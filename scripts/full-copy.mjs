// full-copy.mjs — Clone ALL data from production to staging (no filters)
// Run: $env:SUPABASE_PROD_KEY="..." $env:SUPABASE_STAGING_KEY="..." node scripts/full-copy.mjs

const PROD_KEY = process.env.SUPABASE_PROD_KEY;
const STAGING_KEY = process.env.SUPABASE_STAGING_KEY;
const PROD_URL = "https://cjuacehmienztxrhwnlg.supabase.co";
const STAGING_URL = "https://aavobydtkonccgyfxrmw.supabase.co";

if (!PROD_KEY || !STAGING_KEY) {
  console.error("Set SUPABASE_PROD_KEY and SUPABASE_STAGING_KEY");
  process.exit(1);
}

const PH = { apikey: PROD_KEY, Authorization: `Bearer ${PROD_KEY}` };
const SH = { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}`, "Content-Type": "application/json" };

// Load old→new user UUID map (created by migrate-users-full.mjs)
let userMap = new Map();
try {
  const fs = await import("fs");
  if (fs.existsSync("scripts/user-map.json")) {
    const data = JSON.parse(fs.readFileSync("scripts/user-map.json", "utf-8"));
    userMap = new Map(data);
    console.log(`Loaded ${userMap.size} user UUID mappings`);
  }
} catch {}

// ALL tables — full copy, upsert everything. Order matters: parent tables first (FK dependencies).
const TABLES = [
  // Foundation (no FKs or self-contained)
  "games","item_categories","item_rarities",
  // Servers & guilds
  "servers","guilds",
  // Config that depends on servers
  "app_settings",
  // Items (must come before member_gear, dkp_auctions, etc.)
  "items","item_collections","item_collection_items","item_collection_manual_ownership",
  // Bosses & activities
  "boss_templates","activity_templates","bosses","activities",
  "boss_guilds","boss_assists","boss_spawn_overrides",
  "activity_guilds","activity_assists","activity_instances","activity_parties",
  // Members & gear
  "members","member_gear","member_classes",
  "gear_slots","gear_slot_categories","gear_templates","gear_catalog","gear_upgrade_history",
  // DKP (auctions before bids)
  "dkp_auctions","dkp_bids","dkp_transactions","dkp_config","dkp_distributed","dkp_balances",
  // Attendance & death records
  "death_records","attendance_records","activity_attendance",
  // Parties (members must exist first)
  "static_parties","static_party_members",
  // Config & settings
  "discord_configs","server_classes","server_members","user_roles",
  "moderator_permissions","point_rules","point_adjustments",
  "leaderboard_snapshots","notifications","payments",
  "spawn_notifications","admin_audit_log","cp_updates","distributions",
  "member_notes","member_claim_requests",
  // Metrics
  "tick_metrics",
];

async function fetchAll(table) {
  const rows = [];
  let offset = 0, limit = 1000;
  while (true) {
    const url = `${PROD_URL}/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: PH });
    if (!res.ok) { if (res.status !== 404) console.error(`  ❌ ${table}: ${res.status}`); break; }
    const batch = await res.json();
    if (!batch || !batch.length) break;
    rows.push(...batch);
    offset += limit;
    process.stdout.write(`\r  ${table}: ${rows.length} rows...`);
  }
  if (rows.length) console.log(`\r  ${table}: ${rows.length} rows`);
  return rows;
}

// Delete helper: clear all rows from a staging table
async function clearStagingTable(table) {
  // Tables without an 'id' column need special handling
  if (table === "app_settings") {
    try {
      await fetch(`${STAGING_URL}/rest/v1/${table}?server_id=not.is.null`, { method: "DELETE", headers: SH });
    } catch (e) { console.error(`  ⚠️ clear app_settings failed:`, e.message); }
    return;
  }
  // Tables without an 'id' column — delete by a different column
  if (table === "server_members") {
    try {
      await fetch(`${STAGING_URL}/rest/v1/${table}?server_id=not.is.null`, { method: "DELETE", headers: SH });
    } catch {}
    return;
  }
  if (table === "user_roles") {
    try {
      await fetch(`${STAGING_URL}/rest/v1/${table}?user_id=not.is.null`, { method: "DELETE", headers: SH });
    } catch {}
    return;
  }
  if (table === "activity_parties") {
    try {
      await fetch(`${STAGING_URL}/rest/v1/${table}?activity_instance_id=not.is.null`, { method: "DELETE", headers: SH });
    } catch {}
    return;
  }
  // Supabase requires a WHERE clause for DELETE. Use a dummy condition that matches all.
  try {
    await fetch(`${STAGING_URL}/rest/v1/${table}?id=neq.00000000-0000-0000-0000-000000000000`, { method: "DELETE", headers: SH });
  } catch {}
}

async function upsertTable(table, rows) {
  if (!rows.length) return;
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    try {
      const res = await fetch(`${STAGING_URL}/rest/v1/${table}`, { method: "POST", headers: SH, body: JSON.stringify(chunk) });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        if (err.includes("23505") || err.includes("duplicate")) continue;
        // FK violation or other error — retry row-by-row to skip bad rows
        if (err.includes("23503") || err.includes("foreign key")) {
          let ok = 0;
          for (const row of chunk) {
            try {
              const r = await fetch(`${STAGING_URL}/rest/v1/${table}`, { method: "POST", headers: SH, body: JSON.stringify(row) });
              if (r.ok) ok++;
            } catch {}
          }
          if (ok < chunk.length) console.error(`  ⚠️ ${table}: ${ok}/${chunk.length} rows inserted (skipped ${chunk.length - ok} FK violations)`);
          continue;
        }
        console.error(`  ⚠️ ${table} chunk ${i}: ${err.slice(0, 80)}`);
      }
    } catch (e) { console.error(`  ⚠️ ${table}: ${e.message}`); }
  }
}

console.log("Full clone PROD → STAGING\n");

// Phase 1: Clear staging tables in REVERSE order (children before parents) to avoid FK violations
console.log("Clearing staging tables...");
for (const table of [...TABLES].reverse()) {
  await clearStagingTable(table);
}

// Phase 2: Fetch from production and insert into staging
for (const table of TABLES) {
  const rows = await fetchAll(table);
  if (!rows.length) continue;
  // Auto-remap any column matching a known old user UUID
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (row[key] && userMap.has(row[key])) row[key] = userMap.get(row[key]);
    }
  }
  await upsertTable(table, rows);
}
console.log("\n✅ Clone complete!");

// Phase 3: Clear Discord channel configs on staging (staging bot can't access production channels)
console.log("Clearing staging Discord channel configs...");
try {
  // Fetch all discord_configs IDs from staging
  const dcRes = await fetch(`${STAGING_URL}/rest/v1/discord_configs?select=id`, { headers: SH });
  if (dcRes.ok) {
    const dcRows = await dcRes.json();
    if (dcRows.length) {
      // PATCH all rows to null out channel columns (batch of 500)
      for (let i = 0; i < dcRows.length; i += 500) {
        const batch = dcRows.slice(i, i + 500);
        for (const row of batch) {
          await fetch(`${STAGING_URL}/rest/v1/discord_configs?id=eq.${row.id}`, {
            method: "PATCH",
            headers: { ...SH, Prefer: "return=minimal" },
            body: JSON.stringify({ notification_channel_id: null, thread_channel_id: null, command_channel_id: null }),
          }).catch(() => {});
        }
      }
      console.log(`  Cleared ${dcRows.length} discord_configs channel columns`);
    }
  }
} catch (e) { console.error(`  ⚠️ discord_configs cleanup: ${e.message}`); }

// Show audit log count
(async () => {
  const res = await fetch(`${PROD_URL}/rest/v1/admin_audit_log?select=count`, { headers: { ...PH, Prefer: "count=exact" } });
  const count = res.headers.get("content-range")?.split("/")[1] || "?";
  console.log(`\n📋 Production audit log entries: ${count}`);
})().catch(() => {});
