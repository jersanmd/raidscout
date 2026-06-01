-- 014_auto_sync: Trigger-based auto-sync when templates are updated
-- When an admin updates a boss_template or activity_template, 
-- all linked server bosses/activities get updated automatically.

CREATE OR REPLACE FUNCTION public.sync_boss_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.bosses
  SET name = NEW.name,
      spawn_type = NEW.spawn_type,
      respawn_hours = NEW.respawn_hours,
      schedule = NEW.schedule,
      is_recurring = NEW.is_recurring,
      category = NEW.category,
      tags = NEW.tags,
      points = NEW.points
  WHERE template_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_boss_template ON public.boss_templates;
CREATE TRIGGER trg_sync_boss_template
  AFTER UPDATE ON public.boss_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_boss_template();

CREATE OR REPLACE FUNCTION public.sync_activity_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.activities
  SET name = NEW.name,
      schedule_type = NEW.schedule_type,
      schedule = NEW.schedule,
      duration_minutes = NEW.duration_minutes,
      points_per_participant = NEW.points_per_participant,
      party_size = NEW.party_size,
      category = NEW.category,
      tags = NEW.tags
  WHERE template_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_activity_template ON public.activity_templates;
CREATE TRIGGER trg_sync_activity_template
  AFTER UPDATE ON public.activity_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_activity_template();
