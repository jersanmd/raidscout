import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getMyClaims, markClaimRead, type ClaimRequest } from "@/lib/supabase";

/**
 * Checks for resolved-but-unread claim notifications on login.
 * Returns the first unread accepted/declined claim for banner display.
 * Persists dismissed claim IDs in localStorage to prevent reappearing.
 */
export function useClaimNotifications() {
  const { user } = useAuth();
  const [unreadClaim, setUnreadClaim] = useState<ClaimRequest | null>(null);
  const DISMISSED_KEY = "raidscout-dismissed-claims";

  const getDismissedIds = (): Set<string> => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  };

  const addDismissedId = (id: string) => {
    try {
      const ids = getDismissedIds();
      ids.add(id);
      // Keep only last 50 to prevent unbounded growth
      const arr = [...ids].slice(-50);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(arr));
    } catch {}
  };

  useEffect(() => {
    if (!user) return;
    const dismissedIds = getDismissedIds();

    const check = () => {
      getMyClaims()
        .then(claims => {
          const unread = claims.find(
            c => (c.status === "accepted" || c.status === "declined")
              && !c.is_read
              && !dismissedIds.has(c.id)
          );
          setUnreadClaim(unread || null);
        })
        .catch(() => {});
    };

    check();
    const interval = setInterval(check, 30_000); // Poll every 30s
    return () => clearInterval(interval);
  }, [user]);

  const dismiss = async () => {
    if (!unreadClaim) return;
    // Dismiss ALL unread claims at once to prevent another banner from appearing
    try {
      const claims = await getMyClaims();
      const unreadIds = claims
        .filter(c => (c.status === "accepted" || c.status === "declined") && !c.is_read)
        .map(c => c.id);
      // Mark all as read and add to localStorage
      await Promise.all(unreadIds.map(id => markClaimRead(id).catch(() => {})));
      unreadIds.forEach(id => addDismissedId(id));
    } catch {}
    setUnreadClaim(null);
  };

  return {
    unreadClaim,
    dismiss,
  };
}
