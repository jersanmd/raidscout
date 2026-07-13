import { useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDeathRecords, subscribeToDeathRecords, isSupabaseConfigured, cleanupChannel } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import type { DeathRecord } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

/** Fetch death records from Supabase with realtime subscription. */
export function useDeathRecords() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  // Ref-counted channel to survive React 18+ Strict Mode double-mount
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mountCountRef = useRef(0);

  const query = useQuery<DeathRecord[]>({
    queryKey: ["death_records", serverId],
    queryFn: async () => {
      if (!configured || (!user && !isViewer)) return [];
      return await fetchDeathRecords(serverId);
    },
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchInterval: 10_000, // poll every 10s as fallback for bot kills
    placeholderData: (prev) => prev,
    retry: 2,
    enabled: configured && (!!user || isViewer) && !!serverId,
  });

  // Realtime subscription — per server, ref-counted to survive Strict Mode
  useEffect(() => {
    if ((!user && !isViewer) || !configured || !serverId) return;
    mountCountRef.current++;

    // Only subscribe on first mount (not on Strict Mode double-mount)
    if (mountCountRef.current === 1) {
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["death_records"] });
        queryClient.invalidateQueries({ queryKey: ["spawn_overrides"] });
      };
      channelRef.current = subscribeToDeathRecords(
        serverId,
        invalidate,
        invalidate,
        invalidate,
      );
    }

    return () => {
      mountCountRef.current--;
      // Only cleanup on last unmount
      if (mountCountRef.current <= 0) {
        mountCountRef.current = 0;
        if (channelRef.current) {
          cleanupChannel(channelRef.current);
          channelRef.current = null;
        }
      }
    };
  }, [user?.id, configured, serverId, queryClient, isViewer]);

  return query;
}
