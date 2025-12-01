import fs from "fs";
import path from "path";
import { generateCaption, VideoScript } from "../../services/gemini";
import { generateVideoOpenAI } from "../../services/openai";
import { GeneratedContent } from "../../types";

// Video Generation (Pure Video via Sora/Gemini)
export async function handleVideoGeneration(topic: string): Promise<GeneratedContent> {
  console.log("Generating Video Content...");
  // 1. Generate Script & Prompt using Gemini
  const visualPrompt = `Create a vertical video about ${topic}. Cinematic, engaging.`;
  const scriptText = `Here is a quick tip about ${topic}.`; // Simplified for now

  const videoScript: VideoScript = {
    scriptText,
    visualPrompt,
    estimatedSeconds: 15
  };

  try {
    const videoBuffer = await generateVideoOpenAI(videoScript);
    const filename = `video_${Date.now()}.mp4`;
    const filePath = path.join(process.cwd(), "dev_output", filename); 
    if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, videoBuffer);
    
    return {
      type: 'video',
      mediaPaths: [filePath],
      caption: await generateCaption(topic)
    };
  } catch (error) {
    console.error("Video generation failed", error);
    throw error;
  }
}
