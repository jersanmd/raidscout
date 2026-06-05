import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { useHasPermission } from "@/contexts/ServerContext";
import { fetchAllActivitiesForServer, fetchGuilds, fetchAllActivityGuildsForServer, setActivityGuilds } from "@/lib/supabase";
import type { ActivityGuild } from "@/types";
import { Loader2, Shield, Swords, ChevronUp, ChevronDown, X, Plus, Check } from "lucide-react";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ActivityGuildsTab() {
  const { currentServer } = useServer();
  const { userRole } = useAuth();
  const hasPerm = useHasPermission("can_manage_boss_guilds");
  const canManage = currentServer?.role === "owner" || userRole === "admin" || hasPerm;
  const queryClient = useQueryClient();
  const serverId = currentServer?.id ?? "";

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ["activities-all", serverId],
    queryFn: () => fetchAllActivitiesForServer(serverId),
    enabled: !!serverId && canManage,
  });

  const { data: guilds = [], isLoading: guildsLoading } = useQuery({
    queryKey: ["guilds", serverId],
    queryFn: () => fetchGuilds(serverId),
    enabled: !!serverId && canManage,
  });

  const { data: activityGuilds = [], isLoading: agLoading } = useQuery({
    queryKey: ["activity-guilds", serverId],
    queryFn: () => fetchAllActivityGuildsForServer(serverId),
    enabled: !!serverId && canManage,
  });

  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Build lookup: activityId → ActivityGuild[]
  const getActivityGuilds = (activityId: string) =>
    activityGuilds.filter(ag => ag.activity_id === activityId && ag.mode !== "all" ? ag.sort_order !== null || ag.day_of_week !== null : true);

  const getMode = (activityId: string): "none" | "rotation" | "daily" | "schedule" | "all" => {
    const ags = activityGuilds.filter(ag => ag.activity_id === activityId);
    if (ags.length === 0) return "none";
    return ags[0].mode;
  };

  const handleSetMode = async (activityId: string, mode: "none" | "rotation" | "daily" | "schedule" | "all") => {
    setSavingId(activityId);
    try {
      if (mode === "none") {
        await setActivityGuilds(activityId, [], "rotation");
      } else {
        // Keep existing guild assignments if switching modes
        const existing = getActivityGuilds(activityId);
        const assignments = existing.map((ag, i) => ({
          guild_id: ag.guild_id,
          sort_order: mode === "rotation" || mode === "daily" ? i : undefined,
          day_of_week: mode === "schedule" ? ag.day_of_week : undefined,
        }));
        await setActivityGuilds(activityId, assignments.length > 0 ? assignments : [], mode);
      }
      queryClient.invalidateQueries({ queryKey: ["activity-guilds", serverId] });
    } catch { /* ignore */ }
    setSavingId(null);
  };

  const handleAddGuild = async (activityId: string, guildId: string, mode: "rotation" | "daily" | "schedule" | "all") => {
    if (!guildId) return;
    setSavingId(activityId);
    try {
      const existing = getActivityGuilds(activityId);
      const assignments = [...existing.map((ag, i) => ({
        guild_id: ag.guild_id,
        sort_order: mode === "rotation" || mode === "daily" ? i : undefined,
        day_of_week: mode === "schedule" ? ag.day_of_week : undefined,
      })), { guild_id: guildId, sort_order: mode === "rotation" || mode === "daily" ? existing.length : undefined }];
      await setActivityGuilds(activityId, assignments, mode);
      queryClient.invalidateQueries({ queryKey: ["activity-guilds", serverId] });
    } catch { /* ignore */ }
    setSavingId(null);
  };

  const handleRemoveGuild = async (activityId: string, guildId: string, mode: "rotation" | "daily" | "schedule" | "all") => {
    setSavingId(activityId);
    try {
      const existing = getActivityGuilds(activityId).filter(ag => ag.guild_id !== guildId);
      const assignments = existing.map((ag, i) => ({
        guild_id: ag.guild_id,
        sort_order: mode === "rotation" || mode === "daily" ? i : undefined,
        day_of_week: mode === "schedule" ? ag.day_of_week : undefined,
      }));
      await setActivityGuilds(activityId, assignments, mode);
      queryClient.invalidateQueries({ queryKey: ["activity-guilds", serverId] });
    } catch { /* ignore */ }
    setSavingId(null);
  };

  const handleSetScheduleGuild = async (activityId: string, dayOfWeek: number, guildId: string | null) => {
    setSavingId(activityId);
    try {
      const existing = getActivityGuilds(activityId).filter(ag => ag.day_of_week !== dayOfWeek);
      if (guildId) {
        existing.push({ id: "", activity_id: activityId, guild_id: guildId, sort_order: null, day_of_week: dayOfWeek, mode: "schedule" } as ActivityGuild);
      }
      await setActivityGuilds(activityId, existing.map(ag => ({
        guild_id: ag.guild_id,
        day_of_week: ag.day_of_week ?? undefined,
      })), "schedule");
      queryClient.invalidateQueries({ queryKey: ["activity-guilds", serverId] });
    } catch { /* ignore */ }
    setSavingId(null);
  };

  const handleToggleAllGuild = async (activityId: string, guildId: string, add: boolean) => {
    setSavingId(activityId);
    try {
      const existing = activityGuilds.filter(ag => ag.activity_id === activityId && ag.mode === "all");
      if (add) {
        await setActivityGuilds(activityId, [...existing, { guild_id: guildId } as any], "all");
      } else {
        await setActivityGuilds(activityId, existing.filter(ag => ag.guild_id !== guildId).map(ag => ({ guild_id: ag.guild_id })), "all");
      }
      queryClient.invalidateQueries({ queryKey: ["activity-guilds", serverId] });
    } catch { /* ignore */ }
    setSavingId(null);
  };

  if (!canManage) return <p className="text-xs text-[#71717a] text-center py-8">Only server owners and moderators can manage activity guild assignments.</p>;

  const loading = activitiesLoading || guildsLoading || agLoading;

  return (
    <div className="space-y-4">
      <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-1.5">
          <Shield className="w-3 h-3" /> Activity Guild Assignments
        </h3>
        <p className="text-xs text-[#71717a]">
          Assign guilds to activities with rotation modes. <strong>Rotation</strong> advances per finish, <strong>Daily</strong> per day, <strong>Schedule</strong> per day-of-week, <strong>All Guilds</strong> means everyone participates.
        </p>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-[#71717a] animate-spin" /></div>
        ) : activities.length === 0 ? (
          <p className="text-xs text-[#71717a] text-center py-4">No activities in this server.</p>
        ) : guilds.length === 0 ? (
          <p className="text-xs text-[#a1a1aa] text-center py-4">Create guilds first before assigning them to activities.</p>
        ) : (
          <div className="space-y-2">
            {activities.map(activity => {
              const mode = getMode(activity.id);
              const isExpanded = expandedActivity === activity.id;
              const isSaving = savingId === activity.id;
              const ags = getActivityGuilds(activity.id);
              const allGuildIds = new Set(activityGuilds.filter(ag => ag.activity_id === activity.id && ag.mode === "all").map(ag => ag.guild_id));

              return (
                <div key={activity.id} className="bg-[#18181b]/30 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedActivity(isExpanded ? null : activity.id)}
                    className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[#27272a]/30 transition text-left"
                  >
                    <span className="text-xs text-[#fafafa] font-medium flex-1 truncate">{activity.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      mode === "rotation" ? "text-[#a1a1aa] bg-[#18181b]" :
                      mode === "daily" ? "text-[#a1a1aa] bg-cyan-900/30" :
                      mode === "schedule" ? "text-[#a1a1aa] bg-purple-900/30" :
                      mode === "all" ? "text-[#a1a1aa] bg-emerald-900/30" :
                      "text-[#71717a] bg-[#18181b]"
                    }`}>
                      {mode === "rotation" ? "Rotation" : mode === "daily" ? "Daily" : mode === "schedule" ? "Schedule" : mode === "all" ? "All Guilds" : "None"}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-[#71717a]" /> : <ChevronDown className="w-4 h-4 text-[#71717a]" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#27272a]/50 px-4 py-3 space-y-3">
                      {/* Mode selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#71717a] w-12">Mode:</span>
                        <select
                          value={mode}
                          onChange={(e) => handleSetMode(activity.id, e.target.value as any)}
                          disabled={isSaving}
                          className="bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-xs text-[#fafafa] outline-none focus:border-[#52525b]"
                        >
                          <option value="none">None</option>
                          <option value="rotation">Rotation (per finish)</option>
                          <option value="daily">Daily (per day)</option>
                          <option value="schedule">Schedule</option>
                          <option value="all">All Guilds</option>
                        </select>
                        {isSaving && <Loader2 className="w-3 h-3 text-[#a1a1aa] animate-spin" />}
                      </div>

                      {/* Rotation / Daily mode — guild list */}
                      {(mode === "rotation" || mode === "daily") && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-[#71717a]">Guild rotation order:</p>
                          {ags.map((ag, idx) => {
                            const guild = guilds.find(g => g.id === ag.guild_id);
                            return (
                              <div key={ag.id || `${ag.activity_id}-${ag.guild_id}`} className="flex items-center gap-1 bg-[#18181b]/50 rounded px-2 py-1.5">
                                <span className="text-xs text-[#71717a] w-4">{idx + 1}.</span>
                                <span className="text-sm text-[#e4e4e7] flex-1">{guild?.name ?? "Unknown"}</span>
                                <button onClick={() => handleRemoveGuild(activity.id, ag.guild_id, mode)} className="p-0.5 text-[#71717a] hover:text-[#f87171]"><X className="w-3 h-3" /></button>
                              </div>
                            );
                          })}
                          {isSaving ? (
                            <div className="flex items-center gap-2 text-xs text-[#a1a1aa] py-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</div>
                          ) : (
                            <select
                              value=""
                              onChange={(e) => { if (e.target.value) handleAddGuild(activity.id, e.target.value, mode); }}
                              className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none focus:border-[#52525b]"
                            >
                              <option value="">+ Add guild...</option>
                              {guilds.filter(g => !ags.some(ag => ag.guild_id === g.id)).map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      {/* Schedule mode — per day */}
                      {mode === "schedule" && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-[#71717a]">Assign guild per day:</p>
                          <div className="grid grid-cols-7 gap-1">
                            {DAY_LABELS.map((label, dow) => {
                              const ag = ags.find(a => a.day_of_week === dow);
                              const guild = ag ? guilds.find(g => g.id === ag.guild_id) : null;
                              return (
                                <div key={dow} className="text-center space-y-1">
                                  <span className="text-xs text-[#71717a] block">{label}</span>
                                  <select
                                    value={guild?.id ?? ""}
                                    onChange={(e) => handleSetScheduleGuild(activity.id, dow, e.target.value || null)}
                                    disabled={isSaving}
                                    className="w-full rounded px-1.5 py-1.5 text-xs outline-none border bg-[#18181b] border-[#27272a] text-[#fafafa] focus:border-[#52525b]"
                                  >
                                    <option value="">—</option>
                                    {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* All Guilds mode */}
                      {mode === "all" && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-[#71717a]">All checked guilds participate:</p>
                          {guilds.map(g => {
                            const checked = allGuildIds.has(g.id);
                            return (
                              <label key={g.id} className="flex items-center gap-2 cursor-pointer px-2 py-1.5 hover:bg-[#18181b]/30 rounded">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleToggleAllGuild(activity.id, g.id, !checked)}
                                  disabled={isSaving}
                                  className="w-3.5 h-3.5 rounded border-[#3f3f46] bg-[#18181b] text-[#a1a1aa]"
                                />
                                <span className="text-sm text-[#e4e4e7]">{g.name}</span>
                                {checked && <Check className="w-3 h-3 text-emerald-400 ml-auto" />}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
