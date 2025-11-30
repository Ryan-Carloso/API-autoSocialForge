import { createClient } from "@supabase/supabase-js";
import config from "../src/config";

const supabaseUrl = config.supabaseUrl;
const supabaseKey = config.supabaseKey;

// Since config.ts now throws if these are missing, we don't strictly need the check here,
// but TS might complain about string | undefined if not cast, but config returns string.
// However, let's keep it clean.
if (!supabaseUrl || !supabaseKey) {
  // This should technically not be reached if config.ts does its job, but safety first.
  throw new Error("Supabase URL or Key is missing in configuration.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
