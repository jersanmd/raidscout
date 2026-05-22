import { useState, useRef, useEffect } from "react";
import { useAttendance, useAddAttendance, useRemoveAttendance } from "@/hooks/useAttendance";
import { useMembers } from "@/hooks/useMembers";
import { useServerId } from "@/contexts/ServerContext";
import { extractNamesWithAI } from "@/lib/vision";
import { Loader2, X, Users, Plus, MinusCircle, Check, Pencil, Sparkles, ImagePlus } from "lucide-react";

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
}

export function ParticipantModal({
  deathRecordId,
  bossName,
  deathTime,
  onClose,
  navigate,
  readOnly = false,
}: ParticipantModalProps) {
  const { data: attendance = [], isLoading } = useAttendance(deathRecordId);
  const { data: members = [] } = useMembers();
  const serverId = useServerId();
  const addAttendance = useAddAttendance();
  const removeAttendance = useRemoveAttendance();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI rally scan state
  const [rallyImages, setRallyImages] = useState<File[]>([]);
  const [rallyPreviews, setRallyPreviews] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDetectedNames, setAiDetectedNames] = useState<string[] | null>(null);
  const [aiScanned, setAiScanned] = useState(false);
  const [aiCreating, setAiCreating] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Map<string, { id: string; name: string }> | null>(null);
  const [aiExcludedNames, setAiExcludedNames] = useState<Set<string>>(new Set());
  const [aiResolvedMatches, setAiResolvedMatches] = useState<Map<string, string>>(new Map());
  const [aiEditingIndex, setAiEditingIndex] = useState<number | null>(null);
  const [aiEditValue, setAiEditValue] = useState("");

  const memberMap = new Map(members.map((m) => [m.id, m.name]));
  const attendedIds = new Set(attendance.map((a) => a.member_id));
  const availableMembers = members.filter((m) => !attendedIds.has(m.id));
  const searchLower = memberSearch.toLowerCase().trim();
  const filteredMembers = searchLower
    ? availableMembers.filter((m) => m.name.toLowerCase().includes(searchLower))
    : availableMembers;

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (selectedMembers.size === 0) return;
    const toAdd = [...selectedMembers];
    setSelectedMembers(new Set());
    for (const memberId of toAdd) {
      if (attendedIds.has(memberId)) continue;
      try {
        await addAttendance.mutateAsync({ deathRecordId, memberId });
      } catch { /* handled by mutation */ }
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) return;
    const updated = [...rallyImages, ...files];
    setRallyImages(updated);
    setRallyPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    setAiScanned(false);
    setAiError(null);
    setAiDetectedNames(null);
    setAiSuggestions(null);
    e.target.value = "";
    // Auto-trigger AI scan
    scanImages(updated);
  };

  const scanImages = async (images: File[]) => {
    if (images.length === 0) return;
    setAiLoading(true);
    setAiError(null);
    setAiExcludedNames(new Set());
    setAiResolvedMatches(new Map());
    setAiEditingIndex(null);
    setAiEditValue("");

    try {
      const allNames = new Set<string>();
      for (const img of images) {
        const names = await extractNamesWithAI(img);
        for (const n of names) allNames.add(n);
      }
      const names = [...allNames];
      setAiScanned(true);

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

      for (const name of names) {
        const lower = name.toLowerCase();
        if (alreadyAttendedLower.has(lower)) {
          exclude.add(name);
          continue;
        }
        const existingId = existingLower.get(lower);
        if (!existingId) {
          const close = findClosestMember(name, members);
          if (close) suggestions.set(name, close);
        }
      }

      setAiSuggestions(suggestions);
      setAiDetectedNames(names);
      setAiExcludedNames(exclude);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI scan failed");
    } finally {
      setAiLoading(false);
    }
  };

  // ── Clipboard paste support for rally images ──────────────
  useEffect(() => {
    if (!showAdd) return;

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
          setAiScanned(false);
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
  }, [showAdd, rallyImages]);

  const handleConfirmAIAdds = async () => {
    if (!aiDetectedNames) return;
    setAiCreating(true);

    const existingLower = new Map<string, string>();
    for (const m of members) existingLower.set(m.name.toLowerCase(), m.id);

    for (const name of aiDetectedNames) {
      if (aiExcludedNames.has(name)) continue;

      const lower = name.toLowerCase();
      let memberId: string | undefined;

      const resolvedId = aiResolvedMatches.get(name);
      if (resolvedId) {
        memberId = resolvedId;
      } else {
        memberId = existingLower.get(lower);
      }

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
    setAiEditingIndex(null);
    setAiEditValue("");
    setRallyImages([]);
    setRallyPreviews([]);
    setAiScanned(false);
  };

  const resolveSuggestion = (detectedName: string, member: { id: string; name: string }) => {
    setAiResolvedMatches((prev) => new Map(prev).set(detectedName, member.id));
    setAiSuggestions((prev) => {
      if (!prev) return prev;
      const next = new Map(prev);
      next.delete(detectedName);
      return next.size > 0 ? next : null;
    });
  };

  const toggleExcludeName = (name: string) => {
    setAiExcludedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const startEditName = (index: number, currentName: string) => {
    setAiEditingIndex(index);
    setAiEditValue(currentName);
  };

  const saveEditName = (index: number) => {
    const trimmed = aiEditValue.trim();
    if (trimmed && aiDetectedNames) {
      const updated = [...aiDetectedNames];
      updated[index] = trimmed;
      setAiDetectedNames(updated);
    }
    setAiEditingIndex(null);
    setAiEditValue("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative bg-slate-900 border border-slate-700 rounded-xl w-full shadow-2xl max-h-[80vh] flex flex-col transition-all duration-300 ${showAdd ? "max-w-lg" : "max-w-sm"}`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-white">{bossName}</h3>
            <p className="text-[10px] text-slate-500">
              {new Date(deathTime).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
            </div>
          ) : (
            <div className={showAdd ? "grid grid-cols-2 gap-4" : ""}>
              {/* Left: Participants list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    Participants ({attendance.length})
                  </p>
                  {!showAdd && !readOnly && (
                    <button
                      onClick={() => setShowAdd(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 hover:text-emerald-300 rounded-lg transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  )}
                </div>

                {attendance.length === 0 && !showAdd ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No participants recorded for this kill.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {attendance.map((a) => {
                      const name = memberMap.get(a.member_id) ?? "Unknown";
                      return (
                        <div
                          key={a.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 group"
                        >
                          <button
                            onClick={() => navigate?.(`/leaderboard?member=${encodeURIComponent(name)}`)}
                            className="flex items-center gap-2 flex-1 text-left min-w-0"
                          >
                            <Users className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="text-sm text-slate-200 truncate">{name}</span>
                          </button>
                          {!readOnly && (
                          <button
                            onClick={() => removeAttendance.mutate({ attendanceId: a.id, deathRecordId })}
                            disabled={removeAttendance.isPending}
                            className="text-slate-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100 shrink-0"
                            title="Remove participant"
                          >
                            {removeAttendance.isPending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <MinusCircle className="w-3.5 h-3.5" />
                            )}
                          </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right: Add Participant panel */}
              {showAdd && (
                <div className="space-y-3">
                  {/* Rally Screenshot Upload */}
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Rally Screenshot (AI)</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    {rallyPreviews.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2 items-center">
                          {rallyPreviews.map((preview, i) => (
                            <div key={i} className="relative">
                              <img src={preview} alt={`Rally ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-slate-700" />
                              <button
                                onClick={() => {
                                  setRallyImages(prev => prev.filter((_, j) => j !== i));
                                  setRallyPreviews(prev => prev.filter((_, j) => j !== i));
                                }}
                                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-600 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition flex items-center justify-center"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          {aiLoading && (
                            <span className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-purple-900/30 text-purple-400">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Scanning...
                            </span>
                          )}
                          {aiScanned && !aiError && !aiLoading && (
                            <span className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-900/20 text-emerald-400">
                              <Sparkles className="w-3 h-3" />
                              Scanned ✓
                            </span>
                          )}
                          <button
                            onClick={() => { setRallyImages([]); setRallyPreviews([]); setAiScanned(false); setAiDetectedNames(null); setAiEditingIndex(null); setAiEditValue(""); }}
                            className="px-3 py-2 text-xs text-slate-400 hover:text-white transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed border-slate-700 text-slate-400 hover:text-slate-300 hover:border-slate-600 transition"
                      >
                        <ImagePlus className="w-4 h-4" />
                        <span className="text-xs">Upload rally screenshot</span>
                      </button>
                    )}

                    {aiError && (
                      <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                        <X className="w-3 h-3" /> {aiError}
                      </p>
                    )}

                    {/* AI Detected Names */}
                    {aiDetectedNames && aiDetectedNames.length > 0 && (() => {
                      const existingLower = new Set(members.map((m) => m.name.toLowerCase()));
                      const alreadyAttendedLower = new Set(
                        attendance.map((a) => memberMap.get(a.member_id)?.toLowerCase()).filter(Boolean) as string[]
                      );
                      const suggestionNames = new Set(aiSuggestions?.keys() ?? []);
                      const resolvedNames = new Set(aiResolvedMatches.keys());

                      const alreadyPresentNames = aiDetectedNames.filter((n) => alreadyAttendedLower.has(n.toLowerCase()));
                      const exactNames = aiDetectedNames.filter((n) =>
                        existingLower.has(n.toLowerCase()) && !alreadyAttendedLower.has(n.toLowerCase()) && !suggestionNames.has(n) && !resolvedNames.has(n)
                      );
                      const resolvedExactNames = aiDetectedNames.filter((n) =>
                        resolvedNames.has(n) && !alreadyAttendedLower.has(n.toLowerCase())
                      );
                      const fuzzyNames = aiDetectedNames.filter((n) =>
                        !existingLower.has(n.toLowerCase()) && suggestionNames.has(n) && !resolvedNames.has(n)
                      );
                      const newNames = aiDetectedNames.filter((n) =>
                        !existingLower.has(n.toLowerCase()) && !suggestionNames.has(n) && !resolvedNames.has(n)
                      );

                      const selectedCount = aiDetectedNames.filter((n) => !aiExcludedNames.has(n)).length;

                      return (
                        <div className="mt-2 space-y-3">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                            <span className="text-[11px] font-medium text-violet-300">
                              AI detected {aiDetectedNames.length} name{aiDetectedNames.length !== 1 ? "s" : ""}
                            </span>
                          </div>

                          {/* Already Present */}
                          {alreadyPresentNames.length > 0 && (
                            <div>
                              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                                Already Present ({alreadyPresentNames.length})
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {alreadyPresentNames.map((name) => (
                                  <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-800/50 text-slate-500 border border-slate-700/50">
                                    <Check className="w-3 h-3" />{name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Will Add */}
                          {exactNames.length > 0 && (
                            <NameGroup label={`✓ Will Add (${exactNames.length})`} color="emerald">
                              {exactNames.map((name) => {
                                const idx = aiDetectedNames.indexOf(name);
                                const isEditing = aiEditingIndex === idx;
                                const isExcluded = aiExcludedNames.has(name);
                                if (isEditing) return <EditInput key={name} value={aiEditValue} onChange={setAiEditValue} onSave={() => saveEditName(idx)} onCancel={() => { setAiEditingIndex(null); setAiEditValue(""); }} color="emerald" />;
                                return (
                                  <button key={name} onClick={() => toggleExcludeName(name)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition group cursor-pointer ${isExcluded ? "bg-slate-800/30 text-slate-500 border-slate-700/50 line-through" : "bg-emerald-900/30 text-emerald-400 border-emerald-800/50 hover:border-emerald-700"}`}>
                                    <Check className="w-3 h-3" />{name}
                                    <span onClick={(e) => { e.stopPropagation(); startEditName(idx, name); }} className="opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-white"><Pencil className="w-2.5 h-2.5" /></span>
                                  </button>
                                );
                              })}
                            </NameGroup>
                          )}

                          {/* Resolved */}
                          {resolvedExactNames.length > 0 && (
                            <NameGroup label={`✓ Resolved (${resolvedExactNames.length})`} color="emerald">
                              {resolvedExactNames.map((name) => {
                                const resolvedMember = members.find((m) => m.id === aiResolvedMatches.get(name));
                                const idx = aiDetectedNames.indexOf(name);
                                if (aiEditingIndex === idx) return <EditInput key={name} value={aiEditValue} onChange={setAiEditValue} onSave={() => saveEditName(idx)} onCancel={() => { setAiEditingIndex(null); setAiEditValue(""); }} color="emerald" />;
                                return (
                                  <span key={name} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 group">
                                    <Check className="w-3 h-3" /><span className="text-slate-500 line-through">{name}</span><span className="text-slate-500">→</span><span className="text-emerald-300">{resolvedMember?.name ?? "?"}</span>
                                  </span>
                                );
                              })}
                            </NameGroup>
                          )}

                          {/* Fuzzy */}
                          {fuzzyNames.length > 0 && (
                            <NameGroup label={`≈ Possible Matches (${fuzzyNames.length})`} color="blue">
                              {fuzzyNames.map((name) => {
                                const suggestion = aiSuggestions?.get(name);
                                const isExcluded = aiExcludedNames.has(name);
                                return (
                                  <span key={name} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border group ${isExcluded ? "bg-slate-800/30 text-slate-500 border-slate-700/50" : "bg-blue-900/20 text-blue-300 border-blue-800/50"}`}>
                                    <button onClick={() => toggleExcludeName(name)}>{isExcluded ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}</button>
                                    <span className="text-slate-500 line-through">{name}</span><span className="text-slate-500">→</span>
                                    {suggestion && <button onClick={() => resolveSuggestion(name, suggestion)} className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300"><Check className="w-2.5 h-2.5" />{suggestion.name}</button>}
                                  </span>
                                );
                              })}
                            </NameGroup>
                          )}

                          {/* New */}
                          {newNames.length > 0 && (
                            <NameGroup label={`✦ New Players (${newNames.length})`} color="amber">
                              {newNames.map((name) => {
                                const idx = aiDetectedNames.indexOf(name);
                                const isExcluded = aiExcludedNames.has(name);
                                if (aiEditingIndex === idx) return <EditInput key={name} value={aiEditValue} onChange={setAiEditValue} onSave={() => saveEditName(idx)} onCancel={() => { setAiEditingIndex(null); setAiEditValue(""); }} color="amber" />;
                                return (
                                  <button key={name} onClick={() => toggleExcludeName(name)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition group cursor-pointer ${isExcluded ? "bg-slate-800/30 text-slate-500 border-slate-700/50 line-through" : "bg-slate-800 text-amber-400 border-slate-700 hover:border-amber-700"}`}>
                                    <Users className="w-3 h-3" />{name}
                                    <span onClick={(e) => { e.stopPropagation(); startEditName(idx, name); }} className="opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-white"><Pencil className="w-2.5 h-2.5" /></span>
                                  </button>
                                );
                              })}
                            </NameGroup>
                          )}

                          {selectedCount > 0 && (
                            <button onClick={handleConfirmAIAdds} disabled={aiCreating}
                              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition disabled:opacity-50">
                              {aiCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                              Add {selectedCount} Participant{selectedCount !== 1 ? "s" : ""}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Manual Add */}
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Or add manually</p>
                    {availableMembers.length === 0 ? (
                      <p className="text-xs text-slate-500">All members are already participants.</p>
                    ) : (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          placeholder="Search members…"
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
                        />
                        <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-lg border border-slate-700 bg-slate-800/50 p-1">
                          {filteredMembers.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-3">No members found.</p>
                          ) : (
                            filteredMembers.map((m) => {
                              const checked = selectedMembers.has(m.id);
                              return (
                                <label
                                  key={m.id}
                                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition text-xs ${checked ? "bg-emerald-600/20 text-emerald-300" : "text-slate-300 hover:bg-slate-700/50"}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleMember(m.id)}
                                    className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                                  />
                                  <Users className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{m.name}</span>
                                </label>
                              );
                            })
                          )}
                        </div>
                        <button
                          onClick={handleAddSelected}
                          disabled={selectedMembers.size === 0 || addAttendance.isPending}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition disabled:opacity-50"
                        >
                          {addAttendance.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Plus className="w-3 h-3" />
                          )}
                          Add Selected{selectedMembers.size > 0 ? ` (${selectedMembers.size})` : ""}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tiny sub-components ─────────────────────────────────────

function NameGroup({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = { emerald: "text-emerald-400/80", blue: "text-blue-400/80", amber: "text-amber-400/80" };
  return (
    <div>
      <p className={`text-[10px] font-medium uppercase tracking-wider mb-1.5 ${colorMap[color] ?? "text-slate-400"}`}>{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function EditInput({ value, onChange, onSave, onCancel, color }: { value: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void; color: string }) {
  const borderMap: Record<string, string> = { emerald: "border-emerald-500 focus:ring-emerald-500", blue: "border-blue-500 focus:ring-blue-500", amber: "border-amber-500 focus:ring-amber-500" };
  return (
    <span className="inline-flex items-center gap-1">
      <input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onSave}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
        className={`w-24 px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-white border focus:outline-none focus:ring-1 ${borderMap[color] ?? ""}`}
        autoFocus />
    </span>
  );
}
