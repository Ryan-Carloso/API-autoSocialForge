import config from "../config";
import { CarouselContent } from "./types";
import { generateCarouselWithLog as generateCarouselGemini } from "./geminiClient";
import { generateCaption as generateCaptionGemini } from "./gemini";
import { generateCarouselWithOpenAI, generateCaptionWithOpenAI } from "./openAiClient";

export async function generateCarousel(topic: string): Promise<CarouselContent> {
  if (config.aiProvider === "openai") {
    return generateCarouselWithOpenAI(topic);
  }
  // Default to Gemini
  return generateCarouselGemini(topic);
}

export async function generateCaption(topic: string): Promise<string> {
  if (config.aiProvider === "openai") {
    return generateCaptionWithOpenAI(topic);
  }
  // Default to Gemini
  return generateCaptionGemini(topic);
}
