import { useQuery } from "@tanstack/react-query";
import { fetchBosses, getCurrentServerId, isSupabaseConfigured } from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import type { Boss } from "@/types";

/** Fetch bosses for the current server only. */
export function useBosses() {
  const serverId = useServerId();
  return useQuery<Boss[]>({
    queryKey: ["bosses", serverId],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];
      return await fetchBosses(serverId);
    },
    staleTime: 5 * 60_000,
    retry: 2,
    enabled: isSupabaseConfigured() && !!serverId,
  });
}
