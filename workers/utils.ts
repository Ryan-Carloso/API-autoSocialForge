import path from 'path';
import config from '../IMAGE/config';

export function getMimeType(filename: string): string {
  if (filename.endsWith(".mp4")) return "video/mp4";
  return "image/png";
}

export function buildStoragePath(outputDir: string, group: string, filename: string): string {
  const folder = config.supabaseFolder.endsWith("/") ? config.supabaseFolder : `${config.supabaseFolder}/`;
  return `${folder}${group}/${path.basename(outputDir)}/${filename}`;
}
