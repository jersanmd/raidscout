// Try multiple connection approaches
const passwords = [process.env.DB_PASSWORD].filter(Boolean);
if (!passwords.length) {
  console.error("Set DB_PASSWORD environment variable");
  process.exit(1);
}
let connected = false;

async function tryConnect(host, port, user) {
  const { Client } = require('pg');
  for (const pw of passwords) {
    const client = new Client({ host, port, database: 'postgres', user, password: pw, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
    try {
      await client.connect();
      console.log(`Connected: ${user}@${host}:${port}`);
      return client;
    } catch (e) {
      // try next
    }
  }
  return null;
}

async function run() {
  let client;
  
  // Try pooler first
  client = await tryConnect('aws-0-ap-southeast-1.pooler.supabase.com', 6543, 'postgres.cjuacehmienztxrhwnlg');
  if (!client) {
    // Try direct
    client = await tryConnect('db.cjuacehmienztxrhwnlg.supabase.co', 5432, 'postgres');
  }
  
  if (!client) {
    console.error('Could not connect. Please run the SQL manually in Supabase dashboard:');
    const sql = require('fs').readFileSync('supabase/migrations/050_schema_fixes.sql', 'utf8');
    console.log(sql);
    process.exit(1);
  }

  const { rows } = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('boss_guilds','point_adjustments','moderator_permissions','boss_spawn_overrides','point_rules')");
  console.log('Existing tables:', rows.map(r => r.table_name));

  if (!rows.find(r => r.table_name === 'boss_guilds')) {
    const sql50 = require('fs').readFileSync('supabase/migrations/050_schema_fixes.sql', 'utf8');
    await client.query(sql50);
    console.log('050_schema_fixes executed');
  }

  const sql51 = require('fs').readFileSync('supabase/migrations/051_helper_functions.sql', 'utf8');
  if (sql51.trim()) {
    await client.query(sql51);
    console.log('051_helper_functions executed');
  }

  await client.end();
  console.log('Done');
}

run().catch(e => { console.error(e.message); process.exit(1); });
