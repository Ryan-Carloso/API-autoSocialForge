import { Job } from 'bullmq';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { SchedulePostData } from './types';
import config from '../IMAGE/config';
import { generateCaption } from '../IMAGE/modules/aiService';
import { getMimeType } from './utils';

// Helper functions
function uploadsEndpoint(): string {
  return config.postbridgeUploadUrl;
}

function postsEndpoint(): string {
  return config.postbridgePostsUrl;
}

async function uploadImagesToPostBridge(job: Job, outputDir: string, filenames: string[]): Promise<string[]> {
  if (!config.postbridgeToken || !config.postbridgeUrl) return [];
  const ids: string[] = [];
  for (const fname of filenames) {
    const fullPath = path.join(outputDir, fname);
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
    await job.log(`PostBridge media uploaded: ${fname} -> ${media_id} (${mimeType})`);
  }
  return ids;
}

async function postToPostBridge(job: Job, group: any, caption: string, mediaIds: string[], scheduledAt: string): Promise<void> {
  if (!config.postbridgeToken || !config.postbridgeUrl) {
    await job.log("PostBridge configuration missing; skipping post");
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
    await job.log(`PostBridge success: ${JSON.stringify(data)}`);
  }
  await job.log(`Posted to PostBridge for group ${group.name}`);
}

export default async function schedulePostWorker(job: Job<SchedulePostData>) {
  const { group, prompt, result, scheduledAt } = job.data;
  
  await job.log(`Scheduling post for group ${group.name} at ${scheduledAt}`);
  
  // 1. Upload to PostBridge
  const mediaIds = await uploadImagesToPostBridge(job, result.metadata.outputDir, result.metadata.filenames);
  
  // 2. Generate Caption
  await job.log(`Generating caption...`);
  const caption = await generateCaption(prompt);
  
  // 3. Post/Schedule
  await postToPostBridge(job, group, caption, mediaIds, scheduledAt);
  
  // 4. Cleanup
  try {
      await job.log(`[CLEANUP] Deleting local output directory: ${result.metadata.outputDir}`);
      fs.rmSync(result.metadata.outputDir, { recursive: true, force: true });
  } catch (cleanupErr) {
      await job.log(`[CLEANUP ERROR] Failed to delete ${result.metadata.outputDir}: ${cleanupErr}`);
  }

  return { success: true, mediaIds, caption, scheduledAt };
}
