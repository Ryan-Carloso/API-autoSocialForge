import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config";

// Initialize conditionally.
const genAI = config.geminiKey ? new GoogleGenerativeAI(config.geminiKey) : null;

export async function generateCaption(topic: string): Promise<string> {
  if (!genAI) {
    throw new Error("Gemini API Key not configured.");
  }
  
  // User requested "gemini-2.5-flash"
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });

  const prompt = `
    You are a social media manager.
    Write a catchy, engaging social media caption (max 280 chars) for the following topic.
    Include relevant hashtags.
    
    Topic: "${topic}"
    
    Return ONLY the caption text. Do not include quotes or JSON.
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
    Create a visual design specification for a social media image about the topic: "${topic}".
    
    Return a JSON object with the following fields:
    - text: A short, punchy phrase (max 6-8 words) to display on the image.
    - backgroundColor: A hex color code (e.g., "#FF5733") that fits the mood of the topic.
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
