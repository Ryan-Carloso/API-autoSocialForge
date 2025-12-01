import fetch from "node-fetch";
import FormData from "form-data";
import config from "../config";
import { VideoScript } from "./gemini";

const OPENAI_API_URL = "https://api.openai.com/v1/videos";

export async function generateVideoOpenAI(script: VideoScript): Promise<Buffer> {
  if (!config.openaiKey) {
    throw new Error("OpenAI API Key not configured.");
  }

  // Construct the prompt
  const prompt = `
    ${script.visualPrompt}
    
    Action: ${script.scriptText}
    
    Style: Realistic, high quality, cinematic lighting.
    Text Overlay: "remindergym.com" visible.
  `;

  console.log(`Starting video generation with OpenAI (sora-2)...`);
  console.log(`Target Duration: 20s (Requested)`);

  try {
    // 1. Initiate Video Generation
    const formData = new FormData();
    formData.append("model", "sora-2");
    formData.append("prompt", prompt.trim());
    formData.append("seconds", "12"); // User requested 20s limit. Note: Sora API officially supports up to 12s, but we are trying 20s as requested.
    formData.append("size", "720x1280"); // Vertical for social media

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openaiKey}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI Video API Request Failed: ${response.status} ${response.statusText} - ${errText}`);
    }

    const data = await response.json() as any;
    const jobId = data.id;
    console.log(`OpenAI Video Job initiated: ${jobId}`);

    // 2. Poll for Completion
    let status = data.status;
    let resultUrl = "";

    while (status !== "completed" && status !== "failed" && status !== "cancelled") {
      console.log(`Waiting for video generation... Status: ${status}`);
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Poll every 10s

      const pollResponse = await fetch(`${OPENAI_API_URL}/${jobId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${config.openaiKey}`,
        },
      });

      if (!pollResponse.ok) {
         // If polling fails transiently, log and continue, or throw? Let's throw to be safe.
         const errText = await pollResponse.text();
         throw new Error(`Polling failed: ${pollResponse.status} - ${errText}`);
      }

      const pollData = await pollResponse.json() as any;
      status = pollData.status;
      
      if (status === "completed") {
          // Check for result URL in the object first
          if (pollData.video && pollData.video.url) {
              resultUrl = pollData.video.url;
          } else if (pollData.result_url) {
              resultUrl = pollData.result_url;
          } else {
              // Fallback to content endpoint logic if URL not in object
              // But based on search results, it might be in `video.url`
              console.log("Status completed, looking for URL in response...", pollData);
          }
      } else if (status === "failed") {
          throw new Error(`Video generation failed: ${JSON.stringify(pollData.error || "Unknown error")}`);
      }
    }

    if (!resultUrl) {
        // Try fetching from content endpoint if no URL found in status
        // According to docs: GET /videos/{video_id}/content
        console.log("No URL in status, trying /content endpoint...");
        const contentResponse = await fetch(`${OPENAI_API_URL}/${jobId}/content`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${config.openaiKey}`,
            },
        });
        
        if (contentResponse.ok) {
             const buffer = await contentResponse.buffer();
             console.log(`Downloaded video via /content endpoint. Size: ${buffer.length}`);
             return buffer;
        }
        
        throw new Error("Video generation completed but could not retrieve URL or content.");
    }

    // 3. Download Video
    console.log(`Downloading generated video from: ${resultUrl}`);
    const videoResp = await fetch(resultUrl);
    if (!videoResp.ok) {
        throw new Error(`Failed to download video from URL: ${videoResp.statusText}`);
    }
    const videoBuffer = await videoResp.buffer();
    console.log(`Video downloaded successfully. Size: ${videoBuffer.length}`);

    return videoBuffer;

  } catch (error: any) {
    console.error("OpenAI video generation failed:", error);
    throw error;
  }
}
