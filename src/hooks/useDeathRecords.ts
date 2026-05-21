import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchDeathRecords, subscribeToDeathRecords, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import type { DeathRecord } from "@/types";

/** Prevent duplicate realtime subscriptions across components */
let globalSubscribed = false;

/** Fetch death records from Supabase with realtime subscription. */
export function useDeathRecords() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  useEffect(() => {
    return () => {
      if (serverId) {
        queryClient.removeQueries({ queryKey: ["death_records", serverId] });
      }
    };
  }, [serverId, queryClient]);

  const query = useQuery<DeathRecord[]>({
    queryKey: ["death_records", serverId],
    queryFn: async () => {
      if (!configured || (!user && !isViewer)) return [];
      return await fetchDeathRecords(serverId);
    },
    staleTime: 30_000,
    retry: 2,
    enabled: configured && (!!user || isViewer) && !!serverId,
  });

  // Realtime subscription — only subscribe once globally
  useEffect(() => {
    if (!user || !configured || globalSubscribed) return;
    globalSubscribed = true;

    const channel = subscribeToDeathRecords(
      () => queryClient.invalidateQueries({ queryKey: ["death_records"] }),
      () => queryClient.invalidateQueries({ queryKey: ["death_records"] }),
      () => queryClient.invalidateQueries({ queryKey: ["death_records"] })
    );

    return () => {
      globalSubscribed = false;
      channel.unsubscribe();
    };
  }, [user?.id]);

  return query;
}
