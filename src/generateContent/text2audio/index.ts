import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";
import ffmpeg from "fluent-ffmpeg";
// @ts-ignore
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import config from "../../config";
import { generateCaption } from "../../services/gemini";
import { GeneratedContent } from "../../types";

ffmpeg.setFfmpegPath(ffmpegPath.path);

// Ensure audio directory exists
const AUDIO_DIR = path.join(process.cwd(), "audio");
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// Helper to save WAV/Audio file
async function saveAudioFile(buffer: Buffer, filename: string): Promise<string> {
  const filePath = path.join(AUDIO_DIR, filename);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

// OpenAI TTS Helper
async function generateSpeechOpenAI(text: string): Promise<Buffer> {
  if (!config.openaiKey) throw new Error("OpenAI API Key missing for TTS");
  
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: text,
      voice: "alloy", // Default, can be randomized
      response_format: "wav",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI TTS Failed: ${err}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// OpenAI Whisper Helper (for subtitles)
async function transcribeAudio(audioPath: string): Promise<any> {
  if (!config.openaiKey) throw new Error("OpenAI API Key missing for Transcription");

  const formData = new FormData();
  formData.append("file", fs.createReadStream(audioPath));
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.openaiKey}`,
      ...formData.getHeaders(),
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Whisper Failed: ${err}`);
  }

  return await response.json();
}

function formatTime(seconds: number): string {
  const date = new Date(0);
  date.setMilliseconds(seconds * 1000);
  return date.toISOString().substr(11, 12).replace('.', ',');
}

// Generate SRT/ASS from Whisper words
function generateSubtitleFile(words: any[], outputPath: string) {
  let srtContent = "";
  words.forEach((word: any, index: number) => {
    const start = formatTime(word.start);
    const end = formatTime(word.end);
    srtContent += `${index + 1}\n${start} --> ${end}\n${word.word}\n\n`;
  });
  
  fs.writeFileSync(outputPath, srtContent);
  return outputPath;
}

// Audio Generation (Speech Synthesis + Video Visualization)
export async function handleAudioGeneration(topic: string): Promise<GeneratedContent> {
  console.log("Generating Audio Content (with Video Visualization)...");
  
  // 1. Generate Script
  let scriptText = "";
  try {
      const caption = await generateCaption(topic);
      scriptText = caption.replace(/#/g, ''); // Remove hashtags for speech
  } catch (e) {
      scriptText = `Here is a quick update about ${topic}. Stay tuned for more info.`;
  }

  // 2. Generate Audio (WAV)
  const audioBuffer = await generateSpeechOpenAI(scriptText);
  const audioFilename = `speech_${Date.now()}.wav`;
  const audioPath = await saveAudioFile(audioBuffer, audioFilename);
  
  // 3. Transcribe for Subtitles
  const transcription = await transcribeAudio(audioPath);
  const srtPath = path.join(AUDIO_DIR, `speech_${Date.now()}.srt`);
  generateSubtitleFile(transcription.words, srtPath);
  
  // 4. Generate Video using FFmpeg
  // White background, black text (subtitles)
  const videoFilename = `audio_visual_${Date.now()}.mp4`;
  const videoPath = path.join(process.cwd(), "dev_output", videoFilename);
  if (!fs.existsSync(path.dirname(videoPath))) fs.mkdirSync(path.dirname(videoPath), { recursive: true });
  
  const duration = transcription.duration || 15;

  // Verify SRT file
  if (!fs.existsSync(srtPath)) {
    throw new Error(`SRT file not found at ${srtPath}`);
  }
  const absoluteSrtPath = path.resolve(srtPath);

  // Function to run FFmpeg
  const runFfmpeg = (useSubtitles: boolean) => {
    return new Promise<void>((resolve, reject) => {
      const command = ffmpeg()
        .input("color=c=white:s=1080x1920:d=" + duration)
        .inputFormat("lavfi")
        .input(audioPath);

      if (useSubtitles) {
        // Try simple subtitles filter without force_style first
        // command.outputOptions([`-vf subtitles=${absoluteSrtPath}`]);
        
        // Or better, try to use the complex filter syntax which is more robust
        command.complexFilter([
          `[0:v]subtitles=${absoluteSrtPath}:force_style='Fontname=Arial,FontSize=24,PrimaryColour=&H000000,OutlineColour=&HFFFFFF,BorderStyle=1'[v]`
        ], 'v');
      } else {
        // Fallback: Simple text using Mac system font
        // If this fails, we might need to handle it, but let's try standard path
        const fontPath = '/System/Library/Fonts/Helvetica.ttc';
        command.complexFilter([
           `[0:v]drawtext=text='Audio Content':fontfile=${fontPath}:fontcolor=black:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2[v]`
        ], 'v');
      }

      command
        .outputOptions([
          '-c:v libx264',
          '-c:a aac',
          '-pix_fmt yuv420p',
          '-shortest'
        ])
        .save(videoPath)
        .on('start', (cmd) => console.log(`Spawned FFmpeg (subs=${useSubtitles}): ${cmd}`))
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });
  };

  try {
    console.log("Attempting video generation with subtitles...");
    await runFfmpeg(true);
  } catch (error) {
    console.error("Subtitle generation failed, falling back to simple video...", error);
    await runFfmpeg(false);
  }

  return {
    type: 'audio', // It's actually a video file now
    mediaPaths: [videoPath],
    caption: scriptText
  };
}
