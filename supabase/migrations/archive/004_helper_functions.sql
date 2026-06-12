-- 004_helper_functions.sql
-- Helper functions for the app

-- Resolve a user ID from their email (for moderator invites)
create or replace function get_user_id_by_email(user_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id from auth.users where email = user_email limit 1;
$$;

-- Grant execute to authenticated users
grant execute on function get_user_id_by_email(text) to authenticated;
