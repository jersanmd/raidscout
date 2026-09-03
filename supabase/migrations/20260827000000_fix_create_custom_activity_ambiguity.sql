-- Creating an Activity failed for every user, every time.
--
-- Three copies of create_custom_activity existed in production. Two of them
-- accepted the IDENTICAL set of parameter names and types, differing only in
-- positional order:
--
--   A. (uuid,text,text,jsonb,integer,integer,text,text[],text)
--      9 params, no p_duration_minutes -- from the untracked supabase/rpc_img.sql
--   B. (uuid,text,text,jsonb,integer,integer,integer,text,text[],text)
--      p_duration_minutes before p_party_size -- untracked, in no migration
--   C. (uuid,text,text,jsonb,integer,integer,text,text[],integer,text)
--      p_duration_minutes after p_tags -- migration 089, the canonical one
--
-- PostgREST invokes RPCs with NAMED arguments, where order is irrelevant. The
-- client (src/lib/api/bosses.ts createCustomActivity) sends all ten names, which
-- match B and C equally well, so Postgres refused to choose:
--
--   ERROR 42725: function public.create_custom_activity(...) is not unique
--   HINT: Could not choose a best candidate function.
--
-- Deterministic, not flaky: every "Add Activity" submission hit this.
--
-- TIMELINE (oid ordering 18575 < 18805 < 20467 gives creation order):
--   2026-06-03  A created out-of-band from supabase/rpc_img.sql +
--               fix_rpc_img.sql -- loose files that live OUTSIDE migrations/.
--   (unknown)   B created out-of-band. It appears in NO file in this repo.
--   2026-06-20  C created by migration 089 (commit 2aabd25). C is the newest,
--               so 089 is the change that BROKE creation: before it, the
--               client's ten named keys matched B uniquely and worked.
--
-- So the tracked migration is the trigger, not the victim. The trap:
-- CREATE OR REPLACE only replaces a function whose signature matches exactly.
-- 089 moved p_duration_minutes from position 6 to position 9, which Postgres
-- reads as a DIFFERENT function -- so it added a fourth permutation instead of
-- updating the existing one, and the same-name-set collision was born.
-- Activity creation has been broken since 2026-06-20 (~2 months), which is why
-- it looks unrelated to any recent work: it is.
--
-- Fix: drop A and B, keep C. C is the one tracked in migrations/, so keeping it
-- is what prevents a re-run of 089 from recreating the collision. Its body is
-- also the most complete (the only one inserting both duration_minutes and an
-- explicit template_id); every column it writes was verified against
-- public.activities. A was unreachable regardless -- it lacks
-- p_duration_minutes, which the client always sends.
--
-- Verified beforehand: create_custom_activity is the ONLY function in the public
-- schema with this name-set collision, and it has exactly one caller
-- (src/lib/api/bosses.ts createCustomActivity). create_custom_boss and
-- update_custom_activity each have exactly one overload, which is why creating
-- a BOSS and editing an activity both kept working.
--
-- Verified after applying: one overload remains; the parse-only probe that
-- returned 42725 now plans cleanly; and an end-to-end call inside a
-- deliberately-aborted transaction returned a new activity id with no residue.

DROP FUNCTION IF EXISTS public.create_custom_activity(
  uuid, text, text, jsonb, integer, integer, text, text[], text);          -- A

DROP FUNCTION IF EXISTS public.create_custom_activity(
  uuid, text, text, jsonb, integer, integer, integer, text, text[], text); -- B

-- Re-assert the survivor so this migration is self-contained and the deployed
-- body provably matches tracked source. CREATE OR REPLACE on the identical
-- signature updates C in place and preserves its existing privileges.
CREATE OR REPLACE FUNCTION public.create_custom_activity(
  p_server_id UUID, p_name TEXT, p_schedule_type TEXT,
  p_schedule JSONB DEFAULT NULL,
  p_points_per_participant INTEGER DEFAULT 1,
  p_party_size INTEGER DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}',
  p_duration_minutes INTEGER DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.activities (
    server_id, template_id, name, schedule_type, schedule,
    points_per_participant, party_size, is_enabled, is_custom,
    category, tags, duration_minutes, image_url
  )
  VALUES (
    p_server_id, NULL, p_name, p_schedule_type, p_schedule,
    p_points_per_participant, p_party_size, true, true,
    p_category, p_tags, p_duration_minutes, p_image_url
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
