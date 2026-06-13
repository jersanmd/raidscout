import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMembers, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import type { Member } from "@/types";

/** Fetch members for the current server. Pass includeInactive:true to include disabled members. */
export function useMembers(opts?: { includeInactive?: boolean }) {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const configured = isSupabaseConfigured();

  return useQuery<Member[]>({
    queryKey: ["members", serverId, opts?.includeInactive],
    queryFn: async () => {
      if (!configured || (!user && !isViewer)) return [];
      return await fetchMembers(serverId, opts);
    },
    staleTime: 60_000,
    retry: 2,
    enabled: configured && (!!user || isViewer) && !!serverId,
  });
}

export function useInvalidateMembers() {
  const queryClient = useQueryClient();
  const serverId = useServerId();
  return () => queryClient.invalidateQueries({ queryKey: ["members", serverId] });
}
