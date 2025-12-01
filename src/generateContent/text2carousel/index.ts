import fs from "fs";
import path from "path";
import { createCanvas } from "@napi-rs/canvas";
import { generateCaption, generateCarouselText } from "../../services/gemini";
import { GeneratedContent } from "../../types";

// Carousel Generation (Text -> Image)
export async function handleCarouselGeneration(topic: string): Promise<GeneratedContent> {
  console.log("Generating Carousel Content...");
  const caption = await generateCaption(topic);
  
  // Generate 3-5 slides
  const slides = [];
  for (let i = 0; i < 4; i++) {
    // Use the new simplified text-only generator
    const text = await generateCarouselText(`${topic} - Part ${i+1}`);
    
    // Create Image using Canvas
    const width = 1080;
    const height = 1920; // Stories format
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Background (Always White)
    ctx.fillStyle = '#FFFFFF'; 
    ctx.fillRect(0, 0, width, height);
    
    // Text (Always Black)
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Wrap text
    const words = text.split(' ');
    let line = '';
    let y = height / 2;
    const lineHeight = 80;
    
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > width - 100 && n > 0) {
        ctx.fillText(line, width / 2, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, width / 2, y);
    
    const buffer = canvas.toBuffer('image/png');
    const filename = `carousel_${Date.now()}_${i}.png`;
    const filePath = path.join(process.cwd(), "dev_output", filename);
    if (!fs.existsSync(path.dirname(filePath))) fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
    slides.push(filePath);
  }
  
  return {
    type: 'carousel',
    mediaPaths: slides,
    caption
  };
}
