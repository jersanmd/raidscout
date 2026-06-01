import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import type { Activity, ActivityInstance } from "@/types";

export function useActivities() {
  const serverId = useServerId();
  const configured = isSupabaseConfigured();

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ["activities", serverId],
    queryFn: async () => {
      if (!serverId) return [];
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("server_id", serverId)
        .eq("is_enabled", true)
        .order("name");
      if (error) throw error;
      return (data || []) as Activity[];
    },
    staleTime: 60_000,
    enabled: configured && !!serverId,
  });

  const { data: activityInstances = [], isLoading: instancesLoading } = useQuery({
    queryKey: ["activity_instances", serverId],
    queryFn: async () => {
      if (!serverId || activities.length === 0) return [];
      const activityIds = activities.map(a => a.id);
      const { data, error } = await supabase
        .from("activity_instances")
        .select("*")
        .in("activity_id", activityIds)
        .order("start_time", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as ActivityInstance[];
    },
    staleTime: 0,
    enabled: configured && !!serverId && activities.length > 0,
  });

  return {
    activities,
    activityInstances,
    isLoading: activitiesLoading || instancesLoading,
  };
}
