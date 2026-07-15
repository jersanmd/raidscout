// Transfer boss_guilds from old DB to new DB
const https = require('https');

const OLD = { host: process.env.OLD_SUPABASE_HOST, key: process.env.OLD_SUPABASE_KEY };
const NEW = { host: process.env.NEW_SUPABASE_HOST, key: process.env.NEW_SUPABASE_KEY };

const h = (key) => ({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' });

function fetchAll(host, key) {
  return new Promise((resolve, reject) => {
    const all = [];
    function page(offset) {
      https.get({ hostname: host, path: `/rest/v1/boss_guilds?select=*&limit=1000&offset=${offset}&order=id`, headers: { apikey: key, Authorization: 'Bearer ' + key } }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          const data = JSON.parse(d);
          if (!data || data.length === 0) { resolve(all); return; }
          all.push(...data);
          if (data.length < 1000) { resolve(all); return; }
          page(offset + data.length);
        });
      }).on('error', reject);
    }
    page(0);
  });
}

async function main() {
  // 1. Fetch from old DB
  console.log('Fetching old DB...');
  const oldRows = await fetchAll(OLD.host, OLD.key);
  console.log(`Old DB: ${oldRows.length} rows`);

  // 2. Fetch existing from new DB (to get IDs for deletion)
  console.log('Fetching new DB...');
  const newRows = await fetchAll(NEW.host, NEW.key);
  console.log(`New DB: ${newRows.length} rows`);

  // 3. Delete all existing rows from new DB one by one
  console.log('Deleting new DB rows...');
  let deleted = 0;
  for (const row of newRows) {
    await new Promise(resolve => {
      const opts = { hostname: NEW.host, path: `/rest/v1/boss_guilds?id=eq.${row.id}`, method: 'DELETE', headers: { apikey: NEW.key, Authorization: 'Bearer ' + NEW.key, Prefer: 'return=minimal' } };
      const r = https.request(opts, res => { res.on('end', resolve); });
      r.end();
    });
    deleted++;
    if (deleted % 200 === 0) console.log(`  Deleted ${deleted}/${newRows.length}...`);
  }
  console.log(`  Deleted ${deleted} rows`);

  // 4. Insert old rows (strip id)
  const cleaned = oldRows.map(({ id, ...rest }) => rest);
  console.log(`Inserting ${cleaned.length} rows...`);

  let inserted = 0;
  for (let i = 0; i < cleaned.length; i += 500) {
    const chunk = cleaned.slice(i, i + 500);
    const data = JSON.stringify(chunk);
    const result = await new Promise(resolve => {
      const opts = { hostname: NEW.host, path: '/rest/v1/boss_guilds', method: 'POST', headers: { ...h(NEW.key), 'Content-Length': Buffer.byteLength(data), Prefer: 'return=minimal' } };
      const r = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ ok: res.statusCode === 201, err: d.substring(0, 150) })); });
      r.write(data);
      r.end();
    });
    if (result.ok) {
      inserted += chunk.length;
      console.log(`  Batch ${Math.floor(i/500)+1}: OK (${inserted}/${cleaned.length})`);
    } else {
      console.log(`  Batch ${Math.floor(i/500)+1}: FAILED - ${result.err}`);
      break;
    }
  }

  console.log(`\nDone! Transferred ${inserted} rows from old DB to new DB.`);
}
main().catch(e => console.error(e));
