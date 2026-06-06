import { useState, useMemo, useEffect, useCallback } from "react";
import { type HistoryEntry } from "@/lib/history";
import { fetchHistoryFromSupabase, deleteDeathRecord, isSupabaseConfigured, editDeathTime, fetchGuilds } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import { useQueryClient } from "@tanstack/react-query";
import { ParticipantModal } from "@/components/ParticipantModal";
import { BossImage } from "@/components/BossImage";
import { Clock, Trash2, Skull, Repeat, Timer, Users, Loader2, Pencil, X, Search, Calendar } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { guildColor } from "@/lib/constants";
import type { Guild } from "@/types";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split("T")[0];

export function HistoryView() {
  const [supabaseHistory, setSupabaseHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const configured = isSupabaseConfigured();

  // Date range � default last 7 days
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "custom">("7d");
  const [dateFrom, setDateFrom] = useState(() => daysAgo(7));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const handleDatePreset = (preset: "7d" | "30d" | "custom") => {
    setDateRange(preset);
    if (preset === "7d") { setDateFrom(daysAgo(7)); setDateTo(new Date().toISOString().split("T")[0]); }
    else if (preset === "30d") { setDateFrom(daysAgo(30)); setDateTo(new Date().toISOString().split("T")[0]); }
  };

  const fetchHistory = useCallback((since?: string, until?: string) => {
    if (!configured || (!user && !isViewer) || !serverId) {
      setSupabaseHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchHistoryFromSupabase(serverId, since, until)
      .then(setSupabaseHistory)
      .catch(() => setSupabaseHistory([]))
      .finally(() => setLoading(false));
  }, [configured, user, isViewer, serverId]);

  // Fetch with date range
  useEffect(() => {
    const since = dateFrom ? new Date(dateFrom + "T00:00:00Z").toISOString() : undefined;
    const until = dateTo ? new Date(dateTo + "T23:59:59Z").toISOString() : undefined;
    fetchHistory(since, until);
  }, [fetchHistory, dateFrom, dateTo]);

  const history = supabaseHistory;

  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  // Edit death time
  const [editEntry, setEditEntry] = useState<HistoryEntry | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editToast, setEditToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Guilds for owner guild ID lookup
  const [guilds, setGuilds] = useState<Guild[]>([]);
  useEffect(() => {
    fetchGuilds().then(setGuilds).catch(() => setGuilds([]));
  }, []);

  const handleEditDeathTime = async () => {
    if (!editEntry?.deathRecordId || !editDate) return;
    setEditSaving(true);
    try {
      const match = editDate.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (!match) throw new Error("Invalid date format");
      const [, y, m, d, hh, mm] = match.map(Number);
      const newTime = new Date(y, m - 1, d, hh, mm);
      if (isNaN(newTime.getTime())) throw new Error("Invalid date");
      await editDeathTime(editEntry.deathRecordId, newTime);
      queryClient.invalidateQueries({ queryKey: ["death_records"] });
      // Refresh local history
      if (serverId) {
        const since = dateFrom ? new Date(dateFrom + "T00:00:00Z").toISOString() : undefined;
        const until = dateTo ? new Date(dateTo + "T23:59:59Z").toISOString() : undefined;
        fetchHistory(since, until);
      }
      setEditToast({ type: "success", message: "Death time updated!" });
      setEditEntry(null);
    } catch (err: any) {
      setEditToast({ type: "error", message: err?.message ?? "Failed to update death time" });
    } finally {
      setEditSaving(false);
    }
  };

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchText, setSearchText] = useState("");

  // Auto-open participant modal from URL (linked from Leaderboard)
  useEffect(() => {
    const boss = searchParams.get("boss");
    if (boss && history.length > 0) {
      const entry = history.find(
        (e) => (e.bossName || "").toLowerCase() === boss.toLowerCase() && e.deathRecordId
      );
      if (entry) {
        setSelectedEntry(entry);
        searchParams.delete("boss");
        searchParams.delete("time");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [history, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    if (!searchText.trim()) return history;
    const q = searchText.toLowerCase();
    return history.filter(e => (e.bossName || e.activityName || "").toLowerCase().includes(q));
  }, [history, searchText]);

  const grouped = useMemo(() => {
    const groups: { label: string; entries: HistoryEntry[] }[] = [];
    const now = new Date();

    for (const entry of filtered) {
      const entryDate = new Date(entry.createdAt);
      let label: string;

      if (entryDate.toDateString() === now.toDateString()) {
        label = "Today";
      } else {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (entryDate.toDateString() === yesterday.toDateString()) {
          label = "Yesterday";
        } else {
          label = entryDate.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          });
        }
      }

      let group = groups.find((g) => g.label === label);
      if (!group) {
        group = { label, entries: [] };
        groups.push(group);
      }
      group.entries.push(entry);
    }

    return groups;
  }, [filtered]);

  const handleDelete = async () => {
    if (!deleteTarget || !deleteTarget.deathRecordId) return;
    setDeleting(true);
    try {
      await deleteDeathRecord(deleteTarget.deathRecordId);
      setSupabaseHistory(prev => prev.filter(e => e.id !== deleteTarget.id));
      queryClient.invalidateQueries({ queryKey: ["boss-spawns"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (err) {
      console.error("Failed to delete death record:", err);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <Clock className="w-5 h-5 text-[#71717a]" />
          <h2 className="text-xl font-semibold text-[#fafafa]">History</h2>
        </div>
        <div className="flex items-center gap-2 order-3 sm:order-none w-full sm:w-auto mt-2 sm:mt-0">
          <div className="relative flex-1 sm:flex-initial sm:w-48 lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search boss name..."
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg pl-9 pr-8 py-2 text-sm text-[#fafafa] placeholder-[#52525b] outline-none focus:border-[#52525b] transition"
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#71717a] hover:text-[#fafafa] transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(["7d", "30d", "custom"] as const).map(p => (
            <button
              key={p}
              onClick={() => handleDatePreset(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                dateRange === p
                  ? "bg-[#27272a] border-[#3f3f46] text-[#fafafa]"
                  : "bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa]"
              }`}
            >
              {p === "7d" ? "Last 7d" : p === "30d" ? "Last Month" : "Custom"}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range picker */}
      {dateRange === "custom" && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#71717a]">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-[#fafafa] outline-none focus:border-[#52525b]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#71717a]">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-1.5 text-xs text-[#fafafa] outline-none focus:border-[#52525b]"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-16">
          <Skull className="w-12 h-12 text-[#3f3f46] mx-auto mb-3" />
          <p className="text-[#71717a] text-lg">No history yet</p>
          <p className="text-[#52525b] text-sm mt-1">
            Mark a boss as died to start recording your hunt history.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-[#3f3f46] mx-auto mb-3" />
          <p className="text-[#71717a] text-lg">No results for "{searchText}"</p>
          <button onClick={() => setSearchText("")} className="text-sm text-[#a1a1aa] hover:text-[#d4d4d8] mt-1 transition">
            Clear search
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.label}>
              <h3 className="text-[11px] font-semibold text-[#71717a] uppercase tracking-wider mb-2 flex items-center gap-3">
                {group.label}
                <span className="flex-1 h-px bg-[#27272a]" />
              </h3>

              <div className="space-y-1">
                {group.entries.map((entry) => {
                  const deathDate = new Date(entry.deathTime || "");
                  const respawnDate = new Date(entry.respawnTime || "");
                  const diffMs = respawnDate.getTime() - deathDate.getTime();
                  const diffH = Math.round(diffMs / 3600_000);

                  return (
                    <div
                      key={entry.id}
                      onClick={() => (entry.deathRecordId || entry.activityInstanceId) && setSelectedEntry(entry)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg bg-[#18181b] border border-[#27272a] transition group ${
                        (entry.deathRecordId || entry.activityInstanceId)
                          ? "cursor-pointer hover:border-[#3f3f46] hover:bg-[#18181b]"
                          : ""
                      }`}
                      title={(entry.deathRecordId || entry.activityInstanceId) ? "Click to see participants" : ""}
                    >
                      {/* Icon — boss image or activity image */}
                      {entry.type === "activity" ? (
                        entry.activityImageUrl ? (
                          <img src={entry.activityImageUrl} alt={entry.activityName} className="w-8 h-8 rounded-lg object-cover border border-[#27272a] shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-[#09090b] border border-[#27272a] flex items-center justify-center shrink-0">
                            <Calendar className="w-4 h-4 text-[#52525b]" />
                          </div>
                        )
                      ) : (
                        <BossImage bossName={entry.bossName!} size="sm" />
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[#fafafa] font-medium text-sm">
                            {entry.type === "activity" ? entry.activityName : entry.bossName}
                          </span>
                          {entry.type !== "activity" && entry.ownerGuildName && (
                            <span className={`text-[10px] font-medium ${guildColor(entry.ownerGuildName!).text}`}>
                              {entry.ownerGuildName}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-[#52525b]">
                            {entry.type === "activity" ? "Activity" : entry.spawnType === "fixed_schedule" ? "Schedule" : `+${diffH}h`}
                          </span>
                          {(entry.deathRecordId || entry.activityInstanceId) && (
                            <Users className="w-3 h-3 text-[#52525b]" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs mt-0.5 font-mono">
                          {entry.type === "activity" ? (
                            <span className="text-[#52525b]">Completed: {entry.completionTime ? formatDate(entry.completionTime) + " " + formatTime(entry.completionTime) : "Unknown"}</span>
                          ) : (
                            <>
                              <span className="text-[#a1a1aa]">Killed {entry.deathTime ? formatDate(entry.deathTime) + " " + formatTime(entry.deathTime) : "Unknown"}</span>
                              <span className="text-[#3f3f46]">→</span>
                              <span className="text-[#71717a]">Spawns {entry.respawnTime ? formatDate(entry.respawnTime) + " " + formatTime(entry.respawnTime) : "Unknown"}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {/* Edit + Delete buttons — bosses only */}
                      {!isViewer && entry.type !== "activity" && entry.deathRecordId && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const dt = new Date(entry.deathTime || "");
                              const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                              setEditDate(local);
                              setEditEntry(entry);
                            }}
                            className="text-[#52525b] hover:text-[#a1a1aa] transition opacity-0 group-hover:opacity-100 shrink-0 p-1"
                            title="Edit death time"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Participant modal — works for both boss kills and activity finishes */}
      {selectedEntry && (selectedEntry.deathRecordId || selectedEntry.activityInstanceId) && (
        <ParticipantModal
          deathRecordId={selectedEntry.deathRecordId || ""}
          bossName={selectedEntry.activityName || selectedEntry.bossName || ""}
          deathTime={(selectedEntry.activityInstanceId ? selectedEntry.completionTime : selectedEntry.deathTime) || ""}
          activityInstanceId={selectedEntry.activityInstanceId}
          onClose={() => setSelectedEntry(null)}
          navigate={navigate}
          readOnly={isViewer}
          ownerGuildId={!selectedEntry.activityInstanceId ? (() => {
            const name = selectedEntry.ownerGuildName;
            if (!name) return null;
            return guilds.find(g => g.name === name)?.id ?? null;
          })() : null}
        />
      )}

      {/* Edit death time modal */}
      {editEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditEntry(null)} />
          <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl p-6 w-full max-w-sm shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#fafafa]">Edit Death Time</h3>
              <button onClick={() => setEditEntry(null)} className="p-1 rounded-md text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-[#a1a1aa] mb-3">
              Change the death time for <span className="text-[#fafafa] font-medium">{editEntry.bossName}</span>
            </p>
            <input
              type="datetime-local"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#52525b] mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditEntry(null)}
                className="px-4 py-2 rounded-md text-sm text-[#71717a] hover:text-[#fafafa] transition"
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleEditDeathTime}
                disabled={editSaving}
                className="px-4 py-2 rounded-md text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50"
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit toast */}
      {editToast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in">
          <div className="px-4 py-2 rounded-lg text-sm text-[#fafafa] shadow-lg bg-[#18181b] border border-[#27272a]">
            {editToast.message}
          </div>
        </div>
      )}
    </div>
  );
}
