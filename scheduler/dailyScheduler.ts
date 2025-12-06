import { imagePostQueue } from '../queue/imagePost.queue';
import config from '../IMAGE/config';

export async function scheduleDailyJobs() {
  console.log('Scheduling daily jobs...');
  
  // Clean old repeatable jobs to avoid duplicates if config changes
  const repeatableJobs = await imagePostQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await imagePostQueue.removeRepeatableByKey(job.key);
  }

  for (const group of config.groupConfigs) {
      // Cron expression: At 06:00 AM every day
      // This single job will trigger the batch creation for all 8 post hours
      const cron = `0 6 * * *`;
      
      await imagePostQueue.add(
        'dailyBatch',
        { group },
        {
          repeat: {
            pattern: cron,
          },
          jobId: `dailyBatch-${group.name}`,
        }
      );
      console.log(`Scheduled daily batch for ${group.name} at 06:00 AM (${cron})`);
  }
}
