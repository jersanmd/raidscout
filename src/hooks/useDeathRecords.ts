import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchDeathRecords, subscribeToDeathRecords, isSupabaseConfigured, supabase, cleanupChannel } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import type { DeathRecord } from "@/types";

/** Track active subscriptions to prevent duplicates across concurrent mounts */
const activeSubscriptions = new Set<string>();

/** Fetch death records from Supabase with realtime subscription. */
export function useDeathRecords() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  const query = useQuery<DeathRecord[]>({
    queryKey: ["death_records", serverId],
    queryFn: async () => {
      if (!configured || (!user && !isViewer)) return [];
      return await fetchDeathRecords(serverId);
    },
    staleTime: 0,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
    retry: 2,
    enabled: configured && (!!user || isViewer) && !!serverId,
  });

  // Realtime subscription — per server, deduplicated across components
  useEffect(() => {
    if ((!user && !isViewer) || !configured || !serverId) return;
    const subKey = `deaths-${serverId}`;
    if (activeSubscriptions.has(subKey)) return;
    activeSubscriptions.add(subKey);

    const channel = subscribeToDeathRecords(
      serverId || "unknown",
      () => {
        queryClient.invalidateQueries({ queryKey: ["death_records"] });
        queryClient.invalidateQueries({ queryKey: ["spawn_overrides"] });
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ["death_records"] });
        queryClient.invalidateQueries({ queryKey: ["spawn_overrides"] });
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ["death_records"] });
        queryClient.invalidateQueries({ queryKey: ["spawn_overrides"] });
      }
    );

    return () => {
      activeSubscriptions.delete(subKey);
      cleanupChannel(channel);
    };
  }, [user?.id, configured, serverId, queryClient, isViewer]);

  return query;
}
