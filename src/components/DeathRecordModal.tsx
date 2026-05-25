import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Zap, X, Upload, Check, Plus, Search, Users, ClipboardPaste, Sparkles, Loader2, Pencil, ImagePlus } from "lucide-react";
import { useMembers } from "@/hooks/useMembers";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import { extractNamesWithAI } from "@/lib/vision";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Boss, Member } from "@/types";

interface DeathRecordModalProps {
  boss: Boss;
  onClose: () => void;
  onSubmit: (deathTime: Date, rallyImages: File[], attendeeIds: string[]) => void;
  /** Pre-set death time (e.g., schedule spawn time). Skips the time-selection step entirely. */
  defaultDeathTime?: Date;
  /** Hide the "Custom Time" tab — only allow the pre-set or "now" time */
  hideCustomTime?: boolean;
}

export function DeathRecordModal({ boss, onClose, onSubmit, defaultDeathTime, hideCustomTime }: DeathRecordModalProps) {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  // Step tracking
  const [step, setStep] = useState<"death" | "attendance">(() =>
    defaultDeathTime ? "attendance" : "death"
  );
  const [deathTime, setDeathTime] = useState<Date | null>(defaultDeathTime ?? null);

  // Death time state
  const now = new Date();
  const todayStr = (() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();
  const [customDate, setCustomDate] = useState(todayStr);
  const [customTime, setCustomTime] = useState(() => {
    const h = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${h}:${min}:${s}`;
  });
  const [mode, setMode] = useState<"now" | "custom">("now");

  // Attendance state
  const { data: members = [] } = useMembers();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rallyImages, setRallyImages] = useState<File[]>([]);
  const [rallyPreviews, setRallyPreviews] = useState<string[]>([]);
  const rallyPreviewsRef = useRef<string[]>([]);
  // Keep ref in sync so cleanup on unmount has access to the latest previews
  useEffect(() => { rallyPreviewsRef.current = rallyPreviews; }, [rallyPreviews]);
  // Revoke all object URLs on unmount to prevent memory leaks
  useEffect(() => () => { rallyPreviewsRef.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const [fullscreenPreviewIndex, setFullscreenPreviewIndex] = useState<number | null>(null);
  const [newMemberName, setNewMemberName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste names state
  const [pasteText, setPasteText] = useState("");
  const [pasteMode, setPasteMode] = useState(false);

  // AI scan state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiScanned, setAiScanned] = useState(false);
  const [aiDetectedNames, setAiDetectedNames] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Three-way categorization of AI results
  const [exactMatchNames, setExactMatchNames] = useState<string[]>([]);
  // Fuzzy match: detected name → suggested existing member
  const [fuzzyMatchNames, setFuzzyMatchNames] = useState<Map<string, { id: string; name: string }>>(new Map());
  // Names with no match at all
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);
  // Pending members (not yet in DB) added to checklist from unmatched names
  const [pendingMembers, setPendingMembers] = useState<{ tempId: string; name: string }[]>([]);
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());

  // Inline edit state for AI-detected names
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  // Inline edit for unmatched names
  const [editingUnmatched, setEditingUnmatched] = useState<string | null>(null);
  const [editUnmatchedValue, setEditUnmatchedValue] = useState("");
  const editUnmatchedRef = useRef<HTMLInputElement>(null);

  // ── Step 1: Confirm Death ──────────────────────────────────

  const goToAttendance = (dt: Date) => {
    setDeathTime(dt);
    setStep("attendance");
  };

  const handleDiedNow = () => goToAttendance(defaultDeathTime ?? new Date());

  const displayTime = defaultDeathTime ?? now;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDate || !customTime) return;

    // Parse date parts explicitly — avoids browser timezone ambiguity
    const [y, m, d] = customDate.split("-").map(Number);
    const [h, min, s = 0] = customTime.split(":").map(Number);
    const dt = new Date(y, m - 1, d, h, min, s);

    if (!isNaN(dt.getTime())) {
      goToAttendance(dt);
    }
  };

  // ── Step 2: Attendance ─────────────────────────────────────

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddNewMember = async () => {
    const name = newMemberName.trim();
    if (!name) return;

    const { upsertMember } = await import("@/lib/supabase");
    const member = await upsertMember(name);
    setSelectedIds((prev) => new Set(prev).add(member.id));
    setNewMemberName("");
    queryClient.invalidateQueries({ queryKey: ["members"] });
  };

  const handleNewMemberKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddNewMember();
    }
  };

  /** Add files to the rally images array (supports multiple) — auto-triggers AI scan */
  const addRallyFiles = useCallback((files: FileList | File[]) => {
    const newFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (newFiles.length === 0) return;
    const updated = [...rallyImages, ...newFiles];
    setRallyImages(updated);
    setRallyPreviews((prev) => [...prev, ...newFiles.map((f) => URL.createObjectURL(f))]);
    setAiScanned(false);
    setAiError(null);
    setAiDetectedNames(null);
    setExactMatchNames([]);
    setFuzzyMatchNames(new Map());
    setUnmatchedNames([]);
    setPendingMembers([]);
    setSelectedPendingIds(new Set());
    // Auto-trigger AI scan with the updated image list
    scanImages(updated);
  }, [rallyImages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addRallyFiles(e.target.files);
      // Reset input so the same file(s) can be re-selected
      e.target.value = "";
    }
  };

  const removeRallyImage = (index: number) => {
    setRallyImages((prev) => prev.filter((_, i) => i !== index));
    setRallyPreviews((prev) => {
      const old = prev[index];
      if (old) URL.revokeObjectURL(old);
      return prev.filter((_, i) => i !== index);
    });
    if (fullscreenPreviewIndex === index) setFullscreenPreviewIndex(null);
  };

  // ── Paste image from clipboard ─────────────────────────────
  useEffect(() => {
    if (step !== "attendance") return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const blob = items[i].getAsFile();
        if (blob && blob.type.startsWith("image/")) {
          files.push(blob);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addRallyFiles(files);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [step, addRallyFiles]);

  /** Scan images with AI for name extraction */
  const scanImages = async (images: File[]) => {
    if (images.length === 0) return;
    setAiLoading(true);
    setAiError(null);
    setAiDetectedNames(null);
    setExactMatchNames([]);
    setFuzzyMatchNames(new Map());
    setUnmatchedNames([]);
    setPendingMembers([]);
    setSelectedPendingIds(new Set());

    try {
      const allNames = new Set<string>();
      for (const img of images) {
        const names = await extractNamesWithAI(img);
        for (const n of names) allNames.add(n);
      }
      const names = [...allNames];
      setAiScanned(true);
      setAiDetectedNames(names);

      if (names.length === 0) {
        setAiError("No player names detected in the image. Try pasting names instead.");
        return;
      }

      const existingLower = new Map<string, string>();
      for (const m of members) {
        existingLower.set(m.name.toLowerCase(), m.id);
      }

      const exactIds: string[] = [];
      const exactNames: string[] = [];
      const fuzzyIds: string[] = [];
      const fuzzyMap = new Map<string, { id: string; name: string }>();
      const unmatched: string[] = [];

      for (const name of names) {
        const lower = name.toLowerCase();
        const existingId = existingLower.get(lower);

        if (existingId) {
          exactIds.push(existingId);
          exactNames.push(name);
        } else {
          const close = findClosestMember(name, members);
          if (close) {
            fuzzyIds.push(close.id);
            fuzzyMap.set(name, close);
          } else {
            unmatched.push(name);
          }
        }
      }

      setExactMatchNames(exactNames);
      setFuzzyMatchNames(fuzzyMap);
      setUnmatchedNames(unmatched);

      // Auto-select both exact and fuzzy matches in the checklist
      const autoSelectIds = [...exactIds, ...fuzzyIds];
      if (autoSelectIds.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          autoSelectIds.forEach((id) => next.add(id));
          return next;
        });
      }
    } catch (err) {
      console.error("AI scan failed:", err);
      setAiError(
        err instanceof Error ? err.message : "AI scan failed. Check your API key or try pasting names."
      );
    } finally {
      setAiLoading(false);
    }
  };

  /** Add a single unmatched name to the pending checklist (no DB write) */
  const addUnmatchedToChecklist = (name: string) => {
    const tempId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setPendingMembers(prev => [...prev, { tempId, name }]);
    setSelectedPendingIds(prev => new Set(prev).add(tempId));
    // Remove from unmatched list
    setUnmatchedNames(prev => prev.filter(n => n !== name));
  };

  /** Resolve a fuzzy suggestion: use the existing member instead of the detected name */
  const resolveSuggestion = (detectedName: string, member: { id: string; name: string }) => {
    // The member is already auto-selected, just update the displayed name
    setAiDetectedNames((prev) => {
      if (!prev) return prev;
      const idx = prev.indexOf(detectedName);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = member.name;
      return updated;
    });
    // Remove from fuzzy match map
    setFuzzyMatchNames((prev) => {
      const next = new Map(prev);
      next.delete(detectedName);
      return next;
    });
  };

  /** Mark a detected name as absent — remove from list and deselect if selected */
  const removeDetectedName = (name: string) => {
    setAiDetectedNames((prev) => prev?.filter((n) => n !== name) ?? null);
    // If there was an existing member with this name, deselect them
    const member = members.find((m) => m.name.toLowerCase() === name.toLowerCase());
    if (member) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(member.id);
        return next;
      });
    }
  };

  // ── Inline editing for AI-detected names ───────────────────

  const startEditing = (index: number) => {
    if (!aiDetectedNames) return;
    setEditingIndex(index);
    setEditValue(aiDetectedNames[index]);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const saveEdit = () => {
    if (editingIndex === null || !aiDetectedNames) return;
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== aiDetectedNames[editingIndex]) {
      const updated = [...aiDetectedNames];
      updated[editingIndex] = trimmed;
      setAiDetectedNames(updated);
    }
    setEditingIndex(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue("");
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  // Inline edit for unmatched names
  const startEditUnmatched = (name: string) => {
    setEditingUnmatched(name);
    setEditUnmatchedValue(name);
    setTimeout(() => editUnmatchedRef.current?.focus(), 0);
  };

  const saveEditUnmatched = () => {
    const trimmed = editUnmatchedValue.trim();
    if (trimmed && editingUnmatched && trimmed !== editingUnmatched) {
      setUnmatchedNames(prev => prev.map(n => n === editingUnmatched ? trimmed : n));
    }
    setEditingUnmatched(null);
    setEditUnmatchedValue("");
  };

  const cancelEditUnmatched = () => {
    setEditingUnmatched(null);
    setEditUnmatchedValue("");
  };

  const handleEditUnmatchedKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEditUnmatched();
    } else if (e.key === "Escape") {
      cancelEditUnmatched();
    }
  };

  /**
   * Parse pasted text into individual player names.
   * Handles:
   *   - One name per line
   *   - Comma-separated: "DonAlas, xSupladoo, Demonyita"
   *   - Space-separated rows: "DonAlas xSupladoo Demonyita"
   *   - Mixed: "DonAlas, xSupladoo\nDemonyita E66no99s"
   */
  const parsePastedNames = (text: string): string[] => {
    // Split by newlines first, then by commas, then by 2+ spaces
    const lines = text.split(/[\n\r]+/);

    const rawNames: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try comma-separated first
      if (trimmed.includes(",")) {
        rawNames.push(...trimmed.split(",").map((s) => s.trim()).filter(Boolean));
      } else {
        // Split by 2+ spaces (preserves names with single spaces)
        const spaceSplit = trimmed.split(/\s{2,}/);
        // If no double spaces, split by single spaces — but only if result looks like names
        if (spaceSplit.length === 1) {
          const singleSplit = trimmed.split(/\s+/);
          // Heuristic: if tokens are mostly single words (no spaces within), treat as names
          rawNames.push(...singleSplit.filter(Boolean));
        } else {
          rawNames.push(...spaceSplit.filter(Boolean));
        }
      }
    }

    // Deduplicate & clean
    const seen = new Set<string>();
    const names: string[] = [];
    for (const raw of rawNames) {
      const cleaned = raw.replace(/^[@#*•\-–—\s]+|[@#*•\-–—\s]+$/g, "").trim();
      if (cleaned.length < 2) continue;
      if (/^\d+$/.test(cleaned)) continue; // purely numeric
      const lower = cleaned.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        names.push(cleaned);
      }
    }
    return names;
  };

  /**
   * Process pasted names: create missing members and auto-select all.
   */
  const handleProcessPastedNames = () => {
    const parsedNames = parsePastedNames(pasteText);
    if (parsedNames.length === 0) return;

    const existingLower = new Map<string, string>();
    for (const m of members) {
      existingLower.set(m.name.toLowerCase(), m.id);
    }

    const matchedIds: string[] = [];

    for (const name of parsedNames) {
      const existingId = existingLower.get(name.toLowerCase());
      if (existingId) {
        matchedIds.push(existingId);
      } else {
        // Add as pending — no DB write
        const tempId = `paste_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        setPendingMembers(prev => [...prev, { tempId, name }]);
        setSelectedPendingIds(prev => new Set(prev).add(tempId));
      }
    }

    if (matchedIds.length > 0) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        matchedIds.forEach((id) => next.add(id));
        return next;
      });
    }

    setPasteText("");
    setPasteMode(false);
  };

  const handleFinalSubmit = async () => {
    if (!deathTime || submitting) return;
    setSubmitting(true);

    const finalIds = [...selectedIds];

    // Create pending members (from unmatched AI names) before submitting
    if (pendingMembers.length > 0) {
      const { upsertMember } = await import("@/lib/supabase");
      for (const pm of pendingMembers) {
        if (selectedPendingIds.has(pm.tempId)) {
          try {
            const member = await upsertMember(pm.name);
            finalIds.push(member.id);
          } catch { /* skip failed creates */ }
        }
      }
    }

    onSubmit(deathTime, rallyImages, finalIds);
  };

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const exactMatch = members.some(
    (m) => m.name.toLowerCase() === newMemberName.trim().toLowerCase()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">
              {step === "death"
                ? <>Record Death: <span className="text-red-400">{boss.name}</span></>
                : <>Attendance: <span className="text-red-400">{boss.name}</span>{" · "}
                  {deathTime && <span className="text-slate-400 text-sm font-normal">{deathTime.toLocaleString()}</span>}
                  <button
                    onClick={() => setDeathTime(new Date())}
                    className="ml-3 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition"
                    title="Overwrite the death time with the current date and time"
                  >
                    Use current time
                  </button></>
              }
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {step === "death" ? (
            <>
              {!hideCustomTime && (
              <div className="flex bg-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setMode("now")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition ${
                    mode === "now" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  Died Now
                </button>
                <button
                  onClick={() => setMode("custom")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition ${
                    mode === "custom" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  Custom Time
                </button>
              </div>
              )}

              {mode === "now" || hideCustomTime ? (
                <div className="text-center">
                  <p className="text-slate-400 text-sm mb-2">
                    {defaultDeathTime
                      ? "Scheduled spawn time will be recorded as the death time:"
                      : "Current time will be recorded as the death time:"}
                  </p>
                  <p className="text-white font-mono text-lg">
                    {displayTime.toLocaleString()}
                  </p>
                  {boss.respawn_hours && (
                    <p className="text-slate-500 text-sm mt-2">
                      Next spawn: +{boss.respawn_hours}h →{" "}
                      {new Date(displayTime.getTime() + boss.respawn_hours * 3600_000).toLocaleString()}
                    </p>
                  )}
                  <button
                    onClick={handleDiedNow}
                    className="mt-4 w-full py-2.5 rounded-lg font-medium bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-500 hover:to-orange-400 transition"
                  >
                    Confirm Death & Add Attendance
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCustomSubmit} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      required
                      max={todayStr}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Time
                    </label>
                    <input
                      type="time"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      required
                      step="1"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg font-medium bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-500 hover:to-orange-400 transition"
                  >
                    Confirm Death & Add Attendance
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              {/* Rally image upload (multiple + paste from clipboard) */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Rally Screenshots (optional — paste or upload)
                </label>

                {/* Image previews grid */}
                {rallyPreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {rallyPreviews.map((preview, i) => (
                      <div key={preview} className="relative group">
                        <img
                          src={preview}
                          alt={`Rally screenshot ${i + 1}`}
                          className="w-16 h-16 object-cover rounded-lg border border-slate-700 cursor-pointer hover:border-slate-500 transition"
                          onClick={() => setFullscreenPreviewIndex(i)}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); removeRallyImage(i); }}
                          className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {/* Add more button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-16 h-16 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-300 transition"
                      title="Add more screenshots"
                    >
                      <ImagePlus className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {/* Empty state: upload button */}
                {rallyPreviews.length === 0 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 rounded-lg border-2 border-dashed border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300 transition flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span className="text-sm">Upload screenshots or paste (Ctrl+V)</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />

                {rallyPreviews.length > 0 && (
                  <p className="text-[10px] text-slate-600 mt-1">
                    {rallyPreviews.length} image{rallyPreviews.length !== 1 ? "s" : ""} · Click to enlarge · Paste more with Ctrl+V
                  </p>
                )}
              </div>

              {/* Paste names — 100% accurate alternative to OCR */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-300">
                    Add Attendees
                  </label>
                  <div className="flex items-center gap-2">
                    {/* AI Scan button — only when images are uploaded */}
                    {rallyPreviews.length > 0 && aiLoading && (
                      <span className="flex items-center gap-1 text-xs text-violet-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Scanning...
                      </span>
                    )}
                    {rallyPreviews.length > 0 && aiScanned && !aiError && !aiLoading && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <Sparkles className="w-3.5 h-3.5" />
                        Scanned ✓
                      </span>
                    )}
                    {!isViewer && (
                    <button
                      onClick={() => setPasteMode(!pasteMode)}
                      className={`flex items-center gap-1 text-xs transition ${
                        pasteMode ? "text-amber-400" : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      <ClipboardPaste className="w-3.5 h-3.5" />
                      Paste names
                    </button>
                    )}
                  </div>
                </div>

                {/* AI scan error */}
                {aiError && (
                  <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-800 mb-3">
                    <p className="text-xs text-red-400">{aiError}</p>
                  </div>
                )}

                {/* AI scan in progress */}
                {aiLoading && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-900/20 border border-purple-800 mb-3">
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                    <span className="text-xs text-purple-400">Scanning rally image...</span>
                  </div>
                )}

                {/* AI scan results — three groups: exact (blue), fuzzy (green), unmatched (yellow) */}
                {aiScanned && !aiError && aiDetectedNames && aiDetectedNames.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {/* Exact matches — blue */}
                    {exactMatchNames.length > 0 && (
                      <div className="px-3 py-2 rounded-lg bg-blue-900/20 border border-blue-800">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-blue-400" />
                          <span className="text-xs text-blue-400">
                            {exactMatchNames.length} exact match{exactMatchNames.length !== 1 ? "es" : ""} auto-checked
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {exactMatchNames.map((name) => (
                            <span key={name} className="px-2 py-1 rounded text-xs font-medium bg-blue-900/30 text-blue-300 border border-blue-800/50">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fuzzy matches — green */}
                    {fuzzyMatchNames.size > 0 && (
                      <div className="px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-800">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs text-emerald-400">
                            {fuzzyMatchNames.size} fuzzy match{fuzzyMatchNames.size !== 1 ? "es" : ""} auto-checked
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {[...fuzzyMatchNames.entries()].map(([detected, member]) => (
                            <button
                              key={detected}
                              onClick={() => resolveSuggestion(detected, member)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-emerald-900/30 text-emerald-300 border border-emerald-800/50 hover:bg-emerald-900/50 transition"
                              title={`Click to use "${member.name}" instead of "${detected}"`}
                            >
                              <Pencil className="w-3 h-3" />
                              {detected} → {member.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unmatched names — amber/yellow — hidden for viewers */}
                    {!isViewer && unmatchedNames.length > 0 && (
                      <div className="px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-amber-400" />
                          <span className="text-xs text-amber-400">
                            {unmatchedNames.length} new name{unmatchedNames.length !== 1 ? "s" : ""} — click + to add, name to edit
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {unmatchedNames.map((name) => (
                            editingUnmatched === name ? (
                              <input
                                key={name}
                                ref={editUnmatchedRef}
                                value={editUnmatchedValue}
                                onChange={(e) => setEditUnmatchedValue(e.target.value)}
                                onBlur={saveEditUnmatched}
                                onKeyDown={handleEditUnmatchedKeyDown}
                                className="px-2 py-1 rounded text-xs font-medium bg-amber-900/50 text-amber-200 border border-amber-600 outline-none w-28"
                              />
                            ) : (
                              <span key={name} className="inline-flex items-center rounded text-xs font-medium bg-amber-900/30 text-amber-300 border border-amber-800/50 overflow-hidden">
                                <button
                                  onClick={() => addUnmatchedToChecklist(name)}
                                  className="px-1.5 py-1.5 hover:bg-amber-900/50 transition"
                                  title="Add to checklist"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => startEditUnmatched(name)}
                                  className="flex items-center gap-1 px-2 py-1.5 hover:bg-amber-900/40 transition border-l border-amber-800/50"
                                  title="Click to edit name"
                                >
                                  {name}
                                  <Pencil className="w-3 h-3 text-amber-500/60" />
                                </button>
                              </span>
                            )
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {pasteMode && (
                  <div className="space-y-2 mb-3">
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder={`Paste player names here...\nOne per line, or comma/space separated\n\nExample:\nDonAlas\nxSupladoo\nDemonyita\nE66no99s`}
                      rows={5}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition resize-none placeholder:text-slate-600"
                    />
                    <button
                      onClick={handleProcessPastedNames}
                      disabled={!pasteText.trim()}
                      className="w-full py-2 rounded-lg font-medium bg-amber-900/30 border border-amber-800 text-amber-400 text-sm hover:bg-amber-900/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="w-3.5 h-3.5 inline mr-1.5" />
                      Add {pasteText.trim() ? parsePastedNames(pasteText).length : 0} player{parsePastedNames(pasteText).length !== 1 ? "s" : ""}
                    </button>
                  </div>
                )}
              </div>

              {/* Member search */}
              <div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search members..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500 transition"
                  />
                </div>

                {selectedIds.size > 0 && (
                  <p className="text-sm text-amber-400 mb-2">
                    {selectedIds.size + selectedPendingIds.size} member{selectedIds.size + selectedPendingIds.size > 1 ? "s" : ""} selected
                  </p>
                )}

                <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-lg p-2">
                  {/* Pending (new) members — not yet in DB — hidden for viewers */}
                  {!isViewer && pendingMembers.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-medium text-purple-400 uppercase tracking-wider mb-1 px-1">New</p>
                      <div className="flex flex-wrap gap-1.5">
                      {pendingMembers.map((pm) => (
                        <button
                          key={pm.tempId}
                          onClick={() => {
                            setSelectedPendingIds(prev => {
                              const next = new Set(prev);
                              if (next.has(pm.tempId)) next.delete(pm.tempId);
                              else next.add(pm.tempId);
                              return next;
                            });
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition ${
                            selectedPendingIds.has(pm.tempId)
                              ? "bg-purple-900/30 text-purple-300 border border-purple-800"
                              : "text-purple-400/70 hover:bg-purple-900/20 border border-purple-800/30"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              selectedPendingIds.has(pm.tempId)
                                ? "bg-purple-500 border-purple-500"
                                : "border-purple-700"
                            }`}
                          >
                            {selectedPendingIds.has(pm.tempId) && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span>{pm.name}</span>
                        </button>
                      ))}
                      </div>
                    </div>
                  )}
                  {filteredMembers.length === 0 && pendingMembers.length === 0 ? (
                    <p className="text-sm text-slate-600 text-center py-3">
                      No members found
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                    {filteredMembers.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => toggleMember(m.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition ${
                          selectedIds.has(m.id)
                            ? "bg-amber-900/30 text-amber-300 border border-amber-800"
                            : "text-slate-300 hover:bg-slate-800 border border-transparent"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            selectedIds.has(m.id)
                              ? "bg-amber-500 border-amber-500"
                              : "border-slate-600"
                          }`}
                        >
                          {selectedIds.has(m.id) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span>{m.name}</span>
                      </button>
                    ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Add new member — hidden for viewers */}
              {!isViewer && (
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Add new member
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    onKeyDown={handleNewMemberKeyDown}
                    placeholder="Player name..."
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500 transition"
                  />
                  <button
                    onClick={handleAddNewMember}
                    disabled={!newMemberName.trim() || exactMatch}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>
                {exactMatch && (
                  <p className="text-xs text-amber-500 mt-1">
                    Member already exists — select from the list above
                  </p>
                )}
              </div>
              )}
            </>
          )}
        </div>

        {/* Sticky footer — always visible even when body scrolls */}
        {step === "attendance" && (
          <div className="p-4 border-t border-slate-800 shrink-0">
            <button
              onClick={handleFinalSubmit}
              disabled={submitting}
              className="w-full py-2.5 rounded-lg font-medium bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-500 hover:to-orange-400 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </span>
              ) : selectedIds.size + selectedPendingIds.size > 0 ? (
                <>Confirm and Save Attendance ({selectedIds.size + selectedPendingIds.size})</>
              ) : (
                <>Proceed (skip attendance)</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Fullscreen image preview */}
      {fullscreenPreviewIndex !== null && rallyPreviews[fullscreenPreviewIndex] && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90"
          onClick={() => setFullscreenPreviewIndex(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setFullscreenPreviewIndex(null); }}
          tabIndex={0}
        >
          <button
            onClick={() => setFullscreenPreviewIndex(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={rallyPreviews[fullscreenPreviewIndex]}
            alt="Rally screenshot full size"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-4 text-sm text-slate-400">
            Click anywhere or press Esc to close
          </p>
        </div>
      )}
    </div>
  );
}

/** Exported for the paste preview count in the button */
function parsePastedNames(text: string): string[] {
  const lines = text.split(/[\n\r]+/);
  const rawNames: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes(",")) {
      rawNames.push(...trimmed.split(",").map((s) => s.trim()).filter(Boolean));
    } else {
      const spaceSplit = trimmed.split(/\s{2,}/);
      if (spaceSplit.length === 1) {
        rawNames.push(...trimmed.split(/\s+/).filter(Boolean));
      } else {
        rawNames.push(...spaceSplit.filter(Boolean));
      }
    }
  }
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of rawNames) {
    const cleaned = raw.replace(/^[@#*•\-–—\s]+|[@#*•\-–—\s]+$/g, "").trim();
    if (cleaned.length < 2 || /^\d+$/.test(cleaned)) continue;
    const lower = cleaned.toLowerCase();
    if (!seen.has(lower)) { seen.add(lower); names.push(cleaned); }
  }
  return names;
}

// ── Fuzzy Name Matching ─────────────────────────────────────

/** Levenshtein distance between two strings */
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
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Find the closest existing member to a detected name.
 * Returns the member if similarity is high enough, null otherwise.
 *
 * Threshold: distance ≤ 2 AND distance < ceil(name.length / 2)
 * This prevents false positives on short names while allowing
 * corrections like "DonAIas" → "DonAlas" (distance 1).
 */
function findClosestMember(
  detectedName: string,
  members: { id: string; name: string }[]
): { id: string; name: string } | null {
  const lower = detectedName.toLowerCase();
  const maxDist = Math.min(2, Math.ceil(detectedName.length / 2) - 1);

  let best: { id: string; name: string } | null = null;
  let bestDist = Infinity;

  for (const m of members) {
    // Skip if already exact match (handled elsewhere)
    if (m.name.toLowerCase() === lower) continue;

    const dist = levenshtein(lower, m.name.toLowerCase());
    if (dist < bestDist && dist <= maxDist) {
      bestDist = dist;
      best = m;
    }
  }

  return best;
}
