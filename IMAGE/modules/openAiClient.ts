import OpenAI from "openai";
import path from "path";
import config from "../config";
import { CarouselContent } from "./types";
import { ensureDir, getLogsDir, writeJson } from "./templateHandler";

function openAiLogDir(): string {
  const dir = path.join(getLogsDir(), "openai");
  ensureDir(dir);
  return dir;
}

// Helper function to interact with the standard v1/chat/completions endpoint
async function callOpenAiResponses(
  prompt: string,
  modelId: string,
  jsonMode: boolean = false
): Promise<string> {
  if (!config.openAiKey) throw new Error("OpenAI API Key not configured");

  // Standard OpenAI Chat Completions API
  const url = "https://api.openai.com/v1/chat/completions";

  const payload: any = {
    model: modelId,
    messages: [{ role: "user", content: prompt }],
  };

  if (jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI v1/chat/completions failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function generateCarouselWithOpenAI(topic: string): Promise<CarouselContent> {
  const modelId = "gpt-5-nano-2025-08-07";

  const prompt = `You are a social media strategist. Create a concise high-quality carousel with 3-4 slides. Optimize for engaging, scannable content. Return JSON with { slides: [ { id, title, subtitle, bullets } ], theme: { backgroundColor, textColor, accentColor } }. IDs must start at 1 and increment. Input:\n\n${topic}`;

  const requestLog = { timestamp: new Date().toISOString(), request: { model: modelId, topic, prompt, endpoint: "v1/chat/completions" } };
  const logNameBase = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeJson(openAiLogDir(), `${logNameBase}-request.json`, requestLog);

  try {
    const text = await callOpenAiResponses(prompt, modelId, true);

    const responseLog = { timestamp: new Date().toISOString(), response: { text } };
    writeJson(openAiLogDir(), `${logNameBase}-response.json`, responseLog);

    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as any).slides)) {
      const slidesRaw = (parsed as any).slides as unknown[];
      const slides = slidesRaw.map((s, i) => {
        const o = s as Record<string, unknown>;
        const id = typeof o.id === "number" ? o.id : i + 1;
        const title = typeof o.title === "string" ? o.title : "";
        const subtitle = typeof o.subtitle === "string" ? o.subtitle : undefined;
        const bullets = Array.isArray(o.bullets) ? (o.bullets as unknown[]).map((b) => (typeof b === "string" ? b : "")).filter((b) => b.length > 0) : undefined;
        return { id, title, subtitle, bullets };
      });
      const themeObj = (parsed as any).theme as Record<string, unknown> | undefined;
      const theme = themeObj
        ? {
            backgroundColor: typeof themeObj.backgroundColor === "string" ? themeObj.backgroundColor : undefined,
            textColor: typeof themeObj.textColor === "string" ? themeObj.textColor : undefined,
            accentColor: typeof themeObj.accentColor === "string" ? themeObj.accentColor : undefined,
          }
        : undefined;
      return { slides, theme };
    }
    throw new Error("OpenAI returned unexpected format");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`OpenAI generation failed: ${msg}`);
  }
}

export async function generateCaptionWithOpenAI(topic: string): Promise<string> {
  const modelId = "gpt-5-nano-2025-08-07";

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
    return await callOpenAiResponses(prompt, modelId, false);
  } catch (error) {
    console.error("OpenAI caption generation failed:", error);
    throw error;
  }
}
