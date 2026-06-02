import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchBosses, isSupabaseConfigured, subscribeToBosses, supabase, cleanupChannel } from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Boss } from "@/types";

const activeBossSubscriptions = new Set<string>();

/** Fetch bosses for the current server only, with realtime updates. */
export function useBosses() {
  const serverId = useServerId();
  const { user, isViewer } = useAuth();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  // Realtime subscription for boss table changes — per server
  useEffect(() => {
    if ((!user && !isViewer) || !configured || !serverId) return;
    const subKey = `bosses-${serverId}`;
    if (activeBossSubscriptions.has(subKey)) return;
    activeBossSubscriptions.add(subKey);

    const channel = subscribeToBosses(serverId, () => {
      queryClient.invalidateQueries({ queryKey: ["bosses"] });
    });

    return () => {
      activeBossSubscriptions.delete(subKey);
      cleanupChannel(channel);
    };
  }, [user, configured, queryClient, serverId]);

  return useQuery<Boss[]>({
    queryKey: ["bosses", serverId],
    queryFn: async () => {
      if (!configured) return [];
      return await fetchBosses(serverId);
    },
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 10_000,
    placeholderData: (prev) => prev,
    retry: 2,
    enabled: configured && !!serverId,
  });
}
