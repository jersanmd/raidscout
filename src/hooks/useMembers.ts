import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMembers, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import type { Member } from "@/types";

/** Fetch members for the current server. */
export function useMembers() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const configured = isSupabaseConfigured();

  return useQuery<Member[]>({
    queryKey: ["members", serverId],
    queryFn: async () => {
      if (!configured || (!user && !isViewer)) return [];
      return await fetchMembers(serverId);
    },
    staleTime: 60_000,
    retry: 2,
    enabled: configured && (!!user || isViewer) && !!serverId,
  });
}

export function useInvalidateMembers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["members"] });
}
