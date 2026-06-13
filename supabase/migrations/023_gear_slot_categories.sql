-- 023_gear_slot_categories: Junction table linking gear slots to item_categories
--   Replaces gear_slot_subclasses with FK-based category assignment.
--   When equipping gear in a slot, only items in the assigned categories are shown.

DROP TABLE IF EXISTS public.gear_slot_subclasses;

CREATE TABLE IF NOT EXISTS public.gear_slot_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES public.gear_slots(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.item_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, category_id)
);

ALTER TABLE public.gear_slot_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read gear slot categories" ON public.gear_slot_categories;
CREATE POLICY "Anyone can read gear slot categories" ON public.gear_slot_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage gear slot categories" ON public.gear_slot_categories;
CREATE POLICY "Admins can manage gear slot categories" ON public.gear_slot_categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
