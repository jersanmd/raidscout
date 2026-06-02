// ── Test Spawn Notifications ──────────────────────────────
// Run: npx tsx scripts/test-spawn-notif.ts
// Requires: DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// @ts-nocheck

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TOKEN) { console.error("Set DISCORD_BOT_TOKEN"); process.exit(1); }
if (!SUPABASE_URL) { console.error("Set SUPABASE_URL"); process.exit(1); }
if (!SUPABASE_KEY) { console.error("Set SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const GUILD_ID = "1506237727236948028"; // Yvonne 6

async function supabaseQuerySafe(path: string): Promise<any> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY!}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch { return []; }
}

async function main() {
  // Find the notification channel for Yvonne 6
  const configs = await supabaseQuerySafe(
    `discord_configs?discord_guild_id=eq.${GUILD_ID}&select=notification_channel_id,raidscout_server_id,label`
  );
  
  if (!configs?.length) {
    console.error("No discord_configs found for guild", GUILD_ID);
    process.exit(1);
  }

  // Get server name
  const serverRows = await supabaseQuerySafe(
    `servers?select=name&id=eq.${configs[0].raidscout_server_id}&limit=1`
  );
  const serverName = serverRows?.[0]?.name || "Unknown";

  for (const cfg of configs) {
    if (!cfg.notification_channel_id) {
      console.log(`⚠️  No notification channel for "${cfg.label}", skipping`);
      continue;
    }

    const channelId = cfg.notification_channel_id;
    const now = Math.floor(Date.now() / 1000);
    const in5min = now + 300;

    console.log(`Sending test to channel ${channelId} (${cfg.label}) for server "${serverName}"`);

    // Test 1: 5-minute warning
    const text1 = `🧪 **TEST** — ⚠️ **Test Boss** will spawn in ~5 minutes!\n**TestGuild** — <t:${in5min}:f>`;
    const res1 = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: text1 }),
    });
    console.log(`  5-min warning: ${res1.ok ? "✅" : "❌ " + res1.status}`);

    // Test 2: Spawned now
    const text2 = `🧪 **TEST** — ⚠️ **Test Boss** has spawned!\n**TestGuild** — <t:${now}:f>`;
    const res2 = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: text2 }),
    });
    console.log(`  Spawned now: ${res2.ok ? "✅" : "❌ " + res2.status}`);
  }
}

main().catch(console.error);
