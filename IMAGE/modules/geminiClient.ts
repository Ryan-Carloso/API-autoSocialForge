import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";
import config from "../config";
import { CarouselContent } from "./types";
import { ensureDir, getLogsDir, writeJson } from "./templateHandler";

function geminiLogDir(): string {
  const dir = path.join(getLogsDir(), "gemini");
  ensureDir(dir);
  return dir;
}

export async function generateCarouselWithLog(topic: string): Promise<CarouselContent> {
  if (!config.geminiKey) throw new Error("Gemini API Key not configured");
  const genAI = new GoogleGenerativeAI(config.geminiKey);
  const modelId = "gemini-2.5-flash-preview-09-2025";
  const model = genAI.getGenerativeModel({ model: modelId, generationConfig: { responseMimeType: "application/json" } });
  const prompt = `You are a social media strategist. Create a concise high-quality carousel with 3-4 slides. Optimize for engaging, scannable content. Return JSON with { slides: [ { id, title, subtitle, bullets } ], theme: { backgroundColor, textColor, accentColor } }. IDs must start at 1 and increment. Input:\n\n${topic}`;

  const requestLog = { timestamp: new Date().toISOString(), request: { model: modelId, topic, prompt } };
  const logNameBase = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeJson(geminiLogDir(), `${logNameBase}-request.json`, requestLog);

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text().trim();

  const responseLog = { timestamp: new Date().toISOString(), response: { text } };
  writeJson(geminiLogDir(), `${logNameBase}-response.json`, responseLog);

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
  throw new Error("Gemini returned unexpected format");
}

