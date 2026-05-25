// ── Register Discord Slash Commands ─────────────────────────
// Run once after deploying the bot to register commands with Discord.
// Usage: npx tsx scripts/register-discord-commands.ts
//
// Requires env vars: DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const APP_ID = process.env.DISCORD_APPLICATION_ID;

if (!TOKEN || !APP_ID) {
  console.error("Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID env vars.");
  process.exit(1);
}

const commands = [
  {
    name: "spawn",
    description: "Show boss spawns in the next 24 hours",
    options: [
      {
        name: "boss",
        description: "Filter by boss name (optional)",
        type: 3, // STRING
        required: false,
      },
    ],
  },
  {
    name: "kill",
    description: "Record a boss kill",
    options: [
      {
        name: "boss",
        description: "Boss name",
        type: 3, // STRING
        required: true,
      },
      {
        name: "time",
        description: "Custom death time in HH:MM format (optional, defaults to now)",
        type: 3, // STRING
        required: false,
      },
    ],
  },
];

async function register() {
  const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bot ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  const data = await res.json();

  if (res.ok) {
    console.log(`✅ Registered ${(data as any[]).length} commands:`);
    for (const cmd of data as any[]) {
      console.log(`  /${cmd.name} — ${cmd.description}`);
    }
  } else {
    console.error("❌ Failed to register commands:", data);
  }
}

register();
