import dotenv from "dotenv";

dotenv.config();

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`[CONFIG ERROR] Missing required environment variable: ${key}`);
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

const isDev = process.env.IS_DEV === "true";

const port = Number(getEnv("PORT"));
const postbridgeToken = getEnv("API_KEY_POSTBRIDGE");
const geminiKey = process.env.GEMINI_API_KEY;
const openAiKey = process.env.OPENAI_API_KEY;
const aiProvider = process.env.AI_PROVIDER || "gemini"; // "gemini" or "openai"
const postHours = [ 9, 10, 12, 14, 15, 18, 20, 22 ];

// Parse Groups and Content Paths
interface GroupConfig {
  name: string;
  accountIds: number[];
  contentPath: string;
}

const groupConfigs: GroupConfig[] = [];

// Identify all ACCOUNTS_* keys
const accountKeys = Object.keys(process.env).filter((k) => k.startsWith("ACCOUNTS_"));

for (const accountKey of accountKeys) {
  const groupName = accountKey.replace("ACCOUNTS_", ""); // e.g., "FOOTBALL"
  
  // 1. Parse Account IDs
  const rawAccounts = (process.env[accountKey] || "").trim();
  const accountIds = rawAccounts
    .split(",")
    .map((p) => Number(p.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0);

  if (accountIds.length === 0) {
    console.warn(`[CONFIG WARNING] Group ${groupName} has no valid account IDs. Skipping.`);
    continue;
  }

  // 2. Find Matching Content Path
  const contentPathKey = `CONTENT_PATH_${groupName}`;
  const contentPath = process.env[contentPathKey];

  if (!contentPath) {
    throw new Error(
      `[CONFIG ERROR] Group '${groupName}' is defined via ${accountKey}, but missing corresponding content path variable: ${contentPathKey}.`
    );
  }

  groupConfigs.push({
    name: groupName,
    accountIds,
    contentPath,
  });
}

if (groupConfigs.length === 0) {
  console.warn("[CONFIG WARNING] No valid account groups configured.");
}

export default {
  port,
  postbridgeToken,
  postbridgeUrl: process.env.POSTBRIDGE_URL || process.env.POSTBRIDGE_API_URL,
  postbridgePostsUrl: process.env.POSTBRIDGE_POSTS_URL || "https://api.post-bridge.com/v1/posts",
  postbridgeUploadUrl: process.env.POSTBRIDGE_UPLOAD_URL || "https://api.post-bridge.com/v1/media/create-upload-url",
  supabaseUrl: getEnv("SUPABASE_URL"),
  supabaseKey: getEnv("SUPABASE_KEY"),
  supabaseBucket: getEnv("SUPABASE_BUCKET"),
  supabaseFolder: getEnv("SUPABASE_FOLDER"),
  isDev,
  geminiKey,
  openAiKey,
  aiProvider,
  groupConfigs,
  postHours,
};
