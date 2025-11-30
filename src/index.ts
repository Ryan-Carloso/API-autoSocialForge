import fetch from "node-fetch";
import config from "./config";
import { supabase } from "../supabase/supabase.init";
import { generateCaption, generateImageDesign, ImageDesign } from "./services/gemini";
import path from "path";
import fs from "fs";

const POSTBRIDGE_TOKEN = config.postbridgeToken;

// Helper to generate image using the design spec
async function generateCaptionImage(design: ImageDesign): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const width = 1080;
  const height = 1080;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // 1. Fill Background
  ctx.fillStyle = design.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // 2. Add subtle accent (optional geometric shape)
  ctx.fillStyle = design.accentColor;
  ctx.globalAlpha = 0.2; // Semi-transparent
  ctx.beginPath();
  ctx.arc(width, 0, 400, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(0, height, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1.0; // Reset alpha

  // 3. Draw Text
  ctx.fillStyle = design.textColor;
  ctx.font = "bold 60px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapText(ctx, design.text, width - 100);
  const lineHeight = 80;
  const startY = height / 2 - (lines.length * lineHeight) / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, startY + i * lineHeight);
  });

  return canvas.toBuffer("image/png");
}

function wrapText(ctx: any, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const testLine = line + word + " ";
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(line);
      line = word + " ";
    } else {
      line = testLine;
    }
  }

  lines.push(line);
  return lines;
}

// Helper to post to bridge
async function postToBridge(caption: string, design: ImageDesign, accountIds: number[]): Promise<{ mediaUrl: string; response: any }> {
  const imageBuffer = await generateCaptionImage(design);

  // If in DEV mode, save locally to verify image content
  if (config.isDev) {
    const devDir = path.join(process.cwd(), "dev_output");
    if (!fs.existsSync(devDir)) {
      fs.mkdirSync(devDir, { recursive: true });
    }
    const localFilename = `dev_post_${Date.now()}.png`;
    const localPath = path.join(devDir, localFilename);
    fs.writeFileSync(localPath, imageBuffer);
    console.log(`[DEV] Saved generated image to: ${localPath}`);
  }

  let mediaUrl = "";
  if (supabase) {
    const filename = `${config.supabaseFolder}${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const upload = await supabase.storage.from(config.supabaseBucket).upload(filename, imageBuffer, {
      contentType: "image/png",
      upsert: true,
    });
    if (upload.error) {
      throw new Error(`Supabase upload failed: ${upload.error.message}`);
    }
    const pub = supabase.storage.from(config.supabaseBucket).getPublicUrl(filename);
    mediaUrl = pub.data.publicUrl;
  } else {
    throw new Error("Supabase client not initialized");
  }

  const resp = await fetch("https://api.post-bridge.com/v1/posts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${POSTBRIDGE_TOKEN}`,
    },
    body: JSON.stringify({
      caption,
      media_urls: [mediaUrl],
      social_accounts: accountIds,
      is_draft: config.isDev,
    }),
  });
  const data = await resp.json();
  return { mediaUrl, response: data };
}

// Main startup logic
async function runStartup() {
  console.log("Starting AutoPostBridge...");
  console.log(`Detected ${config.groupConfigs.length} account groups.`);

  for (const group of config.groupConfigs) {
    console.log(`\n--- Processing Group: ${group.name} ---`);
    console.log(`Account IDs: ${group.accountIds.join(", ")}`);
    console.log(`Content Path: ${group.contentPath}`);

    // 1. Load Content
    let contentList: string[] = [];
    try {
      const importPath = path.resolve(process.cwd(), group.contentPath);
      const module = await import(importPath);
      
      if (Array.isArray(module.ideas)) {
        contentList = module.ideas;
      } else if (Array.isArray(module.default)) {
        contentList = module.default;
      } else {
        throw new Error("Module does not export 'ideas' array or default array.");
      }
      
      if (contentList.length === 0) {
        throw new Error("Content list is empty.");
      }
      console.log(`Loaded ${contentList.length} ideas.`);
    } catch (error: any) {
      console.error(`[GROUP ERROR] Failed to load content module for ${group.name}: ${error.message}`);
      continue; // Skip to next group
    }

    // 2. Pick Random Topic
    const topic = contentList[Math.floor(Math.random() * contentList.length)];
    console.log(`Selected topic: "${topic}"`);

    // 3. Generate Content (AI or Fallback)
    let caption = topic;
    // Default design fallback
    let design: ImageDesign = {
      text: topic,
      backgroundColor: "#FFFFFF",
      textColor: "#000000",
      accentColor: "#CCCCCC"
    };

    if (config.geminiKey) {
      console.log("Gemini Key found. Generating AI content...");
      try {
        const [genCaption, genDesign] = await Promise.all([
          generateCaption(topic),
          generateImageDesign(topic)
        ]);
        caption = genCaption;
        design = genDesign;
        console.log("AI Generation successful.", design);
      } catch (error: any) {
        console.error("AI Generation failed, falling back to raw topic:", error.message);
      }
    } else {
      console.log("No Gemini Key. Using raw topic.");
    }

    // 4. Post
    try {
      console.log("Posting to Bridge...");
      const result = await postToBridge(caption, design, group.accountIds);
      console.log("Post successful!", {
        mediaUrl: result.mediaUrl,
        response: result.response
      });
    } catch (error: any) {
      console.error(`[GROUP ERROR] Posting failed for ${group.name}:`, error);
    }
  }
  
  console.log("\nAll groups processed. Done.");
}

// Execute
runStartup().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
