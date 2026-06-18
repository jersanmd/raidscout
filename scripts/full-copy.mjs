// full-copy.mjs — Copy all data from production to staging with filters
// Run: node scripts/full-copy.mjs

const PROD_KEY = process.env.SUPABASE_PROD_KEY;
const STAGING_KEY = process.env.SUPABASE_STAGING_KEY;
const PROD_URL = "https://cjuacehmienztxrhwnlg.supabase.co";
const STAGING_URL = "https://aavobydtkonccgyfxrmw.supabase.co";

if (!PROD_KEY || !STAGING_KEY) {
  console.error("Set SUPABASE_PROD_KEY and SUPABASE_STAGING_KEY");
  process.exit(1);
}

const PH = { apikey: PROD_KEY, Authorization: `Bearer ${PROD_KEY}` };
const SH = { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" };

const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 86400_000).toISOString();

// Table definitions: [name, timeFilter?]
const TABLES = [
  // No filtering — copy all
  ["app_settings"],
  ["games"],
  ["activity_templates"],
  ["item_categories"],
  ["servers"],
  ["guilds"],
  ["activities"],
  ["boss_templates"],
  ["static_parties"],
  ["static_party_members"],
  ["members"],
  ["member_classes"],
  ["discord_configs"],
  ["server_classes"],
  ["point_adjustments"],
  ["leaderboard_snapshots"],
  ["items"],
  ["item_collections"],
  ["collection_items"],
  ["item_ownership"],
  ["transactions"],
  ["listings"],
  ["cp_screenshots"],
  ["activity_attendance"],
  ["member_gear"],

  // Last 7 days only
  ["bosses", `created_at=gte.${SEVEN_DAYS_AGO}`],
  ["death_records", `death_time=gte.${SEVEN_DAYS_AGO}`],
  ["attendance_records", `created_at=gte.${SEVEN_DAYS_AGO}`],
  ["boss_guilds", `created_at=gte.${SEVEN_DAYS_AGO}`],
  ["boss_spawn_overrides", `created_at=gte.${SEVEN_DAYS_AGO}`],
  ["admin_audit_log", `created_at=gte.${SEVEN_DAYS_AGO}`],

  // Skip: spawn_notifications
];

async function fetchAll(table, filter) {
  const rows = [];
  let offset = 0;
  const limit = 1000;
  const query = filter ? `select=*&limit=${limit}&offset=${offset}&${filter}` : `select=*&limit=${limit}&offset=${offset}`;
  
  while (true) {
    const url = `${PROD_URL}/rest/v1/${table}?${query.replace(`offset=0`, `offset=${offset}`)}`;
    const res = await fetch(url, { headers: PH });
    if (!res.ok) {
      console.error(`  ❌ ${table}: ${res.status}`);
      break;
    }
    const batch = await res.json();
    if (!batch.length) break;
    rows.push(...batch);
    offset += limit;
    process.stdout.write(`\r  ${table}: ${rows.length} rows...`);
  }
  console.log(`\r  ${table}: ${rows.length} rows`);
  return rows;
}

async function upsertTable(table, rows) {
  if (!rows.length) return 0;
  let inserted = 0;
  const chunkSize = 500;
  
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    try {
      const res = await fetch(`${STAGING_URL}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...SH, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(chunk),
      });
      if (res.ok) {
        inserted += chunk.length;
      } else {
        // Try without merge-duplicates
        const r2 = await fetch(`${STAGING_URL}/rest/v1/${table}`, {
          method: "POST",
          headers: SH,
          body: JSON.stringify(chunk),
        });
        if (!r2.ok) {
          const err = await r2.text().catch(() => "");
          if (err.includes("23505") || err.includes("duplicate")) {
            inserted += chunk.length; // already exists
          } else {
            console.error(`  ⚠️ ${table} chunk ${i}: ${r2.status} ${err.slice(0,80)}`);
          }
        } else {
          inserted += chunk.length;
        }
      }
    } catch (e) {
      console.error(`  ⚠️ ${table} chunk ${i}: ${e.message}`);
    }
  }
  console.log(`  ✅ ${table}: ${inserted}/${rows.length}`);
  return inserted;
}

async function clearTable(table) {
  try {
    // Delete all rows
    let deleted = 0;
    while (true) {
      const res = await fetch(`${STAGING_URL}/rest/v1/${table}?select=id&limit=1000`, {
        method: "DELETE",
        headers: { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}`, Prefer: "return=minimal" },
      });
      if (res.ok) break;
      const err = await res.text().catch(() => "");
      if (err.includes("PGRST") || res.status === 404) break;
      console.error(`  Clear ${table}: ${res.status}`);
      break;
    }
  } catch {}
}

console.log("Full data copy PROD → STAGING\n");

for (const [table, filter] of TABLES) {
  // Skip tables that reference auth.users (user_id columns) — those need UUID remapping
  if (table === "server_members" || table === "user_roles") {
    console.log(`  ⏭️ ${table}: skipped (auth-dependent)`);
    continue;
  }
  
  console.log(`\n📋 ${table}${filter ? " (last 7 days)" : ""}`);
  const rows = await fetchAll(table, filter || null);
  if (rows.length > 0) {
    await upsertTable(table, rows);
  }
}

console.log("\n✅ Full copy complete!");
console.log("Note: server_members and user_roles preserved from migration script.");
