import { useEffect, useCallback, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-impersonate`;

/**
 * When an admin views a server from the admin panel, this hook:
 * 1. Adds the admin to server_members as owner (so RLS matches)
 * 2. Removes them when they navigate away
 * 3. Cleans up stale memberships on app load
 */
export function useAdminViewAs(serverId: string | null) {
  const { user, userRole } = useAuth();
  const previousId = useRef<string | null>(null);
  const [joining, setJoining] = useState(false);

  // Cleanup stale admin memberships on mount (from crashes/disconnects)
  useEffect(() => {
    if (userRole !== "admin" || !user) return;
    fetch(EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id, action: "cleanup" }),
    }).catch(() => {});
  }, [userRole, user]);

  // Join/leave server as admin viewing changes
  useEffect(() => {
    if (userRole !== "admin" || !user) return;

    const prev = previousId.current;

    // Leave previous server
    if (prev && prev !== serverId) {
      fetch(EDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, server_id: prev, action: "leave" }),
      }).catch(() => {});
    }

    // Join new server
    if (serverId && serverId !== prev) {
      setJoining(true);
      fetch(EDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, server_id: serverId, action: "join" }),
      })
        .catch(() => {})
        .finally(() => setJoining(false));
    }

    previousId.current = serverId;

    // Leave on unmount
    return () => {
      if (serverId) {
        fetch(EDGE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.id, server_id: serverId, action: "leave" }),
        }).catch(() => {});
      }
    };
  }, [serverId, userRole, user]);

  const viewAsOwner = useCallback((targetServerId: string) => {
    // This is called by the admin panel button
    // The hook will handle join/leave automatically via the serverId effect
    return targetServerId;
  }, []);

  return { viewAsOwner, joining };
}
