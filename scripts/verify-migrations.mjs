// Verifies the consolidated schema matches the original migrations
import { readFileSync } from "fs";

const original = readFileSync("supabase/migrations/all_migrations.sql", "utf-8");
const consolidated = readFileSync("supabase/migrations/000_initial_schema.sql", "utf-8");

// Extract statements from each
function extract(contents) {
  const results = {
    tables: new Map(),
    policies: [],
    functions: [],
    triggers: [],
    indexes: [],
    grants: [],
    rls: new Set(),
    extensions: [],
  };

  // Simple extraction by pattern matching
  // Tables
  const tableMatches = [...contents.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi)];
  for (const m of tableMatches) results.tables.set(m[1].toLowerCase(), (results.tables.get(m[1].toLowerCase()) || 0) + 1);

  // ALTER ADD COLUMN
  const alterMatches = [...contents.matchAll(/ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+(?:COLUMN\s+)?(\w+)/gi)];
  for (const m of alterMatches) {
    const tbl = m[1].toLowerCase();
    if (results.tables.has(tbl)) results.tables.set(tbl, results.tables.get(tbl) + 1);
  }

  // Policies
  const policyMatches = [...contents.matchAll(/CREATE\s+POLICY\s+"?([^"]+)"?\s+ON\s+(?:public\.)?(\w+)/gi)];
  for (const m of policyMatches) results.policies.push(`${m[2].toLowerCase()}.${m[1]}`);

  // Functions
  const funcMatches = [...contents.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)/gi)];
  for (const m of funcMatches) results.functions.push(m[1].toLowerCase());

  // RLS
  const rlsMatches = [...contents.matchAll(/ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi)];
  for (const m of rlsMatches) results.rls.add(m[1].toLowerCase());

  return results;
}

const orig = extract(original);
const cons = extract(consolidated);

console.log("=== COMPARISON ===\n");

// Tables
console.log("--- TABLES ---");
const origTables = new Set(orig.tables.keys());
const consTables = new Set(cons.tables.keys());

for (const t of origTables) {
  if (!consTables.has(t)) console.log(`  ❌ MISSING in consolidated: ${t}`);
}
for (const t of consTables) {
  if (!origTables.has(t)) console.log(`  ⚠️  EXTRA in consolidated: ${t}`);
}
const tableMatch = [...origTables].filter(t => consTables.has(t));
console.log(`  ✅ Matching tables: ${tableMatch.length} / ${origTables.size}`);
if ([...origTables].filter(t => !consTables.has(t)).length === 0 && [...consTables].filter(t => !origTables.has(t)).length === 0) {
  console.log("  ✅ All tables match!");
}
console.log("");

// Functions
console.log("--- FUNCTIONS ---");
const origFuncs = new Set(orig.functions);
const consFuncs = new Set(cons.functions);
const funcMissing = [...origFuncs].filter(f => !consFuncs.has(f));
const funcExtra = [...consFuncs].filter(f => !origFuncs.has(f));
if (funcMissing.length) console.log(`  ❌ Missing: ${funcMissing.join(", ")}`);
if (funcExtra.length) console.log(`  ⚠️  Extra: ${funcExtra.join(", ")}`);
const funcMatch = [...origFuncs].filter(f => consFuncs.has(f));
console.log(`  ✅ Matching functions: ${funcMatch.length} / ${origFuncs.size}`);
if (funcMissing.length === 0 && funcExtra.length === 0) {
  console.log("  ✅ All functions match!");
}
console.log("");

// Policies
console.log("--- POLICIES ---");
const origPols = new Set(orig.policies);
const consPols = new Set(cons.policies);
const polMissing = [...origPols].filter(p => !consPols.has(p));
const polExtra = [...consPols].filter(p => !origPols.has(p));
if (polMissing.length) {
  console.log(`  ❌ Missing (${polMissing.length}):`);
  polMissing.slice(0, 20).forEach(p => console.log(`     ${p}`));
  if (polMissing.length > 20) console.log(`     ... and ${polMissing.length - 20} more`);
}
if (polExtra.length) {
  console.log(`  ⚠️  Extra (${polExtra.length}):`);
  polExtra.slice(0, 10).forEach(p => console.log(`     ${p}`));
}
const polMatch = [...origPols].filter(p => consPols.has(p));
console.log(`  ✅ Matching policies: ${polMatch.length} / ${origPols.size}`);
if (polMissing.length === 0 && polExtra.length === 0) {
  console.log("  ✅ All policies match!");
}
console.log("");

// RLS
console.log("--- RLS ---");
const rlsMissing = [...orig.rls].filter(t => !cons.rls.has(t));
const rlsExtra = [...cons.rls].filter(t => !orig.rls.has(t));
if (rlsMissing.length) console.log(`  ❌ RLS not enabled in consolidated: ${rlsMissing.join(", ")}`);
if (rlsExtra.length) console.log(`  ⚠️  Extra RLS in consolidated: ${rlsExtra.join(", ")}`);
if (rlsMissing.length === 0 && rlsExtra.length === 0) console.log("  ✅ All RLS match!");

console.log("\n=== SUMMARY ===");
console.log(`Tables:    ${origTables.size} orig → ${consTables.size} consolidated (${[...origTables].filter(t => consTables.has(t)).length} match)`);
console.log(`Functions: ${origFuncs.size} orig → ${consFuncs.size} consolidated (${funcMatch.length} match)`);
console.log(`Policies:  ${origPols.size} orig → ${consPols.size} consolidated (${polMatch.length} match)`);
console.log(`RLS:       ${orig.rls.size} orig → ${cons.rls.size} consolidated`);
