-- 022_gear_slots: Game-level gear slot definitions with subclasses
--   Admin defines what gear slots exist per game (Helm, Chest, Weapon, etc.)
--   Each slot can have subclasses that categorise equippable items

-- ── Gear Slots ──
CREATE TABLE IF NOT EXISTS public.gear_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game, name)
);

-- ── Gear Slot Subclasses ──
CREATE TABLE IF NOT EXISTS public.gear_slot_subclasses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES public.gear_slots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, name)
);

-- ── RLS: Slots readable by all, manageable by admins ──
ALTER TABLE public.gear_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gear_slot_subclasses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read gear slots" ON public.gear_slots;
CREATE POLICY "Anyone can read gear slots" ON public.gear_slots
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage gear slots" ON public.gear_slots;
CREATE POLICY "Admins can manage gear slots" ON public.gear_slots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Anyone can read gear slot subclasses" ON public.gear_slot_subclasses;
CREATE POLICY "Anyone can read gear slot subclasses" ON public.gear_slot_subclasses
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage gear slot subclasses" ON public.gear_slot_subclasses;
CREATE POLICY "Admins can manage gear slot subclasses" ON public.gear_slot_subclasses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── Seed default slots for LordNine ──
INSERT INTO public.gear_slots (game, name, sort_order)
VALUES
  ('lordnine', 'Helm', 1),
  ('lordnine', 'Chest', 2),
  ('lordnine', 'Gloves', 3),
  ('lordnine', 'Boots', 4),
  ('lordnine', 'Weapon', 5),
  ('lordnine', 'Necklace', 6),
  ('lordnine', 'Ring', 7),
  ('lordnine', 'Earring', 8),
  ('lordnine', 'Belt', 9),
  ('lordnine', 'Cloak', 10)
ON CONFLICT (game, name) DO NOTHING;
