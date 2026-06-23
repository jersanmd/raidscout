import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useAttendance,
  useAddAttendance,
  useRemoveAttendance,
} from "@/hooks/useAttendance";
import { RallyImageOverlay } from "@/components/RallyImageOverlay";
import { useMembers } from "@/hooks/useMembers";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useServerId } from "@/contexts/ServerContext";
import { markActivityAttendance, fetchActivityAttendance, fetchActivityInstance, setActivityRallyImages, setActivityPartyLeaders, awardDkpOnKill } from "@/lib/supabase";
import { extractNamesWithAI } from "@/lib/vision";
import {
  fetchGuilds,
  supabase,
  addRallyImageToDeath,
  removeRallyImageFromDeath,
  uploadRallyImage,
  fetchDeathRallyImages,
  fetchDeathScanResults,
  saveDeathScanResults,
  fetchActivityScanResults,
  saveActivityScanResults,
} from "@/lib/supabase";
import { guildColor } from "@/lib/constants";
import { writeAuditEntry, AuditAction } from "@/lib/api/audit";
import {
  Loader2,
  X,
  Plus,
  Check,
  Sparkles,
  ImagePlus,
  Shield,
  Pencil,
} from "lucide-react";
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
  members: { id: string; name: string }[],
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
  /** Guild ID that owns this boss — its members sorted to top */
  ownerGuildId?: string | null;
  /** Activity instance ID — when set, fetches activity_attendance instead of attendance_records */
  activityInstanceId?: string;
}

export function ParticipantModal({
  deathRecordId,
  bossName,
  deathTime,
  onClose,
  navigate,
  readOnly: readOnlyProp = false,
  onEditDeathTime,
  onChangeGuild,
  onDelete,
  ownerGuildId,
  activityInstanceId,
}: ParticipantModalProps) {
  const readOnly = readOnlyProp;

  // Fetch attendance: activity_attendance when activityInstanceId is set, otherwise death attendance
  const { data: bossAttendance = [], isLoading: bossLoading } = useAttendance(
    activityInstanceId ? null : deathRecordId,
  );
  const { data: activityAttendance = [], isLoading: activityLoading } =
    useQuery({
      queryKey: ["activity_attendance", activityInstanceId],
      queryFn: async () => {
        if (!activityInstanceId) return [];
        return await fetchActivityAttendance(activityInstanceId);
      },
      enabled: !!activityInstanceId,
      staleTime: 30_000,
    });
  const attendance = activityInstanceId ? activityAttendance : bossAttendance;
  const isLoading = activityInstanceId ? activityLoading : bossLoading;
  const { data: members = [] } = useMembers();
  const addAttendance = useAddAttendance();
  const removeAttendance = useRemoveAttendance();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const serverId = useServerId();
  const toggleAttendance = useCallback(async (memberId: string, memberName: string, isAttending: boolean, readOnly: boolean) => {
    if (readOnly) return;
    setPendingIds(prev => new Set(prev).add(memberId));
    try {
      if (isAttending) {
        const att = attendance.find((a) => a.member_id === memberId);
        if (att) {
          if (activityInstanceId) {
            await markActivityAttendance(activityInstanceId, memberId, false);
            writeAuditEntry({ action: AuditAction.ATTENDANCE_REMOVE, server_id: serverId!, target_id: activityInstanceId, details: { member_name: memberName, boss_name: bossName } });
            queryClient.invalidateQueries({ queryKey: ["activity_attendance", activityInstanceId] });
            queryClient.invalidateQueries({ queryKey: ["activity_instances"] });
            queryClient.invalidateQueries({ queryKey: ["activities"] });
          } else {
            await removeAttendance.mutateAsync({ attendanceId: att.id, deathRecordId, memberName, bossName });
            awardDkpOnKill(deathRecordId).catch(() => {});
          }
        }
      } else {
        if (activityInstanceId) {
          await markActivityAttendance(activityInstanceId, memberId, true);
          writeAuditEntry({ action: AuditAction.ATTENDANCE_ADD, server_id: serverId!, target_id: activityInstanceId, details: { member_name: memberName, boss_name: bossName } });
          queryClient.invalidateQueries({ queryKey: ["activity_attendance", activityInstanceId] });
          queryClient.invalidateQueries({ queryKey: ["activity_instances"] });
          queryClient.invalidateQueries({ queryKey: ["activities"] });
        } else {
          await addAttendance.mutateAsync({ deathRecordId, memberId, memberName, bossName });
          awardDkpOnKill(deathRecordId).catch(() => {});
        }
      }
    } finally {
      setPendingIds(prev => {
        const next = new Set(prev);
        next.delete(memberId);
        return next;
      });
    }
  }, [attendance, activityInstanceId, deathRecordId, addAttendance, removeAttendance, queryClient, bossName]);

  const [memberSearch, setMemberSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guild data for grouping members
  const [guilds, setGuilds] = useState<Guild[]>([]);
  useEffect(() => {
    fetchGuilds()
      .then(setGuilds)
      .catch(() => setGuilds([]));
  }, []);

  // Saved rally images from DB (boss death records or activity instances)
  const [savedRallyUrls, setSavedRallyUrls] = useState<string[]>([]);
  useEffect(() => {
    if (activityInstanceId) {
      fetchActivityInstance(activityInstanceId)
        .then(d => setSavedRallyUrls(d.rally_images || []))
        .catch(() => {});
    } else if (deathRecordId) {
      fetchDeathRallyImages(deathRecordId)
        .then(setSavedRallyUrls)
        .catch(() => {});
    }
  }, [deathRecordId, activityInstanceId]);

  // Load persisted AI scan results on open
  useEffect(() => {
    (async () => {
      try {
        let results: import("@/types").ScanResults | null = null;
        if (activityInstanceId) {
          results = await fetchActivityScanResults(activityInstanceId);
        } else if (deathRecordId) {
          results = await fetchDeathScanResults(deathRecordId);
        }
        if (results) {
          setExactMatchNames(results.exactMatches || []);
          const fm = new Map<string, { id: string; name: string }>();
          if (results.fuzzyMatches) {
            // Need to look up member IDs from names — but we may not have members loaded yet
            // Store names only; matching will be re-resolved when scan is re-run
            for (const [detected, memberName] of Object.entries(results.fuzzyMatches)) {
              fm.set(detected, { id: "", name: memberName });
            }
          }
          setFuzzyMatchNames(fm);
          setUnmatchedNames(results.unmatched || []);
          setAlreadyAttendedNames(results.alreadyAttended || []);
          // Mark as having detected names so the overlay shows
          const allNames = [
            ...(results.exactMatches || []),
            ...Object.values(results.fuzzyMatches || {}),
            ...(results.unmatched || []),
          ];
          if (allNames.length > 0) setAiDetectedNames(allNames);
        }
      } catch (err) { console.error("[ParticipantModal] AI vision fetch failed:", err); }
    })();
  }, [deathRecordId, activityInstanceId]);

  // Party leaders state (boss death records or activity instances)
  const [partyLeaders, setPartyLeaders] = useState<Record<string, string>>({});
  const [partyLeadersLoading, setPartyLeadersLoading] = useState(true);
  useEffect(() => {
    if (activityInstanceId) {
      fetchActivityInstance(activityInstanceId)
        .then(d => { setPartyLeaders(d.party_leaders || {}); setPartyLeadersLoading(false); })
        .catch(() => { setPartyLeaders({}); setPartyLeadersLoading(false); });
    } else if (deathRecordId) {
      (async () => {
        try {
          const { data } = await supabase
            .from("death_records")
            .select("party_leaders")
            .eq("id", deathRecordId)
            .single();
          setPartyLeaders((data as any)?.party_leaders || {});
        } catch {
          setPartyLeaders({});
        } finally {
          setPartyLeadersLoading(false);
        }
      })();
    } else {
      setPartyLeadersLoading(false);
    }
  }, [deathRecordId, activityInstanceId]);

  const savePartyLeaders = async (updated: Record<string, string>) => {
    try {
      if (activityInstanceId) {
        await setActivityPartyLeaders(activityInstanceId, updated);
      } else {
        await supabase
          .from("death_records")
          .update({ party_leaders: updated })
          .eq("id", deathRecordId);
      }
      const leaderIds = Object.values(updated).filter(Boolean);
      if (leaderIds.length > 0) {
        const leaderNames = leaderIds.map(id => members.find(m => m.id === id)?.name ?? id).join(", ");
        writeAuditEntry({ action: AuditAction.PARTY_LEADERS_SET, server_id: serverId!, target_id: deathRecordId, details: { boss_name: bossName, leaders: leaderNames } });
      }
    } catch (err) { console.error("[ParticipantModal] savePartyLeaders failed:", err); }
  };

  // Group members by guild for party leader selectors
  const groupedMembers = useMemo(() => {
    const map = new Map<
      string,
      { guildId: string | null; guildName: string; members: Member[] }
    >();
    for (const m of members) {
      const gid = (m as any).guild_id || null;
      const key = gid ?? "_none_";
      if (!map.has(key)) {
        const g = guilds.find((x) => x.id === gid);
        map.set(key, {
          guildId: gid,
          guildName: g?.name || "No Guild",
          members: [],
        });
      }
      map.get(key)!.members.push(m);
    }
    return [...map.values()];
  }, [members, guilds]);

  // AI rally scan state
  const [rallyImages, setRallyImages] = useState<File[]>([]);
  const [rallyPreviews, setRallyPreviews] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [fullscreenPreviewIndex, setFullscreenPreviewIndex] = useState<
    number | null
  >(null);
  useEscapeKey(() => {
    if (fullscreenPreviewIndex !== null) {
      setFullscreenPreviewIndex(null);
    } else {
      onClose();
    }
  });
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDetectedNames, setAiDetectedNames] = useState<string[] | null>(null);
  // Three-way categorization
  const [exactMatchNames, setExactMatchNames] = useState<string[]>([]);
  const [fuzzyMatchNames, setFuzzyMatchNames] = useState<
    Map<string, { id: string; name: string }>
  >(new Map());
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);
  // Already-attended names (excluded from results)
  const [alreadyAttendedNames, setAlreadyAttendedNames] = useState<string[]>(
    [],
  );
  // Inline edit for unmatched names
  const [editingUnmatched, setEditingUnmatched] = useState<string | null>(null);
  const [editUnmatchedValue, setEditUnmatchedValue] = useState("");
  const editUnmatchedRef = useRef<HTMLInputElement>(null);

  const memberMap = new Map(members.map((m) => [m.id, m.name]));
  const attendedIds = new Set(attendance.map((a) => a.member_id));
  const allFilteredMembers = memberSearch.trim()
    ? members.filter((m) =>
        m.name.toLowerCase().includes(memberSearch.toLowerCase().trim()),
      )
    : members;

  // Group members by guild — owner guild first, alphabetical within groups
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
    const groups = [...map.entries()]
      .filter(([, ms]) => ms.length > 0)
      .map(([gid, ms]) => ({
        guildId: gid,
        guildName: gid
          ? (guilds.find((g) => g.id === gid)?.name ?? "Unknown")
          : "No Guild",
        color: gid
          ? guildColor(guilds.find((g) => g.id === gid)?.name ?? "")
          : { bg: "", text: "", border: "" },
        members: ms,
      }));

    // Sort members alphabetically within each group
    for (const group of groups) {
      group.members.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Move owner guild to the top
    if (ownerGuildId) {
      const ownerIdx = groups.findIndex((g) => g.guildId === ownerGuildId);
      if (ownerIdx > 0) {
        const [owner] = groups.splice(ownerIdx, 1);
        groups.unshift(owner);
      }
    }

    return groups;
  }, [allFilteredMembers, guilds, ownerGuildId]);

  // Reset guild map when attendees change

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0) return;
    const updated = [...rallyImages, ...files];
    setRallyImages(updated);
    setRallyPreviews((prev) => [
      ...prev,
      ...files.map((f) => URL.createObjectURL(f)),
    ]);
    setAiError(null);
    setAiDetectedNames(null);
    setExactMatchNames([]);
    setFuzzyMatchNames(new Map());
    setUnmatchedNames([]);
    setAlreadyAttendedNames([]);
    e.target.value = "";
    scanImages(updated);
  };

  const scanImages = async (images: File[]) => {
    if (images.length === 0) return;

    // Save images to storage immediately
    for (const file of images) {
      uploadRallyImage(file).then((url) => {
        if (url) {
          if (activityInstanceId) {
            setSavedRallyUrls((prev) => {
              const next = [...prev, url];
              setActivityRallyImages(activityInstanceId, next);
              return next;
            });
          } else {
            addRallyImageToDeath(deathRecordId, url);
            setSavedRallyUrls((prev) => [...prev, url]);
          }
        }
      });
    }

    setAiLoading(true);
    setAiError(null);
    setExactMatchNames([]);
    setFuzzyMatchNames(new Map());
    setUnmatchedNames([]);
    setAlreadyAttendedNames([]);

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
        attendance
          .map((a) => memberMap.get(a.member_id)?.toLowerCase())
          .filter(Boolean) as string[],
      );

      const exactNames: string[] = [];
      const fuzzyMap = new Map<string, { id: string; name: string }>();
      const unmatched: string[] = [];
      const alreadyThere: string[] = [];

      for (const name of names) {
        const lower = name.toLowerCase();
        if (alreadyAttendedLower.has(lower)) {
          alreadyThere.push(name);
          continue;
        }
        const existingId = existingLower.get(lower);
        if (existingId) {
          exactNames.push(name);
        } else {
          const close = findClosestMember(name, members);
          if (close) {
            fuzzyMap.set(name, close);
          } else {
            unmatched.push(name);
          }
        }
      }

      // Auto-add exact + fuzzy matches to attendance (existing members only)
      const toAdd: { id: string; name: string }[] = [];
      for (const name of exactNames) {
        const id = existingLower.get(name.toLowerCase());
        if (id && !attendedIds.has(id)) toAdd.push({ id, name });
      }
      for (const [detectedName, member] of fuzzyMap) {
        if (!attendedIds.has(member.id)) toAdd.push({ id: member.id, name: member.name });
      }
      for (const { id, name } of toAdd) {
        try {
          await addAttendance.mutateAsync({ deathRecordId, memberId: id, memberName: name, bossName });
        } catch (err) { console.error("[ParticipantModal] bulk addAttendance failed for member:", id, err); }
      }
      if (toAdd.length > 0) awardDkpOnKill(deathRecordId).catch(() => {});

      // Keep scan results for overlay display (don't clear exact/fuzzy)
      const allDetected = [...exactNames, ...fuzzyMap.keys(), ...unmatched];
      setExactMatchNames(exactNames);
      setFuzzyMatchNames(fuzzyMap);
      setUnmatchedNames(unmatched);
      setAlreadyAttendedNames(alreadyThere);
      setAiDetectedNames(allDetected.length > 0 ? allDetected : null);

      // Save scan results to DB for future viewing
      const scanResults: import("@/types").ScanResults = {
        exactMatches: exactNames,
        fuzzyMatches: Object.fromEntries([...fuzzyMap.entries()].map(([k, v]) => [k, v.name])),
        unmatched,
        alreadyAttended: alreadyThere,
      };
      if (activityInstanceId) {
        try { await saveActivityScanResults(activityInstanceId, scanResults); } catch (err) { console.error("[ParticipantModal] saveActivityScanResults failed:", err); }
      } else if (deathRecordId) {
        try { await saveDeathScanResults(deathRecordId, scanResults); } catch (err) { console.error("[ParticipantModal] saveDeathScanResults failed:", err); }
      }

      if (toAdd.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["attendance"] });
      }
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
          setRallyPreviews((prev) => [...prev, URL.createObjectURL(blob)]);
          setAiError(null);
          setAiDetectedNames(null);
          setExactMatchNames([]);
          setFuzzyMatchNames(new Map());
          setUnmatchedNames([]);
          setAlreadyAttendedNames([]);
          scanImages(updated);
          return;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [rallyImages]);

  /** User clicks to create new members and add them to attendance */
  const handleCreateAndAddNew = async () => {
    if (unmatchedNames.length === 0) return;
    setAiLoading(true);

    for (const name of unmatchedNames) {
      try {
        const { upsertMember } = await import("@/lib/supabase");
        const member = await upsertMember(name);
        if (!attendedIds.has(member.id)) {
          try {
            await addAttendance.mutateAsync({
              deathRecordId,
              memberId: member.id,
              memberName: name,
              bossName,
            });
          } catch (err) { console.error("[ParticipantModal] manual addAttendance failed:", member.id, err); }
        }
      } catch (err) { console.error("[ParticipantModal] manual attendance operation failed:", err); }
    }
    awardDkpOnKill(deathRecordId).catch(() => {});

    setUnmatchedNames([]);
    setAiDetectedNames(null);
    setAiLoading(false);
    queryClient.invalidateQueries({ queryKey: ["members"] });
    queryClient.invalidateQueries({ queryKey: ["attendance"] });
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
      setUnmatchedNames((prev) =>
        prev.map((n) => (n === editingUnmatched ? trimmed : n)),
      );
    }
    setEditingUnmatched(null);
    setEditUnmatchedValue("");
  };

  const handleEditUnmatchedKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEditUnmatched();
    } else if (e.key === "Escape") {
      setEditingUnmatched(null);
      setEditUnmatchedValue("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col ">
        <div className="flex items-center justify-between p-4 border-b border-[#27272a] shrink-0">
          <div>
            <h3 className="text-sm font-bold text-[#fafafa]">{bossName}</h3>
            <p className="text-[10px] text-[#71717a]">
              {new Date(deathTime).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onChangeGuild && (
              <button
                onClick={onChangeGuild}
                className="text-xs text-[#a1a1aa]/80 hover:text-violet-300 transition px-2 py-1 rounded hover:bg-[#27272a]"
              >
                Change Guild
              </button>
            )}
            {onEditDeathTime && (
              <button
                onClick={onEditDeathTime}
                className="text-xs text-[#a1a1aa]/80 hover:text-cyan-300 transition px-2 py-1 rounded hover:bg-[#27272a]"
              >
                Edit Time
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-xs text-[#a1a1aa]/80 hover:text-red-300 transition px-2 py-1 rounded hover:bg-[#18181b]"
              >
                Remove
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[#71717a] hover:text-[#fafafa] transition p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-[#52525b] animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Rally Screenshot (AI) */}
              {!readOnly && (
                <div>
                  <p className="text-[10px] text-[#71717a] uppercase tracking-wider mb-1">
                    Rally Screenshot (AI)
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    multiple
                  />
                  {rallyPreviews.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2 items-center">
                        {rallyPreviews.map((preview, i) => (
                          <div key={i} className="relative group">
                            <img
                              src={preview}
                              alt={`Rally ${i + 1}`}
                              className="w-16 h-16 object-cover rounded-lg border border-[#27272a] cursor-pointer hover:border-[#52525b] transition"
                              onClick={() => setFullscreenPreviewIndex(i)}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRallyImages((prev) =>
                                  prev.filter((_, j) => j !== i),
                                );
                                setRallyPreviews((prev) =>
                                  prev.filter((_, j) => j !== i),
                                );
                              }}
                              className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-red-600 text-[#fafafa] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-16 h-16 rounded-lg border-2 border-dashed border-[#27272a] text-[#71717a] hover:text-[#a1a1aa] hover:border-[#3f3f46] transition flex items-center justify-center"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {aiLoading && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#27272a] text-[#a1a1aa]">
                          <Loader2 className="w-3 h-3 animate-spin" />{" "}
                          Scanning...
                        </span>
                      )}
                      {aiError && (
                        <p className="text-[10px] text-[#a1a1aa]">{aiError}</p>
                      )}
                      {aiDetectedNames && aiDetectedNames.length > 0 && (
                        <div className="space-y-1.5 p-2 rounded-lg bg-[#18181b] border border-[#27272a]">
                          {/* Already attended — gray */}
                          {alreadyAttendedNames.length > 0 && (
                            <div className="text-[10px] text-[#71717a] px-1">
                              <Sparkles className="w-2.5 h-2.5 inline mr-1" />
                              {alreadyAttendedNames.length} already attending
                            </div>
                          )}

                          {/* Unmatched — amber, individual add + edit */}
                          {unmatchedNames.length > 0 && (
                            <div className="px-2 py-1.5 rounded bg-[#18181b] border border-[#27272a]">
                              <span className="text-xs font-medium text-[#a1a1aa]">
                                {unmatchedNames.length} new name
                                {unmatchedNames.length !== 1 ? "s" : ""} — click
                                + to add, name to edit
                              </span>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {unmatchedNames.map((name) =>
                                  editingUnmatched === name ? (
                                    <input
                                      key={name}
                                      ref={editUnmatchedRef}
                                      value={editUnmatchedValue}
                                      onChange={(e) =>
                                        setEditUnmatchedValue(e.target.value)
                                      }
                                      onBlur={saveEditUnmatched}
                                      onKeyDown={handleEditUnmatchedKeyDown}
                                      className="px-2 py-1 rounded text-xs font-medium bg-[#27272a] text-amber-200 border border-[#3f3f46] outline-none w-28"
                                    />
                                  ) : (
                                    <span
                                      key={name}
                                      className="inline-flex items-center rounded text-xs font-medium bg-[#27272a] text-amber-300 border border-[#27272a] overflow-hidden"
                                    >
                                      <button
                                        onClick={async () => {
                                          try {
                                            const { upsertMember } =
                                              await import("@/lib/supabase");
                                            const member =
                                              await upsertMember(name);
                                            if (!attendedIds.has(member.id)) {
                                              try {
                                                await addAttendance.mutateAsync(
                                                  {
                                                    deathRecordId,
                                                    memberId: member.id,
                                                    memberName: name,
                                                    bossName,
                                                  },
                                                );
                                              } catch (err) { console.error("[ParticipantModal] unmatched addAttendance failed:", member.id, err); }
                                            }
                                            awardDkpOnKill(deathRecordId).catch(() => {});
                                            setUnmatchedNames((prev) =>
                                              prev.filter((n) => n !== name),
                                            );
                                            if (unmatchedNames.length === 1)
                                              setAiDetectedNames(null);
                                            queryClient.invalidateQueries({
                                              queryKey: ["members"],
                                            });
                                            queryClient.invalidateQueries({
                                              queryKey: ["attendance"],
                                            });
                                          } catch (err) { console.error("[ParticipantModal] unmatched attendance operation failed:", err); }
                                        }}
                                        className="px-1.5 py-1.5 hover:bg-[#27272a] transition"
                                        title="Add to attendance"
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
                                  ),
                                )}
                              </div>
                            </div>
                          )}

                          {/* Bulk create button — only if many unmatched */}
                          {unmatchedNames.length > 3 && (
                            <button
                              onClick={handleCreateAndAddNew}
                              disabled={aiLoading}
                              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-semibold bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46] transition disabled:opacity-50"
                            >
                              {aiLoading ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Plus className="w-3 h-3" />
                              )}
                              Create & add all {unmatchedNames.length} new
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-[#27272a] text-[#71717a] hover:text-[#a1a1aa] hover:border-[#3f3f46] transition text-xs"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      Upload rally screenshot for AI scan
                    </button>
                  )}
                </div>
              )}

              {/* Saved rally images from DB */}
              {savedRallyUrls.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] text-[#71717a] uppercase tracking-wider mb-1">
                    Rally Screenshots ({savedRallyUrls.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {savedRallyUrls.map((url, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={url}
                          alt={`Rally ${i + 1}`}
                          className="h-20 w-auto rounded-lg object-cover border border-[#27272a] cursor-pointer hover:border-[#3f3f46] transition"
                          onClick={() => {
                            setFullscreenPreviewIndex(i);
                            setRallyPreviews(savedRallyUrls);
                          }}
                        />
                        {!readOnly && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = savedRallyUrls.filter((u) => u !== url);
                              setSavedRallyUrls(next);
                              if (activityInstanceId) {
                                setActivityRallyImages(activityInstanceId, next);
                              } else {
                                removeRallyImageFromDeath(deathRecordId, url);
                              }
                            }}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-[#fafafa] flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-400"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Members — check = attending, uncheck = not */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-[#71717a] uppercase tracking-wider">
                    Participants ({attendance.length})
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Search members…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#52525b] outline-none focus:border-[#52525b] focus:ring-1 focus:ring-[#27272a] transition mb-2"
                />
                <div className="max-h-96 overflow-y-auto rounded-lg border border-[#27272a] bg-[#18181b] p-2 space-y-2">
                  {guildGroups.length === 0 ? (
                    <p className="text-xs text-[#52525b] text-center py-3">
                      No members found.
                    </p>
                  ) : (
                    guildGroups.map((group) => (
                      <div key={group.guildId ?? "noguild"}>
                        {/* Guild header */}
                        {group.guildId && (
                          <div className="flex items-center gap-2 mb-1">
                            <div
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${group.color.bg} ${group.color.text} ${group.color.border} border w-fit`}
                            >
                              <Shield className="w-2.5 h-2.5" />
                              {group.guildName}
                            </div>
                            {/* Party Leader selector inside guild header */}
                            {!partyLeadersLoading &&
                              (readOnly ? (
                                <span
                                  className={`text-xs px-2 py-1 rounded border font-medium ${group.color.text} ${group.color.border} bg-[#18181b]`}
                                >
                                  Leader:{" "}
                                  {members.find(
                                    (m) =>
                                      m.id === partyLeaders[group.guildId!],
                                  )?.name || "—"}
                                </span>
                              ) : (
                                <select
                                  value={partyLeaders[group.guildId!] ?? ""}
                                  onChange={(e) => {
                                    const next = { ...partyLeaders };
                                    const gid = group.guildId!;
                                    if (e.target.value)
                                      next[gid] = e.target.value;
                                    else delete next[gid];
                                    setPartyLeaders(next);
                                    savePartyLeaders(next);
                                  }}
                                  className={`text-xs px-2 py-1 rounded border font-medium bg-[#18181b] focus:outline-none focus:ring-1 focus:ring-[#27272a] ${group.color.text} ${group.color.border}`}
                                >
                                  <option value="">No leader</option>
                                  {group.members
                                    .filter((m) => attendedIds.has(m.id))
                                    .map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.name}
                                      </option>
                                    ))}
                                </select>
                              ))}
                          </div>
                        )}
                        {!group.guildId && guilds.length > 0 && (
                          <p className="text-[10px] font-medium text-[#71717a] uppercase tracking-wider mb-1 px-1">
                            No Guild
                          </p>
                        )}
                        {/* Member chips */}
                        <div className="flex flex-wrap gap-1">
                          {group.members.map((m) => {
                            const isAttending = attendedIds.has(m.id);
                            return (
                              <label
                                key={m.id}
                                title={
                                  readOnly
                                    ? "Only moderators can update participants"
                                    : undefined
                                }
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded transition text-sm ${readOnly ? "cursor-default" : "cursor-pointer"} ${isAttending ? "bg-[#27272a] text-emerald-300 border border-[#27272a]" : "text-[#a1a1aa] hover:bg-[#27272a] border border-transparent"}`}
                              >
                                {pendingIds.has(m.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500 shrink-0" />
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={isAttending}
                                    disabled={readOnly}
                                    title={readOnly ? "Only moderators can update participants" : undefined}
                                    onChange={() => toggleAttendance(m.id, m.name, isAttending, readOnly)}
                                    className="w-4 h-4 rounded border-[#3f3f46] bg-[#27272a] text-emerald-500 focus:ring-[#27272a] cursor-pointer"
                                  />
                                )}
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
      {/* Fullscreen image preview */}
      {fullscreenPreviewIndex !== null && rallyPreviews[fullscreenPreviewIndex]
        ? createPortal(
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
              <RallyImageOverlay
                src={rallyPreviews[fullscreenPreviewIndex]}
                alt="Rally screenshot"
                attendingNames={attendance.map(a => memberMap.get(a.member_id)).filter(Boolean) as string[]}
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
