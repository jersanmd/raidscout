// Deep analysis: are the "missing" boss_guilds and discord_configs rows true duplicates?
import https from "https";

const OLD_HOST = "oeugehqgpodzhagomeex.supabase.co";
const OLD_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldWdlaHFncG9kemhhZ29tZWV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEyNjYwNiwiZXhwIjoyMDk0NzAyNjA2fQ.NXdVlAN6zanzfGggg960WVhtlliycdm_USV_m6YE1Ik";

const NEW_HOST = "cjuacehmienztxrhwnlg.supabase.co";
const NEW_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdWFjZWhtaWVuenR4cmh3bmxnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUzMzE2NiwiZXhwIjoyMDk2MTA5MTY2fQ.IFjdQxy9_2a6KNCOj3y-2VYdhYr6BYjxgAGCW-5cv-c";

function req(host, path) {
  return new Promise((resolve, reject) => {
    const key = host === OLD_HOST ? OLD_KEY : NEW_KEY;
    https.get({
      hostname: host, path,
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    }).on("error", reject);
  });
}

async function fetchAll(host, table) {
  const all = [];
  let offset = 0;
  while (true) {
    const data = await req(host, `/rest/v1/${table}?select=*&limit=1000&offset=${offset}&order=id`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += data.length;
  }
  return all;
}

async function main() {
  console.log("=== Deep Analysis: boss_guilds ===\n");
  
  const oldBg = await fetchAll(OLD_HOST, "boss_guilds");
  const newBg = await fetchAll(NEW_HOST, "boss_guilds");
  
  console.log(`Old: ${oldBg.length}, New: ${newBg.length}`);
  
  // Build set of unique keys from new DB
  const newKeys = new Set(
    newBg.map(r => `${r.boss_id}::${r.guild_id}::${r.day_of_week ?? 'NULL'}::${r.sort_order ?? 'NULL'}`)
  );
  
  // Find old rows whose unique key doesn't exist in new
  const trulyMissing = oldBg.filter(r => {
    const k1 = `${r.boss_id}::${r.guild_id}::${r.day_of_week ?? 'NULL'}::${r.sort_order ?? 'NULL'}`;
    return !newKeys.has(k1);
  });
  
  console.log(`Truly missing unique combos: ${trulyMissing.length}`);
  
  // Find duplicate combos (same key, different UUID)
  const dupes = oldBg.filter(r => {
    const k1 = `${r.boss_id}::${r.guild_id}::${r.day_of_week ?? 'NULL'}::${r.sort_order ?? 'NULL'}`;
    return newKeys.has(k1);
  }).filter(r => {
    // Is the UUID different from the one in new DB?
    const k1 = `${r.boss_id}::${r.guild_id}::${r.day_of_week ?? 'NULL'}::${r.sort_order ?? 'NULL'}`;
    const match = newBg.find(n => 
      n.boss_id === r.boss_id && n.guild_id === r.guild_id && 
      (n.day_of_week ?? null) === (r.day_of_week ?? null) &&
      (n.sort_order ?? null) === (r.sort_order ?? null)
    );
    return match && match.id !== r.id;
  });
  
  console.log(`Same combo, different UUID (dupes): ${dupes.length}`);
  
  if (dupes.length > 0) {
    console.log(`\nSample dupe (old → new UUID):`);
    console.log(`  boss: ${dupes[0].boss_id.substring(0,8)}…`);
    console.log(`  guild: ${dupes[0].guild_id.substring(0,8)}…`);
    console.log(`  day: ${dupes[0].day_of_week}`);
    console.log(`  old UUID: ${dupes[0].id}`);
    const match = newBg.find(n => n.boss_id === dupes[0].boss_id && n.guild_id === dupes[0].guild_id);
    console.log(`  new UUID: ${match?.id}`);
  }
  
  // discord_configs
  console.log(`\n=== Deep Analysis: discord_configs ===\n`);
  const oldDc = await fetchAll(OLD_HOST, "discord_configs");
  const newDc = await fetchAll(NEW_HOST, "discord_configs");
  console.log(`Old: ${oldDc.length}, New: ${newDc.length}`);
  
  const newDiscordIds = new Set(newDc.map(r => r.discord_guild_id));
  const missingDc = oldDc.filter(r => !newDiscordIds.has(r.discord_guild_id));
  console.log(`Truly missing discord_guild_ids: ${missingDc.length}`);
  
  const dupDc = oldDc.filter(r => newDiscordIds.has(r.discord_guild_id));
  console.log(`Already exists in new (dupes): ${dupDc.length}`);
  
  if (oldDc.length === newDc.length + missingDc.length + (dupDc.length > 0 ? 1 : 0)) {
    console.log(`\n✅ All accounted for — the difference is duplicate rows with different UUIDs`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
