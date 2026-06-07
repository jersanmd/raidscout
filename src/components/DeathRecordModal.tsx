import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Zap, X, Upload, Check, Plus, Search, Users, ClipboardPaste, Sparkles, Loader2, Pencil, ImagePlus } from "lucide-react";
import { useMembers } from "@/hooks/useMembers";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import { extractNamesWithAI } from "@/lib/vision";
import { isSupabaseConfigured, fetchGuilds, fetchStaticParties, type StaticParty } from "@/lib/supabase";
import { guildColor } from "@/lib/constants";
import type { Boss, Member, Guild } from "@/types";

interface DeathRecordModalProps {
 boss: Boss;
 onClose: () => void;
 onSubmit: (deathTime: Date, rallyImages: File[], attendeeIds: string[], partyLeaders?: Record<string, string> | null) => void;
 /** Pre-set death time (e.g., schedule spawn time). Skips the time-selection step entirely. */
 defaultDeathTime?: Date;
 /** Hide the "Custom Time" tab — only allow the pre-set or "now" time */
 hideCustomTime?: boolean;
 /** Guild ID that currently owns this boss — its members will be sorted to the top */
 ownerGuildId?: string | null;
 /** Render as an activity end modal instead of boss death */
 isActivity?: boolean;
 /** Activity name (used in title when isActivity) */
 activityName?: string;
}

export function DeathRecordModal({ boss, onClose, onSubmit, defaultDeathTime, hideCustomTime, ownerGuildId, isActivity = false, activityName }: DeathRecordModalProps) {
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
 const [guilds, setGuilds] = useState<Guild[]>([]);
 const [parties, setParties] = useState<StaticParty[]>([]);
 const [partySelect, setPartySelect] = useState("");
 useEffect(() => {
 if (serverId) {
   fetchGuilds(serverId).then(setGuilds).catch(() => setGuilds([]));
   fetchStaticParties(serverId).then(setParties).catch(() => setParties([]));
 }
 }, [serverId]);
 const guildMap = new Map(guilds.map(g => [g.id, g]));
 // Group members by guild — owner guild sorted first, members alphabetical within each group
 const groupedMembers = useMemo(() => {
 const groups: { guildName: string; guildId: string | null; members: Member[] }[] = [];
 const guildGroups = new Map<string, Member[]>();
 const ungrouped: Member[] = [];
 for (const m of members) {
 if (m.guild_id && guildMap.has(m.guild_id)) {
 const existing = guildGroups.get(m.guild_id);
 if (existing) existing.push(m);
 else guildGroups.set(m.guild_id, [m]);
 } else {
 ungrouped.push(m);
 }
 }
 for (const [gid, gmembers] of guildGroups) {
 const g = guildMap.get(gid)!;
 groups.push({ guildName: g.name, guildId: gid, members: gmembers });
 }
 if (ungrouped.length > 0) groups.push({ guildName: "Ungrouped", guildId: null, members: ungrouped });

 // Sort members alphabetically within each group
 for (const group of groups) {
 group.members.sort((a, b) => a.name.localeCompare(b.name));
 }

 // Move owner guild to the top
 if (ownerGuildId) {
 const ownerIdx = groups.findIndex(g => g.guildId === ownerGuildId);
 if (ownerIdx > 0) {
 const [owner] = groups.splice(ownerIdx, 1);
 groups.unshift(owner);
 }
 }

 return groups;
 }, [members, guilds, ownerGuildId]);
 const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
 const [partyLeaders, setPartyLeaders] = useState<Record<string, string>>({}); // guild_id → member_id
 const [rallyImages, setRallyImages] = useState<File[]>([]);
 const [rallyPreviews, setRallyPreviews] = useState<string[]>([]);
 const rallyPreviewsRef = useRef<string[]>([]);
 // Keep ref in sync so cleanup on unmount has access to the latest previews
 useEffect(() => { rallyPreviewsRef.current = rallyPreviews; }, [rallyPreviews]);
 // Revoke all object URLs on unmount to prevent memory leaks
 useEffect(() => () => { rallyPreviewsRef.current.forEach(url => URL.revokeObjectURL(url)); }, []);
 const [fullscreenPreviewIndex, setFullscreenPreviewIndex] = useState<number | null>(null);
 const [newMemberName, setNewMemberName] = useState("");
 const [newMemberGuildId, setNewMemberGuildId] = useState<string>("");
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
 const member = await upsertMember(name, newMemberGuildId || null);
 setSelectedIds((prev) => new Set(prev).add(member.id));
 setNewMemberName("");
 setNewMemberGuildId("");
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

 // Auto-set party leader: first AI-detected name that matches a member in the owner's guild
 if (ownerGuildId) {
 const ownerGuildMembers = members.filter(m => m.guild_id === ownerGuildId);
 if (ownerGuildMembers.length > 0) {
 for (const name of names) {
 const lower = name.toLowerCase();
 const match = ownerGuildMembers.find(m => m.name.toLowerCase() === lower);
 if (match) {
 setPartyLeaders(prev => ({ ...prev, [ownerGuildId]: match.id }));
 break;
 }
 }
 // If no exact match, try fuzzy on owner guild members
 for (const name of names) {
 const close = findClosestMember(name, ownerGuildMembers);
 if (close) {
 setPartyLeaders(prev => ({ ...prev, [ownerGuildId]: close.id }));
 break;
 }
 }
 }
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
 * - One name per line
 * - Comma-separated: "DonAlas, xSupladoo, Demonyita"
 * - Space-separated rows: "DonAlas xSupladoo Demonyita"
 * - Mixed: "DonAlas, xSupladoo\nDemonyita E66no99s"
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

 onSubmit(deathTime, rallyImages, finalIds, Object.keys(partyLeaders).length > 0 ? partyLeaders : null);
 };

 const filteredGroupedMembers = useMemo(() => {
 if (!searchQuery.trim()) return groupedMembers;
 const q = searchQuery.toLowerCase();
 return groupedMembers
 .map(g => ({
 ...g,
 members: g.members.filter(m => m.name.toLowerCase().includes(q)),
 }))
 .filter(g => g.members.length > 0);
 }, [groupedMembers, searchQuery]);

 const exactMatch = members.some(
 (m) => m.name.toLowerCase() === newMemberName.trim().toLowerCase()
 );

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
 {/* Backdrop */}
 <div className="absolute inset-0 bg-black/60" onClick={onClose} />

 {/* Modal */}
 <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col ">
 {/* Header */}
 <div className="flex items-center justify-between p-4 border-b border-[#27272a] shrink-0">
 <div>
 <h2 className="text-lg font-bold text-[#fafafa]">
 {step === "death"
 ? (isActivity
 ? <>Record End: <span className="text-[#a1a1aa]">{activityName ?? boss.name}</span></>
 : <>Record Death: <span className="text-[#a1a1aa]">{boss.name}</span></>)
 : <>Attendance: <span className="text-[#a1a1aa]">{isActivity ? (activityName ?? boss.name) : boss.name}</span>{" · "}
 {deathTime && <span className="text-[#a1a1aa] text-sm font-normal">{deathTime.toLocaleString()}</span>}
 <button
 onClick={() => setDeathTime(new Date())}
 className="ml-3 px-2 py-0.5 rounded text-[10px] font-medium bg-[#27272a] text-[#a1a1aa] hover:bg-white/[0.10] hover:text-[#fafafa] transition"
 title={isActivity ? "Overwrite the end time with the current date and time" : "Overwrite the death time with the current date and time"}
 >
 Use current time
 </button></>
 }
 </h2>
 </div>
 <button
 onClick={onClose}
 className="text-[#71717a] hover:text-[#fafafa] transition p-1"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 {/* Body */}
 <div className="p-4 space-y-4 overflow-y-auto flex-1">
 {step === "death" ? (
 <>
 {!hideCustomTime && (
 <div className="flex bg-[#18181b] rounded-lg p-0.5 border border-[#27272a]">
 <button
 onClick={() => setMode("now")}
 className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition ${
 mode === "now" ? "bg-[#27272a] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8]"
 }`}
 >
 <Zap className="w-4 h-4" />
 {isActivity ? "End Now" : "Died Now"}
 </button>
 <button
 onClick={() => setMode("custom")}
 className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition ${
 mode === "custom" ? "bg-[#27272a] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8]"
 }`}
 >
 <Clock className="w-4 h-4" />
 Custom Time
 </button>
 </div>
 )}

 {mode === "now" || hideCustomTime ? (
 <div className="text-center">
 <p className="text-[#a1a1aa] text-sm mb-2">
 {isActivity
 ? "Current time will be recorded as the end time:"
 : defaultDeathTime
 ? "Scheduled spawn time will be recorded as the death time:"
 : "Current time will be recorded as the death time:"}
 </p>
 <p className="text-[#fafafa] font-mono text-lg">
 {displayTime.toLocaleString()}
 </p>
 {!isActivity && boss.respawn_hours ? (
 <p className="text-[#71717a] text-sm mt-2">
 Next spawn: +{boss.respawn_hours}h →{" "}
 {new Date(displayTime.getTime() + boss.respawn_hours * 3600_000).toLocaleString()}
 </p>
 ) : isActivity ? (
 <p className="text-[#71717a] text-sm mt-2">Next start: determined by activity schedule</p>
 ) : null}
 <button
 onClick={handleDiedNow}
 className="mt-4 w-full py-2.5 rounded-lg font-semibold bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] hover: transition"
 >
 {isActivity ? "Confirm End & Add Attendance" : "Confirm Death & Add Attendance"}
 </button>
 </div>
 ) : (
 <form onSubmit={handleCustomSubmit} className="space-y-3">
 <div>
 <label className="block text-sm font-medium text-[#a1a1aa] mb-1">
 Date
 </label>
 <input
 type="date"
 value={customDate}
 onChange={(e) => setCustomDate(e.target.value)}
 required
 max={todayStr}
 className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#27272a] transition"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-[#a1a1aa] mb-1">
 Time
 </label>
 <input
 type="time"
 value={customTime}
 onChange={(e) => setCustomTime(e.target.value)}
 required
 step="1"
 className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#27272a] transition"
 />
 </div>
 <button
 type="submit"
 className="w-full py-2.5 rounded-lg font-semibold bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] hover: transition"
 >
 {isActivity ? "Confirm End & Add Attendance" : "Confirm Death & Add Attendance"}
 </button>
 </form>
 )}
 </>
 ) : (
 <>
 {/* Rally image upload (multiple + paste from clipboard) */}
 <div>
 <label className="block text-sm font-medium text-[#a1a1aa] mb-2">
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
 className="w-16 h-16 object-cover rounded-lg border border-[#27272a] cursor-pointer hover:border-[#52525b] transition"
 onClick={() => setFullscreenPreviewIndex(i)}
 />
 <button
 onClick={(e) => { e.stopPropagation(); removeRallyImage(i); }}
 className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-red-600 text-[#fafafa] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition"
 >
 <X className="w-3 h-3" />
 </button>
 </div>
 ))}
 <button onClick={() => fileInputRef.current?.click()} className="w-16 h-16 flex items-center justify-center rounded-lg border-2 border-dashed border-[#27272a] text-[#71717a] hover:border-[#3f3f46] hover:text-[#a1a1aa] transition" title="Add more screenshots">
 <ImagePlus className="w-5 h-5" />
 </button>
 </div>
 )}

 {/* Empty state: upload button */}
 {rallyPreviews.length === 0 && (
 <button
 onClick={() => fileInputRef.current?.click()}
 className="w-full py-3 rounded-lg border-2 border-dashed border-[#27272a] text-[#71717a] hover:border-[#3f3f46] hover:text-[#a1a1aa] transition flex items-center justify-center gap-2"
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
 <p className="text-[10px] text-[#52525b] mt-1">
 {rallyPreviews.length} image{rallyPreviews.length !== 1 ? "s" : ""} · Click to enlarge · Paste more with Ctrl+V
 </p>
 )}
 </div>

 {/* Paste names — 100% accurate alternative to OCR */}
 <div>
 <div className="flex items-center justify-between mb-2">
 <label className="text-sm font-medium text-[#a1a1aa]">
 Add Attendees
 </label>
 <div className="flex items-center gap-2">
 {/* AI Scan button — only when images are uploaded */}
 {rallyPreviews.length > 0 && aiLoading && (
 <span className="flex items-center gap-1 text-xs text-[#a1a1aa]">
 <Loader2 className="w-3.5 h-3.5 animate-spin" />
 Scanning...
 </span>
 )}
 {rallyPreviews.length > 0 && aiScanned && !aiError && !aiLoading && (
 <span className="flex items-center gap-1 text-xs text-[#a1a1aa]">
 <Sparkles className="w-3.5 h-3.5" />
 Scanned ✓
 </span>
 )}
 {!isViewer && (
 <button
 onClick={() => setPasteMode(!pasteMode)}
 className={`flex items-center gap-1 text-xs transition ${
 pasteMode ? "text-[#a1a1aa]" : "text-[#71717a] hover:text-[#a1a1aa]"
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
 <div className="px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] mb-3">
 <p className="text-xs text-[#a1a1aa]">{aiError}</p>
 </div>
 )}

 {/* AI scan in progress */}
 {aiLoading && (
 <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] mb-3">
 <Loader2 className="w-4 h-4 text-[#a1a1aa] animate-spin" />
 <span className="text-xs text-[#a1a1aa]">Scanning rally image...</span>
 </div>
 )}

 {/* AI scan results — three groups: exact (blue), fuzzy (green), unmatched (yellow) */}
 {aiScanned && !aiError && aiDetectedNames && aiDetectedNames.length > 0 && (
 <div className="space-y-2 mb-3">
 {/* Exact matches — blue */}
 {exactMatchNames.length > 0 && (
 <div className="px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a]">
 <div className="flex items-center gap-2">
 <Check className="w-4 h-4 text-[#a1a1aa]" />
 <span className="text-xs text-[#a1a1aa]">
 {exactMatchNames.length} exact match{exactMatchNames.length !== 1 ? "es" : ""} auto-checked
 </span>
 </div>
 <div className="flex flex-wrap gap-1.5 mt-1.5">
 {exactMatchNames.map((name) => (
 <span key={name} className="px-2 py-1 rounded text-xs font-medium bg-[#27272a] text-cyan-300 border border-[#27272a]">
 {name}
 </span>
 ))}
 </div>
 </div>
 )}

 {/* Fuzzy matches — green */}
 {fuzzyMatchNames.size > 0 && (
 <div className="px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a]">
 <div className="flex items-center gap-2">
 <Check className="w-4 h-4 text-[#a1a1aa]" />
 <span className="text-xs text-[#a1a1aa]">
 {fuzzyMatchNames.size} fuzzy match{fuzzyMatchNames.size !== 1 ? "es" : ""} auto-checked
 </span>
 </div>
 <div className="flex flex-wrap gap-1.5 mt-1.5">
 {[...fuzzyMatchNames.entries()].map(([detected, member]) => (
 <button
 key={detected}
 onClick={() => resolveSuggestion(detected, member)}
 className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-[#27272a] text-emerald-300 border border-[#27272a] hover:bg-[#3f3f46] transition"
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
 <div className="px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a]">
 <div className="flex items-center gap-2">
 <Users className="w-4 h-4 text-[#a1a1aa]" />
 <span className="text-xs text-[#a1a1aa]">
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
 className="px-2 py-1 rounded text-xs font-medium bg-[#27272a] text-amber-200 border border-[#3f3f46] outline-none w-28"
 />
 ) : (
 <span key={name} className="inline-flex items-center rounded text-xs font-medium bg-[#27272a] text-amber-300 border border-[#27272a] overflow-hidden">
 <button
 onClick={() => addUnmatchedToChecklist(name)}
 className="px-1.5 py-1.5 hover:bg-[#27272a] transition"
 title="Add to checklist"
 >
 <Plus className="w-3.5 h-3.5" />
 </button>
 <button
 onClick={() => startEditUnmatched(name)}
 className="flex items-center gap-1 px-2 py-1.5 hover:bg-[#27272a] transition border-l border-[#27272a]"
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
 className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] text-sm focus:outline-none focus:ring-1 focus:ring-[#27272a] transition resize-none placeholder:text-[#3f3f46]"
 />
 <button
 onClick={handleProcessPastedNames}
 disabled={!pasteText.trim()}
 className="w-full py-2 rounded-lg font-semibold bg-[#27272a] border border-[#27272a] text-[#a1a1aa] text-sm hover:bg-[#3f3f46] transition disabled:opacity-50 disabled:cursor-not-allowed"
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
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52525b]" />
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search members..."
 className="w-full pl-9 pr-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] text-sm focus:outline-none focus:ring-1 focus:ring-[#27272a] transition"
 />
 </div>

 {selectedIds.size > 0 && (
 <p className="text-sm text-[#a1a1aa] mb-2">
 {selectedIds.size + selectedPendingIds.size} member{selectedIds.size + selectedPendingIds.size > 1 ? "s" : ""} selected
 </p>
 )}

 <div className="max-h-64 overflow-y-auto border border-[#27272a] rounded-lg p-2">
 {/* Pending (new) members — not yet in DB — hidden for viewers */}
 {!isViewer && pendingMembers.length > 0 && (
 <div className="mb-2">
 <p className="text-[10px] font-medium text-[#a1a1aa] uppercase tracking-wider mb-1 px-1">New</p>
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
 ? "bg-[#27272a] text-violet-300 border border-[#3f3f46]"
 : "text-[#a1a1aa]/70 hover:bg-[#27272a] border border-[#27272a]"
 }`}
 >
 <div
 className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
 selectedPendingIds.has(pm.tempId)
 ? "bg-violet-500 border-violet-500"
 : "border-[#3f3f46]"
 }`}
 >
 {selectedPendingIds.has(pm.tempId) && <Check className="w-3 h-3 text-[#fafafa]" />}
 </div>
 <span>{pm.name}</span>
 </button>
 ))}
 </div>
 </div>
 )}
 {filteredGroupedMembers.length === 0 && pendingMembers.length === 0 ? (
 <p className="text-sm text-[#52525b] text-center py-3">
 No members found
 </p>
 ) : (
 <div className="space-y-2">
 {/* Quick Party Select */}
 {parties.length > 0 && (
 <div className="flex items-center gap-2 pb-1">
 <select
 value={partySelect}
 onChange={(e) => {
 const val = e.target.value;
 setPartySelect(val);
 if (val) {
 const party = parties.find(p => p.id === val);
 if (party) {
 const ids = new Set(party.member_ids.filter(id => members.some(m => m.id === id)));
 setSelectedIds(ids);
 }
 } else {
 setSelectedIds(new Set());
 }
 }}
 className="flex-1 px-2 py-1.5 bg-[#18181b] border border-[#27272a] rounded text-xs text-[#a1a1aa] outline-none focus:border-[#52525b]"
 >
 <option value="">Quick party...</option>
 {parties.map(p => (
 <option key={p.id} value={p.id}>{p.name} ({p.member_ids.length})</option>
 ))}
 </select>
 {partySelect && (
 <button onClick={() => { setPartySelect(""); setSelectedIds(new Set()); }} className="text-[10px] text-[#71717a] hover:text-[#fafafa]">
 Clear
 </button>
 )}
 </div>
 )}
 {filteredGroupedMembers.map((group) => (
 <div key={group.guildId ?? "ungrouped"}>
 <p className={`text-[10px] font-medium uppercase tracking-wider mb-1 px-1 ${group.guildId ? guildColor(group.guildName).text : "text-[#71717a]"}`}>
 {group.guildName}
 <span className="text-[#52525b] ml-1">({group.members.length})</span>
 </p>
 <div className="flex flex-wrap gap-1.5">
 {group.members.map((m) => (
 <button
 key={m.id}
 onClick={() => toggleMember(m.id)}
 className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm transition ${
 selectedIds.has(m.id)
 ? "bg-[#27272a] text-amber-300 border border-[#3f3f46]"
 : "text-[#a1a1aa] hover:bg-[#27272a] border border-transparent"
 }`}
 >
 <div
 className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
 selectedIds.has(m.id)
 ? "bg-amber-500 border-amber-500"
 : "border-slate-600"
 }`}
 >
 {selectedIds.has(m.id) && <Check className="w-3 h-3 text-[#fafafa]" />}
 </div>
 <span>{m.name}</span>
 </button>
 ))}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>

 {/* Add new member — hidden for viewers */}
 {!isViewer && (
 <div>
 <label className="block text-sm font-medium text-[#71717a] mb-1">
 Add new member
 </label>
 <div className="flex gap-2">
 <input
 type="text"
 value={newMemberName}
 onChange={(e) => setNewMemberName(e.target.value)}
 onKeyDown={handleNewMemberKeyDown}
 placeholder="Player name..."
 className="flex-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] text-sm focus:outline-none focus:ring-1 focus:ring-[#27272a] transition"
 />
 <select
 value={newMemberGuildId}
 onChange={(e) => setNewMemberGuildId(e.target.value)}
 className="px-2 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] text-sm focus:outline-none focus:ring-1 focus:ring-[#27272a] transition max-w-[140px]"
 >
 <option value="">No guild</option>
 {guilds.map(g => (
 <option key={g.id} value={g.id}>{g.name}</option>
 ))}
 </select>
 <button
 onClick={handleAddNewMember}
 disabled={!newMemberName.trim() || exactMatch}
 className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#27272a] text-[#fafafa] text-sm font-medium hover:bg-[#27272a] transition disabled:opacity-50 disabled:cursor-not-allowed"
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
 <div className="p-4 border-t border-[#27272a] shrink-0 space-y-2">
 {/* Per-guild Party Leader selectors */}
 {selectedIds.size > 0 && groupedMembers.length > 1 && (
 <div className="space-y-1.5">
 <span className="text-[10px] text-[#71717a] uppercase tracking-wider">Party Leaders (per guild)</span>
 {groupedMembers.filter(g => g.members.some(m => selectedIds.has(m.id))).map(g => (
 <div key={g.guildId ?? "_none_"} className="flex items-center gap-2">
 <span className="text-[10px] text-[#71717a] w-16 truncate shrink-0" title={g.guildName}>{g.guildName || "No Guild"}</span>
 <select
 value={partyLeaders[g.guildId ?? "_none_"] ?? ""}
 onChange={(e) => setPartyLeaders(prev => {
 const next = { ...prev };
 if (e.target.value) next[g.guildId ?? "_none_"] = e.target.value;
 else delete next[g.guildId ?? "_none_"];
 return next;
 })}
 className="flex-1 px-2 py-1 bg-[#18181b] border border-[#27272a] rounded text-xs text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#27272a]"
 >
 <option value="">None</option>
 {g.members.filter(m => selectedIds.has(m.id)).map(m => (
 <option key={m.id} value={m.id}>{m.name}</option>
 ))}
 </select>
 </div>
 ))}
 </div>
 )}
 <button
 onClick={handleFinalSubmit}
 disabled={submitting}
 className="w-full py-2.5 rounded-lg font-semibold bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] hover: transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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

 {/* Fullscreen image preview — portaled to body to escape modal stacking */}
 {fullscreenPreviewIndex !== null && rallyPreviews[fullscreenPreviewIndex] && createPortal(
 <div
 className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90"
 onClick={() => setFullscreenPreviewIndex(null)}
 >
 <button
 onClick={() => setFullscreenPreviewIndex(null)}
 className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-[#fafafa] hover:bg-white/20 transition z-10"
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
 </div>,
 document.body
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
 prev[j] + 1, // deletion
 curr[j - 1] + 1, // insertion
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
