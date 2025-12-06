import Redis from 'ioredis';
import { connection } from '../queue/connection';

// Create a separate client for state management
export const redisClient = new Redis(connection as any);

export async function getNextBatchType(groupName: string): Promise<boolean> {
  const key = `batchType:${groupName}`;
  const current = await redisClient.get(key);
  let isVideo: boolean;
  
  if (current === null) {
      // Random start
      isVideo = Math.random() < 0.5;
  } else {
      // Toggle
      isVideo = current !== 'true'; // If was true, now false.
  }
  
  await redisClient.set(key, String(isVideo));
  return isVideo;
}
