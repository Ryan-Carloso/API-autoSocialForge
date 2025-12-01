# API AutoPostBridge

An automated content generation and social media posting engine. It intelligently generates Videos, Carousels, and Audio-Visuals using AI and posts them via the PostBridge API.

## 🚀 How to Run (Step-by-Step)

### 1. Prerequisites
*   **Node.js** (v18 or higher)
*   **PostBridge Account** (for API Key and Social Account IDs)
*   **Supabase Project** (for file storage)
*   **AI Keys**: Google Gemini (Text/Scripting) & OpenAI (Video/Audio/TTS)

### 2. Installation
Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd API-AutoPostBridge
npm install
```

### 3. Configuration
Create your environment file:

```bash
cp .example.env .env
```

Open `.env` and fill in your keys:
*   **`API_KEY_POSTBRIDGE`**: Your PostBridge API Token.
*   **`GEMINI_API_KEY`**: For generating scripts, captions, and image designs.
*   **`OPENAI_API_KEY`**: For Speech-to-Text, Text-to-Speech, and Video generation.
*   **`SUPABASE_*`**: Connection details for your Supabase Storage bucket.

### 4. Define Your Content Groups
The system works by defining "Groups". Each group has a list of social account IDs and a source of content topics.

In your `.env` file, add groups like this:

```env
# Group Name: FOOTBALL
ACCOUNTS_FOOTBALL=1001,1002              # Comma-separated Social Account IDs
CONTENT_PATH_FOOTBALL=./src/football.ts  # Local file OR URL to JSON endpoint
```

### 5. Start the Engine
Run the development server:

```bash
npm run dev
```

The system will:
1.  Load your content topics.
2.  Randomly select a content type:
    *   **Video (5%)**: AI-generated vertical video.
    *   **Carousel (47.5%)**: Text-to-Image slides with white background.
    *   **Audio (47.5%)**: Text-to-Speech with synchronized subtitles.
3.  Generate the media assets.
4.  Upload to Supabase.
5.  Post to your social accounts via PostBridge.

---

## 📂 Project Structure

*   `src/controller.ts`: Main logic for probability distribution and delegation.
*   `src/generateContent/`: Modular generators.
    *   `text2audio/`: TTS + FFmpeg visualization.
    *   `text2video/`: AI Video generation.
    *   `text2carousel/`: Canvas-based image generation.
*   `src/services/`: Shared AI services (Gemini, OpenAI).
*   `src/config.ts`: Environment variable management.

## 🛠 Troubleshooting

*   **FFmpeg Error?**: Ensure `ffmpeg` is installed on your system (`brew install ffmpeg` on Mac).
*   **Canvas Error?**: You may need to install build tools if `@napi-rs/canvas` fails to load.
*   **Missing Keys?**: Double-check your `.env` file. The app will crash if required keys are missing.
