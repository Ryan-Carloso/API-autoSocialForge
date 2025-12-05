import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import path from "path";
import fs from "fs";
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { CarouselContent, RenderOptions } from "./types";
import { ensureDir } from "./templateHandler";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

type FfprobeVideoStream = { width?: number; height?: number };

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const tentative = current.length > 0 ? `${current} ${w}` : w;
    if (tentative.length > maxCharsPerLine) {
      if (current.length > 0) lines.push(current);
      current = w;
    } else {
      current = tentative;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function computeLinesForSlide(title: string, subtitle: string | undefined, bullets: string[] | undefined, options: RenderOptions, width: number): { lines: string[]; breaks: Set<number> } {
  const availableWidth = width - (options.marginLeft + options.marginRight);
  const approxCharWidth = options.fontSize * 0.6 + options.letterSpacing;
  const maxChars = Math.max(1, Math.floor(availableWidth / approxCharWidth));
  const lines: string[] = [];
  const breaks: number[] = [];
  const titleLines = wrapText(title, maxChars);
  lines.push(...titleLines);
  if (titleLines.length > 0) breaks.push(lines.length - 1);
  if (subtitle) {
    const subLines = wrapText(subtitle, maxChars);
    lines.push(...subLines);
    if (subLines.length > 0) breaks.push(lines.length - 1);
  }
  if (bullets && bullets.length > 0) {
    for (const b of bullets) {
      const prefixed = `• ${b}`;
      const bl = wrapText(prefixed, maxChars);
      lines.push(...bl);
      if (bl.length > 0) breaks.push(lines.length - 1);
    }
  }
  return { lines, breaks: new Set(breaks) };
}

function buildDrawtextFilters(lines: string[], breaks: Set<number>, options: RenderOptions, width: number, height: number): string {
  const startY = options.marginTop;
  const lineHeight = Math.floor(options.fontSize * 1.1);
  const filters: string[] = [];
  let y = startY;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const escaped = line.replace(/:/g, '\\:').replace(/'/g, "\\'");
    filters.push(
      `drawtext=fontfile='${options.fontFile}':text='${escaped}':x=${options.marginLeft}:y=${y}:fontsize=${options.fontSize}:fontcolor=${options.textColor}:line_spacing=4:spacing=${options.letterSpacing}:box=0`
    );
    y += lineHeight;
    if (breaks.has(i)) y += options.paragraphSpacing;
    if (y > height - options.marginBottom - lineHeight) break;
  }
  return filters.join(",");
}

function ffprobeDimensions(templatePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(templatePath, (err, data) => {
      if (err || !data) {
        resolve({ width: 1080, height: 1080 });
        return;
      }
      const stream = (data.streams.find((s) => (s as FfprobeVideoStream).width) as FfprobeVideoStream) || {};
      const width = stream.width || 1080;
      const height = stream.height || 1080;
      resolve({ width, height });
    });
  });
}

export async function generateImagesFromCarousel(
  templatePath: string,
  carousel: CarouselContent,
  options: RenderOptions,
  outputDir: string
): Promise<string[]> {
  ensureDir(outputDir);
  const dims = await ffprobeDimensions(templatePath);
  if (!GlobalFonts.has(options.fontName)) {
    try {
      GlobalFonts.registerFromPath(options.fontFile, options.fontName);
    } catch {}
  }
  const files: string[] = [];
  for (const slide of carousel.slides) {
    const computed = computeLinesForSlide(slide.title, slide.subtitle, slide.bullets, options, dims.width);
    const filter = buildDrawtextFilters(computed.lines, computed.breaks, options, dims.width, dims.height);
    const outPath = path.join(outputDir, `photoID${slide.id}.png`);
    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(templatePath)
          .outputOptions(["-frames:v 1", "-y"]) // single frame, overwrite
          .videoFilters(filter)
          .output(outPath)
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .run();
      });
      if (!fs.existsSync(outPath)) throw new Error("ffmpeg output missing");
    } catch {
      const bg = await loadImage(templatePath);
      const width = bg.width || dims.width;
      const height = bg.height || dims.height;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bg, 0, 0, width, height);
      ctx.fillStyle = options.textColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = `${options.fontStyle} ${options.fontWeight} ${options.fontSize}px ${options.fontName}`;
      let y = options.marginTop;

      const lineHeight = Math.floor(options.fontSize * 1.1);
      for (let i = 0; i < computed.lines.length; i++) {
        const line = computed.lines[i];
        drawTextWithSpacing(ctx, line, options.marginLeft, y, options.letterSpacing, width - (options.marginLeft + options.marginRight));
        y += lineHeight;
        if (computed.breaks.has(i)) y += options.paragraphSpacing;
        if (y > height - options.marginBottom - lineHeight) break;
      }
      const buf = canvas.toBuffer("image/png");
      fs.writeFileSync(outPath, buf);
    }
    files.push(outPath);
  }
  return files;
}

function drawTextWithSpacing(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
  maxWidth: number
) {
  if (!letterSpacing || letterSpacing === 0) {
    ctx.fillText(text, x, y, maxWidth);
    return;
  }
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    const w = ctx.measureText(ch).width;
    cursor += w + letterSpacing;
    if (cursor - x > maxWidth) break;
  }
}
