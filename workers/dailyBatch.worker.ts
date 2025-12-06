import { Job } from 'bullmq';
import { DailyBatchData } from './types';
import config from '../IMAGE/config';
import { imagePostQueue } from '../queue/imagePost.queue';

export default async function dailyBatchWorker(job: Job<DailyBatchData>) {
  const { group } = job.data;
  
  await job.log(`Starting daily batch for group ${group.name}`);
  
  const jobs = config.postHours.map(hour => ({
    name: 'generateContent',
    data: {
      group,
      hour,
      isVideoBatch: false, // Will be overridden by generateContent worker
    },
    opts: {
      jobId: `generateContent-${group.name}-${hour}-${Date.now()}`, // Unique ID for this run
    }
  }));

  await imagePostQueue.addBulk(jobs);
  
  await job.log(`Scheduled ${jobs.length} posts for group ${group.name}`);
  
  return { success: true, scheduledCount: jobs.length };
}
