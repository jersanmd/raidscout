// Transfer missing data for tables with discrepancies
// boss_assists (7 rows, table was missing), boss_guilds (30), death_records (17), discord_configs (1)

const OLD_URL = "https://oeugehqgpodzhagomeex.supabase.co/rest/v1";
const OLD_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldWdlaHFncG9kemhhZ29tZWV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEyNjYwNiwiZXhwIjoyMDk0NzAyNjA2fQ.NXdVlAN6zanzfGggg960WVhtlliycdm_USV_m6YE1Ik";

const NEW_URL = "https://cjuacehmienztxrhwnlg.supabase.co/rest/v1";
const NEW_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdWFjZWhtaWVuenR4cmh3bmxnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUzMzE2NiwiZXhwIjoyMDk2MTA5MTY2fQ.IFjdQxy9_2a6KNCOj3y-2VYdhYr6BYjxgAGCW-5cv-c";

const hdrs = (key) => ({
  apikey: key, Authorization: `Bearer ${key}`,
  "Content-Type": "application/json", Prefer: "return=minimal"
});

async function fetchAll(url, table, key) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(`${url}/${table}?select=*&limit=${limit}&offset=${offset}`, { headers: hdrs(key) });
    if (!res.ok) throw new Error(`Fetch ${table}: ${res.status}`);
    const data = await res.json();
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < limit) break;
    offset += data.length;
  }
  return all;
}

async function insertBatch(url, table, key, rows) {
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(`${url}/${table}`, {
      method: "POST",
      headers: hdrs(key),
      body: JSON.stringify(chunk)
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: err.substring(0, 200) };
    }
  }
  return { ok: true };
}

async function transferTable(table, idField = "id") {
  console.log(`\n[${table}]`);
  
  // Fetch from old DB
  const oldRows = await fetchAll(OLD_URL, table, OLD_KEY);
  console.log(`  Old DB: ${oldRows.length} rows`);
  
  // Fetch from new DB to get existing IDs
  const newRows = await fetchAll(NEW_URL, table, NEW_KEY);
  const newIds = new Set(newRows.map(r => r[idField]));
  console.log(`  New DB: ${newRows.length} rows`);
  
  // Find missing
  const missing = oldRows.filter(r => !newIds.has(r[idField]));
  if (missing.length === 0) {
    console.log(`  ✅ No missing rows`);
    return;
  }
  
  console.log(`  ❌ Missing: ${missing.length} rows - transferring...`);
  
  // Clean: strip id if auto-generated in target (we preserve the original id for FK integrity)
  const result = await insertBatch(NEW_URL, table, NEW_KEY, missing);
  if (result.ok) {
    console.log(`  ✅ Transferred ${missing.length} rows`);
  } else {
    console.error(`  ❌ FAILED: ${result.error}`);
  }
}

async function main() {
  console.log("=== Transfer Missing Data ===\n");
  
  // 1. boss_assists (table was just created, should be 0 → 7)
  await transferTable("boss_assists");
  
  // 2. boss_guilds (972 → 942, missing 30)
  await transferTable("boss_guilds");
  
  // 3. death_records (2680 → 2663, missing 17)
  await transferTable("death_records");
  
  // 4. discord_configs (4 → 3, missing 1)
  await transferTable("discord_configs");
  
  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
