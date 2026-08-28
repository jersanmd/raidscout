-- "Looted by": the member who picked up the boss drop for this kill.
--
-- Lives on death_records like party_leaders does — it is a property of the
-- kill, not of any attendance row. Single member per kill (one drop, one
-- looter). Edited from the participants modal through the same staff update
-- path the party-leader selector already uses; no RLS changes needed.

ALTER TABLE public.death_records
  ADD COLUMN IF NOT EXISTS looted_by UUID REFERENCES public.members(id) ON DELETE SET NULL;
