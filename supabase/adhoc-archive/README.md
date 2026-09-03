# Ad-hoc SQL archive — ⛔ DO NOT RUN

Historical one-off scripts, kept for reference only. **Every file here is stale.**
They define older versions of functions that `supabase/migrations/` has since
replaced. Running any of them against a database will silently undo current
behavior — or worse, break a feature outright.

## This already happened

`rpc_img.sql` and `fix_rpc_img.sql` were run by hand against production on
2026-06-03. They created a `create_custom_activity` whose parameter list differed
from the one in `migrations/`. Because **`CREATE OR REPLACE FUNCTION` only
replaces a function whose signature matches exactly**, a differing parameter
order does not update the existing function — it creates an *additional* one.

Postgres then held several overloads with the same parameter *names*. PostgREST
invokes RPCs by name, so it could no longer choose between them and every call
failed with `42725: function ... is not unique`. **Creating an Activity was
broken for roughly two months** before anyone traced it back here. Fixed in
`migrations/20260827000000_fix_create_custom_activity_ambiguity.sql`.

## Rules

- **Never** run a file from this folder.
- Schema and function changes go in `supabase/migrations/` — nowhere else.
- Changing a function's parameter list? `DROP FUNCTION` the old signature
  explicitly in the same migration. `CREATE OR REPLACE` alone will leave the old
  one behind.
- To check for this class of problem, look for overloads sharing a name set:

  ```sql
  SELECT p.proname, count(*)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proargnames IS NOT NULL
  GROUP BY p.proname,
           (SELECT array_agg(a ORDER BY a) FROM unnest(p.proargnames) a)
  HAVING count(*) > 1;
  ```

  It should return zero rows.
