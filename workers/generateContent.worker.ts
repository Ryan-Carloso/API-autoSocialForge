import { Job } from 'bullmq';
import { GenerateContentData } from './types';
import { getSelectedItem, itemToPrompt } from '../IMAGE/modules/contentProcessor';
import { generateCarousel } from '../IMAGE/modules/aiService';
import { imagePostQueue } from '../queue/imagePost.queue';
import { getNextBatchType } from './state';

export default async function generateContentWorker(job: Job<GenerateContentData>) {
  const { group, hour } = job.data;
  
  // Determine batch type dynamically
  const isVideoBatch = await getNextBatchType(group.name);

  await job.log(`Starting content generation for group ${group.name} (Video Batch: ${isVideoBatch})`);
  
  const selected = await getSelectedItem(group);
  const prompt = itemToPrompt(selected);
  
  await job.log(`Generated prompt: ${prompt}`);
  
  const carousel = await generateCarousel(prompt);
  
  await job.log(`Generated carousel with ${carousel.slides.length} slides`);
  
  // Add next job
  await imagePostQueue.add('createMedia', {
    group,
    hour,
    isVideoBatch,
    selected,
    carousel,
    prompt,
  });
  
  return { success: true, slides: carousel.slides.length };
}
