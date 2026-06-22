-- Migration 086: Fix admin_audit_log sequence out-of-sync
-- Error: duplicate key value violates unique constraint "admin_audit_log_pkey"

SELECT setval('public.admin_audit_log_id_seq', COALESCE((SELECT MAX(id) FROM public.admin_audit_log), 0));

-- Verify
DO $$
DECLARE
  v_seq BIGINT;
  v_max BIGINT;
BEGIN
  SELECT last_value INTO v_seq FROM public.admin_audit_log_id_seq;
  SELECT COALESCE(MAX(id), 0) INTO v_max FROM public.admin_audit_log;
  IF v_seq < v_max THEN
    RAISE EXCEPTION 'Sequence still behind: seq=%, max=%', v_seq, v_max;
  END IF;
END $$;
