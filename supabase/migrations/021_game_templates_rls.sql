-- 021_game_templates_rls: RLS policies for games and template tables

-- ── Games ──────────────────────────────────────────────────
CREATE POLICY "Anyone can read games" ON public.games
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage games" ON public.games
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Boss Templates ─────────────────────────────────────────
CREATE POLICY "Anyone can read boss templates" ON public.boss_templates
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage boss templates" ON public.boss_templates
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Activity Templates ─────────────────────────────────────
CREATE POLICY "Anyone can read activity templates" ON public.activity_templates
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage activity templates" ON public.activity_templates
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());
