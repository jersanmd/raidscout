// Transfer admin_audit_log - Batch insert with FK error handling
import https from "https";

const OLD_HOST = "oeugehqgpodzhagomeex.supabase.co";
const OLD_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldWdlaHFncG9kemhhZ29tZWV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEyNjYwNiwiZXhwIjoyMDk0NzAyNjA2fQ.NXdVlAN6zanzfGggg960WVhtlliycdm_USV_m6YE1Ik";

const NEW_HOST = "cjuacehmienztxrhwnlg.supabase.co";
const NEW_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdWFjZWhtaWVuenR4cmh3bmxnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUzMzE2NiwiZXhwIjoyMDk2MTA5MTY2fQ.IFjdQxy9_2a6KNCOj3y-2VYdhYr6BYjxgAGCW-5cv-c";

function req(host, path, method, key, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: host,
      path,
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(body ? { Prefer: "return=minimal" } : {})
      }
    };
    const r = https.request(opts, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        const contentRange = res.headers["content-range"];
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, body: data, contentRange });
      });
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function fetchAll(host, table, key) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, contentRange } = await req(host, `/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}&order=id.asc`, "GET", key);
    const total = contentRange ? parseInt(contentRange.split("/")[1]) : null;
    if (!data || data.length === 0) break;
    all.push(...data);
    offset += data.length;
    if (total && all.length >= total) break;
  }
  return all;
}

async function main() {
  console.log("=== Transfer admin_audit_log ===\n");

  // Fetch from old DB
  console.log("Fetching from old DB...");
  const rows = await fetchAll(OLD_HOST, "admin_audit_log", OLD_KEY);
  console.log(`Total: ${rows.length} rows`);

  // Fetch valid server IDs from new DB
  console.log("Fetching valid server IDs from new DB...");
  const validServers = await fetchAll(NEW_HOST, "servers", NEW_KEY);
  const validServerIds = new Set(validServers.map(s => s.id));
  console.log(`Found ${validServerIds.size} valid servers\n`);

  // Clean rows
  let nulledServers = 0;
  const cleaned = rows.map(({ id, ...rest }) => {
    if (rest.server_id && !validServerIds.has(rest.server_id)) {
      rest.server_id = null;
      nulledServers++;
    }
    return rest;
  });
  console.log(`Nulled ${nulledServers} invalid server references`);
  console.log(`Inserting ${cleaned.length} records in batches...\n`);

  // Insert in batches of 500
  const chunkSize = 500;
  let totalInserted = 0;
  let totalFailed = 0;

  for (let i = 0; i < cleaned.length; i += chunkSize) {
    const chunk = cleaned.slice(i, i + chunkSize);
    const batchNum = Math.floor(i / chunkSize) + 1;
    
    let result = await req(NEW_HOST, "/rest/v1/admin_audit_log", "POST", NEW_KEY, chunk);
    
    if (result.status === 201) {
      totalInserted += chunk.length;
      console.log(`  Batch ${batchNum}: OK (${totalInserted}/${cleaned.length})`);
    } else if (result.body && result.body.includes("actor_id")) {
      // FK error on actor_id — retry with nulled actors
      console.log(`  Batch ${batchNum}: Actor FK error, retrying with nulled actors...`);
      const nulledChunk = chunk.map(r => ({ ...r, actor_id: null }));
      result = await req(NEW_HOST, "/rest/v1/admin_audit_log", "POST", NEW_KEY, nulledChunk);
      if (result.status === 201) {
        totalInserted += chunk.length;
        console.log(`  Batch ${batchNum}: OK after nulling actors (${totalInserted}/${cleaned.length})`);
      } else {
        console.error(`  Batch ${batchNum}: FAILED`, (result.body || "").substring(0, 150));
        totalFailed++;
      }
    } else {
      console.error(`  Batch ${batchNum}: FAILED (${result.status})`, (result.body || "").substring(0, 150));
      totalFailed++;
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`  Inserted: ~${totalInserted} records`);
  if (totalFailed > 0) console.log(`  Failed batches: ${totalFailed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
