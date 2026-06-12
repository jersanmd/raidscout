// Consolidates all migrations into a single clean schema file
// Usage: node scripts/consolidate-migrations.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = "supabase/migrations";
const ARCHIVE_DIR = "supabase/migrations/archive";
const OUTPUT_FILE = "supabase/migrations/000_initial_schema.sql";

// Read and parse the all_migrations.sql
const content = readFileSync(join(MIGRATIONS_DIR, "all_migrations.sql"), "utf-8");

// Split into logical blocks
const lines = content.split("\n");

// Tracking
const tables = new Map(); // name -> { columns: Map<string, string>, constraints: [], indexes: [] }
const functions = [];
const policies = [];
const triggers = [];
const rpcGrants = [];
const extensions = [];
const inserts = []; // seed data
const rlsEnabled = new Set();
const other = [];

let currentSection = null;
let buffer = [];

function flushBuffer() {
  const sql = buffer.join("\n").trim();
  buffer = [];
  if (!sql) return;

  // Detect statement type
  const upper = sql.toUpperCase();

  if (sql.startsWith("CREATE TABLE") || sql.startsWith("create table")) {
    const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/i);
    if (match) {
      const name = match[1].toLowerCase();
      if (!tables.has(name)) {
        tables.set(name, { columns: new Map(), constraints: [], indexes: [], createStmt: sql });
      }
    }
  } else if (sql.match(/ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+(?:COLUMN\s+)?/i)) {
    const name = sql.match(/ALTER\s+TABLE\s+(?:public\.)?(\w+)/i)?.[1]?.toLowerCase();
    if (name && tables.has(name)) {
      // Extract column definition
      const colMatch = sql.match(/ADD\s+(?:COLUMN\s+)?(\w+)\s+([^;]+)/i);
      if (colMatch) {
        const colName = colMatch[1].toLowerCase();
        const colDef = colMatch[2].trim();
        tables.get(name).columns.set(colName, colDef);
      }
    } else {
      other.push(sql);
    }
  } else if (sql.includes("CREATE POLICY") || sql.includes("create policy")) {
    policies.push(sql);
  } else if (sql.includes("CREATE OR REPLACE FUNCTION") || sql.includes("create or replace function")) {
    functions.push(sql);
  } else if (sql.includes("CREATE INDEX") || sql.includes("create index")) {
    other.push(sql);
  } else if (sql.includes("CREATE TRIGGER") || sql.includes("create trigger")) {
    triggers.push(sql);
  } else if (sql.match(/ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)) {
    const name = sql.match(/ALTER\s+TABLE\s+(?:public\.)?(\w+)/i)?.[1]?.toLowerCase();
    if (name) rlsEnabled.add(name);
  } else if (sql.includes("GRANT EXECUTE")) {
    rpcGrants.push(sql);
  } else if (sql.includes("CREATE EXTENSION") || sql.includes("create extension")) {
    extensions.push(sql);
  } else if (sql.match(/INSERT\s+INTO/i) || sql.includes("insert into")) {
    inserts.push(sql);
    // Reset if it's a seed insert
  } else if (sql.startsWith("--") || sql.startsWith("/*")) {
    // Comments — skip
  } else if (sql.length > 5) {
    other.push(sql);
  }
}

// Process line by line, accumulating multi-line statements
let inStatement = false;
for (const line of lines) {
  const trimmed = line.trim();
  
  // Skip comment-only lines and empty lines
  if (!trimmed || trimmed.startsWith("--") && !buffer.length) continue;
  
  buffer.push(line);
  
  // Check if statement ends (semicolon at end or standalone)
  if (trimmed.endsWith(";") || trimmed === ";" || trimmed.endsWith("$$;") || trimmed.endsWith("$$")) {
    flushBuffer();
  }
}
// Flush remaining
if (buffer.length) flushBuffer();

// ── Build output ──
const output = [];

output.push("-- Consolidated Initial Schema for RaidScout");
output.push("-- Generated: " + new Date().toISOString());
output.push("-- Tables: " + tables.size + ", Policies: " + policies.length + ", Functions: " + functions.length);
output.push("");

// Extensions
if (extensions.length) {
  output.push("-- ── Extensions ──");
  output.push(...extensions);
  output.push("");
}

// Tables with all columns merged
for (const [name, table] of tables) {
  output.push(`-- ── ${name} ──`);
  output.push(table.createStmt);
  // Add any ALTER columns inline as comments showing they exist
  if (table.columns.size > 0) {
    output.push("-- Additional columns added over time:");
    for (const [col, def] of table.columns) {
      output.push(`-- ALTER TABLE ${name} ADD COLUMN ${col} ${def};`);
    }
  }
  if (rlsEnabled.has(name)) {
    output.push(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`);
  }
  output.push("");
}

// Policies
if (policies.length) {
  output.push("-- ── Row Level Security Policies ──");
  output.push(...policies);
  output.push("");
}

// Functions
if (functions.length) {
  output.push("-- ── Functions & RPCs ──");
  for (const fn of functions) {
    output.push(fn);
    output.push("");
  }
}

// RPC Grants
if (rpcGrants.length) {
  output.push("-- ── RPC Grants ──");
  output.push(...rpcGrants);
  output.push("");
}

// Indexes, triggers, other
if (other.length) {
  output.push("-- ── Indexes, Triggers & Other ──");
  output.push(...other.filter(s => s.trim()));
  output.push("");
}

// Seed data (commented out — for reference only)
if (inserts.length) {
  output.push("-- ── Seed Data (reference only, not applied on fresh deploy) ──");
  output.push("-- " + inserts.length + " INSERT statements available in seed.sql");
  output.push("");
}

const result = output.join("\n");
writeFileSync(OUTPUT_FILE, result);
console.log(`✅ Written ${OUTPUT_FILE} (${(result.length / 1024).toFixed(1)} KB)`);

// Move old migrations to archive
if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
console.log(`📁 Archive directory: ${ARCHIVE_DIR}`);
console.log("Run: git mv supabase/migrations/0*.sql supabase/migrations/archive/");
