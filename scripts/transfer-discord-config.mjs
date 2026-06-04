// Transfer the 1 missing discord_config row that was blocked by the old unique constraint
import https from "https";

const OLD_HOST = "oeugehqgpodzhagomeex.supabase.co";
const OLD_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldWdlaHFncG9kemhhZ29tZWV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEyNjYwNiwiZXhwIjoyMDk0NzAyNjA2fQ.NXdVlAN6zanzfGggg960WVhtlliycdm_USV_m6YE1Ik";

const NEW_HOST = "cjuacehmienztxrhwnlg.supabase.co";
const NEW_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdWFjZWhtaWVuenR4cmh3bmxnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUzMzE2NiwiZXhwIjoyMDk2MTA5MTY2fQ.IFjdQxy9_2a6KNCOj3y-2VYdhYr6BYjxgAGCW-5cv-c";

const hdrs = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" });

async function fetchAll(url, table, key) {
  const all = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${url}/${table}?select=*&limit=1000&offset=${offset}`, { headers: hdrs(key) });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += data.length;
  }
  return all;
}

async function main() {
  const oldRows = await fetchAll(`https://${OLD_HOST}/rest/v1`, "discord_configs", OLD_KEY);
  const newRows = await fetchAll(`https://${NEW_HOST}/rest/v1`, "discord_configs", NEW_KEY);
  
  const newIds = new Set(newRows.map(r => r.id));
  const missing = oldRows.filter(r => !newIds.has(r.id));
  
  console.log(`Old: ${oldRows.length}, New: ${newRows.length}, Missing: ${missing.length}`);
  
  if (missing.length === 0) {
    console.log("✅ Already in sync");
    return;
  }
  
  console.log("Missing row:");
  missing.forEach(r => {
    console.log(`  id: ${r.id}`);
    console.log(`  discord_guild_id: ${r.discord_guild_id}`);
    console.log(`  raidscout_server_id: ${r.raidscout_server_id}`);
    console.log(`  command_prefix: ${r.command_prefix}`);
    console.log(`  label: ${r.label}`);
  });
  
  // Insert
  const res = await fetch(`https://${NEW_HOST}/rest/v1/discord_configs`, {
    method: "POST",
    headers: hdrs(NEW_KEY),
    body: JSON.stringify(missing)
  });
  
  if (res.ok) {
    console.log(`✅ Transferred ${missing.length} row(s)`);
  } else {
    const err = await res.text();
    console.error(`❌ Failed: ${err.substring(0, 200)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
