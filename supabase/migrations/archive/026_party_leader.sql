ALTER TABLE public.death_records ADD COLUMN IF NOT EXISTS party_leader_id UUID REFERENCES public.members(id) ON DELETE SET NULL;
