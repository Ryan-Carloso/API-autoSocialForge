import path from "path";
import fs from "fs";
import config from "./config.ts";
import { supabase } from "../supabase/supabase.init.ts";
import { GroupConfig, SelectedItem, CarouselContent, GeneratedResult } from "./modules/types.ts";
import { getSelectedItem, itemToPrompt } from "./modules/contentProcessor";
import { generateCarouselWithLog } from "./modules/geminiClient";
import { getTemplatePath, getRenderOptionsFromEnv, getOutputDir, writeLog } from "./modules/templateHandler";
import { generateImagesFromCarousel } from "./modules/imageGenerator";

function readBuffers(files: string[]): Buffer[] {
  return files.map((f) => fs.readFileSync(f));
}

function saveMetadata(
  groupName: string,
  selected: SelectedItem,
  carousel: CarouselContent,
  outputDir: string
): GeneratedResult {
  const filenames = carousel.slides.map((s) => `photoID${s.id}.png`);
  const metadata = {
    group: groupName,
    selected,
    carousel,
    createdAt: new Date().toISOString(),
    outputDir,
    filenames,
  };
  const metaPath = path.join(outputDir, "metadata.json");
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  writeLog(`Saved ${metaPath}`);
  return { images: filenames.map((n) => path.join(outputDir, n)), metadata };
}

async function uploadToSupabase(result: GeneratedResult): Promise<void> {
  const bucket = config.supabaseBucket;
  const folder = config.supabaseFolder.endsWith("/") ? config.supabaseFolder : `${config.supabaseFolder}/`;
  for (let i = 0; i < result.metadata.filenames.length; i++) {
    const fullPath = path.join(result.metadata.outputDir, result.metadata.filenames[i]);
    const fname = `${folder}${result.metadata.group}/${path.basename(result.metadata.outputDir)}/${result.metadata.filenames[i]}`;
    const fileBuf = fs.readFileSync(fullPath);
    const up = await supabase.storage.from(bucket).upload(fname, fileBuf, {
      contentType: "image/png",
      upsert: true,
    });
    if (up.error) throw new Error(`Supabase upload failed: ${up.error.message}`);
    writeLog(`Uploaded ${fname}`);
  }
  const metaName = `${folder}${result.metadata.group}/${path.basename(result.metadata.outputDir)}/metadata.json`;
  const upMeta = await supabase.storage.from(bucket).upload(metaName, Buffer.from(JSON.stringify(result.metadata, null, 2)), {
    contentType: "application/json",
    upsert: true,
  });
  if (upMeta.error) throw new Error(`Supabase upload failed: ${upMeta.error.message}`);
  writeLog(`Uploaded ${metaName}`);
}

export async function runImagePipeline(): Promise<void> {
  writeLog("Starting image pipeline");
  for (const group of config.groupConfigs as GroupConfig[]) {
    try {
      writeLog(`Processing group ${group.name}`);
      const selected: SelectedItem = await getSelectedItem(group);
      const prompt = itemToPrompt(selected);
      const carousel: CarouselContent = await generateCarouselWithLog(prompt);
      const templatePath = getTemplatePath();
      const options = getRenderOptionsFromEnv();
      const outputDir = getOutputDir(group.name);
      const files = await generateImagesFromCarousel(templatePath, carousel, options, outputDir);
      writeLog(`Generated ${files.length} images at ${outputDir}`);
      const result = saveMetadata(group.name, selected, carousel, outputDir);
      await uploadToSupabase(result);
      writeLog(`Completed group ${group.name}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeLog(`Group ${group.name} error: ${msg}`);
    }
  }
  writeLog("Image pipeline finished");
}

if (require.main === module) {
  runImagePipeline().catch(() => process.exit(1));
}
