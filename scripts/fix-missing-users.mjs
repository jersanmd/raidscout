// fix-missing-users.mjs — Patch server_members rows still using production UUIDs
// Run after sync-staging.ps1 to create staging accounts for unmapped users.
// Usage: $env:SUPABASE_PROD_KEY="..." $env:SUPABASE_STAGING_KEY="..." node scripts/fix-missing-users.mjs

const PROD_KEY = process.env.SUPABASE_PROD_KEY;
const STAGING_KEY = process.env.SUPABASE_STAGING_KEY;
const PROD_URL = "https://cjuacehmienztxrhwnlg.supabase.co";
const STAGING_URL = "https://aavobydtkonccgyfxrmw.supabase.co";

const DEFAULT_PASSWORD = "staging123!";

if (!PROD_KEY || !STAGING_KEY) {
  console.error("Set SUPABASE_PROD_KEY and SUPABASE_STAGING_KEY");
  process.exit(1);
}

async function main() {
  // 1. Find unmapped user IDs in staging server_members (production UUIDs not in auth.users)
  console.log("Finding unmapped users...");
  const smRes = await fetch(
    `${STAGING_URL}/rest/v1/server_members?select=user_id&order=user_id`,
    { headers: { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}` } }
  );
  if (!smRes.ok) { console.error("Failed to fetch server_members:", smRes.status); process.exit(1); }
  const members = await smRes.json();
  const uniqueIds = [...new Set(members.map(m => m.user_id))];

  // Check which of these exist in staging auth.users
  let unmapped = [];
  for (const uid of uniqueIds) {
    const res = await fetch(
      `${STAGING_URL}/auth/v1/admin/users/${uid}`,
      { headers: { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}` } }
    );
    if (!res.ok) unmapped.push(uid);
  }
  console.log(`  Found ${unmapped.length} unmapped user IDs`);

  if (unmapped.length === 0) { console.log("✅ All users mapped!"); process.exit(0); }

  // 2. Look up production emails for unmapped IDs
  console.log("\nLooking up production emails...");
  const toCreate = [];
  for (const uid of unmapped) {
    const res = await fetch(
      `${PROD_URL}/auth/v1/admin/users/${uid}`,
      { headers: { apikey: PROD_KEY, Authorization: `Bearer ${PROD_KEY}` } }
    );
    if (res.ok) {
      const u = await res.json();
      toCreate.push({ prodId: uid, email: u.email, created_at: u.created_at });
      console.log(`  ${u.email}`);
    }
  }
  console.log(`  Found ${toCreate.length} production emails`);

  // 3. Create/map on staging
  console.log("\nCreating staging accounts...");
  let mapped = 0;
  for (const { prodId, email, created_at } of toCreate) {
    try {
      const res = await fetch(`${STAGING_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: DEFAULT_PASSWORD, email_confirm: true, created_at }),
      });
      if (res.ok) {
        const u = await res.json();
        // Update server_members
        await fetch(
          `${STAGING_URL}/rest/v1/server_members?user_id=eq.${prodId}`,
          { method: "PATCH", headers: { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ user_id: u.id }) }
        );
        mapped++;
      } else {
        const err = await res.text().catch(() => "");
        if (err.includes("already been registered")) {
          // Find existing staging user by email and remap
          const findRes = await fetch(`${STAGING_URL}/auth/v1/admin/users?per_page=100`, {
            headers: { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}` }
          });
          if (findRes.ok) {
            const data = await findRes.json();
            const existing = (data.users || []).find(u => u.email === email);
            if (existing) {
              await fetch(
                `${STAGING_URL}/rest/v1/server_members?user_id=eq.${prodId}`,
                { method: "PATCH", headers: { apikey: STAGING_KEY, Authorization: `Bearer ${STAGING_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ user_id: existing.id }) }
              );
              mapped++;
            }
          }
        }
      }
    } catch {}
  }
  console.log(`  Mapped ${mapped}/${toCreate.length} users`);
  console.log(`\n✅ Done! Password for new users: ${DEFAULT_PASSWORD}`);
}

main().catch(console.error);
