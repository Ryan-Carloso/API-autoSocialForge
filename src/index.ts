import fetch from "node-fetch";
import config from "./config";
import { supabase } from "../supabase/supabase.init";
import { Controller } from "./controller";
import path from "path";
import fs from "fs";

const POSTBRIDGE_TOKEN = config.postbridgeToken;

// Helper to post to bridge
async function postToBridge(caption: string, mediaBuffers: Buffer[], mimeType: string, accountIds: number[], metadata?: any): Promise<{ mediaUrls: string[]; response: any }> {
  // If in DEV mode, save locally to verify image content
  if (config.isDev) {
    const devDir = path.join(process.cwd(), "dev_output");
    if (!fs.existsSync(devDir)) {
      fs.mkdirSync(devDir, { recursive: true });
    }
    
    mediaBuffers.forEach((buffer, index) => {
        const ext = mimeType.split("/")[1] || "bin";
        const localFilename = `dev_post_part${index + 1}_${Date.now()}.${ext}`;
        const localPath = path.join(devDir, localFilename);
        fs.writeFileSync(localPath, buffer);
        console.log(`[DEV] Saved generated media Part ${index + 1} to: ${localPath}`);
    });
  }

  let mediaUrls: string[] = [];
  if (supabase) {
    // Optional: authenticate if credentials are provided to satisfy bucket RLS
    try {
      if (config.supabaseEmail && config.supabasePassword) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: config.supabaseEmail,
            password: config.supabasePassword,
          });
          if (signInError) {
            console.warn(`[SUPABASE WARNING] Sign-in failed: ${signInError.message}`);
          }
        }
      }
    } catch (e) {
      console.warn(`[SUPABASE WARNING] Auth step encountered an issue: ${(e as any)?.message || e}`);
    }

    for (const buffer of mediaBuffers) {
        const ext = mimeType.split("/")[1] || "bin";
        const filename = `${config.supabaseFolder}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const upload = await supabase.storage.from(config.supabaseBucket).upload(filename, buffer, {
          contentType: mimeType,
          upsert: true,
        });
        if (upload.error) {
          throw new Error(`Supabase upload failed: ${upload.error.message}`);
        }
        // Prefer a signed URL to avoid bucket policy issues
        const signed = await supabase.storage.from(config.supabaseBucket).createSignedUrl(filename, 60 * 60 * 24 * 7);
        if (signed.error || !signed.data?.signedUrl) {
          const pub = supabase.storage.from(config.supabaseBucket).getPublicUrl(filename);
          mediaUrls.push(pub.data.publicUrl);
        } else {
          mediaUrls.push(signed.data.signedUrl);
        }
    }
  } else {
    throw new Error("Supabase client not initialized");
  }

  const resp = await fetch("https://api.post-bridge.com/v1/posts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${POSTBRIDGE_TOKEN}`,
    },
    body: JSON.stringify({
      caption,
      media_urls: mediaUrls,
      social_accounts: accountIds,
      is_draft: config.isDev,
      metadata: metadata || {},
    }),
  });
  const data = await resp.json();
  return { mediaUrls, response: data };
}

// Main startup logic
async function runStartup() {
  console.log("Starting AutoPostBridge...");
  console.log(`Detected ${config.groupConfigs.length} account groups.`);

  for (const group of config.groupConfigs) {
    console.log(`\n--- Processing Group: ${group.name} ---`);
    console.log(`Account IDs: ${group.accountIds.join(", ")}`);
    console.log(`Content Path: ${group.contentPath}`);

    // 1. Load Content
    let contentList: any[] = [];
    try {
      if (group.contentPath.startsWith("http")) {
        const resp = await fetch(group.contentPath);
        if (!resp.ok) throw new Error(`Failed to fetch content: ${resp.statusText}`);
        const data = await resp.json();
        if (Array.isArray(data)) {
          contentList = data;
        } else {
          throw new Error("Remote content is not an array.");
        }
      } else {
        const importPath = path.resolve(process.cwd(), group.contentPath);
        const module = await import(importPath);
        
        if (Array.isArray(module.ideas)) {
          contentList = module.ideas;
        } else if (Array.isArray(module.default)) {
          contentList = module.default;
        } else {
          throw new Error("Module does not export 'ideas' array or default array.");
        }
      }
      
      if (contentList.length === 0) {
        throw new Error("Content list is empty.");
      }
      console.log(`Loaded ${contentList.length} items.`);
    } catch (error: any) {
      console.error(`[GROUP ERROR] Failed to load content for ${group.name}: ${error.message}`);
      continue; // Skip to next group
    }

    // 2. Process Group with Controller
    try {
        const generatedContent = await Controller.processGroup(group.name, contentList);
        
        let mediaBuffers: Buffer[] = [];
        let mimeType = "video/mp4";

        // Read files into buffers
        for (const p of generatedContent.mediaPaths) {
            if (fs.existsSync(p)) {
                mediaBuffers.push(fs.readFileSync(p));
            } else {
                console.warn(`[WARNING] Generated file not found: ${p}`);
            }
        }
        
        if (mediaBuffers.length === 0) {
            throw new Error("No valid media files generated.");
        }
        
        if (generatedContent.type === 'carousel') {
            mimeType = "image/png";
        } else {
            mimeType = "video/mp4";
        }
        
        // 3. Post (skip in dev)
        if (config.isDev) {
            console.log("[DEV] Skipping PostBridge upload; media saved locally in 'dev_output/'.");
        } else {
            console.log("Posting to Bridge...");
            const result = await postToBridge(generatedContent.caption, mediaBuffers, mimeType, group.accountIds);
            console.log("Post successful!", {
                mediaUrls: result.mediaUrls,
                response: result.response
            });
        }

    } catch (error: any) {
        console.error(`[GROUP ERROR] Processing failed for ${group.name}:`, error);
    }
  }
  
  console.log("\nAll groups processed. Done.");
}

// Execute
runStartup().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
