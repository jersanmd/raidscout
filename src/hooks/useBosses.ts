import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchBosses, isSupabaseConfigured, subscribeToBosses, supabase } from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Boss } from "@/types";

let globalBossSubscribed = false;

/** Fetch bosses for the current server only, with realtime updates. */
export function useBosses() {
  const serverId = useServerId();
  const { user, isViewer } = useAuth();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  // Realtime subscription for boss table changes
  useEffect(() => {
    if ((!user && !isViewer) || !configured || globalBossSubscribed) return;
    globalBossSubscribed = true;

    const channel = subscribeToBosses(() => {
      queryClient.invalidateQueries({ queryKey: ["bosses"] });
    });

    return () => {
      globalBossSubscribed = false;
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [user, configured, queryClient]);

  return useQuery<Boss[]>({
    queryKey: ["bosses", serverId],
    queryFn: async () => {
      if (!configured) return [];
      return await fetchBosses(serverId);
    },
    staleTime: 10_000,
    retry: 2,
    enabled: configured && !!serverId,
  });
}
