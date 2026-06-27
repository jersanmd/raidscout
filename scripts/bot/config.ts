// Shared config

export const TOKEN = process.env.DISCORD_BOT_TOKEN!;
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const SITE_URL = process.env.SITE_URL || "https://www.raidscout.com";
export const BOT_API_SECRET = process.env.BOT_API_SECRET;

export let botUserId = "";
export function setBotUserId(id: string) { botUserId = id; }

if (!TOKEN) { console.error("Set DISCORD_BOT_TOKEN"); process.exit(1); }
if (!SUPABASE_URL) { console.error("Set SUPABASE_URL"); process.exit(1); }
if (!SUPABASE_KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (!BOT_API_SECRET) { console.error("Set BOT_API_SECRET"); process.exit(1); }
