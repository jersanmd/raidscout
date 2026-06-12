-- 101_scan_results: Persist AI scan results alongside rally images
-- so the RallyImageOverlay shows name badges when viewing saved images.

ALTER TABLE public.death_records
  ADD COLUMN IF NOT EXISTS scan_results JSONB DEFAULT NULL;

ALTER TABLE public.activity_instances
  ADD COLUMN IF NOT EXISTS scan_results JSONB DEFAULT NULL;

COMMENT ON COLUMN public.death_records.scan_results IS
  'AI vision scan results: { exactMatches: string[], fuzzyMatches: { detected: memberName }, unmatched: string[], alreadyAttended: string[] }';
