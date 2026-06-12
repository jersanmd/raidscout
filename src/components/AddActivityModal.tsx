import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServer } from "@/contexts/ServerContext";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useServerTimezone } from "@/hooks/useServerTimezone";
import { AddActivityForm } from "@/components/AddActivityForm";
import { fetchGuilds, setActivityGuilds } from "@/lib/supabase";
import { X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import type { Guild } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddActivityModal({ open, onClose }: Props) {
  const { currentServer } = useServer();
  const queryClient = useQueryClient();
  const timezone = useServerTimezone();
  useEscapeKey(onClose, open);

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildMode, setGuildMode] = useState<"none" | "rotation" | "daily" | "schedule">("rotation");
  const [selectedGuildIds, setSelectedGuildIds] = useState<string[]>([]);
  const [scheduleDays, setScheduleDays] = useState<Record<number, string | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (currentServer?.id) {
      fetchGuilds(currentServer.id).then(setGuilds).catch(() => setGuilds([]));
    }
  }, [currentServer?.id]);

  // Auto-select first guild as default for rotation
  useEffect(() => {
    if (guilds.length > 0 && selectedGuildIds.length === 0) {
      setSelectedGuildIds([guilds[0].id]);
    }
  }, [guilds]);

  if (!open || !currentServer) return null;

  const handleCreated = () => {
    queryClient.invalidateQueries({ queryKey: ["activities", currentServer.id] });
    queryClient.invalidateQueries({ queryKey: ["activity_instances", currentServer.id] });
    queryClient.invalidateQueries({ queryKey: ["activities-all", currentServer.id] });
    onClose();
  };

  const handleAssignGuilds = async (activityId: string) => {
    if (guildMode === "none") return;
    setSubmitting(true);
    try {
      if (guildMode === "schedule") {
        const assignments = Object.entries(scheduleDays)
          .filter(([, gid]) => gid !== null && gid !== undefined)
          .map(([day, gid]) => ({ guild_id: gid as string, day_of_week: parseInt(day) }));
        if (assignments.length > 0) await setActivityGuilds(activityId, assignments, "schedule");
      } else {
        if (selectedGuildIds.length === 0) { setSubmitting(false); return; }
        const assignments = selectedGuildIds.map((gid, i) => ({ guild_id: gid, sort_order: i + 1 }));
        await setActivityGuilds(activityId, assignments, guildMode);
      }
    } catch (err) {
      console.error("[AddActivityModal] Guild assignment failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const addGuild = (guildId: string) => {
    if (!guildId || selectedGuildIds.includes(guildId)) return;
    setSelectedGuildIds(prev => [...prev, guildId]);
  };
  const removeGuild = (guildId: string) => setSelectedGuildIds(prev => prev.filter(id => id !== guildId));
  const moveGuild = (guildId: string, direction: "up" | "down") => {
    setSelectedGuildIds(prev => {
      const idx = prev.indexOf(guildId);
      if (idx === -1) return prev;
      const next = [...prev];
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };
  const availableGuilds = guilds.filter(g => !selectedGuildIds.includes(g.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
          <h2 className="text-base font-semibold text-[#fafafa]">Add Custom Activity</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <AddActivityForm
            gameId="custom"
            gameSlug="custom"
            serverId={currentServer.id}
            timezone={timezone}
            onCreated={handleCreated}
            onCancel={onClose}
            onCreatedWithId={handleAssignGuilds}
            hideSubmitButton
            formRef={formRef}
          />

          {/* Guild Assignment Section */}
          {guilds.length > 0 && (
            <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-3 space-y-2">
              <h3 className="text-xs font-medium text-[#fafafa]">Guild Assignment</h3>
              <p className="text-[10px] text-[#71717a]">
                Optionally assign this activity to a guild now.
                You can change this later in Server Settings.
              </p>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#71717a] w-10">Mode:</span>
                <select
                  value={guildMode}
                  onChange={(e) => {
                    setGuildMode(e.target.value as "none" | "rotation" | "daily" | "schedule");
                    setSelectedGuildIds([]);
                    setScheduleDays({});
                  }}
                  className="flex-1 bg-[#09090b] border border-[#3f3f46] rounded px-2 py-1.5 text-xs text-[#fafafa] outline-none focus:ring-1 focus:ring-[#52525b]"
                >
                  <option value="none">None</option>
                  <option value="rotation">Rotation (per kill)</option>
                  <option value="daily">Daily (per day)</option>
                  <option value="schedule">Schedule</option>
                </select>
              </div>

              {(guildMode === "rotation" || guildMode === "daily") && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-[#71717a]">Guild order (first → last):</p>
                  {selectedGuildIds.map((gid, idx) => {
                    const guild = guilds.find(g => g.id === gid);
                    return (
                      <div key={gid} className="flex items-center gap-1 bg-[#09090b]/50 rounded px-2 py-1.5">
                        <span className="text-[10px] text-[#71717a] w-4">{idx + 1}.</span>
                        <span className="text-xs text-[#e4e4e7] flex-1">{guild?.name ?? "Unknown"}</span>
                        <button onClick={() => moveGuild(gid, "up")} disabled={idx === 0} className="p-0.5 text-[#71717a] hover:text-[#a1a1aa] disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                        <button onClick={() => moveGuild(gid, "down")} disabled={idx === selectedGuildIds.length - 1} className="p-0.5 text-[#71717a] hover:text-[#a1a1aa] disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                        <button onClick={() => removeGuild(gid)} className="p-0.5 text-[#71717a] hover:text-[#f87171]"><X className="w-3 h-3" /></button>
                      </div>
                    );
                  })}
                  {availableGuilds.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => addGuild(e.target.value)}
                      className="w-full bg-[#09090b] border border-[#3f3f46] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none focus:ring-1 focus:ring-[#52525b]"
                    >
                      <option value="">+ Add guild...</option>
                      {availableGuilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  )}
                </div>
              )}

              {guildMode === "schedule" && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-[#71717a]">Assign a guild per day:</p>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-[#71717a] w-8">{day}</span>
                      <select
                        value={scheduleDays[i] ?? ""}
                        onChange={(e) => setScheduleDays(prev => ({ ...prev, [i]: e.target.value || null }))}
                        className="flex-1 bg-[#09090b] border border-[#3f3f46] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none focus:ring-1 focus:ring-[#52525b]"
                      >
                        <option value="">—</option>
                        {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {submitting && (
                <p className="text-[10px] text-[#71717a] mt-1">Assigning guilds to activity...</p>
              )}
            </div>
          )}
        </div>

        {/* Footer with Add button */}
        <div className="p-4 border-t border-[#27272a]">
          <button
            onClick={() => formRef.current?.requestSubmit()}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : "Add Activity"}
          </button>
        </div>
      </div>
    </div>
  );
}
