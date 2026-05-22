import { useState, useMemo, useEffect } from "react";
import { type HistoryEntry } from "@/lib/history";
import { fetchHistoryFromSupabase, deleteDeathRecord, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import { useQueryClient } from "@tanstack/react-query";
import { ParticipantModal } from "@/components/ParticipantModal";
import { Clock, Trash2, Skull, Repeat, Timer, Users, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

export function HistoryView() {
  const [supabaseHistory, setSupabaseHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const configured = isSupabaseConfigured();

  // Fetch from Supabase only
  useEffect(() => {
    if (!configured || (!user && !isViewer) || !serverId) {
      setSupabaseHistory([]);
      setLoading(!configured || (!user && !isViewer) ? false : !serverId);
      return;
    }
    setLoading(true);
    fetchHistoryFromSupabase(serverId)
      .then(setSupabaseHistory)
      .catch(() => setSupabaseHistory([]))
      .finally(() => setLoading(false));
  }, [configured, user, isViewer, serverId]);

  const history = supabaseHistory;

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open participant modal from URL (linked from Leaderboard)
  useEffect(() => {
    const boss = searchParams.get("boss");
    if (boss && history.length > 0) {
      const entry = history.find(
        (e) => e.bossName.toLowerCase() === boss.toLowerCase() && e.deathRecordId
      );
      if (entry) {
        setSelectedEntry(entry);
        searchParams.delete("boss");
        searchParams.delete("time");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [history, searchParams, setSearchParams]);

  const grouped = useMemo(() => {
    const groups: { label: string; entries: HistoryEntry[] }[] = [];
    const now = new Date();

    for (const entry of history) {
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
  }, [history]);

  const handleClear = () => {
    setSupabaseHistory([]);
    setShowClearConfirm(false);
  };

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
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-white">Respawn History</h2>
        </div>
        {history.length > 0 && !isViewer && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-400 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-16">
          <Skull className="w-12 h-12 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500 text-lg">No history yet</p>
          <p className="text-slate-600 text-sm mt-1">
            Mark a boss as died to start recording your hunt history.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.label}>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                {group.label}
              </h3>

              <div className="space-y-1">
                {group.entries.map((entry) => {
                  const deathDate = new Date(entry.deathTime);
                  const respawnDate = new Date(entry.respawnTime);
                  const diffMs = respawnDate.getTime() - deathDate.getTime();
                  const diffH = Math.round(diffMs / 3600_000);

                  return (
                    <div
                      key={entry.id}
                      onClick={() => entry.deathRecordId && setSelectedEntry(entry)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-900/50 border border-slate-800/50 transition group ${
                        entry.deathRecordId
                          ? "cursor-pointer hover:border-slate-600 hover:bg-slate-900/80"
                          : ""
                      }`}
                      title={entry.deathRecordId ? "Click to see participants" : ""}
                    >
                      {/* Icon */}
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                          entry.spawnType === "fixed_schedule"
                            ? "bg-blue-900/20 text-blue-400"
                            : "bg-orange-900/20 text-orange-400"
                        }`}
                      >
                        {entry.spawnType === "fixed_schedule" ? (
                          <Repeat className="w-4 h-4" />
                        ) : (
                          <Timer className="w-4 h-4" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium text-sm">
                            {entry.bossName}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
                            {entry.spawnType === "fixed_schedule" ? "Schedule" : `+${diffH}h`}
                          </span>
                          {entry.deathRecordId && (
                            <Users className="w-3 h-3 text-slate-600" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span>
                            Killed: {formatDate(entry.deathTime)} {formatTime(entry.deathTime)}
                          </span>
                          <span>â†’</span>
                          <span className="text-slate-400">
                            Spawns: {formatDate(entry.respawnTime)} {formatTime(entry.respawnTime)}
                          </span>
                        </div>
                      </div>
                      {/* Delete button */}
                      {!isViewer && entry.deathRecordId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(entry);
                          }}
                          className="text-slate-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100 shrink-0 p-1"
                          title="Delete entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Clear confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowClearConfirm(false)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xs shadow-2xl p-4 space-y-4">
            <p className="text-white text-sm text-center">
              Clear all {history.length} history entries?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                className="flex-1 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete single entry confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xs shadow-2xl p-4 space-y-4">
            <p className="text-white text-sm text-center">
              Delete <span className="font-semibold text-red-400">{deleteTarget.bossName}</span> entry? This will also remove all participant records for this kill.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm flex items-center justify-center gap-1.5"
              >
                {deleting ? (
                  <span className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Participant modal */}
      {selectedEntry && selectedEntry.deathRecordId && (
        <ParticipantModal
          deathRecordId={selectedEntry.deathRecordId}
          bossName={selectedEntry.bossName}
          deathTime={selectedEntry.deathTime}
          onClose={() => setSelectedEntry(null)}
          navigate={navigate}
          readOnly={false}
        />
      )}
    </div>
  );
}
