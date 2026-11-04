# October 4, 2026 — Changelog

## 🔒 Security

- **The publishable (anon) key could call admin and viewer-link RPCs** — Phase 0 of viewer-link access control. Verified on production: the publishable key, which ships in the browser bundle, could call `get_all_users` (every account's email), `get_server_viewer_key` (any server's viewer link), `toggle_viewer_can_*` and `restore_server` on any server, and forge audit rows via `log_server_action`/`log_admin_action`. Supabase's default privileges grant `anon` EXECUTE on every new function in `public`, so none of these were ever limited to signed-in users.

  Migration `20261004000000` (applied) locks them down, with guards chosen from a caller trace so no legitimate flow changes: admin-only where only the Admin Panel calls; `get_user_id_by_email` stays open to server owners (they add moderators by email); `get_user_email` and the `log_*` helpers are revoked from client roles — only postgres-owned `SECURITY DEFINER` callers use them, which keeps the owners' audit-log emails; viewer-link functions allow owner/moderator, platform admins and the `servers.owner_id` holder (moderators may now regenerate the key). It also pins `search_path` on the audit trigger chain — it named its tables and functions without a schema and resolved through the caller's path, so the viewer toggles (now pinned to `''`) failed in their audit trigger — and rewrites the nine RLS policies that read `servers.viewer_key` as the invoking role (same results today) so hiding that column from anon next can't break anon reads of members, items, gear or DKP.

  Rehearsed on production in a rolled-back transaction: 34 role checks (anon, member, moderator, owner, non-member admin, service_role) passed, including the toggles' audit rows and a preview of the column revoke.

- **Anyone could list every server's rally images and CP screenshots** — Migration `20261004000001` (applied) drops the policies that exposed the screenshot buckets. Public URLs still serve, and members keep a read path to their own server's rally images so deletes work.

- **The bot posted the server's viewer key in Discord on every CP update** — `!updatestats` linked `/view/<viewer_key>?redirect=...`, which put the server's private viewer link in a public channel each time a member updated their CP. It now links `/m/<slug>` instead; a shadowed `const` had also meant the slug was never actually used. Deployed to Fly.

- **Site hardening ahead of the column revoke** — The viewer server read no longer selects `discord_webhook_url` (anon is about to lose it; the viewer-key lookup already returns it), and a failed read no longer marks the server expired. The servers realtime channel now listens to its own row only, and member profiles always use the member's own server and timezone, showing staff controls only for members of the current server.
