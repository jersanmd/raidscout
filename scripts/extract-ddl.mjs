// extract-ddl.mjs — Extract clean DDL from pg_dump schema.sql
// Creates a consolidated migration file for staging branches

import { readFileSync, writeFileSync } from "fs";

const raw = readFileSync("schema.sql", "utf-8");

// Remove SET statements, comments, and data
let cleaned = raw
  .replace(/^SET .+;$/gm, "")
  .replace(/^SELECT .+;$/gm, "")
  .replace(/^--.+$/gm, "")
  .replace(/^\s*$/gm, "");

// Split into individual SQL statements
// pg_dump separates statements with blank lines
const statements = cleaned
  .split(/\n{2,}/)
  .map(s => s.trim())
  .filter(Boolean);

// Categorize statements
const extensions = [];
const tables = [];
const alterTables = [];
const indexes = [];
const functions = [];
const policies = [];
const triggers = [];
const others = [];

const SEQUENCE_MARKER = "__PG_DUMP_SEQUENCE__";

for (const stmt of statements) {
  // Skip data inserts, COPY, and pg_catalog stuff
  if (
    stmt.startsWith("COPY ") ||
    stmt.startsWith("INSERT INTO ") ||
    stmt.includes("pg_catalog.") && !stmt.startsWith("CREATE EXTENSION") ||
    stmt.startsWith("GRANT ") ||
    stmt.startsWith("REVOKE ") ||
    stmt.startsWith("COMMENT ") ||
    stmt.startsWith("ALTER DEFAULT PRIVILEGES") ||
    stmt.startsWith("CREATE SEQUENCE") ||
    stmt.startsWith("ALTER SEQUENCE") ||
    stmt.startsWith("CREATE TRIGGER") && stmt.includes("supabase") ||
    stmt.includes("OWNER TO") ||
    stmt === "\\." ||
    stmt.startsWith("--") ||
    stmt.startsWith("/*") ||
    stmt.match(/^\d+\s/) // data lines from COPY
  ) {
    continue;
  }

  if (stmt.startsWith("CREATE EXTENSION")) {
    extensions.push(stmt);
  } else if (stmt.startsWith("CREATE TABLE")) {
    // Replace "CREATE TABLE [ONLY] public.xxx" → "CREATE TABLE IF NOT EXISTS xxx"
    let cleaned = stmt.replace(/^CREATE TABLE (ONLY )?public\./, "CREATE TABLE IF NOT EXISTS ");
    tables.push(cleaned);
  } else if (stmt.startsWith("ALTER TABLE") && (stmt.includes("ENABLE ROW LEVEL SECURITY") || stmt.includes("ENABLE ALWAYS"))) {
    alterTables.push(stmt);
  } else if (stmt.startsWith("ALTER TABLE") && stmt.includes("ADD CONSTRAINT")) {
    // Keep FK, unique, and PK constraints
    alterTables.push(stmt);
  } else if (stmt.startsWith("ALTER TABLE")) {
    // Skip sequence defaults (pg_dump artifacts for SERIAL columns — our tables use UUIDs)
    if (stmt.includes("nextval")) continue;
    // Skip OWNER TO changes
    if (stmt.includes("OWNER TO")) continue;
    alterTables.push(stmt);
  } else if (stmt.startsWith("CREATE") && stmt.includes("INDEX")) {
    let cleaned = stmt
      .replace(/^CREATE (UNIQUE )?INDEX ([^\s]+) ON (ONLY )?public\./, "CREATE $1INDEX IF NOT EXISTS $2 ON ");
    indexes.push(cleaned);
  } else if (stmt.startsWith("CREATE OR REPLACE FUNCTION")) {
    functions.push(stmt);
  } else if (stmt.startsWith("CREATE POLICY")) {
    policies.push(stmt);
  } else if (stmt.startsWith("CREATE TRIGGER")) {
    triggers.push(stmt);
  } else if (stmt.match(/^(CREATE|ALTER) (FUNCTION|TABLE|INDEX|POLICY|TRIGGER|TYPE|DOMAIN|VIEW)/)) {
    others.push(stmt);
  }
}

// Build migration — sort ALTER TABLE: PK constraints first, then others, then FKs last
const pkAlters = alterTables.filter(s => s.includes("PRIMARY KEY"));
const fkAlters = alterTables.filter(s => s.includes("FOREIGN KEY"));
const otherAlters = alterTables.filter(s => !s.includes("PRIMARY KEY") && !s.includes("FOREIGN KEY"));
const sortedAlters = [...pkAlters, ...otherAlters, ...fkAlters];

const parts = [
  "-- Consolidated Production Schema",
  `-- Generated: ${new Date().toISOString()}`,
  `-- Tables: ${tables.length}, Indexes: ${indexes.length}, Functions: ${functions.length}, Policies: ${policies.length}`,
  "",
  "-- ── Extensions ──",
  ...extensions,
  "",
  "-- ── Tables ──",
  ...tables,
  "",
  "-- ── Alter Tables ──",
  ...sortedAlters,
  "",
  "-- ── Indexes ──",
  ...indexes,
  "",
  "-- ── Functions ──",
  "",
  "SET check_function_bodies = false;",
  "",
  ...functions,
  "",
  "-- ── Policies ──",
  ...policies,
  "",
  "-- ── Triggers ──",
  ...triggers,
];

if (others.length > 0) {
  parts.push("", "-- ── Other ──", ...others);
}

const output = parts.join("\n\n") + "\n";
writeFileSync("supabase/migrations/000_consolidated_production.sql", output);

console.log(`✅ Written supabase/migrations/000_consolidated_production.sql`);
console.log(`   Extensions: ${extensions.length}`);
console.log(`   Tables: ${tables.length}`);
console.log(`   Alter Tables: ${alterTables.length}`);
console.log(`   Indexes: ${indexes.length}`);
console.log(`   Functions: ${functions.length}`);
console.log(`   Policies: ${policies.length}`);
console.log(`   Triggers: ${triggers.length}`);
console.log(`   Skipped: ${others.length} other statements`);
console.log(`   Total size: ${(output.length / 1024).toFixed(1)} KB`);
