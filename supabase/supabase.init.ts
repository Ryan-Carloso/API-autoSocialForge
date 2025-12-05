import { createClient } from "@supabase/supabase-js";
import config from "../IMAGE/config";

const supabaseUrl = config.supabaseUrl;
const supabaseKey = config.supabaseKey;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase URL or Key is missing in configuration.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
