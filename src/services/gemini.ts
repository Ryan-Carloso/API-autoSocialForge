import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";
import config from "../config";
import fs from "fs";
import path from "path";

// Initialize conditionally.
const genAI = config.geminiKey ? new GoogleGenerativeAI(config.geminiKey) : null;

// Initialize new GenAI client
const googleGenAI = config.geminiKey ? new GoogleGenAI({ apiKey: config.geminiKey }) : null;

export async function generateCaption(topic: string): Promise<string> {
  if (!genAI) {
    throw new Error("Gemini API Key not configured.");
  }
  
  // User requested "gemini-2.5-flash"
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });

  const prompt = `
    You are a creative social media strategist.
    Create a unique, catchy, and engaging social media caption (max 280 chars) based on the following input.
    The input might be a simple topic or a detailed context.
    Focus on the key message and make it stand out.
    Include relevant hashtags.
    
    Input:
    ${topic}
    
    Return ONLY the caption text. Do not include quotes or JSON.
    
    IMPORTANT: You MUST append exactly the following lines at the end of the caption:
    
    Download our fit app 📲 Link in Bio
    Read more on our blog: remindergym.com
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Gemini caption generation failed:", error);
    throw error;
  }
}

export interface ImageDesign {
  text: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
}

export async function generateImageDesign(topic: string): Promise<ImageDesign> {
  if (!genAI) {
    throw new Error("Gemini API Key not configured.");
  }

  // User requested "gemini-2.5-flash" for the prompt creation
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025", generationConfig: { responseMimeType: "application/json" } });

  const prompt = `
    You are a creative graphic designer.
    Create a visual design specification for a social media image based on the following input:
    
    ${topic}
    
    Return a JSON object with the following fields:
    - text: A short, punchy phrase (max 6-8 words) to display on the image.
    - backgroundColor: A hex color code (e.g., "#FF5733") that fits the mood.
    - textColor: A hex color code (e.g., "#FFFFFF") that contrasts well with the background.
    - accentColor: A hex color code for visual interest (e.g., "#C70039").
    
    Ensure the colors are visually appealing and the text is high contrast.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text().trim();
    
    // Parse JSON
    const design = JSON.parse(jsonText) as ImageDesign;
    return design;
  } catch (error) {
    console.error("Gemini image design generation failed:", error);
    throw error;
  }
}

export interface VideoScript {
  scriptText: string;
  visualPrompt: string;
  estimatedSeconds: number;
}

export async function generateVideoScript(content: string): Promise<VideoScript> {
  if (!genAI) {
    throw new Error("Gemini API Key not configured.");
  }

  // Use a text model for script generation
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash", generationConfig: { responseMimeType: "application/json" } });

  const prompt = `
    You are a professional video scriptwriter for social media (TikTok/Reels).
    Analyze the following content and create a concise, high-energy video script.
    
    Content:
    ${content}
    
    Constraints:
    1. Target Duration: 7 to 16 seconds.
    2. Word Count: Keep the spoken script under 40 words (approx 2.5 words/sec).
    3. Structure: Hook -> Value -> Call to Action.
    4. Completeness: Ensure the script is a complete thought and doesn't trail off.
    
    Output JSON format:
    {
      "scriptText": "The actual spoken words (narration) for the video.",
      "visualPrompt": "A detailed visual description for an AI video generator to create the scene. Include style, lighting, subject, and action.",
      "estimatedSeconds": 10
    }
    
    For the visualPrompt:
    - Describe a fit 23-year-old blonde woman speaking to the camera.
    - Setting: Modern gym, electric blue/neon purple lighting.
    - Style: High energy, fast cuts, dynamic motion.
    - IMPORTANT: Do NOT include any iPhone mockups or UI elements.
    - IMPORTANT: Include a text overlay instruction for "remindergym.com" to appear subtly.
  `;

  let jsonText = "";
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    jsonText = response.text().trim();
    
    // Remove Markdown code blocks if present
    jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    let parsed = JSON.parse(jsonText);
    // Handle array response
    if (Array.isArray(parsed)) {
        parsed = parsed[0];
    }
    
    const script = parsed as VideoScript;
    
    // Validate keys exist
    if (!script.scriptText || !script.visualPrompt) {
        throw new Error("Invalid JSON structure");
    }
    
    console.log(`Generated Video Script (${script.estimatedSeconds}s):`, script.scriptText);
    return script;
  } catch (error) {
    console.error("Gemini script generation failed:", error);
    console.log("Raw JSON text was:", jsonText); // Debug log
    // Fallback if JSON fails
    return {
      scriptText: content.substring(0, 100),
      visualPrompt: `Dynamic gym video about ${content.substring(0, 50)}`,
      estimatedSeconds: 10
    };
  }
}

export async function generateVideo(script: VideoScript): Promise<Buffer> {
  if (!googleGenAI) {
    throw new Error("Gemini API Key not configured.");
  }

  // Construct the final prompt using the optimized script and visual instructions
  const prompt = `
    Create a high-quality, engaging social media video based on this script:
    "${script.scriptText}"
    
    Visual Description:
    ${script.visualPrompt}
    
    Mandatory Elements:
    1. The woman should be speaking (lip-sync if possible, or just energetic talking action).
    2. Text Overlay: Display "remindergym.com" clearly but elegantly (e.g., in the corner or as a lower third) throughout or at the end.
    3. NO iPhone frames, NO mockups, NO generic phone screens.
    4. Ending: The video must feel complete within ${script.estimatedSeconds} seconds.
    
    Style: Veo-3.1-generate-preview style, photorealistic, cinematic lighting.
  `;

  console.log(`Starting video generation with veo-3.1-generate-preview...`);
  console.log(`Target Duration: ~${script.estimatedSeconds}s`);

  try {
    let operation = await googleGenAI.models.generateVideos({
      model: "veo-3.1-generate-preview",
      prompt: prompt,
    });

    // Poll the operation status until the video is ready.
    console.log("Polling for video generation...");
    while (!operation.done) {
      console.log("Waiting for video generation to complete...");
      await new Promise((resolve) => setTimeout(resolve, 10000));
      operation = await googleGenAI.operations.getVideosOperation({
        operation: operation,
      });
    }
    
    if (!operation.response?.generatedVideos?.[0]?.video) {
        throw new Error("Video generation completed but no video file returned.");
    }

    // Create a temp file path
    const tempDir = path.join(process.cwd(), "temp_videos");
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path.join(tempDir, `video_${Date.now()}.mp4`);

    // Download the generated video.
    await googleGenAI.files.download({
      file: operation.response.generatedVideos[0].video,
      downloadPath: tempFilePath,
    });
    
    console.log(`Generated video saved to ${tempFilePath}`);
    
    // Read buffer
    const videoBuffer = fs.readFileSync(tempFilePath);
    
    // Clean up
    fs.unlinkSync(tempFilePath);
    
    return videoBuffer;

  } catch (error: any) {
    console.error("Gemini video generation failed:", error);
    throw error;
  }
}
