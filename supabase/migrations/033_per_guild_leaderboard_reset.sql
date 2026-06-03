-- 033_per_guild_leaderboard_reset.sql
-- Update get_leaderboard RPC to support per-guild reset dates
-- via p_guild_resets JSON parameter: {"<guild_id>": "<reset_iso>", ...}
-- Each member's kills are filtered by their own guild's reset date

drop function if exists get_leaderboard(uuid, timestamptz);
drop function if exists get_leaderboard(uuid, timestamptz, jsonb);

create or replace function get_leaderboard(
  p_server_id uuid,
  p_since timestamptz default '1970-01-01T00:00:00Z',
  p_guild_resets jsonb default '{}'::jsonb
)
returns table(
  member_id uuid,
  member_name text,
  total_points bigint,
  last_attended timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
begin
  -- Get server timezone (default UTC)
  select coalesce(s.timezone, 'UTC') into v_tz
  from public.servers s
  where s.id = p_server_id;

  return query
    with
    -- Attendance records filtered by per-guild reset (or global p_since)
    kills as (
      select
        ar.member_id,
        ar.death_record_id,
        ar.server_id,
        dr.boss_id,
        dr.death_time,
        b.name as boss_name,
        b.boss_points,
        m.guild_id
      from public.attendance_records ar
      join public.death_records dr on dr.id = ar.death_record_id
      join public.bosses b on b.id = dr.boss_id
      left join public.members m on m.id = ar.member_id
      where ar.server_id = p_server_id
        and ar.created_at >= coalesce(
          (p_guild_resets->>m.guild_id::text)::timestamptz,
          p_since
        )
    ),
    -- Per-guild point overrides
    guild_overrides as (
      select bg.boss_id, bg.guild_id, bg.points
      from public.boss_guilds bg
      join public.bosses b on b.id = bg.boss_id
      where b.server_id = p_server_id
        and bg.points is not null
    ),
    -- Time-based multipliers
    time_multipliers as (
      select
        pr.guild_id,
        (pr.config->>'start_hour')::int as start_hour,
        (pr.config->>'end_hour')::int as end_hour,
        (pr.config->>'multiplier')::numeric as multiplier
      from public.point_rules pr
      where pr.server_id = p_server_id
        and pr.rule_type = 'time_multiplier'
        and pr.enabled = true
    ),
    -- Compute points per kill with overrides and multipliers
    scored as (
      select
        k.member_id,
        coalesce(go.points, k.boss_points, 0) as base_points,
        coalesce(
          (
            select max(tm.multiplier)
            from time_multipliers tm
            where tm.guild_id = k.guild_id
              and (
                (tm.start_hour <= tm.end_hour
                  and extract(hour from k.death_time at time zone v_tz) >= tm.start_hour
                  and extract(hour from k.death_time at time zone v_tz) < tm.end_hour)
                or
                (tm.start_hour > tm.end_hour
                  and (extract(hour from k.death_time at time zone v_tz) >= tm.start_hour
                       or extract(hour from k.death_time at time zone v_tz) < tm.end_hour))
              )
          ),
          1
        )::numeric as multiplier,
        k.death_time
      from kills k
      left join guild_overrides go on go.boss_id = k.boss_id and go.guild_id = k.guild_id
    )
    select
      s.member_id,
      m.name as member_name,
      sum((s.base_points * s.multiplier))::bigint as total_points,
      max(s.death_time) as last_attended
    from scored s
    join public.members m on m.id = s.member_id
    group by s.member_id, m.name
    having count(*) > 0
    order by total_points desc, last_attended desc;
end;
$$;

grant execute on function get_leaderboard(uuid, timestamptz, jsonb) to anon, authenticated;
