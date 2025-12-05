# API AutoPostBridge

Automated social media posting bridge that generates content (via Gemini AI or raw topics), converts it into engaging carousels (images or videos), and posts to the PostBridge API.

## Features

- **Multi-Group Support**: Configure different account groups (e.g., Football, Gym) with separate content sources.
- **AI Content Generation**: Uses Google Gemini API or OpenAI (GPT-4o) to generate captions and image text overlays based on topics.
- **Hybrid Content (Image/Video)**:
  - **Smart Conversion**: Randomly decides (50/50 chance) whether a post will be a carousel of **Static Images** or **Silent Videos** (5-second clips).
  - **Batch Consistency**: Ensures each carousel is either *all* videos or *all* images for a consistent viewer experience.
  - **Sequential Rotation**: Alternates content types (Video <-> Image) sequentially between scheduled posts.
- **Smart Scheduling**:
  - Automatically schedules posts for "Tomorrow" based on configured `postHours`.
  - Adds a 1-minute stagger between groups/posts to prevent API congestion.
- **Supabase Integration**: Uploads generated assets to Supabase Storage.
- **Draft Mode**: Set `IS_DEV=true` to post as drafts for safe testing.

## Setup Guide

### 1. Prerequisites
- Node.js installed
- A Supabase project (Storage bucket required)
- Google Gemini API Key OR OpenAI API Key
- PostBridge API Key
- `ffmpeg` installed (handled automatically via npm packages, but ensure system compatibility)

### 2. Installation
Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd API-AutoPostBridge
npm install
```

### 3. Environment Configuration
Create your `.env` file from the example:

```bash
cp .example.env .env
```

Open `.env` and fill in your credentials:

- **API Keys**: `API_KEY_POSTBRIDGE`
- **AI Provider**: Set `AI_PROVIDER=openai` (and add `OPENAI_API_KEY`) or `AI_PROVIDER=gemini` (and add `GEMINI_API_KEY`).
- **Supabase**: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_BUCKET`
- **Groups**: Define your account groups and content paths.
- **Content Paths**: Can be a local file path (TypeScript) OR a remote URL (returning JSON).

**Example Group Configuration:**
```env
# Group: Football (Local File)
ACCOUNTS_FOOTBALL=12345,67890
CONTENT_PATH_FOOTBALL=src/contents/football.ts

# Group: Gym (Remote JSON URL)
ACCOUNTS_GYM=11111,22222
CONTENT_PATH_GYM=https://api.example.com/v1/gym-topics
```

### 4. Visual Configuration (`configStyle.ts`)
You can customize the look and feel of the generated images by editing `IMAGE/configStyle.ts`. This file controls fonts, colors, margins, and spacing.

**Key Parameters in `IMAGE/configStyle.ts`:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `IMAGE_FONT_SIZE` | Font size for the main text | `30` |
| `IMAGE_TEXT_COLOR` | Hex color code for text | `#ffffff` |
| `IMAGE_MARGIN_HORIZONTAL` | General horizontal margin | `100` |
| `IMAGEM_MARGIM_LEFT` | Left margin for text | `100` |
| `IMAGEM_MARGIM_RIGHT` | Right margin (negative values can adjust wrap width) | `-240` |
| `IMAGE_MARGIN_TOP` | Top margin (starting Y position) | `165` |
| `IMAGE_MARGIN_BOTTOM` | Bottom margin limit | `50` |
| `SPACE_BETWEEN_LETTERS` | Letter spacing (tracking) | `4` |
| `SPACE_BETWEEN_PARAGRAPH` | Spacing between paragraphs/bullets | `15` |
| `FONT_WEIGHT` | Font weight (e.g., 600) | `600` |
| `FONT_STYLE` | Font style (e.g., "bold") | `"bold"` |
| `IMAGE_FONT_FILE` | Path to the font file (relative to IMAGE dir) | `"FONTS/Roboto-Medium.ttf"` |

**Note**: Ensure the font file specified in `IMAGE_FONT_FILE` exists in the project directory.

### 5. Running the Project
To start the content generation and scheduling pipeline:

```bash
npm run dev
```

The system will:
1. Iterate through all configured groups.
2. Pick a topic from the content source.
3. Generate content via Gemini.
4. Create images (and optionally convert to videos).
5. Upload assets to Supabase.
6. Schedule the post on PostBridge for tomorrow.

## Content Source Format

You can provide content in two ways:

### 1. Local TypeScript File
Create a file (e.g., `src/contents/football.ts`) exporting an `ideas` array:

```typescript
export const ideas = [
  "The evolution of striker roles in modern football",
  "Top 5 defensive strategies for 2025",
  "How VAR has changed the pace of the game"
];
```

### 2. Remote JSON URL
Provide a URL in `CONTENT_PATH_<NAME>` that returns a JSON array.
The system accepts:
- Simple string array: `["Topic 1", "Topic 2"]`
- Object array: `[ { "id": "1", "topic": "My Topic", "content": "..." }, ... ]`

## Troubleshooting

- **FFmpeg Errors**: If you see "Cannot find ffmpeg", ensure `npm install` ran successfully. The project uses `@ffmpeg-installer/ffmpeg` to provide binaries.
- **Font Errors**: If you see "Font file not found", check `IMAGE/configStyle.ts` and ensure `IMAGE_FONT_FILE` points to a valid `.ttf` file.
