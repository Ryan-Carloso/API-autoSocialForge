import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import path from "path";
import fs from "fs";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

/**
 * Converts a single image into a silent 5 second video.
 * @param imagePath Absolute path to the source image (PNG/JPG)
 * @returns Promise resolving to the absolute path of the generated MP4 video
 */
export async function convertImageToVideo(imagePath: string): Promise<string> {
  const dir = path.dirname(imagePath);
  const ext = path.extname(imagePath);
  const name = path.basename(imagePath, ext);
  const videoPath = path.join(dir, `${name}.mp4`);

  return new Promise((resolve, reject) => {
    ffmpeg(imagePath)
      .loop(5) // Input looping
      .outputOptions([
        "-t 5",            // Total duration
        "-c:v libx264",      // Video codec
        "-pix_fmt yuv420p",  // Pixel format for compatibility
        "-r 30",             // Frame rate
        "-movflags +faststart", // Web optimization
        "-an"                // No audio
      ])
      .save(videoPath)
      .on("end", () => {
        if (fs.existsSync(videoPath)) {
          resolve(videoPath);
        } else {
          reject(new Error("Video file was not created"));
        }
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}
