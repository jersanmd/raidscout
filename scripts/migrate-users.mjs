// Import auth users from old project to new project, preserving IDs
const oldKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldWdlaHFncG9kemhhZ29tZWV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEyNjYwNiwiZXhwIjoyMDk0NzAyNjA2fQ.NXdVlAN6zanzfGggg960WVhtlliycdm_USV_m6YE1Ik";
const newKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdWFjZWhtaWVuenR4cmh3bmxnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUzMzE2NiwiZXhwIjoyMDk2MTA5MTY2fQ.IFjdQxy9_2a6KNCOj3y-2VYdhYr6BYjxgAGCW-5cv-c";

const h = (k) => ({ apikey: k, Authorization: `Bearer ${k}`, "Content-Type": "application/json" });

async function migrate() {
  // 1. Get old users
  const oldRes = await fetch("https://oeugehqgpodzhagomeex.supabase.co/auth/v1/admin/users", { headers: h(oldKey) });
  const { users } = await oldRes.json();
  console.log(`Old users: ${users.length}`);

  // 2. Get existing new users to skip duplicates
  const newRes = await fetch("https://cjuacehmienztxrhwnlg.supabase.co/auth/v1/admin/users", { headers: h(newKey) });
  const { users: existingUsers } = await newRes.json();
  const existingIds = new Set(existingUsers?.map(u => u.id) || []);
  console.log(`Existing new users: ${existingIds.size}`);

  // 3. Create users in new project with original IDs
  let created = 0, skipped = 0;
  for (const u of users) {
    if (existingIds.has(u.id)) {
      skipped++;
      continue;
    }
    const payload = {
      id: u.id,
      email: u.email,
      password: "RaidScout2026!Temp", // temporary password - users must reset
      email_confirm: true,
      user_metadata: u.raw_user_meta_data || {},
    };
    const res = await fetch("https://cjuacehmienztxrhwnlg.supabase.co/auth/v1/admin/users", {
      method: "POST",
      headers: h(newKey),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      created++;
      console.log(`  Created: ${u.email}`);
    } else {
      const err = await res.text();
      console.log(`  FAILED: ${u.email} - ${err.slice(0, 100)}`);
    }
  }
  console.log(`\nCreated: ${created}, Skipped: ${skipped}, Total: ${users.length}`);
}

migrate().catch(e => console.error(e.message));
