import path from "path";
import fs from "fs";
import fetch from "node-fetch";
import config from "./config.ts";
import { supabase } from "../supabase/supabase.init.ts";
import { GroupConfig, SelectedItem, CarouselContent, GeneratedResult } from "./modules/types.ts";
import { getSelectedItem, itemToPrompt } from "./modules/contentProcessor";
import { generateCarouselWithLog } from "./modules/geminiClient";
import { getTemplatePath, getRenderOptionsFromEnv, getOutputDir, writeLog } from "./modules/templateHandler";
import { generateImagesFromCarousel } from "./modules/imageGenerator";
import { generateCaption } from "./modules/gemini.ts";
import { convertImageToVideo } from "./modules/videoConverter.ts";

function saveMetadata(
  groupName: string,
  selected: SelectedItem,
  carousel: CarouselContent,
  outputDir: string,
  filenames: string[]
): GeneratedResult {
  const metadata = {
    group: groupName,
    selected,
    carousel,
    createdAt: new Date().toISOString(),
    outputDir,
    filenames,
  };
  return { images: filenames.map((n) => path.join(outputDir, n)), metadata };
}

function buildStoragePath(outputDir: string, group: string, filename: string): string {
  const folder = config.supabaseFolder.endsWith("/") ? config.supabaseFolder : `${config.supabaseFolder}/`;
  return `${folder}${group}/${path.basename(outputDir)}/${filename}`;
}

function getMimeType(filename: string): string {
  if (filename.endsWith(".mp4")) return "video/mp4";
  return "image/png";
}

async function uploadToSupabase(result: GeneratedResult): Promise<string[]> {
  const bucket = config.supabaseBucket;
  const storagePaths: string[] = [];
  for (let i = 0; i < result.metadata.filenames.length; i++) {
    const filename = result.metadata.filenames[i];
    const fullPath = path.join(result.metadata.outputDir, filename);
    const fname = buildStoragePath(result.metadata.outputDir, result.metadata.group, filename);
    const fileBuf = fs.readFileSync(fullPath);
    const contentType = getMimeType(filename);
    const up = await supabase.storage.from(bucket).upload(fname, fileBuf, {
      contentType,
      upsert: true,
    });
    if (up.error) throw new Error(`Supabase upload failed: ${up.error.message}`);
    storagePaths.push(fname);
    writeLog(`Uploaded ${fname} (${contentType})`);
  }
  return storagePaths;
}


async function getSignedUrls(paths: string[]): Promise<string[]> {
  const bucket = config.supabaseBucket;
  const out: string[] = [];
  for (const p of paths) {
    const signed = await supabase.storage.from(bucket).createSignedUrl(p, 3600);
    if (signed.error) throw new Error(`Supabase signed URL error: ${signed.error.message}`);
    out.push(signed.data.signedUrl);
  }
  return out;
}

function uploadsEndpoint(): string {
  return config.postbridgeUploadUrl;
}

function postsEndpoint(): string {
  return config.postbridgePostsUrl;
}

async function uploadImagesToPostBridge(result: GeneratedResult): Promise<string[]> {
  if (!config.postbridgeToken || !config.postbridgeUrl) return [];
  const ids: string[] = [];
  for (const fname of result.metadata.filenames) {
    const fullPath = path.join(result.metadata.outputDir, fname);
    const stat = fs.statSync(fullPath);
    const mimeType = getMimeType(fname);
    const req = await fetch(uploadsEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.postbridgeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: fname, mime_type: mimeType, size_bytes: stat.size }),
    });
    if (!req.ok) {
      const t = await req.text();
      throw new Error(`PostBridge upload URL error ${req.status}: ${t}`);
    }
    const { media_id, upload_url } = (await req.json()) as { media_id: string; upload_url: string };
    const fileBuf = fs.readFileSync(fullPath);
    const put = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: fileBuf,
    });
    if (!put.ok) {
      const t = await put.text();
      throw new Error(`PostBridge media upload error ${put.status}: ${t}`);
    }
    ids.push(media_id);
    writeLog(`PostBridge media uploaded: ${fname} -> ${media_id} (${mimeType})`);
  }
  return ids;
}

async function postToPostBridge(group: GroupConfig, caption: string, mediaIds: string[], metadata: GeneratedResult["metadata"], scheduledAt: string): Promise<void> {
  if (!config.postbridgeToken || !config.postbridgeUrl) {
    writeLog("PostBridge configuration missing; skipping post");
    return;
  }
  const body = {
    social_accounts: group.accountIds,
    caption,
    media: mediaIds,
    is_draft: config.isDev ? true : false,
    scheduled_at: scheduledAt,
  };
  const resp = await fetch(postsEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.postbridgeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PostBridge error ${resp.status}: ${text}`);
  }
  let data: unknown = null;
  try {
    data = await resp.json();
  } catch {}
  if (data) {
    writeLog(`PostBridge success: ${JSON.stringify(data)}`);
    const d = data as Record<string, unknown>;
    const sched = (d.scheduled_at || (d as any).schedule || (d as any).scheduledAt) as string | undefined;
    if (sched) writeLog(`PostBridge scheduled at: ${sched}`);
  }
  writeLog(`Posted to PostBridge for group ${metadata.group}`);
}

export async function runImagePipeline(): Promise<void> {
  writeLog("Starting image pipeline");
  for (const group of config.groupConfigs as GroupConfig[]) {
    writeLog(`Processing group ${group.name}`);
    
    // Initialize toggle state for this group (random start: true or false)
    let isVideoBatch = Math.random() < 0.5;
    writeLog(`Initial batch type for group ${group.name}: ${isVideoBatch ? "VIDEO" : "IMAGE"}`);

    for (let i = 0; i < config.postHours.length; i++) {
      const hour = config.postHours[i];
      try {
        writeLog(`Starting generation for schedule hour: ${hour} [Type: ${isVideoBatch ? "VIDEO" : "IMAGE"}]`);
        const selected: SelectedItem = await getSelectedItem(group);
        const prompt = itemToPrompt(selected);
        const carousel: CarouselContent = await generateCarouselWithLog(prompt);
        const templatePath = getTemplatePath();
        const options = getRenderOptionsFromEnv();
        const outputDir = getOutputDir(group.name);
        const files = await generateImagesFromCarousel(templatePath, carousel, options, outputDir);
        
        // Post-process files: Convert ALL to video OR keep ALL as images
        const finalFiles: string[] = [];
        
        if (isVideoBatch) {
          writeLog(`[BATCH DECISION] Converting ALL ${files.length} slides to VIDEO`);
          for (const f of files) {
            try {
              writeLog(`Converting to video: ${path.basename(f)}`);
              const videoPath = await convertImageToVideo(f);
              finalFiles.push(path.basename(videoPath));
            } catch (err) {
              writeLog(`[ERROR] Video conversion failed for ${path.basename(f)}, falling back to IMAGE: ${err}`);
              finalFiles.push(path.basename(f));
            }
          }
        } else {
          writeLog(`[BATCH DECISION] Keeping ALL ${files.length} slides as IMAGES`);
          for (const f of files) {
            finalFiles.push(path.basename(f));
          }
        }
        
        // Toggle for next post in sequence
        isVideoBatch = !isVideoBatch;

        writeLog(`Generated ${files.length} items at ${outputDir}`);
        const result = saveMetadata(group.name, selected, carousel, outputDir, finalFiles);
        const storagePaths = await uploadToSupabase(result);
        const mediaIds = await uploadImagesToPostBridge(result);
        const caption = await generateCaption(prompt);

        // Calculate scheduled time: Tomorrow at hour:00 UTC
        const date = new Date();
        date.setDate(date.getDate() + 1);
        date.setUTCHours(hour, 0, 0, 0);
        const scheduledAt = date.toISOString();

        await postToPostBridge(group, caption, mediaIds, result.metadata, scheduledAt);
        writeLog(`Completed group ${group.name} for hour ${hour}`);
        
        // Cleanup: Delete local files if running in Production (not Dev)
        if (!config.isDev) {
          try {
            writeLog(`[CLEANUP] Deleting local output directory: ${outputDir}`);
            fs.rmSync(outputDir, { recursive: true, force: true });
          } catch (cleanupErr) {
            writeLog(`[CLEANUP ERROR] Failed to delete ${outputDir}: ${cleanupErr}`);
          }
        }

        if (i < config.postHours.length - 1) {
          writeLog("Waiting 1 minute before next post...");
          await new Promise((resolve) => setTimeout(resolve, 60000));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        writeLog(`Group ${group.name} hour ${hour} error: ${msg}`);
      }
    }
  }
  writeLog("Image pipeline finished");
}

if (require.main === module) {
  runImagePipeline().catch(() => process.exit(1));
}
