# July 27, 2026 — Changelog

## 🐛 Bug Fixes

- **Gear tracking 403 error on save** — `writeAuditEntry` calls in the gear editor were fire-and-forget (missing `await`), causing unhandled 403 rejections from the RLS-protected audit table to appear as network errors in the console. All three call sites (`saveMemberGear`, `addCatalogItem`, `deleteCatalogItem`) now properly await with error handling.

## 🗄️ Database

- **Fix FK on member_gear and gear_upgrade_history** — Migration `024_member_gear_fk_fix` changes `catalog_item_id`, `old_item_id`, and `new_item_id` foreign keys from `gear_catalog` to `items`, matching what the gear editor actually uses. Also updates `get_gear_summary` RPC to join against `items` instead of `gear_catalog`.
