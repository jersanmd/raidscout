import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase, isSupabaseConfigured, subscribeToActivityInstances, cleanupChannel } from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import type { Activity, ActivityInstance } from "@/types";

const activeActivitySubscriptions = new Set<string>();

export function useActivities() {
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  // Realtime subscription for activity instance changes
  useEffect(() => {
    if (!configured || !serverId) return;
    const subKey = `activity-instances-${serverId}`;
    if (activeActivitySubscriptions.has(subKey)) return;
    activeActivitySubscriptions.add(subKey);

    const channel = subscribeToActivityInstances(serverId, () => {
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["activity_instances"] });
    });

    return () => {
      activeActivitySubscriptions.delete(subKey);
      cleanupChannel(channel);
    };
  }, [configured, queryClient, serverId]);

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ["activities", serverId],
    queryFn: async () => {
      if (!serverId) return [];
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("server_id", serverId)
        .is("deleted_at", null)
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
