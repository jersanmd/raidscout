-- 035_fix_rpc_signature.sql
-- Restore the original 3-param get_leaderboard signature that PostgREST expects,
-- but with per-guild reset support built in

drop function if exists get_leaderboard(uuid, timestamptz);
drop function if exists get_leaderboard(uuid, timestamptz, jsonb);
drop function if exists get_leaderboard(uuid, timestamptz, timestamptz);
drop function if exists get_leaderboard(uuid, timestamptz, timestamptz, jsonb);

create or replace function get_leaderboard(
  p_server_id uuid,
  p_since timestamptz default null,
  p_until timestamptz default null
)
returns table(
  member_id uuid,
  member_name text,
  boss_points bigint,
  activity_points bigint,
  total_points bigint,
  boss_kills bigint,
  activities_attended bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guild_resets jsonb;
begin
  -- Fetch all guild-specific reset dates for this server
  select coalesce(jsonb_object_agg(
    g.id::text,
    s.value
  ), '{}'::jsonb) into v_guild_resets
  from public.app_settings s
  join public.guilds g on g.server_id = s.server_id
    and s.key = 'leaderboard_reset_at:' || g.name
  where s.server_id = p_server_id;

  return query
  with boss_scores as (
    select
      m.id as mid,
      m.name as mname,
      coalesce(sum(coalesce(bg.points, b.boss_points, 0)), 0) as bp,
      count(distinct dr.id) as bk
    from public.members m
    left join public.attendance_records ar on ar.member_id = m.id
    left join public.death_records dr on dr.id = ar.death_record_id
      and dr.server_id = p_server_id
      and (p_since is null or dr.death_time >= p_since)
      and (p_until is null or dr.death_time <= p_until)
      -- Per-guild reset: only when p_since is null (no global snapshot exists)
      -- When p_since is set, use it globally for all guilds
      and ar.created_at >= coalesce(
        case when p_since is null
          then (v_guild_resets->>m.guild_id::text)::timestamptz
          else null
        end,
        '1970-01-01T00:00:00Z'::timestamptz
      )
    left join public.bosses b on b.id = dr.boss_id
    left join public.boss_guilds bg on bg.boss_id = b.id and bg.guild_id = m.guild_id
    where m.server_id = p_server_id
    group by m.id, m.name
  ),
  activity_scores as (
    select
      m.id as mid,
      coalesce(sum(a.points_per_participant), 0) as ap,
      count(distinct aa.activity_instance_id) as aa_count
    from public.members m
    left join public.activity_attendance aa on aa.member_id = m.id and aa.present = true
    left join public.activity_instances ai on ai.id = aa.activity_instance_id
      and (p_since is null or ai.end_time >= p_since)
      and (p_until is null or ai.end_time <= p_until)
    left join public.activities a on a.id = ai.activity_id and a.server_id = p_server_id
    where m.server_id = p_server_id
    group by m.id
  )
  select
    bs.mid,
    bs.mname,
    bs.bp::bigint,
    coalesce(ascores.ap, 0)::bigint,
    (bs.bp + coalesce(ascores.ap, 0))::bigint,
    bs.bk::bigint,
    coalesce(ascores.aa_count, 0)::bigint
  from boss_scores bs
  left join activity_scores ascores on ascores.mid = bs.mid
  order by bs.bp + coalesce(ascores.ap, 0) desc;
end;
$$;

grant execute on function get_leaderboard(uuid, timestamptz, timestamptz) to anon, authenticated;
