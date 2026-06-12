// Fetches Discord avatar images for given usernames
// Usage: node scripts/fetch-testers.mjs
// Requires: DISCORD_BOT_TOKEN and DISCORD_GUILD_ID env vars

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

const usernames = [
  "itsyohboyjustin",
  "mr.handsome18",
  "vn1tv",
  "megane7182",
  "jshimura",
  ".iwhiterabbit",
  "daescord.",
  "itscj8",
  "bruubruu",
];

async function main() {
  if (!TOKEN) { console.error("Set DISCORD_BOT_TOKEN"); process.exit(1); }
  if (!GUILD_ID) { console.error("Set DISCORD_GUILD_ID"); process.exit(1); }

  console.log(`Searching ${usernames.length} users in guild ${GUILD_ID}...`);

  // Fetch all guild members (paginated)
  const members = [];
  let after = null;
  while (true) {
    const url = `https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=1000${after ? `&after=${after}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bot ${TOKEN}` } });
    if (!res.ok) {
      console.error(`Failed to fetch members: ${res.status}`);
      break;
    }
    const batch = await res.json();
    if (!batch.length) break;
    members.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user.id;
  }
  console.log(`Fetched ${members.length} members from guild.`);

  // Match usernames
  const results = [];
  const notFound = [];

  for (const target of usernames) {
    const lower = target.toLowerCase();
    const member = members.find((m) =>
      m.user?.username?.toLowerCase() === lower ||
      (m.nick && m.nick.toLowerCase() === lower)
    );
    if (member) {
      const user = member.user;
      const avatarHash = user.avatar;
      const discrim = user.discriminator || "0";
      const avatarUrl = avatarHash
        ? `https://cdn.discordapp.com/avatars/${user.id}/${avatarHash}.png?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discrim) % 5}.png`;
      results.push({ username: user.username, id: user.id, avatar_url: avatarUrl });
      console.log(`OK ${target} -> ${user.username} (${user.id})`);
    } else {
      notFound.push(target);
      console.log(`MISS ${target} not found`);
    }
  }

  // Download avatars
  if (results.length > 0) {
    const fs = await import("fs");
    const path = await import("path");
    const dir = "public/testers";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    for (const r of results) {
      const imgRes = await fetch(r.avatar_url);
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const slug = r.username.toLowerCase().replace(/[^a-z0-9]/g, "");
        const filepath = path.join(dir, `${slug}.png`);
        fs.writeFileSync(filepath, buffer);
        console.log(`SAVED ${filepath}`);
      }
    }
  }

  // Print results for TESTERS array
  console.log("\n--- Copy into LandingPage.tsx ---\n");
  for (const r of results) {
    const slug = r.username.toLowerCase().replace(/[^a-z0-9]/g, "");
    console.log(`  { name: "${r.username}", role: "Guild Member", avatar: "/testers/${slug}.png", discord: "${r.id}" },`);
  }
  if (notFound.length > 0) {
    console.log(`\nNot found: ${notFound.join(", ")}`);
  }
}

main().catch(console.error);
