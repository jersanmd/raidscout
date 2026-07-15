// Fast transfer: concurrent PATCH in batches of 200
const https = require('https');

const OLD = { host: process.env.OLD_SUPABASE_HOST, key: process.env.OLD_SUPABASE_KEY };
const NEW = { host: process.env.NEW_SUPABASE_HOST, key: process.env.NEW_SUPABASE_KEY };

function fetchAll(host, path, key) {
  return new Promise((resolve, reject) => {
    const all = [];
    function page(offset) {
      https.get({ hostname: host, path: `/rest/v1/${path}&limit=1000&offset=${offset}`, headers: { apikey: key, Authorization: 'Bearer ' + key } }, res => {
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
  console.log('Fetching old DB...');
  const oldBosses = await fetchAll(OLD.host, 'bosses?select=id,name,server_id,boss_points', OLD.key);
  const oldServers = await fetchAll(OLD.host, 'servers?select=id,name', OLD.key);
  const oldSrvMap = new Map(oldServers.map(s => [s.id, s.name]));

  console.log('Fetching new DB...');
  const newBosses = await fetchAll(NEW.host, 'bosses?select=id,name,server_id', NEW.key);
  const newServers = await fetchAll(NEW.host, 'servers?select=id,name', NEW.key);
  const newSrvMap = new Map(newServers.map(s => [s.id, s.name]));

  const oldMap = new Map();
  for (const b of oldBosses) {
    if (b.boss_points == null) continue;
    oldMap.set(`${b.name}|${oldSrvMap.get(b.server_id)||''}`, b.boss_points);
  }

  const updates = [];
  for (const b of newBosses) {
    const oldPt = oldMap.get(`${b.name}|${newSrvMap.get(b.server_id)||''}`);
    if (oldPt != null) updates.push({ id: b.id, boss_points: oldPt });
  }
  console.log(`Matched ${updates.length} bosses to update`);

  let done = 0;
  for (let i = 0; i < updates.length; i += 200) {
    const batch = updates.slice(i, i + 200);
    await Promise.all(batch.map(u => new Promise(resolve => {
      const data = JSON.stringify({ boss_points: u.boss_points });
      const opts = { hostname: NEW.host, path: `/rest/v1/bosses?id=eq.${u.id}`, method: 'PATCH', headers: { apikey: NEW.key, Authorization: 'Bearer ' + NEW.key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Prefer: 'return=minimal' } };
      const r = https.request(opts, res => { res.on('end', resolve); });
      r.write(data); r.end();
    })));
    done += batch.length;
    console.log(`  ${done}/${updates.length}`);
  }
  console.log('Done!');
}
main().catch(e => console.error(e));
