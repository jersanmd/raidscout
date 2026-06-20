import { useState, useMemo, Fragment } from "react";
import type { Boss, Guild, BossGuild } from "@/types";
import { fetchBossGuilds, setBossGuilds } from "@/lib/supabase";
import { Loader2, ChevronUp, ChevronDown, Plus, Minus, X, CheckSquare, Square } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  bosses: Boss[];
  guilds: Guild[];
  bossGuilds: BossGuild[];
  onBossGuildsChange: (bg: BossGuild[]) => void;
  serverId: string;
}

export function BossGuildsTab({ bosses, guilds, bossGuilds, onBossGuildsChange, serverId }: Props) {
  const { toast } = useToast();
  const [expandedBoss, setExpandedBoss] = useState<string | null>(null);
  const [savingBossId, setSavingBossId] = useState<string | null>(null);
  const [bossMultiMode, setBossMultiMode] = useState(false);
  const [selectedBossIds, setSelectedBossIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<"rotation" | "schedule" | "daily" | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkRotationAdded, setBulkRotationAdded] = useState<string[]>([]);
  const [bulkDailyAdded, setBulkDailyAdded] = useState<string[]>([]);
  const [bulkScheduleDays, setBulkScheduleDays] = useState<Record<number, string | null>>({});

  const sortedBosses = useMemo(() => [...bosses].sort((a, b) => a.name.localeCompare(b.name)), [bosses]);

  const getBossGuildsForBoss = (bossId: string) => bossGuilds.filter(bg => bg.boss_id === bossId);

  const getBossMode = (bossId: string): "none" | "rotation" | "schedule" | "daily" => {
    const bgs = getBossGuildsForBoss(bossId).filter(bg => bg.sort_order !== -1);
    if (bgs.length === 0) return "none";
    if (bgs[0].mode === "daily") return "daily";
    if (bgs[0].mode === "schedule") return "schedule";
    if (bgs[0].sort_order !== null && bgs[0].sort_order > 0) return "rotation";
    return "none";
  };

  const toggleBossSelect = (bossId: string) => {
    setSelectedBossIds(prev => { const n = new Set(prev); n.has(bossId) ? n.delete(bossId) : n.add(bossId); return n; });
  };
  const clearBossSelection = () => {
    setSelectedBossIds(new Set()); setBulkMode(null); setBulkRotationAdded([]); setBulkDailyAdded([]); setBulkScheduleDays({});
  };

  const handleSetBossMode = async (bossId: string, mode: "none" | "rotation" | "schedule" | "daily") => {
    const currentMode = getBossMode(bossId);
    if (currentMode === mode) return;
    setSavingBossId(bossId);
    try {
      await setBossGuilds(bossId, [], "rotation", serverId);
      if (mode === "none") {
        onBossGuildsChange(bossGuilds.filter(bg => bg.boss_id !== bossId));
      } else {
        onBossGuildsChange(bossGuilds.filter(bg => bg.boss_id !== bossId));
      }
    } catch (err: any) { toast("error", err?.message ?? "Failed to set mode"); }
    finally { setSavingBossId(null); }
  };

  const handleAddRotationGuild = async (bossId: string, guildId: string) => {
    setSavingBossId(bossId);
    try {
      const existing = getBossGuildsForBoss(bossId).filter(bg => bg.sort_order !== null && bg.sort_order > 0);
      const nextOrder = existing.length > 0 ? Math.max(...existing.map(bg => bg.sort_order ?? 0)) + 1 : 1;
      const newAssignments = [...existing.map(bg => ({ guild_id: bg.guild_id, sort_order: bg.sort_order! })), { guild_id: guildId, sort_order: nextOrder }];
      await setBossGuilds(bossId, newAssignments, "rotation", serverId);
      const updated = await fetchBossGuilds(serverId);
      onBossGuildsChange(updated);
    } catch (err: any) { toast("error", err?.message ?? "Failed to add guild"); }
    finally { setSavingBossId(null); }
  };

  const handleRemoveRotationGuild = async (bossId: string, entryId: string) => {
    const existing = getBossGuildsForBoss(bossId).filter(bg => bg.id !== entryId);
    const reordered = existing.map((bg, i) => ({ guild_id: bg.guild_id, sort_order: i + 1 }));
    await setBossGuilds(bossId, reordered, "rotation", serverId);
    const updated = await fetchBossGuilds(serverId);
    onBossGuildsChange(updated);
  };

  const handleMoveRotationGuild = async (bossId: string, entryId: string, direction: "up" | "down") => {
    const existing = getBossGuildsForBoss(bossId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = existing.findIndex(bg => bg.id === entryId);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === existing.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [existing[idx], existing[swapIdx]] = [existing[swapIdx], existing[idx]];
    const reordered = existing.map((bg, i) => ({ guild_id: bg.guild_id, sort_order: i + 1 }));
    await setBossGuilds(bossId, reordered, "rotation", serverId);
    const updated = await fetchBossGuilds(serverId);
    onBossGuildsChange(updated);
  };

  const handleAddDailyGuild = async (bossId: string, guildId: string) => {
    setSavingBossId(bossId);
    try {
      const existing = getBossGuildsForBoss(bossId);
      const nextOrder = existing.length > 0 ? Math.max(...existing.map(bg => bg.sort_order ?? 0)) + 1 : 1;
      const newAssignments = [...existing.map(bg => ({ guild_id: bg.guild_id, sort_order: bg.sort_order! })), { guild_id: guildId, sort_order: nextOrder }];
      await setBossGuilds(bossId, newAssignments, "daily", serverId);
      const updated = await fetchBossGuilds(serverId);
      onBossGuildsChange(updated);
    } catch (err: any) { toast("error", err?.message ?? "Failed to add guild"); }
    finally { setSavingBossId(null); }
  };

  const handleRemoveDailyGuild = async (bossId: string, entryId: string) => {
    const existing = getBossGuildsForBoss(bossId).filter(bg => bg.id !== entryId);
    const reordered = existing.map((bg, i) => ({ guild_id: bg.guild_id, sort_order: i + 1 }));
    await setBossGuilds(bossId, reordered, "daily", serverId);
    const updated = await fetchBossGuilds(serverId);
    onBossGuildsChange(updated);
  };

  const handleMoveDailyGuild = async (bossId: string, entryId: string, direction: "up" | "down") => {
    const existing = getBossGuildsForBoss(bossId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = existing.findIndex(bg => bg.id === entryId);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === existing.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [existing[idx], existing[swapIdx]] = [existing[swapIdx], existing[idx]];
    const reordered = existing.map((bg, i) => ({ guild_id: bg.guild_id, sort_order: i + 1 }));
    await setBossGuilds(bossId, reordered, "daily", serverId);
    const updated = await fetchBossGuilds(serverId);
    onBossGuildsChange(updated);
  };

  const handleSetScheduleGuild = async (bossId: string, dayOfWeek: number, guildId: string | null) => {
    const existing = getBossGuildsForBoss(bossId).filter(bg => bg.day_of_week !== dayOfWeek);
    const newAssignments = existing.map(bg => ({ guild_id: bg.guild_id, day_of_week: bg.day_of_week! }));
    if (guildId) newAssignments.push({ guild_id: guildId, day_of_week: dayOfWeek });
    await setBossGuilds(bossId, newAssignments, "schedule", serverId);
    const updated = await fetchBossGuilds(serverId);
    onBossGuildsChange(updated);
  };

  if (guilds.length === 0) {
    return <div className="text-center py-16"><p className="text-[#71717a]">No guilds created yet.</p><p className="text-[#52525b] text-sm mt-1">Create guilds in the Guilds tab first.</p></div>;
  }

  return (
    <div className="space-y-2">
      {/* Multi-select controls */}
      <div className="flex items-center gap-2">
        <button onClick={() => { setBossMultiMode(!bossMultiMode); clearBossSelection(); }}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${
            bossMultiMode ? "bg-[#27272a] text-[#fafafa]" : "bg-[#18181b] text-[#a1a1aa] hover:text-[#fafafa]"
          }`}>
          <CheckSquare className="w-3.5 h-3.5" />{bossMultiMode ? "Exit Multi-Select" : "Multi-Select"}
        </button>
        {bossMultiMode && selectedBossIds.size > 0 && (
          <span className="text-xs text-[#a1a1aa]">{selectedBossIds.size} selected</span>
        )}
      </div>

      {/* Multi-select bulk actions */}
      {bossMultiMode && selectedBossIds.size > 0 && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#a1a1aa]">Bulk set mode:</span>
            {(["rotation", "daily", "schedule", "none"] as const).map(m => (
              <button key={m} onClick={() => { setBulkMode(m === "none" ? null : m); }}
                disabled={bulkProcessing}
                className={`px-2 py-1 rounded text-xs font-medium transition capitalize ${
                  bulkMode === m ? "bg-[#27272a] text-[#fafafa]" : "bg-[#27272a] text-[#d4d4d8] hover:bg-[#3f3f46]"
                } disabled:opacity-50`}>{m}</button>
            ))}
          </div>
          {bulkMode === "rotation" && (
            <div>
              <p className="text-xs text-[#71717a] mb-1">Add guilds to rotation (in order):</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {bulkRotationAdded.map((gid, i) => { const g = guilds.find(x => x.id === gid); return <span key={i} className="text-xs bg-blue-900/30 border border-blue-700/50 rounded px-2 py-0.5 text-blue-300">{g?.name}</span>; })}
              </div>
              <select value="" onChange={e => { if (e.target.value) { setBulkRotationAdded(prev => [...prev, e.target.value]); e.target.value = ""; }}}
                className="bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-xs text-[#fafafa]">
                <option value="">+ Add guild...</option>
                {guilds.filter(g => !bulkRotationAdded.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {bulkRotationAdded.length > 0 && (
                <button onClick={() => setBulkRotationAdded([])} className="ml-2 text-xs text-[#a1a1aa] hover:text-[#f87171]">Clear</button>
              )}
            </div>
          )}
          {bulkMode === "daily" && (
            <div>
              <p className="text-xs text-[#71717a] mb-1">Add guilds to daily rotation:</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {bulkDailyAdded.map((gid, i) => { const g = guilds.find(x => x.id === gid); return <span key={i} className="text-xs bg-cyan-900/30 border border-cyan-700/50 rounded px-2 py-0.5 text-cyan-300">{g?.name}</span>; })}
              </div>
              <select value="" onChange={e => { if (e.target.value) { setBulkDailyAdded(prev => [...prev, e.target.value]); e.target.value = ""; }}}
                className="bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-xs text-[#fafafa]">
                <option value="">+ Add guild...</option>
                {guilds.filter(g => !bulkDailyAdded.includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          {bulkMode && (
            <button onClick={() => { if (bulkMode === "rotation") bulkRotationAdded.forEach(gid => { selectedBossIds.forEach(bid => { handleAddRotationGuild(bid, gid); }); }); clearBossSelection(); }}
              disabled={bulkProcessing}
              className="px-3 py-1.5 rounded text-xs font-medium bg-[#27272a] text-[#fafafa] hover:bg-[#3f3f46] disabled:opacity-50">
              {bulkProcessing ? "Applying..." : `Apply ${bulkMode} to ${selectedBossIds.size} bosses`}
            </button>
          )}
        </div>
      )}

      {/* Per-boss list */}
      {sortedBosses.map(boss => {
        const mode = getBossMode(boss.id);
        const bossAssignments = getBossGuildsForBoss(boss.id).filter(bg => bg.sort_order !== -1);
        const isExpanded = expandedBoss === boss.id;
        const isSaving = savingBossId === boss.id;

        return (
          <div key={boss.id} className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
            <button onClick={() => setExpandedBoss(isExpanded ? null : boss.id)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition ${isExpanded ? "border-b border-[#27272a]" : ""}`}>
              <div className="flex items-center gap-3">
                {bossMultiMode && (
                  <input type="checkbox" checked={selectedBossIds.has(boss.id)}
                    onChange={() => toggleBossSelect(boss.id)}
                    className="w-3.5 h-3.5 rounded border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] focus:ring-[#52525b]/50" />
                )}
                <span className="text-sm text-[#fafafa] font-medium">{boss.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  mode === "rotation" ? "bg-[#18181b] text-[#a1a1aa]" :
                  mode === "daily" ? "bg-[#18181b] text-[#a1a1aa]" :
                  mode === "schedule" ? "bg-[#18181b] text-[#a1a1aa]" :
                  "bg-[#18181b] text-[#71717a]"
                }`}>{mode === "none" ? "—" : mode}</span>
              </div>
              <div className="flex items-center gap-2">
                {isSaving && <Loader2 className="w-4 h-4 text-[#a1a1aa] animate-spin" />}
                {!bossMultiMode && (isExpanded ? <ChevronUp className="w-4 h-4 text-[#71717a]" /> : <ChevronDown className="w-4 h-4 text-[#71717a]" />)}
              </div>
            </button>

            {!bossMultiMode && isExpanded && (
              <div className="px-4 py-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#71717a] w-12">Mode:</span>
                  <select value={mode} onChange={e => handleSetBossMode(boss.id, e.target.value as any)}
                    className="bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-xs text-[#fafafa] outline-none">
                    <option value="none">None</option>
                    <option value="rotation">Rotation (per kill)</option>
                    <option value="daily">Daily (per day)</option>
                    <option value="schedule">Schedule</option>
                  </select>
                </div>

                {mode === "rotation" && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-[#71717a]">Guild rotation order (first → last):</p>
                    {bossAssignments.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((bg, idx) => {
                      const guild = guilds.find(g => g.id === bg.guild_id);
                      return (
                        <div key={bg.id} className="flex items-center gap-1 bg-[#18181b] rounded px-2 py-1.5">
                          <span className="text-xs text-[#71717a] w-4">{idx + 1}.</span>
                          <span className="text-sm text-slate-200 flex-1">{guild?.name ?? "?"}</span>
                          <button onClick={() => handleMoveRotationGuild(boss.id, bg.id, "up")} disabled={idx === 0} className="p-0.5 text-[#71717a] hover:text-emerald-400 disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                          <button onClick={() => handleMoveRotationGuild(boss.id, bg.id, "down")} disabled={idx === bossAssignments.length - 1} className="p-0.5 text-[#71717a] hover:text-[#f87171] disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                          <button onClick={() => handleRemoveRotationGuild(boss.id, bg.id)} className="p-0.5 text-[#71717a] hover:text-[#f87171]"><X className="w-3 h-3" /></button>
                        </div>
                      );
                    })}
                    {isSaving ? (
                      <div className="flex items-center gap-2 text-xs text-[#a1a1aa] py-1"><Loader2 className="w-3 h-3 animate-spin" />Adding...</div>
                    ) : (
                      <select value="" onChange={e => { if (e.target.value) handleAddRotationGuild(boss.id, e.target.value); }}
                        className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none">
                        <option value="">+ Add guild to rotation...</option>
                        {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    )}
                  </div>
                )}

                {mode === "daily" && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-[#71717a]">Daily rotation order:</p>
                    {bossAssignments.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((bg, idx) => {
                      const guild = guilds.find(g => g.id === bg.guild_id);
                      return (
                        <div key={bg.id} className="flex items-center gap-1 bg-[#18181b] rounded px-2 py-1.5">
                          <span className="text-xs text-[#71717a] w-4">{idx + 1}.</span>
                          <span className="text-sm text-slate-200 flex-1">{guild?.name ?? "?"}</span>
                          <button onClick={() => handleMoveDailyGuild(boss.id, bg.id, "up")} disabled={idx === 0} className="p-0.5 text-[#71717a] hover:text-emerald-400 disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                          <button onClick={() => handleMoveDailyGuild(boss.id, bg.id, "down")} disabled={idx === bossAssignments.length - 1} className="p-0.5 text-[#71717a] hover:text-[#f87171] disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                          <button onClick={() => handleRemoveDailyGuild(boss.id, bg.id)} className="p-0.5 text-[#71717a] hover:text-[#f87171]"><X className="w-3 h-3" /></button>
                        </div>
                      );
                    })}
                    {isSaving ? (
                      <div className="flex items-center gap-2 text-xs text-[#a1a1aa] py-1"><Loader2 className="w-3 h-3 animate-spin" />Adding...</div>
                    ) : (
                      <select value="" onChange={e => { if (e.target.value) handleAddDailyGuild(boss.id, e.target.value); }}
                        className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none">
                        <option value="">+ Add guild to daily rotation...</option>
                        {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    )}
                  </div>
                )}

                {mode === "schedule" && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-[#71717a]">Assign guild per day:</p>
                    <div className="grid grid-cols-7 gap-1">
                      {DAY_LABELS.map((label, dow) => {
                        const bg = bossAssignments.find(a => a.day_of_week === dow);
                        const guild = bg ? guilds.find(g => g.id === bg.guild_id) : null;
                        return (
                          <div key={dow} className="text-center space-y-1">
                            <span className="text-xs text-[#71717a] block">{label}</span>
                            <select value={guild?.id ?? ""} onChange={e => handleSetScheduleGuild(boss.id, dow, e.target.value || null)}
                              className={`w-full rounded-lg px-1.5 py-1.5 text-xs outline-none border ${
                                guild ? "bg-purple-900/20 border-purple-700 text-purple-300" : "bg-[#18181b] border-[#27272a] text-[#fafafa]"
                              }`}>
                              <option value="">—</option>
                              {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
