import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase credentials not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local"
  );
}

/** Check if Supabase is configured (not the placeholder values) */
export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseKey && !supabaseUrl.includes("your-project") && !supabaseKey.includes("your-key");
}

// Only create the client when properly configured, otherwise use a no-op placeholder
// that won't crash but will fail gracefully on any actual calls.
export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl!, supabaseKey!)
  : createClient("https://placeholder.supabase.co", "placeholder-key");

// Re-export URL and key for edge function calls
export { supabaseUrl, supabaseKey };

// ── Server ID helper (set by ServerContext, used by inserts) ──
let _currentServerId: string | null = null;
export function setCurrentServerId(id: string | null) { _currentServerId = id; }
export function getCurrentServerId(): string | null { return _currentServerId; }

// ── Viewer key helper (set by AuthContext, used for viewer writes) ──
let _currentViewerKey: string | null = null;
export function setCurrentViewerKey(key: string | null) { _currentViewerKey = key; }
export function getCurrentViewerKey(): string | null { return _currentViewerKey; }
