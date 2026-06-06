-- 102_analytics_activity_hunters: Include activity attendance in top_hunters + activity_participation stat

CREATE OR REPLACE FUNCTION get_analytics(
  since TEXT,
  s_id UUID DEFAULT NULL,
  guild_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  result JSONB;
  death_filter TEXT := '';
  activity_guild_filter TEXT := '';
BEGIN
  -- Build optional guild filter: only deaths with attendees from this guild
  IF guild_id IS NOT NULL THEN
    death_filter := format(
      'AND dr.id IN (SELECT DISTINCT ar.death_record_id FROM attendance_records ar JOIN members m ON m.id = ar.member_id WHERE m.guild_id = %L)',
      guild_id
    );
    activity_guild_filter := format(
      'AND m2.guild_id = %L',
      guild_id
    );
  END IF;

  EXECUTE format('
    WITH filtered_deaths AS (
      SELECT dr.id, dr.death_time, dr.boss_id
      FROM death_records dr
      WHERE dr.death_time >= %L::timestamptz
        AND (%L::uuid IS NULL OR dr.server_id = %L::uuid)
        %s
    ),
    stats AS (
      SELECT
        COUNT(*) AS total_kills,
        COALESCE(SUM(ar_count.cnt), 0) AS total_attendance,
        COUNT(DISTINCT ar.member_id) AS active_members
      FROM filtered_deaths fd
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt, array_agg(member_id) AS mids
        FROM attendance_records ar
        WHERE ar.death_record_id = fd.id
      ) ar_count ON true
    ),
    activity_stats AS (
      SELECT
        COUNT(*)::int AS activity_participation
      FROM activity_attendance aa
      JOIN activity_instances ai ON ai.id = aa.activity_instance_id
      JOIN activities a ON a.id = ai.activity_id AND a.server_id = %L::uuid
      WHERE aa.present = true
        AND ai.end_time >= %L::timestamptz
    ),
    kills_by_week AS (
      SELECT
        to_char(date_trunc(''week'', fd.death_time), ''Mon DD'') AS week_label,
        COUNT(*)::int AS count
      FROM filtered_deaths fd
      GROUP BY date_trunc(''week'', fd.death_time)
      ORDER BY date_trunc(''week'', fd.death_time) DESC
      LIMIT 12
    ),
    top_bosses AS (
      SELECT b.name, COUNT(*)::int AS kills
      FROM filtered_deaths fd
      JOIN bosses b ON b.id = fd.boss_id
      GROUP BY b.name
      ORDER BY kills DESC
      LIMIT 10
    ),
    -- Combine boss kill attendance + activity attendance for hunter rankings
    combined_attendance AS (
      SELECT ar.member_id
      FROM filtered_deaths fd
      JOIN attendance_records ar ON ar.death_record_id = fd.id
      UNION ALL
      SELECT aa.member_id
      FROM activity_attendance aa
      JOIN activity_instances ai ON ai.id = aa.activity_instance_id
      JOIN activities a ON a.id = ai.activity_id AND a.server_id = %L::uuid
      WHERE aa.present = true
        AND ai.end_time >= %L::timestamptz
    ),
    top_hunters AS (
      SELECT m.name, COUNT(*)::int AS attended
      FROM combined_attendance ca
      JOIN members m ON m.id = ca.member_id
      %s
      GROUP BY m.name
      ORDER BY attended DESC
      LIMIT 50
    ),
    kills_by_day AS (
      SELECT
        trim(to_char(fd.death_time, ''Day'')) AS day,
        COUNT(*)::int AS count
      FROM filtered_deaths fd
      GROUP BY date_part(''dow'', fd.death_time), to_char(fd.death_time, ''Day'')
      ORDER BY date_part(''dow'', fd.death_time)
    )
    SELECT jsonb_build_object(
      ''total_kills'', COALESCE((SELECT total_kills FROM stats), 0),
      ''total_attendance'', COALESCE((SELECT total_attendance FROM stats), 0),
      ''active_members'', COALESCE((SELECT active_members FROM stats), 0),
      ''activity_participation'', COALESCE((SELECT activity_participation FROM activity_stats), 0),
      ''kills_by_week'', COALESCE((SELECT jsonb_agg(row_to_json(kills_by_week.*)) FROM kills_by_week), ''[]''::jsonb),
      ''top_bosses'', COALESCE((SELECT jsonb_agg(row_to_json(top_bosses.*)) FROM top_bosses), ''[]''::jsonb),
      ''top_hunters'', COALESCE((SELECT jsonb_agg(row_to_json(top_hunters.*)) FROM top_hunters), ''[]''::jsonb),
      ''kills_by_day'', COALESCE((SELECT jsonb_agg(row_to_json(kills_by_day.*)) FROM kills_by_day), ''[]''::jsonb)
    ) INTO result;
  ', since, s_id, s_id, death_filter,
     s_id, since,
     s_id, since,
     activity_guild_filter);

  RETURN result;
END;
$$;
