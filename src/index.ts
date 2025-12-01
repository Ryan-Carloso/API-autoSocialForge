import fetch from "node-fetch";
import config from "./config";
import { supabase } from "../supabase/supabase.init";
import { generateCaption, generateVideo, generateVideoScript, generateMultiPartVideoScript } from "./services/gemini";
import path from "path";
import fs from "fs";

const POSTBRIDGE_TOKEN = config.postbridgeToken;

// Helper to post to bridge
async function postToBridge(caption: string, mediaBuffers: Buffer[], mimeType: string, accountIds: number[], metadata?: any): Promise<{ mediaUrls: string[]; response: any }> {
  // If in DEV mode, save locally to verify image content
  if (config.isDev) {
    const devDir = path.join(process.cwd(), "dev_output");
    if (!fs.existsSync(devDir)) {
      fs.mkdirSync(devDir, { recursive: true });
    }
    
    mediaBuffers.forEach((buffer, index) => {
        const ext = mimeType.split("/")[1] || "bin";
        const localFilename = `dev_post_part${index + 1}_${Date.now()}.${ext}`;
        const localPath = path.join(devDir, localFilename);
        fs.writeFileSync(localPath, buffer);
        console.log(`[DEV] Saved generated media Part ${index + 1} to: ${localPath}`);
    });
  }

  let mediaUrls: string[] = [];
  if (supabase) {
    for (const buffer of mediaBuffers) {
        const ext = mimeType.split("/")[1] || "bin";
        const filename = `${config.supabaseFolder}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const upload = await supabase.storage.from(config.supabaseBucket).upload(filename, buffer, {
          contentType: mimeType,
          upsert: true,
        });
        if (upload.error) {
          throw new Error(`Supabase upload failed: ${upload.error.message}`);
        }
        const pub = supabase.storage.from(config.supabaseBucket).getPublicUrl(filename);
        mediaUrls.push(pub.data.publicUrl);
    }
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
      media_urls: mediaUrls,
      social_accounts: accountIds,
      is_draft: config.isDev,
      metadata: metadata || {},
    }),
  });
  const data = await resp.json();
  return { mediaUrls, response: data };
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
    let contentList: any[] = [];
    try {
      if (group.contentPath.startsWith("http")) {
        const resp = await fetch(group.contentPath);
        if (!resp.ok) throw new Error(`Failed to fetch content: ${resp.statusText}`);
        const data = await resp.json();
        if (Array.isArray(data)) {
          contentList = data;
        } else {
          throw new Error("Remote content is not an array.");
        }
      } else {
        const importPath = path.resolve(process.cwd(), group.contentPath);
        const module = await import(importPath);
        
        if (Array.isArray(module.ideas)) {
          contentList = module.ideas;
        } else if (Array.isArray(module.default)) {
          contentList = module.default;
        } else {
          throw new Error("Module does not export 'ideas' array or default array.");
        }
      }
      
      if (contentList.length === 0) {
        throw new Error("Content list is empty.");
      }
      console.log(`Loaded ${contentList.length} items.`);
    } catch (error: any) {
      console.error(`[GROUP ERROR] Failed to load content for ${group.name}: ${error.message}`);
      continue; // Skip to next group
    }

    // 2. Pick Random Topic
    const selectedItem = contentList[Math.floor(Math.random() * contentList.length)];
    let topicPrompt = "";
    let shortTitle = "";

    if (typeof selectedItem === "string") {
      topicPrompt = selectedItem;
      shortTitle = selectedItem;
      console.log(`Selected topic: "${shortTitle}"`);
    } else if (typeof selectedItem === "object" && selectedItem !== null) {
      shortTitle = selectedItem.title || "New Post";
      console.log(`Selected item title: "${shortTitle}"`);
      
      let contentText = "";
      try {
        if (selectedItem.content) {
          const contentObj = JSON.parse(selectedItem.content);
          if (Array.isArray(contentObj.contentElements)) {
            contentText = contentObj.contentElements
              .map((el: any) => {
                if (el.type === "paragraph" && Array.isArray(el.content)) {
                  return el.content.map((c: any) => c.text).join("");
                }
                return "";
              })
              .filter((s: string) => s.length > 0)
              .join("\n");
          }
        }
      } catch (e) {
        console.warn("Failed to parse content JSON, using title only.");
      }
      
      topicPrompt = `Title: ${shortTitle}\n\nContext: ${contentText}`;
    } else {
      console.warn("Unknown item format, using JSON stringify.");
      topicPrompt = JSON.stringify(selectedItem);
      shortTitle = "New Post";
    }

    // 3. Generate Content (AI or Fallback)
    let caption = shortTitle;
    let mediaBuffers: Buffer[] = [];
    let mimeType = "video/mp4";
    let metadata: any = {};

    if (config.geminiKey) {
      console.log("Gemini Key found. Generating AI content...");
      try {
        // 1. Generate Optimized Script first (Multi-Part)
        console.log("Generating multi-part video script...");
        const multiScript = await generateMultiPartVideoScript(topicPrompt);
        
        metadata = {
            merge_segments: true,
            segment_count: 2,
            segments: [
                { part: 1, duration_est: multiScript.part1.estimatedSeconds },
                { part: 2, duration_est: multiScript.part2.estimatedSeconds }
            ]
        };

        // 2. Generate Video & Caption sequentially to avoid overload
        console.log("Generating caption...");
        const genCaption = await generateCaption(topicPrompt);
        
        console.log("Generating video Part 1...");
        const videoData1 = await generateVideo(multiScript.part1);
        
        console.log("Generating video Part 2...");
        const videoData2 = await generateVideo(multiScript.part2);

        caption = genCaption;
        mediaBuffers = [videoData1, videoData2];
        console.log("AI Generation successful. Video parts:", mediaBuffers.length);
      } catch (error: any) {
        console.error("AI Generation failed:", error.message);
      }
    } else {
      console.log("No Gemini Key. Skipping generation.");
    }

    if (mediaBuffers.length === 0) {
        console.error("No media generated. Skipping post.");
        continue;
    }

    // 4. Post
    try {
      console.log("Posting to Bridge...");
      const result = await postToBridge(caption, mediaBuffers, mimeType, group.accountIds, metadata);
      console.log("Post successful!", {
        mediaUrls: result.mediaUrls,
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
