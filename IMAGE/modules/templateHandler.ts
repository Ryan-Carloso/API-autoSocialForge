import path from "path";
import fs from "fs";
import { RenderOptions } from "./types";

function baseDir(): string {
  return path.resolve("/Users/itsector/Documents/GitHub/API-autoSocialForge/IMAGE");
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getTemplatePath(): string {
  const p = path.join(baseDir(), "template", "Remindergym.png");
  if (!fs.existsSync(p)) {
    throw new Error(`Template not found at ${p}`);
  }
  return p;
}

export function getLogsDir(): string {
  const logsDir = path.join(baseDir(), "logs");
  ensureDir(logsDir);
  return logsDir;
}

export function getOutputDir(group: string): string {
  const out = path.join(baseDir(), "output", group);
  ensureDir(out);
  const unit = path.join(out, new Date().toISOString().replace(/[:.]/g, "-"));
  ensureDir(unit);
  return unit;
}

export function getRenderOptionsFromEnv(): RenderOptions {
  const margin = Number(process.env.IMAGE_MARGIN || 20);
  const fontSize = Number(process.env.IMAGE_FONT_SIZE || 100);
  const textColor = String(process.env.IMAGE_TEXT_COLOR || "#ffffff");
  const defaultFontCandidates = [
    String(process.env.IMAGE_FONT_FILE || ""),
    "/System/Library/Fonts/SFNS.ttf",
    "/Library/Fonts/Arial.ttf",
    "/Library/Fonts/Helvetica.ttc",
  ];
  let fontFile = defaultFontCandidates.find((f) => !!f && fs.existsSync(f)) || "/Library/Fonts/Arial.ttf";
  if (!fs.existsSync(fontFile)) {
    throw new Error("Font file not found. Set IMAGE_FONT_FILE env to a valid font path.");
  }
  return { margin, fontSize, fontFile, textColor };
}

export function writeLog(message: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(getLogsDir(), `${today}.log`);
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, line);
  console.log(message);
}

export function writeJson(dir: string, filename: string, data: unknown): string {
  ensureDir(dir);
  const p = path.join(dir, filename);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

