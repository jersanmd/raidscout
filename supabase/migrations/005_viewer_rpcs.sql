-- 005_viewer_rpcs.sql
-- Viewer (guest) write operations via RPC with invite_code validation

-- ── Viewer Auth ─────────────────────────────────────────────

create or replace function get_server_by_viewer_key(v_key text)
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select s.id, s.name
    from servers s
    where s.invite_code = v_key;
end;
$$;

grant execute on function get_server_by_viewer_key(text) to anon, authenticated;

-- ── Death Records ───────────────────────────────────────────

create or replace function viewer_insert_death_record(
  p_boss_id uuid,
  p_death_time timestamptz,
  p_server_id uuid,
  p_viewer_key text,
  p_owner_guild_id uuid default null
)
returns setof death_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key
  select id into v_server_id from servers where invite_code = p_viewer_key;
  if v_server_id is null or v_server_id <> p_server_id then
    raise exception 'Invalid viewer key';
  end if;

  return query
    insert into death_records (boss_id, user_id, death_time, server_id, owner_guild_id)
    values (p_boss_id, auth.uid(), p_death_time, p_server_id, p_owner_guild_id)
    returning *;
end;
$$;

grant execute on function viewer_insert_death_record(uuid, timestamptz, uuid, text, uuid) to anon, authenticated;

-- ──

create or replace function viewer_delete_death_record(
  p_death_record_id uuid,
  p_viewer_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the death record's server
  select server_id into v_server_id from death_records where id = p_death_record_id;
  if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
  end if;

  delete from death_records where id = p_death_record_id;
end;
$$;

grant execute on function viewer_delete_death_record(uuid, text) to anon, authenticated;

-- ── Members ─────────────────────────────────────────────────

create or replace function viewer_upsert_member(
  p_name text,
  p_server_id uuid,
  p_viewer_key text
)
returns setof members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server_id uuid;
  v_member_id uuid;
begin
  -- Validate viewer key
  select id into v_server_id from servers where invite_code = p_viewer_key;
  if v_server_id is null or v_server_id <> p_server_id then
    raise exception 'Invalid viewer key';
  end if;

  -- Upsert member
  select id into v_member_id from members where name = p_name;
  if v_member_id is null then
    return query insert into members (name) values (p_name) returning *;
  else
    return query select * from members where id = v_member_id;
  end if;
end;
$$;

grant execute on function viewer_upsert_member(text, uuid, text) to anon, authenticated;

-- ── Attendance ──────────────────────────────────────────────

create or replace function viewer_add_attendance(
  p_death_record_id uuid,
  p_member_id uuid,
  p_viewer_key text
)
returns setof attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the death record's server
  select server_id into v_server_id from death_records where id = p_death_record_id;
  if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
  end if;

  return query
    insert into attendance_records (death_record_id, member_id, server_id)
    values (p_death_record_id, p_member_id, v_server_id)
    on conflict (death_record_id, member_id) do nothing
    returning *;
end;
$$;

grant execute on function viewer_add_attendance(uuid, uuid, text) to anon, authenticated;

-- ──

create or replace function viewer_remove_attendance(
  p_attendance_id uuid,
  p_viewer_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the attendance record's server
  select dr.server_id into v_server_id
  from attendance_records ar
  join death_records dr on dr.id = ar.death_record_id
  where ar.id = p_attendance_id;

  if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
  end if;

  delete from attendance_records where id = p_attendance_id;
end;
$$;

grant execute on function viewer_remove_attendance(uuid, text) to anon, authenticated;
