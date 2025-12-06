import { Job } from 'bullmq';
import path from 'path';
import { CreateMediaData } from './types';
import { generateImagesFromCarousel } from '../IMAGE/modules/imageGenerator';
import { convertImageToVideo } from '../IMAGE/modules/videoConverter';
import { getTemplatePath, getRenderOptionsFromEnv, getOutputDir } from '../IMAGE/modules/templateHandler';
import { imagePostQueue } from '../queue/imagePost.queue';

export default async function createMediaWorker(job: Job<CreateMediaData>) {
  const { group, carousel, isVideoBatch } = job.data;
  
  await job.log(`Generating media for group ${group.name} (Video: ${isVideoBatch})`);
  
  const templatePath = getTemplatePath();
  const options = getRenderOptionsFromEnv();
  const outputDir = getOutputDir(group.name);
  
  const files = await generateImagesFromCarousel(templatePath, carousel, options, outputDir);
  
  await job.log(`Generated ${files.length} images at ${outputDir}`);
  
  const finalFiles: string[] = [];
  
  if (isVideoBatch) {
    await job.log(`Converting to video...`);
    for (const f of files) {
      try {
        const videoPath = await convertImageToVideo(f);
        finalFiles.push(path.basename(videoPath));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await job.log(`Video conversion failed for ${path.basename(f)}: ${msg}`);
        finalFiles.push(path.basename(f));
      }
    }
  } else {
    for (const f of files) {
      finalFiles.push(path.basename(f));
    }
  }
  
  await imagePostQueue.add('uploadSupabase', {
    ...job.data,
    outputDir,
    filenames: finalFiles,
  });
  
  return { success: true, outputDir, files: finalFiles };
}
