# API AutoPostBridge

Automated social media posting bridge that generates content (via Gemini AI or raw topics) and posts to the PostBridge API.

## Features

- **Multi-Group Support**: Configure different account groups (e.g., Football, Gym) with separate content sources.
- **AI Content Generation**: Uses Google Gemini API to generate captions and image text overlays.
- **Fallback Mechanism**: Automatically falls back to raw topics if AI generation fails or quota is exceeded.
- **Supabase Integration**: Uploads generated images to Supabase Storage.
- **Draft Mode**: `IS_DEV=true` posts as drafts for testing.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Configuration**:
    Copy `.example.env` to `.env` and configure your keys.

    ```bash
    cp .example.env .env
    ```

3.  **Configuration Rules**:
    -   **Groups**: Define account groups using `ACCOUNTS_<NAME>` (comma-separated IDs).
    -   **Content Paths**: For *every* group, you must define a corresponding `CONTENT_PATH_<NAME>`.
    -   **Content Modules**: The content path must point to a TypeScript file exporting an `ideas` array (or default array).

    **Example**:
    ```env
    # Group: Football
    ACCOUNTS_FOOTBALL=123,456
    CONTENT_PATH_FOOTBALL=src/contents/football.ts
    ```

4.  **Run**:
    ```bash
    npm run dev
    ```

## Content Module Format

Create a TypeScript file (e.g., `src/contents/my-topic.ts`):

```typescript
export const ideas = [
  "Topic 1",
  "Topic 2",
  "Topic 3"
];
```

## Changelog

### [Latest] - Legacy Cleanup & Group Restructuring

-   **Removed**: Deprecated `IDEAS_CONTENT_*` environment variables (JSON strings in .env).
-   **Removed**: Single `CONTENT_PATH` configuration.
-   **Changed**: Content system now requires a 1:1 mapping between Account Groups (`ACCOUNTS_<NAME>`) and Content Paths (`CONTENT_PATH_<NAME>`).
-   **Added**: Strict validation at startup. The application will fail to start if an Account Group is defined without a corresponding Content Path.
-   **Refactored**: Startup logic now iterates through all configured groups, generating and posting unique content for each group.
