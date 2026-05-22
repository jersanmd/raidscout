import { useState, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAttendance, useAddAttendance, useRemoveAttendance } from "@/hooks/useAttendance";
import { useMembers } from "@/hooks/useMembers";
import { useServerId } from "@/contexts/ServerContext";
import { extractNamesWithAI } from "@/lib/vision";
import { fetchGuilds } from "@/lib/supabase";
import { guildColor } from "@/lib/constants";
import { Loader2, X, Plus, Check, Sparkles, ImagePlus, Shield } from "lucide-react";
import type { Guild, Member } from "@/types";

// ── Helpers ─────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function findClosestMember(
  detectedName: string,
  members: { id: string; name: string }[]
): { id: string; name: string } | null {
  const lower = detectedName.toLowerCase();
  const maxDist = Math.min(2, Math.ceil(detectedName.length / 2) - 1);

  let best: { id: string; name: string } | null = null;
  let bestDist = Infinity;

  for (const m of members) {
    if (m.name.toLowerCase() === lower) continue;
    const dist = levenshtein(lower, m.name.toLowerCase());
    if (dist < bestDist && dist <= maxDist) {
      bestDist = dist;
      best = m;
    }
  }

  return best;
}

// ── Component ───────────────────────────────────────────────

interface ParticipantModalProps {
  deathRecordId: string;
  bossName: string;
  deathTime: string;
  onClose: () => void;
  navigate?: (path: string) => void;
  readOnly?: boolean;
  /** Optional: called when user wants to edit death time */
  onEditDeathTime?: () => void;
  /** Optional: called when user wants to change displayed guild */
  onChangeGuild?: () => void;
  /** Optional: called when user wants to delete this death record */
  onDelete?: () => void;
}

export function ParticipantModal({
  deathRecordId,
  bossName,
  deathTime,
  onClose,
  navigate,
  readOnly = false,
  onEditDeathTime,
  onChangeGuild,
  onDelete,
}: ParticipantModalProps) {
  const { data: attendance = [], isLoading } = useAttendance(deathRecordId);
  const { data: members = [] } = useMembers();
  const addAttendance = useAddAttendance();
  const removeAttendance = useRemoveAttendance();
  const queryClient = useQueryClient();

  const [memberSearch, setMemberSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guild data for grouping members
  const [guilds, setGuilds] = useState<Guild[]>([]);
  useEffect(() => { fetchGuilds().then(setGuilds).catch(() => setGuilds([])); }, []);

  // AI rally scan state
  const [rallyImages, setRallyImages] = useState<File[]>([]);
  const [rallyPreviews, setRallyPreviews] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDetectedNames, setAiDetectedNames] = useState<string[] | null>(null);
  const [aiCreating, setAiCreating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Map<string, { id: string; name: string }> | null>(null);
  const [aiExcludedNames, setAiExcludedNames] = useState<Set<string>>(new Set());
  const [aiResolvedMatches, setAiResolvedMatches] = useState<Map<string, string>>(new Map());

  const memberMap = new Map(members.map((m) => [m.id, m.name]));
  const attendedIds = new Set(attendance.map((a) => a.member_id));
  const allFilteredMembers = memberSearch.trim()
    ? members.filter((m) => m.name.toLowerCase().includes(memberSearch.toLowerCase().trim()))
    : members;

  // Group members by guild
  const guildGroups = useMemo(() => {
    const map = new Map<string | null, Member[]>();
    map.set(null, []); // no guild
    for (const g of guilds) map.set(g.id, []);
    for (const m of allFilteredMembers) {
      const key = m.guild_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    // Only return groups that have members
    return [...map.entries()]
      .filter(([, ms]) => ms.length > 0)
      .map(([gid, ms]) => ({
        guildId: gid,
        guildName: gid ? guilds.find(g => g.id === gid)?.name ?? "Unknown" : "No Guild",
        color: gid ? guildColor(guilds.find(g => g.id === gid)?.name ?? "") : { bg: "", text: "", border: "" },
        members: ms,
      }));
  }, [allFilteredMembers, guilds]);

  // Reset guild map when attendees change

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) return;
    const updated = [...rallyImages, ...files];
    setRallyImages(updated);
    setRallyPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    setAiError(null);
    setAiDetectedNames(null);
    setAiSuggestions(null);
    e.target.value = "";
    scanImages(updated);
  };

  const scanImages = async (images: File[]) => {
    if (images.length === 0) return;
    setAiLoading(true);
    setAiError(null);
    setAiExcludedNames(new Set());
    setAiResolvedMatches(new Map());

    try {
      const allNames = new Set<string>();
      for (const img of images) {
        const names = await extractNamesWithAI(img);
        for (const n of names) allNames.add(n);
      }
      const names = [...allNames];

      if (names.length === 0) {
        setAiError("No player names detected in the image.");
        setAiDetectedNames(null);
        return;
      }

      const existingLower = new Map<string, string>();
      for (const m of members) existingLower.set(m.name.toLowerCase(), m.id);

      const alreadyAttendedLower = new Set(
        attendance.map((a) => memberMap.get(a.member_id)?.toLowerCase()).filter(Boolean) as string[]
      );

      const suggestions = new Map<string, { id: string; name: string }>();
      const exclude = new Set<string>();
      const autoAddIds: string[] = [];

      for (const name of names) {
        const lower = name.toLowerCase();
        if (alreadyAttendedLower.has(lower)) {
          exclude.add(name);
          continue;
        }
        const existingId = existingLower.get(lower);
        if (existingId) {
          // Exact match — auto-add
          autoAddIds.push(existingId);
          exclude.add(name);
        } else {
          const close = findClosestMember(name, members);
          if (close) {
            // Fuzzy match — auto-add too
            autoAddIds.push(close.id);
            exclude.add(name);
          }
        }
      }

      // Auto-add all matches immediately
      for (const memberId of autoAddIds) {
        try { await addAttendance.mutateAsync({ deathRecordId, memberId }); } catch {}
      }

      setAiSuggestions(null);
      setAiDetectedNames(names);
      setAiExcludedNames(exclude);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI scan failed");
    } finally {
      setAiLoading(false);
    }
  };

  // ── Clipboard paste support ───────────────────────────────
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const blob = items[i].getAsFile();
        if (blob && blob.type.startsWith("image/")) {
          e.preventDefault();
          const updated = [...rallyImages, blob];
          setRallyImages(updated);
          setRallyPreviews(prev => [...prev, URL.createObjectURL(blob)]);
          setAiError(null);
          setAiDetectedNames(null);
          setAiSuggestions(null);
          scanImages(updated);
          return;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [rallyImages]);

  const handleConfirmAIAdds = async () => {
    if (!aiDetectedNames) return;
    setAiCreating(true);

    const existingLower = new Map<string, string>();
    for (const m of members) existingLower.set(m.name.toLowerCase(), m.id);

    for (const name of aiDetectedNames) {
      if (aiExcludedNames.has(name)) continue;
      const lower = name.toLowerCase();
      let memberId = aiResolvedMatches.get(name) ?? existingLower.get(lower);

      if (memberId && !attendedIds.has(memberId)) {
        try { await addAttendance.mutateAsync({ deathRecordId, memberId }); } catch {}
      } else if (!memberId) {
        const { upsertMember } = await import("@/lib/supabase");
        const member = await upsertMember(name);
        try { await addAttendance.mutateAsync({ deathRecordId, memberId: member.id }); } catch {}
      }
    }

    setAiCreating(false);
    setAiDetectedNames(null);
    setAiSuggestions(null);
    setAiExcludedNames(new Set());
    setAiResolvedMatches(new Map());
    setRallyImages([]);
    setRallyPreviews([]);
    queryClient.invalidateQueries({ queryKey: ["members"] });
  };

  const resolveSuggestion = (detectedName: string, member: { id: string; name: string }) => {
    // Immediately add to participants
    if (!attendedIds.has(member.id)) {
      addAttendance.mutate({ deathRecordId, memberId: member.id });
    }
    setAiResolvedMatches((prev) => new Map(prev).set(detectedName, member.id));
    setAiSuggestions((prev) => {
      if (!prev) return prev;
      const next = new Map(prev);
      next.delete(detectedName);
      return next.size > 0 ? next : null;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white">{bossName}</h3>
            <p className="text-[10px] text-slate-500">{new Date(deathTime).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            {onChangeGuild && (
              <button onClick={onChangeGuild} className="text-xs text-purple-400 hover:text-purple-300 transition px-2 py-1 rounded hover:bg-purple-900/20">
                Change Guild
              </button>
            )}
            {onEditDeathTime && (
              <button onClick={onEditDeathTime} className="text-xs text-blue-400 hover:text-blue-300 transition px-2 py-1 rounded hover:bg-blue-900/20">
                Edit Time
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300 transition px-2 py-1 rounded hover:bg-red-900/20">
                Remove
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Rally Screenshot (AI) */}
              {!readOnly && (
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Rally Screenshot (AI)</p>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" multiple />
                  {rallyPreviews.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2 items-center">
                        {rallyPreviews.map((preview, i) => (
                          <div key={i} className="relative">
                            <img src={preview} alt={`Rally ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-slate-700" />
                            <button onClick={() => { setRallyImages(prev => prev.filter((_, j) => j !== i)); setRallyPreviews(prev => prev.filter((_, j) => j !== i)); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center"><X className="w-2.5 h-2.5" /></button>
                          </div>
                        ))}
                        <button onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-600 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                      </div>
                      {aiLoading && <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-purple-900/30 text-purple-400"><Loader2 className="w-3 h-3 animate-spin" /> Scanning...</span>}
                      {aiError && <p className="text-[10px] text-red-400">{aiError}</p>}
                      {aiDetectedNames && aiDetectedNames.length > 0 && (() => {
                        const existingLower = new Set(members.map((m) => m.name.toLowerCase()));
                        const alreadyAttendedLower = new Set(attendance.map((a) => memberMap.get(a.member_id)?.toLowerCase()).filter(Boolean) as string[]);
                        const autoAddedCount = aiDetectedNames.filter((n) => {
                          const lower = n.toLowerCase();
                          return existingLower.has(lower) || alreadyAttendedLower.has(lower) || aiSuggestions?.has(n);
                        }).length;
                        const newNames = aiDetectedNames.filter((n) => !existingLower.has(n.toLowerCase()) && !aiSuggestions?.has(n) && !alreadyAttendedLower.has(n.toLowerCase()));
                        return (
                          <div className="space-y-2 p-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-violet-400" />
                              <span className="text-[10px] font-medium text-violet-300">
                                {autoAddedCount} of {aiDetectedNames.length} name{aiDetectedNames.length !== 1 ? "s" : ""} auto-added
                                {newNames.length > 0 && <span className="text-amber-400"> · {newNames.length} new</span>}
                              </span>
                            </div>
                            {newNames.length > 0 && <NameGroup label={`New Players — add manually (${newNames.length})`} color="amber">{newNames.map((name) => <span key={name} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-900/20 text-amber-400 border border-amber-800/50"><Plus className="w-2.5 h-2.5" />{name}</span>)}</NameGroup>}
                            {newNames.length > 0 && <button onClick={handleConfirmAIAdds} disabled={aiCreating} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium bg-violet-600 text-white hover:bg-violet-500 transition disabled:opacity-50">{aiCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}Create {newNames.length} New Player{newNames.length !== 1 ? "s" : ""}</button>}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600 transition text-xs"><ImagePlus className="w-3.5 h-3.5" />Upload rally screenshot for AI scan</button>
                  )}
                </div>
              )}

              {/* All Members — check = attending, uncheck = not */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Participants ({attendance.length})</p>
                </div>
                <input type="text" placeholder="Search members…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition mb-2" />
                <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/50 p-2 space-y-2">
                  {guildGroups.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-3">No members found.</p>
                  ) : (
                    guildGroups.map((group) => (
                      <div key={group.guildId ?? "noguild"}>
                        {/* Guild header */}
                        {group.guildId && (
                          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium mb-1 ${group.color.bg} ${group.color.text} ${group.color.border} border w-fit`}>
                            <Shield className="w-2.5 h-2.5" />
                            {group.guildName}
                          </div>
                        )}
                        {!group.guildId && guilds.length > 0 && (
                          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1 px-1">No Guild</p>
                        )}
                        {/* Member chips */}
                        <div className="flex flex-wrap gap-1">
                        {group.members.map((m) => {
                          const isAttending = attendedIds.has(m.id);
                          return (
                            <label key={m.id} title={readOnly ? "Only moderators can update participants" : undefined} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded transition text-sm ${readOnly ? "cursor-default" : "cursor-pointer"} ${isAttending ? "bg-emerald-600/20 text-emerald-300 border border-emerald-800" : "text-slate-400 hover:bg-slate-700/50 border border-transparent"}`}>
                              <input type="checkbox" checked={isAttending} disabled={readOnly} title={readOnly ? "Only moderators can update participants" : undefined} onChange={() => {
                                if (readOnly) return;
                                if (isAttending) { const att = attendance.find(a => a.member_id === m.id); if (att) removeAttendance.mutate({ attendanceId: att.id, deathRecordId }); }
                                else { addAttendance.mutate({ deathRecordId, memberId: m.id }); }
                              }} className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer" />
                              <span className="truncate">{m.name}</span>
                            </label>
                          );
                        })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function NameGroup({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  const c: Record<string, string> = { emerald: "text-emerald-400/80", blue: "text-blue-400/80", amber: "text-amber-400/80", slate: "text-slate-400" };
  return (
    <div>
      <p className={`text-[10px] font-medium uppercase tracking-wider mb-1 ${c[color] ?? "text-slate-400"}`}>{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}
