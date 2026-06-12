-- 010_activities_and_parties: Activities, instances, parties, attendance
-- Depends on 009 (games, templates).

CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.activity_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('recurring', 'one_time')),
  schedule JSONB,
  duration_minutes INTEGER,
  points_per_participant INTEGER NOT NULL DEFAULT 1,
  party_size INTEGER,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_custom BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_instance_id UUID NOT NULL REFERENCES public.activity_instances(id) ON DELETE CASCADE,
  party_number INTEGER NOT NULL,
  member_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_instance_id, party_number)
);

CREATE TABLE IF NOT EXISTS public.activity_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_instance_id UUID NOT NULL REFERENCES public.activity_instances(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  present BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_instance_id, member_id)
);

-- RLS
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_attendance ENABLE ROW LEVEL SECURITY;
