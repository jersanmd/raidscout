// migrate-users-full.mjs — Copy all users from production to staging, preserving server links
// 1. Fetch production user emails
// 2. Create on staging via Admin API
// 3. Update server_members, user_roles to use new UUIDs

const PROD_KEY = process.env.SUPABASE_PROD_KEY;
const STAGING_KEY = process.env.SUPABASE_STAGING_KEY;
const PROD_URL = "https://cjuacehmienztxrhwnlg.supabase.co";
const STAGING_URL = "https://aavobydtkonccgyfxrmw.supabase.co";

if (!PROD_KEY || !STAGING_KEY) {
  console.error("Set SUPABASE_PROD_KEY and SUPABASE_STAGING_KEY");
  process.exit(1);
}

const DEFAULT_PASSWORD = "staging123!";

async function main() {
  // 1. Fetch production user emails from CSV or API
  console.log("Step 1: Fetching production user list...");
  
  // Use Admin API
  const prodUsers = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${PROD_URL}/auth/v1/admin/users?per_page=100&page=${page}`, {
      headers: { apikey: PROD_KEY, Authorization: `Bearer ${PROD_KEY}` }
    });
    if (!res.ok) {
      console.error(`  Admin API failed: ${res.status} — trying REST fallback`);
      break;
    }
    const data = await res.json();
    if (!data.users || !data.users.length) break;
    prodUsers.push(...data.users.map(u => ({ id: u.id, email: u.email, created_at: u.created_at })));
    if (data.users.length < 100) break;
    page++;
  }

  // Fallback: use CSV
  if (!prodUsers.length) {
    console.log("  Admin API empty — check if you have users.csv");
    const fs = await import("fs");
    try {
      const csv = fs.readFileSync("scripts/users.csv", "utf-8");
      const lines = csv.trim().split("\n").filter(l => l.trim() && !l.startsWith("id,"));
      for (const line of lines) {
        const m = line.match(/^([0-9a-f-]{36}),([^,]+),/);
        if (m) prodUsers.push({ id: m[1], email: m[2] });
      }
    } catch { console.error("  No CSV found either"); process.exit(1); }
  }

  console.log(`  Found ${prodUsers.length} production users`);

  // 2. Create users on staging
  console.log("\nStep 2: Creating users on staging...");
  const idMap = new Map(); // oldId → newId

  for (let i = 0; i < prodUsers.length; i++) {
    const { id: oldId, email, created_at } = prodUsers[i];
    try {
      const res = await fetch(`${STAGING_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: DEFAULT_PASSWORD, email_confirm: true, created_at }),
      });
      if (res.ok) {
        const u = await res.json();
        idMap.set(oldId, u.id);
        if ((i + 1) % 10 === 0) process.stdout.write(`\r  Created ${i + 1}/${prodUsers.length}...`);
      } else {
        const err = await res.text().catch(() => "");
        if (err.includes("already been registered") || err.includes("already exists")) {
          // Find existing user on staging
          const findRes = await fetch(`${STAGING_URL}/auth/v1/admin/users?per_page=100`, {
            headers: { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}` }
          });
          if (findRes.ok) {
            const data = await findRes.json();
            const existing = (data.users || []).find(u => u.email === email);
            if (existing) {
              idMap.set(oldId, existing.id);
              // Update created_at to match production for email verification accuracy
              if (created_at) {
                fetch(`${STAGING_URL}/auth/v1/admin/users/${existing.id}`, {
                  method: "PUT",
                  headers: { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ created_at }),
                }).catch(() => {});
              }
              if ((i + 1) % 10 === 0) process.stdout.write(`\r  Mapped ${i + 1}/${prodUsers.length}...`);
            }
          }
        }
        // else: user creation failed, skip
      }
    } catch (e) {
      // skip failed users
    }
  }
  console.log(`\r  Created/mapped ${idMap.size}/${prodUsers.length} users`);

  // Save map for full-copy.mjs to use
  const fs = await import("fs");
  fs.writeFileSync("scripts/user-map.json", JSON.stringify([...idMap]));
  console.log("  Saved user-map.json");

  // 3. Update server_members
  console.log("\nStep 3: Remapping server_members...");
  let updatedMembers = 0;
  for (const [oldId, newId] of idMap) {
    try {
      const res = await fetch(
        `${STAGING_URL}/rest/v1/server_members?user_id=eq.${oldId}`,
        {
          method: "PATCH",
          headers: {
            apikey: STAGING_KEY,
            Authorization: `Bearer ${STAGING_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ user_id: newId }),
        }
      );
      if (res.ok) updatedMembers++;
    } catch {}
  }
  console.log(`  Updated ${updatedMembers} server_members`);

  // 4. Update user_roles
  console.log("\nStep 4: Remapping user_roles...");
  let updatedRoles = 0;
  for (const [oldId, newId] of idMap) {
    try {
      const res = await fetch(
        `${STAGING_URL}/rest/v1/user_roles?user_id=eq.${oldId}`,
        {
          method: "PATCH",
          headers: {
            apikey: STAGING_KEY,
            Authorization: `Bearer ${STAGING_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ user_id: newId }),
        }
      );
      if (res.ok) updatedRoles++;
    } catch {}
  }
  console.log(`  Updated ${updatedRoles} user_roles`);

  // 5. Remap user_id in all data tables
  const userColTables = {
    "death_records": ["user_id", "party_leader_id"],
    "items": ["created_by", "approved_by"],
    "admin_audit_log": ["actor_id"],
    "point_adjustments": ["adjusted_by"],
    "cp_updates": ["approved_by"],
    "member_notes": ["created_by"],
    "distributions": ["created_by"],
  };

  for (const [table, cols] of Object.entries(userColTables)) {
    let updated = 0;
    for (const [oldId, newId] of idMap) {
      for (const col of cols) {
        try {
          const res = await fetch(
            `${STAGING_URL}/rest/v1/${table}?${col}=eq.${oldId}`,
            { method: "PATCH", headers: { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ [col]: newId }) }
          );
          if (res.ok) updated++;
        } catch {}
      }
    }
    if (updated) console.log(`  Remapped ${table}: ${updated} rows`);
  }

  console.log(`\n✅ Done! ${idMap.size} users on staging — password: ${DEFAULT_PASSWORD}`);
}

main().catch(console.error);
