import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

/**
 * Robust helper to log safety incidents and logs directly to Supabase.
 * Gracefully falls back to local logging if the database connection fails or tables do not exist.
 */
export async function logToSupabase(log: {
  type: "danger" | "warning" | "safe";
  msg: string;
  time: string;
  metadata?: any;
}) {
  if (!supabase) {
    console.warn("Supabase is not initialized. Skipping DB log insertion.");
    return false;
  }

  try {
    const { error } = await supabase.from("safety_logs").insert([
      {
        log_type: log.type,
        message: log.msg,
        occurred_at: log.time,
        metadata: log.metadata || {},
      }
    ]);

    if (error) {
      console.warn("Supabase log insertion failed (expected if table safety_logs is not created yet):", error.message);
      return false;
    }
    
    console.log("Successfully logged incident to Supabase DB!");
    return true;
  } catch (err) {
    console.warn("Error inserting log to Supabase:", err);
    return false;
  }
}
