-- Fix admin_audit_log_id_seq sequence to prevent duplicate key errors
-- Error: duplicate key value violates unique constraint "admin_audit_log_pkey"
-- Cause: The sequence fell behind the actual max ID in the table

DO $$
DECLARE
  v_max BIGINT;
BEGIN
  SELECT COALESCE(MAX(id), 0) INTO v_max FROM public.admin_audit_log;
  PERFORM setval('public.admin_audit_log_id_seq', v_max);
END $$;
