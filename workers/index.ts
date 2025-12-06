import { Worker } from 'bullmq';
import { connection } from '../queue/connection';
import { IMAGE_POST_QUEUE_NAME } from '../queue/imagePost.queue';
import generateContentWorker from './generateContent.worker';
import createMediaWorker from './createMedia.worker';
import uploadSupabaseWorker from './uploadSupabase.worker';
import schedulePostWorker from './schedulePost.worker';
import dailyBatchWorker from './dailyBatch.worker';

export const worker = new Worker(IMAGE_POST_QUEUE_NAME, async (job) => {
  switch (job.name) {
    case 'dailyBatch':
        return dailyBatchWorker(job as any);
    case 'generateContent':
      return generateContentWorker(job as any);
    case 'createMedia':
      return createMediaWorker(job as any);
    case 'uploadSupabase':
      return uploadSupabaseWorker(job as any);
    case 'schedulePost':
      return schedulePostWorker(job as any);
    default:
      throw new Error(`Unknown job name: ${job.name}`);
  }
}, {
  connection,
  concurrency: 5, // Allow parallel processing of different hours
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} (${job.name}) completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} (${job?.name}) failed: ${err.message}`);
});
