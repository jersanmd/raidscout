-- Seed beta test notifications for all servers with active subscriptions
-- Notifies both owner and all moderators (idempotent — safe to re-run)
-- Run this in Supabase SQL Editor after running 006_notifications.sql

DO $$
DECLARE
  s RECORD;
  m RECORD;
  days_left INT;
  already_done BOOLEAN;
BEGIN
  FOR s IN
    SELECT id, name, owner_id, subscription_ends_at
    FROM public.servers
    WHERE subscription_ends_at IS NOT NULL
      AND subscription_ends_at > now()
  LOOP
    days_left := CEIL(EXTRACT(EPOCH FROM (s.subscription_ends_at - now())) / 86400);
    
    IF days_left <= 0 THEN CONTINUE; END IF;

    -- Skip if owner already has a beta test notification for this server
    SELECT EXISTS(
      SELECT 1 FROM public.notifications
      WHERE user_id = s.owner_id
        AND server_id = s.id
        AND type = 'feature_announcement'
        AND title LIKE '🎉 Beta Test Reward%'
    ) INTO already_done;

    IF NOT already_done THEN
      INSERT INTO public.notifications (user_id, server_id, type, title, body, read, created_at)
      VALUES (
        s.owner_id,
        s.id,
        'feature_announcement',
        '🎉 Beta Test Reward — ' || days_left || ' Days',
        'Congratulations! As a thank you for participating in the RaidScout beta test, your server "' || s.name || '" has been granted ' || days_left || ' day' || CASE WHEN days_left != 1 THEN 's' ELSE '' END || ' of Pro access. Enjoy all premium features!',
        false,
        now()
      );
    END IF;

    -- Notify all moderators (skip duplicates too)
    FOR m IN
      SELECT user_id FROM public.server_members WHERE server_id = s.id AND role = 'moderator'
    LOOP
      SELECT EXISTS(
        SELECT 1 FROM public.notifications
        WHERE user_id = m.user_id
          AND server_id = s.id
          AND type = 'feature_announcement'
          AND title LIKE '🎉 Beta Test Reward%'
      ) INTO already_done;

      IF NOT already_done THEN
        INSERT INTO public.notifications (user_id, server_id, type, title, body, read, created_at)
        VALUES (
          m.user_id,
          s.id,
          'feature_announcement',
          '🎉 Beta Test Reward — ' || days_left || ' Days',
          'Congratulations! As a thank you for participating in the RaidScout beta test, the server "' || s.name || '" has been granted ' || days_left || ' day' || CASE WHEN days_left != 1 THEN 's' ELSE '' END || ' of Pro access. Enjoy all premium features!',
          false,
          now()
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
