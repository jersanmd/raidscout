-- 029_item_approval: Add approval workflow to items table
--   Status: pending (user-created), approved (global), rejected (hidden)
--   Pending items are only visible to their creating server
--   Approved items with a game are visible to all servers under that game

-- ── Add status and approval tracking columns ──
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- ── Index for admin review queries ──
CREATE INDEX IF NOT EXISTS idx_items_status_game ON public.items(status, game);

-- ── Update RLS: pending items only visible to creating server ──
DROP POLICY IF EXISTS "Members can read server or game items" ON public.items;

CREATE POLICY "Members can read server or game items" ON public.items
  FOR SELECT USING (
    -- Items scoped to their server (includes pending from own server)
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = items.server_id AND sm.user_id = auth.uid())
    -- Approved items shared via game (cross-server, global)
    OR (items.game IS NOT NULL AND items.status = 'approved')
    -- Admins see all
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ── Allow regular members to insert items (pending by default) ──
DROP POLICY IF EXISTS "Members can insert items" ON public.items;

CREATE POLICY "Members can insert items" ON public.items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.server_members sm
      WHERE sm.server_id = items.server_id AND sm.user_id = auth.uid()
    )
  );

-- ── Members can update/delete their own pending items ──
DROP POLICY IF EXISTS "Moderators can manage items" ON public.items;

CREATE POLICY "Moderators can manage items" ON public.items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = items.server_id AND sm.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = items.server_id AND sm.user_id = auth.uid())
  );

-- ── RPC: Approve an item (admin only) ──
CREATE OR REPLACE FUNCTION public.approve_item(p_item_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve items';
  END IF;

  UPDATE public.items
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  WHERE id = p_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_item(UUID) TO authenticated;

-- ── RPC: Reject an item (admin only) ──
CREATE OR REPLACE FUNCTION public.reject_item(p_item_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject items';
  END IF;

  UPDATE public.items
  SET status = 'rejected',
      approved_by = auth.uid(),
      approved_at = now()
  WHERE id = p_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_item(UUID) TO authenticated;

-- ── RPC: Fetch pending items for admin review ──
CREATE OR REPLACE FUNCTION public.fetch_pending_items(p_game TEXT DEFAULT NULL)
RETURNS SETOF public.items
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM public.items
  WHERE status = 'pending'
    AND (p_game IS NULL OR game = p_game)
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_pending_items(TEXT) TO authenticated;
