// Data migration: Old DB -> New DB
import { writeFileSync } from 'fs';

const oldKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldWdlaHFncG9kemhhZ29tZWV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEyNjYwNiwiZXhwIjoyMDk0NzAyNjA2fQ.NXdVlAN6zanzfGggg960WVhtlliycdm_USV_m6YE1Ik";
const newKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdWFjZWhtaWVuenR4cmh3bmxnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUzMzE2NiwiZXhwIjoyMDk2MTA5MTY2fQ.IFjdQxy9_2a6KNCOj3y-2VYdhYr6BYjxgAGCW-5cv-c";
const oldUrl = "https://oeugehqgpodzhagomeex.supabase.co/rest/v1";
const newUrl = "https://cjuacehmienztxrhwnlg.supabase.co/rest/v1";
const gameId = "00000000-0000-0000-0000-000000000001";

const hdrs = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" });

// Columns to strip because they reference auth.users (not migrated)
const stripAuthRefs = ["user_id", "adjusted_by"];

async function fetchAll(url, table, key) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(`${url}/${table}?select=*&limit=${limit}&offset=${offset}`, { headers: hdrs(key) });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function deleteAll(url, table, key) {
  try {
    const res = await fetch(`${url}/${table}?limit=1`, { headers: hdrs(key) });
    if (res.ok) {
      // Only delete non-seeded tables (skip games, boss_templates, activity_templates)
      const skip = ["games", "boss_templates", "activity_templates"];
      if (!skip.includes(table)) {
        await fetch(`${url}/${table}?id=neq.00000000-0000-0000-0000-000000000000`, { method: "DELETE", headers: hdrs(key) });
        console.log(`  Cleaned ${table}`);
      }
    }
  } catch (e) { /* table might not exist */ }
}

async function insertBatch(url, table, key, rows) {
  if (rows.length === 0) return;
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(`${url}/${table}`, {
      method: "POST",
      headers: hdrs(key),
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status}: ${err.slice(0, 300)}`);
    }
  }
  console.log(`  ${table}: ${rows.length} rows OK`);
}

function scheduleToUtc(schedule) {
  if (!Array.isArray(schedule)) return schedule;
  return schedule.map(slot => {
    const [h, m] = slot.time.split(":").map(Number);
    let totalMin = h * 60 + m - 480;
    let day = slot.day;
    if (totalMin < 0) { totalMin += 1440; day = (day + 6) % 7; }
    const newH = Math.floor(totalMin / 60);
    const newM = totalMin % 60;
    return { day, time: `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}` };
  });
}

async function migrate() {
  console.log("=== DATA MIGRATION v2 ===\n");

  // Ordered by FK dependency — only remaining tables
  const tables = [
    { name: "boss_guilds", transform: (r) => r, dedupKey: (r) => `${r.boss_id}|${r.guild_id}|${r.day_of_week ?? -1}` },
    { name: "discord_configs", transform: (r) => r, dedupKey: (r) => r.discord_guild_id },
  ];

  for (const { name, transform, dedupKey } of tables) {
    console.log(`\n[${name}]`);
    let rows = await fetchAll(oldUrl, name, oldKey);
    console.log(`  Fetched ${rows.length} rows`);
    
    let transformed = rows.map(transform);
    
    // Deduplicate if needed
    if (dedupKey) {
      const seen = new Set();
      const before = transformed.length;
      transformed = transformed.filter(r => {
        const k = dedupKey(r);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (transformed.length < before) console.log(`  Deduped: ${before} -> ${transformed.length}`);
    }
    
    try {
      await insertBatch(newUrl, name, newKey, transformed);
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }

  console.log("\n=== POST-MIGRATION BACKFILLS (run in Supabase SQL Editor) ===");
  console.log(`
UPDATE bosses b SET template_id = bt.id
FROM boss_templates bt
WHERE b.name = bt.name AND bt.game_id = '${gameId}' AND b.template_id IS NULL;

UPDATE bosses SET is_custom = true WHERE template_id IS NULL;
  `);
  console.log("\n=== DONE ===");
}

migrate().catch(e => { console.error(e); process.exit(1); });
