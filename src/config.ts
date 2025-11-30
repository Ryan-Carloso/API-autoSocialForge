import dotenv from "dotenv";

dotenv.config();

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`[CONFIG ERROR] Missing required environment variable: ${key}`);
    // We do not exit here to allow other errors to be logged, but in a real strict mode we might.
    // However, for "do not fallback", we return an empty string or throw.
    // The user said "do an log but do not fallback will be an invisible error".
    // Returning empty string will likely cause failure downstream, which is better than silent fallback.
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

// Optional env var with no fallback (returns undefined if missing, but logs if important?)
// For IS_DEV, it's a boolean flag, so checking existence is fine.
const isDev = process.env.IS_DEV === "true";

const port = Number(getEnv("PORT"));
const postbridgeToken = getEnv("API_KEY_POSTBRIDGE");

const groups = Object.keys(process.env)
  .filter((k) => k.startsWith("ACCOUNTS_"))
  .reduce<Record<string, string[]>>((acc, key) => {
    const name = key.replace("ACCOUNTS_", "").toLowerCase();
    const raw = (process.env[key] || "").trim();
    const list = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    acc[name] = list;
    return acc;
  }, {});

const accountIds = [
  ...new Set(
    Object.values(groups)
      .flat()
      .map((v) => Number(v))
      .filter((n) => !Number.isNaN(n))
  ),
];

export default {
  port,
  postbridgeToken,
  groups,
  accountIds,
  supabaseUrl: getEnv("SUPABASE_URL"),
  supabaseKey: getEnv("SUPABASE_KEY"),
  supabaseBucket: getEnv("SUPABASE_BUCKET"),
  supabaseFolder: getEnv("SUPABASE_FOLDER"),
  isDev,
};
