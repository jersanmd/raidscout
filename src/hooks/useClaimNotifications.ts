import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getMyClaims, markClaimRead, type ClaimRequest } from "@/lib/supabase";

/**
 * Checks for resolved-but-unread claim notifications on login.
 * Returns the first unread accepted/declined claim for banner display.
 */
export function useClaimNotifications() {
  const { user } = useAuth();
  const [unreadClaim, setUnreadClaim] = useState<ClaimRequest | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyClaims()
      .then(claims => {
        const unread = claims.find(
          c => (c.status === "accepted" || c.status === "declined") && !c.is_read
        );
        setUnreadClaim(unread || null);
      })
      .catch(() => {});
  }, [user]);

  const dismiss = async () => {
    if (unreadClaim) {
      await markClaimRead(unreadClaim.id).catch(() => {});
    }
    setDismissed(true);
  };

  return {
    unreadClaim: dismissed ? null : unreadClaim,
    dismiss,
  };
}
