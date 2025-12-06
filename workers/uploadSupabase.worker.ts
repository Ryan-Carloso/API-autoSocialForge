import { Job } from 'bullmq';
import fs from 'fs';
import path from 'path';
import { UploadSupabaseData } from './types';
import { supabase } from '../supabase/supabase.init';
import config from '../IMAGE/config';
import { imagePostQueue } from '../queue/imagePost.queue';
import { getMimeType, buildStoragePath } from './utils';
import { GeneratedResult } from '../IMAGE/modules/types';

export default async function uploadSupabaseWorker(job: Job<UploadSupabaseData>) {
  const { group, selected, carousel, outputDir, filenames } = job.data;
  
  await job.log(`Uploading to Supabase for group ${group.name}`);
  
  // Construct result metadata
  const result: GeneratedResult = {
      images: filenames.map((n) => path.join(outputDir, n)),
      metadata: {
        group: group.name,
        selected,
        carousel,
        createdAt: new Date().toISOString(),
        outputDir,
        filenames,
      }
  };

  const bucket = config.supabaseBucket;
  const storagePaths: string[] = [];
  
  for (const filename of filenames) {
    const fullPath = path.join(outputDir, filename);
    const fname = buildStoragePath(outputDir, group.name, filename);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${fullPath}`);
    }

    const fileBuf = fs.readFileSync(fullPath);
    const contentType = getMimeType(filename);
    
    const up = await supabase.storage.from(bucket).upload(fname, fileBuf, {
      contentType,
      upsert: true,
    });
    
    if (up.error) throw new Error(`Supabase upload failed: ${up.error.message}`);
    
    storagePaths.push(fname);
    await job.log(`Uploaded ${fname} (${contentType})`);
  }
  
  // Prepare for next step
  // Calculate scheduled time: Tomorrow at hour:00 UTC (as per original logic)
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setUTCHours(job.data.hour, 0, 0, 0);
  const scheduledAt = date.toISOString();

  await imagePostQueue.add('schedulePost', {
    ...job.data,
    result,
    mediaIds: [], // Will be handled in schedulePost
    caption: '',  // Will be handled in schedulePost
    scheduledAt,
  });
  
  return { success: true, storagePaths };
}
