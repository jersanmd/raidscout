-- Stop anyone from LISTING every server's rally images and CP screenshots.
--
-- Both buckets are public, so files are served by URL without any policy
-- (/storage/v1/object/public/...) -- that keeps working. These two SELECT
-- policies only added the ability to enumerate every object in the bucket,
-- across all servers, with the anon key. Nothing in the app, bot or edge
-- functions lists either bucket.
--
-- A storage DELETE also applies SELECT policies, so the rally-image removal in
-- ParticipantModal (storage.ts remove()) needs a SELECT path: members may see
-- their own server's folder (objects are stored as <server_id>/<file>). This
-- also stops any signed-in user from deleting other servers' rally images.
--
-- Separate from 20261004000000 because storage.objects is owned by
-- supabase_storage_admin; if this cannot apply, the rest is unaffected.

DROP POLICY IF EXISTS "Public read rally" ON storage.objects;
DROP POLICY IF EXISTS "Public read cp-screenshots" ON storage.objects;

DROP POLICY IF EXISTS "Server members read own rally images" ON storage.objects;
CREATE POLICY "Server members read own rally images" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rally-images'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT sm.server_id::text FROM public.server_members sm WHERE sm.user_id = (SELECT auth.uid())
      )
      -- an owner recorded only in servers.owner_id, with no server_members row
      OR (storage.foldername(name))[1] IN (
        SELECT s.id::text FROM public.servers s WHERE s.owner_id = (SELECT auth.uid())
      )
      OR public.is_admin()
    )
  );
