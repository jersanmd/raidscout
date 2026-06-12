-- Migration 078: Add UPDATE policy for death_records (needed for daily rotation guild switching)

CREATE POLICY "Server members can update death records" ON public.death_records
  FOR UPDATE
  USING (public.is_member_of_server(server_id))
  WITH CHECK (public.is_member_of_server(server_id));
