import { Queue } from 'bullmq';
import { connection } from './connection';

export const IMAGE_POST_QUEUE_NAME = 'imagePost';

export const imagePostQueue = new Queue(IMAGE_POST_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500, // Keep last 500 failed jobs
  },
});
