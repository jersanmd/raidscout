import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useMembers } from "@/hooks/useMembers";
import { useAuth } from "@/contexts/AuthContext";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { updateMemberName, deleteMember, upsertMember, isSupabaseConfigured, fetchGuilds, setMemberGuild, bulkAddMembers, supabase, fetchStaticParties, createParty, deleteParty, addMemberToParty, removeMemberFromParty, type StaticParty } from "@/lib/supabase";
import { useServerId, useHasPermission } from "@/contexts/ServerContext";
import type { Guild } from "@/types";
import { Users, Plus, Pencil, Trash2, Loader2, X, Check, UserPlus, CheckCircle, AlertTriangle, Image, Upload, Copy, Shield, Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { Member } from "@/types";
import { guildColor } from "@/lib/constants";

export function MembersView() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const canManageRaidMembers = useHasPermission("can_manage_members");
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();
  const { data: members = [], isLoading } = useMembers();

  const [searchParams] = useSearchParams();

  // Highlight member input when navigated from banner
  const memberInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (highlight === "add-member" && memberInputRef.current) {
      setTimeout(() => {
        memberInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        memberInputRef.current?.classList.add("animate-highlight-input");
        memberInputRef.current?.focus();
      }, 200);
      // Remove the highlight param from URL without reload
      const params = new URLSearchParams(searchParams);
      params.delete("highlight");
      window.history.replaceState(null, "", `?${params.toString()}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [addName, setAddName] = useState("");
  const [addCombatPower, setAddCombatPower] = useState("");
  const [addClass, setAddClass] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Guilds
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(true);

  // Classes — managed per server
  const [classes, setClasses] = useState<string[]>([]);
  const [newClassName, setNewClassName] = useState("");

  // Static parties — drag & drop UI
  const [parties, setParties] = useState<StaticParty[]>([]);
  const [partyGuildFilter, setPartyGuildFilter] = useState<string>("");
  const [partySize, setPartySize] = useState<number>(4);
  const [allPartyBoxes, setAllPartyBoxes] = useState<Record<string, string[][]>>({});
  const [unassignedSearch, setUnassignedSearch] = useState("");
  const [savingParties, setSavingParties] = useState(false);
  const [membersTab, setMembersTab] = useState<"members" | "parties">("members");

  // Carousel state
  const [carouselPage, setCarouselPage] = useState(0);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const isSwiping = useRef(false);

  // Responsive items per page: 2 on lg+ screens, 1 on smaller
  const [itemsPerPage, setItemsPerPage] = useState(() => window.innerWidth >= 1024 ? 2 : 1);
  useEffect(() => {
    const update = () => setItemsPerPage(window.innerWidth >= 1024 ? 2 : 1);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Swipe handlers
  const handleSwipeStart = useCallback((clientX: number) => {
    touchStartX.current = clientX;
    isSwiping.current = true;
  }, []);

  const handleSwipeMove = useCallback((clientX: number) => {
    if (!isSwiping.current) return;
    touchDeltaX.current = clientX - touchStartX.current;
  }, []);

  const handleSwipeEnd = useCallback((totalPages: number) => {
    if (!isSwiping.current) return;
    isSwiping.current = false;
    const threshold = 50;
    if (touchDeltaX.current > threshold) {
      setCarouselPage(p => p === 0 ? totalPages - 1 : p - 1);
    } else if (touchDeltaX.current < -threshold) {
      setCarouselPage(p => p >= totalPages - 1 ? 0 : p + 1);
    }
    touchDeltaX.current = 0;
  }, []);

  // Current guild key for boxes
  const currentGuildKey = partyGuildFilter || "__all__";

  // Current party boxes for the active guild filter
  const partyBoxes: string[][] = allPartyBoxes[currentGuildKey] ?? [];

  // Load saved parties and populate boxes
  const refreshParties = () => {
    if (serverId) fetchStaticParties(serverId).then(setParties).catch(() => {});
  };

  // When parties load from server, group by guild
  useEffect(() => {
    if (parties.length > 0) {
      const grouped: Record<string, string[][]> = {};
      for (const p of parties) {
        const key = p.guild_id || "__all__";
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(p.member_ids);
      }
      setAllPartyBoxes(grouped);
      setPartySize(parties[0]?.member_ids.length || 4);
    }
  }, [parties]);

  // Filtered members for unassigned list
  const unassignedMembers = useMemo(() => {
    return members.filter(m => {
      if (partyGuildFilter && m.guild_id !== partyGuildFilter) return false;
      return !partyBoxes.some(box => box.includes(m.id));
    });
  }, [members, partyGuildFilter, partyBoxes]);

  // Update boxes for current guild
  const setPartyBoxes = (boxes: string[][]) => {
    setAllPartyBoxes(prev => ({ ...prev, [currentGuildKey]: boxes }));
  };

  // Generate party boxes based on party size
  const handleApplyPartySize = () => {
    const filtered = members.filter(m => !partyGuildFilter || m.guild_id === partyGuildFilter);
    const count = Math.max(1, Math.ceil(filtered.length / Math.max(1, partySize)));
    setPartyBoxes(Array.from({ length: count }, () => []));
  };

  // Drag a member into a specific slot (handles inserts & reordering)
  const handleDropInSlot = (boxIndex: number, slotIndex: number, memberId: string) => {
    setAllPartyBoxes(prev => {
      const boxes = [...(prev[currentGuildKey] ?? [])];
      // Remove member from wherever they currently are
      const cleaned = boxes.map(box => box.filter(id => id !== memberId));
      // Insert at the target slot within the target box
      const target = [...(cleaned[boxIndex] ?? [])];
      target.splice(slotIndex, 0, memberId);
      // Truncate to partySize
      cleaned[boxIndex] = target.slice(0, partySize);
      return { ...prev, [currentGuildKey]: cleaned };
    });
  };

  // Double-click auto-assign: assign to first box with an empty slot
  const handleAutoAssign = (memberId: string) => {
    setAllPartyBoxes(prev => {
      const boxes = [...(prev[currentGuildKey] ?? [])];
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].length < partySize && !boxes[i].includes(memberId)) {
          const next = boxes.map(box => box.filter(id => id !== memberId));
          next[i] = [...next[i], memberId];
          return { ...prev, [currentGuildKey]: next };
        }
      }
      return prev;
    });
  };

  // Remove member from box (back to unassigned)
  const handleRemoveFromBox = (boxIndex: number, memberId: string) => {
    setAllPartyBoxes(prev => {
      const boxes = [...(prev[currentGuildKey] ?? [])];
      return { ...prev, [currentGuildKey]: boxes.map((box, i) => (i === boxIndex ? box.filter(id => id !== memberId) : box)) };
    });
  };

  // Drop member back to unassigned
  const handleDropUnassigned = (memberId: string) => {
    setAllPartyBoxes(prev => {
      const boxes = [...(prev[currentGuildKey] ?? [])];
      return { ...prev, [currentGuildKey]: boxes.map(box => box.filter(id => id !== memberId)) };
    });
  };

  // Save all party boxes for ALL guilds
  const handleSaveParties = async () => {
    setSavingParties(true);
    try {
      // Delete existing parties
      for (const p of parties) {
        await deleteParty(p.id).catch(() => {});
      }
      // Create new parties from all guild keys
      for (const [key, boxes] of Object.entries(allPartyBoxes)) {
        const guildId = key === "__all__" ? null : key;
        for (let i = 0; i < boxes.length; i++) {
          const box = boxes[i];
          if (box.length === 0) continue;
          const partyId = await createParty(`Party ${i + 1}`, guildId);
          for (const memberId of box) {
            await addMemberToParty(partyId, memberId).catch(() => {});
          }
        }
      }
      refreshParties();
      const totalBoxes = Object.values(allPartyBoxes).reduce((sum, b) => sum + b.filter(bx => bx.length > 0).length, 0);
      showToast("success", `${totalBoxes} parties saved`);
    } catch (err) {
      showToast("error", "Failed to save parties");
    } finally {
      setSavingParties(false);
    }
  };

  useEffect(() => {
    setGuildsLoading(true);
    fetchGuilds(serverId)
      .then(setGuilds)
      .catch(() => setGuilds([]))
      .finally(() => setGuildsLoading(false));
    if (serverId) {
      supabase.rpc("get_member_classes", { p_server_id: serverId })
        .then(({ data }) => { if (data) setClasses(data as string[]); }, () => setClasses([]));
      fetchStaticParties(serverId).then(setParties).catch(() => setParties([]));
    }
  }, [serverId]);

  // Prefill first guild in add-member form
  useEffect(() => {
    if (guilds.length > 0 && !addGuild) {
      setAddGuild(guilds[0].id);
    }
  }, [guilds]);

  const handleAddClass = async () => {
    const name = newClassName.trim();
    if (!name || classes.includes(name)) return;
    const updated = [...classes, name];
    setClasses(updated);
    setNewClassName("");
    if (serverId) {
      await supabase.rpc("set_member_classes", { p_server_id: serverId, p_classes: updated });
    }
  };

  const handleRemoveClass = async (name: string) => {
    const updated = classes.filter(c => c !== name);
    setClasses(updated);
    if (serverId) {
      await supabase.rpc("set_member_classes", { p_server_id: serverId, p_classes: updated });
    }
  };

  // Guild selection for add / bulk
  const [addGuild, setAddGuild] = useState<string>("");

  // Bulk add
  const [showBulkModal, setShowBulkModal] = useState(false);
  useEscapeKey(() => { setShowBulkModal(false); setBulkNames(""); setDeleteId(null); setDeleteConfirmName(""); });
  const [bulkNames, setBulkNames] = useState("");
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkGuild, setBulkGuild] = useState<string>("");
  const [searchText, setSearchText] = useState("");

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
  }, []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["members", serverId] });

  // Sort members by guild, then by name
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const ga = guilds.find(g => g.id === a.guild_id)?.name ?? "zzz";
      const gb = guilds.find(g => g.id === b.guild_id)?.name ?? "zzz";
      if (ga !== gb) return ga.localeCompare(gb);
      return a.name.localeCompare(b.name);
    });
  }, [members, guilds]);

  // Filter by search text
  const filteredMembers = useMemo(() => {
    if (!searchText.trim()) return sortedMembers;
    const q = searchText.toLowerCase();
    return sortedMembers.filter(m => m.name.toLowerCase().includes(q));
  }, [sortedMembers, searchText]);

  // Group members by guild (memoized)
  const guildGroups = useMemo(() => {
    const grouped = new Map<string, { guild: Guild | null; members: Member[] }>();
    for (const m of filteredMembers) {
      const guild = guilds.find(g => g.id === m.guild_id) ?? null;
      const key = guild?.id ?? "__noguild__";
      if (!grouped.has(key)) grouped.set(key, { guild, members: [] });
      grouped.get(key)!.members.push(m);
    }
    return [...grouped.values()].sort((a, b) => {
      if (!a.guild) return 1;
      if (!b.guild) return -1;
      return a.guild.name.localeCompare(b.guild.name);
    });
  }, [filteredMembers, guilds]);

  // Group guild groups into carousel pages (2 per page on lg+, 1 on mobile)
  const carouselPages = useMemo(() => {
    const pages: typeof guildGroups[] = [];
    for (let i = 0; i < guildGroups.length; i += itemsPerPage) {
      pages.push(guildGroups.slice(i, i + itemsPerPage));
    }
    return pages;
  }, [guildGroups, itemsPerPage]);

  // Clamp carousel page when page count changes
  useEffect(() => {
    setCarouselPage(p => p >= carouselPages.length && carouselPages.length > 0 ? carouselPages.length - 1 : p);
  }, [carouselPages.length]);

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name) return;

    // Prevent duplicates (case-insensitive)
    if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      showToast("error", `"${name}" already exists`);
      return;
    }

    setAdding(true);
    try {
      await upsertMember(name, addGuild || null, addCombatPower ? Number(addCombatPower) : null, addClass || null);
      setAddName("");
      setAddCombatPower("");
      setAddClass("");
      invalidate();
      showToast("success", `"${name}" added`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  };

  // Parse bulk names: deduplicate, split by newline
  const parsedNames = bulkNames
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  const existingNames = new Set(members.map((m) => m.name.toLowerCase()));
  const newNames = [...new Set(parsedNames.map((n) => n.toLowerCase()))]
    .filter((n) => !existingNames.has(n))
    .map((n) => parsedNames.find((p) => p.toLowerCase() === n)!);
  const alreadyExisting = [...new Set(parsedNames.map((n) => n.toLowerCase()))]
    .filter((n) => existingNames.has(n))
    .map((n) => parsedNames.find((p) => p.toLowerCase() === n)!);

  const handleBulkAdd = async () => {
    if (newNames.length === 0) return;
    setBulkAdding(true);
    let added = 0;
    try {
      added = await bulkAddMembers(newNames, bulkGuild || null);
    } catch { /* keep 0 */ }
    setBulkAdding(false);
    setShowBulkModal(false);
    setBulkNames("");
    setBulkGuild("");
    invalidate();
    const guildLabel = bulkGuild ? guilds.find(g => g.id === bulkGuild)?.name : "";
    showToast("success", `${added} member${added !== 1 ? "s" : ""} added${guildLabel ? ` to "${guildLabel}"` : ""}`);
  };

  const handleEdit = async (id: string) => {
    const name = editName.trim();
    const oldName = members.find((m) => m.id === id)?.name;
    if (!name || name === oldName) {
      setEditingId(null);
      return;
    }

    // Prevent renaming to an existing name
    if (members.some((m) => m.id !== id && m.name.toLowerCase() === name.toLowerCase())) {
      showToast("error", `"${name}" already exists`);
      return;
    }
    setSaving(true);
    try {
      await updateMemberName(id, name);
      setEditingId(null);
      invalidate();
      showToast("success", `"${oldName}" → "${name}"`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to update member");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const memberName = members.find((m) => m.id === id)?.name ?? "";
    setDeleting(true);
    try {
      await deleteMember(id);
      setDeleteId(null);
      setDeleteConfirmName("");
      invalidate();
      showToast("success", `"${memberName}" removed`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to delete member");
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (member: Member) => {
    setEditingId(member.id);
    setEditName(member.name);
  };

  if (isLoading || guildsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#18181b] border border-[#27272a]">
            <Users className="w-5 h-5 text-[#fafafa]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#fafafa]">Members</h2>
            <p className="text-sm text-[#a1a1aa]">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Add member form — inline in header */}
        {canManageRaidMembers && (
        <form
          onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
          className="flex flex-col sm:flex-row sm:items-center gap-1.5 w-full sm:w-auto"
        >
          {/* Row 1 (mobile): Name + CP. On desktop: flows inline */}
          <div className="flex sm:contents gap-1.5 w-full sm:w-auto">
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Member name..."
              ref={memberInputRef}
              className="w-[60%] sm:w-44 px-2 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition text-xs"
            />
            <input
              type="number"
              value={addCombatPower}
              onChange={(e) => setAddCombatPower(e.target.value)}
              placeholder="CP"
              className="w-[40%] sm:w-20 px-2 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] placeholder-[#52525b] text-xs focus:outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition"
            />
          </div>
          {/* Row 2 (mobile): actions. On desktop: flows inline */}
          <div className="flex flex-wrap items-center sm:contents gap-1.5">
            {classes.length > 0 && (
              <select
                value={addClass}
                onChange={(e) => setAddClass(e.target.value)}
                className="px-1.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-[10px] text-[#a1a1aa] outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition max-w-[80px] truncate"
              >
                <option value="">—</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {guilds.length > 0 && (
              <select
                value={addGuild}
                onChange={(e) => setAddGuild(e.target.value)}
                className="px-1.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-[10px] text-[#a1a1aa] outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition max-w-[100px] truncate"
              >
                <option value="">—</option>
                {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            <button
              type="submit"
              disabled={adding || !addName.trim()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#fafafa] text-[#09090b] text-xs font-medium hover:bg-[#e4e4e7] disabled:opacity-50 transition"
            >
              {adding ? (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <UserPlus className="w-3 h-3" />
              )}
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs font-medium hover:bg-[#27272a] hover:text-[#fafafa] transition"
            >
              <Upload className="w-3 h-3" />
              Bulk
            </button>
            {members.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const names = members.map(m => m.name).join(", ");
                  navigator.clipboard.writeText(names);
                  setToast({ type: "success", message: `${members.length} names copied!` });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs font-medium hover:bg-[#27272a] hover:text-[#fafafa] transition shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy All
              </button>
            )}
          </div>
        </form>
        )}

        {members.length > 0 && !canManageRaidMembers && (
          <button
            onClick={() => {
              const names = members.map(m => m.name).join(", ");
              navigator.clipboard.writeText(names);
              setToast({ type: "success", message: `${members.length} names copied!` });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs font-medium hover:bg-[#27272a] hover:text-[#fafafa] transition shrink-0 ml-auto"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy All
          </button>
        )}
      </div>

      {/* Toast notification */}
      {toast && <ToastMessage toast={toast} onDismiss={() => setToast(null)} />}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[#27272a] pb-2">
        <button
          onClick={() => setMembersTab("members")}
          className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition ${
            membersTab === "members"
              ? "bg-[#18181b] text-[#fafafa] border border-[#27272a] border-b-transparent"
              : "text-[#71717a] hover:text-[#d4d4d8]"
          }`}
        >
          <Users className="w-3.5 h-3.5 inline mr-1" />
          Members
        </button>
        <button
          onClick={() => setMembersTab("parties")}
          className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition ${
            membersTab === "parties"
              ? "bg-[#18181b] text-[#fafafa] border border-[#27272a] border-b-transparent"
              : "text-[#71717a] hover:text-[#d4d4d8]"
          }`}
        >
          <Shield className="w-3.5 h-3.5 inline mr-1" />
          Parties {parties.length > 0 && `(${parties.length})`}
        </button>

        {/* Classes — inline in tab bar */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-[#52525b]">Classes:</span>
          <span className="text-[9px] text-[#3f3f46] italic hidden sm:inline" title="Assign classes to personalize attendance records & leaderboard filters">personalize members</span>
          {classes.map(c => (
            <span key={c} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-[#18181b] text-[#a1a1aa] border border-[#27272a]">
              {c}
              <button onClick={() => handleRemoveClass(c)} className="text-[#52525b] hover:text-[#f87171]"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
          <input
            type="text"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddClass())}
            placeholder="Add class"
            className="w-24 px-2 py-0.5 bg-[#18181b] border border-[#27272a] rounded text-[10px] text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"
          />
          <button onClick={handleAddClass} disabled={!newClassName.trim()} className="p-0.5 text-[#52525b] hover:text-[#fafafa] disabled:opacity-30"><Plus className="w-3 h-3" /></button>
        </div>
      </div>

      {/* Parties Tab — Drag & Drop */}
      {membersTab === "parties" && canManageRaidMembers && (
      <div className="space-y-3">
        {/* Controls: guild filter + party size */}
        <div className="flex flex-wrap items-center gap-2">
          {guilds.length > 0 && (
            <select
              value={partyGuildFilter}
              onChange={(e) => setPartyGuildFilter(e.target.value)}
              className="px-2 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa] outline-none focus:border-[#52525b]"
            >
              <option value="">All guilds</option>
              {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-xs text-[#a1a1aa]">
            Party size:
            <input
              type="number"
              value={partySize}
              onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
              min={1}
              className="w-16 px-2 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] text-xs text-center focus:outline-none focus:border-[#52525b]"
            />
          </label>
          <button
            onClick={handleApplyPartySize}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition"
          >
            Generate Boxes
          </button>
          {partyBoxes.length > 0 && (
            <button
              onClick={handleSaveParties}
              disabled={savingParties}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#22c55e] text-[#09090b] hover:bg-[#16a34a] disabled:opacity-50 transition ml-auto"
            >
              {savingParties ? "Saving…" : "Save Parties"}
            </button>
          )}
        </div>

        {partyBoxes.length === 0 ? (
          <p className="text-sm text-[#71717a] text-center py-8">
            Select a guild, set a party size, then click "Generate Boxes" to start organizing members into parties.
          </p>
        ) : (
        <div className="flex gap-4">
          {/* Left: Unassigned members */}
          <div
            className="w-64 shrink-0 rounded-lg border border-dashed border-[#3f3f46] bg-[#09090b]/50 p-2 space-y-1 self-start"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const memberId = e.dataTransfer.getData("text/plain");
              if (memberId) handleDropUnassigned(memberId);
            }}
          >
            <p className="text-[10px] text-[#52525b] uppercase tracking-wider px-2 py-1">
              Unassigned ({unassignedMembers.length})
            </p>
            {/* Search in unassigned */}
            <div className="px-1">
              <input
                type="text"
                value={unassignedSearch}
                onChange={(e) => setUnassignedSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1 bg-[#09090b] border border-[#27272a] rounded text-[10px] text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"
              />
            </div>
            {unassignedMembers.length === 0 ? (
              <p className="text-[10px] text-[#3f3f46] text-center py-4">All members placed</p>
            ) : (
              unassignedMembers
                .filter(m => !unassignedSearch || m.name.toLowerCase().includes(unassignedSearch.toLowerCase()))
                .map(m => {
                  const g = guilds.find(g => g.id === m.guild_id);
                  const c = g ? guildColor(g.name) : null;
                  return (
                <div
                  key={m.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", m.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDoubleClick={() => handleAutoAssign(m.id)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#18181b] border border-[#27272a] text-xs text-[#d4d4d8] cursor-grab active:cursor-grabbing hover:border-[#52525b] transition"
                >
                  <span className="w-5 h-5 rounded bg-[#09090b] flex items-center justify-center text-[10px] text-[#71717a] font-bold shrink-0">
                    {m.name.charAt(0)}
                  </span>
                  <span className="truncate flex-1">{m.name}</span>
                  {g && c && (
                    <span className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border ${c.bg} ${c.text} ${c.border}`}>
                      <Shield className="w-2.5 h-2.5" />
                      {g.name}
                    </span>
                  )}
                </div>
                  );
                })
            )}
          </div>

          {/* Right: Party boxes */}
          <div className="flex-1 flex flex-wrap gap-2 items-start content-start">
            {partyBoxes.map((box, i) => {
              const boxMembers = box.map(id => members.find(m => m.id === id)).filter(Boolean) as Member[];
              // Show partySize slots per box — some filled, some empty
              const slots: (Member | null)[] = Array.from({ length: partySize }, (_, s) => boxMembers[s] ?? null);
              return (
                <div key={i} className="w-[200px] shrink-0 rounded-lg border border-[#27272a] bg-[#18181b]/30 p-2 space-y-0.5">
                  <p className="text-[10px] text-[#52525b] uppercase tracking-wider px-1 flex items-center justify-between">
                    <span>Party {i + 1} <span className="text-[#3f3f46]">({box.length}/{partySize})</span></span>
                    {box.length > 0 && (
                      <button
                        onClick={() => setAllPartyBoxes(prev => {
                          const boxes = [...(prev[currentGuildKey] ?? [])];
                          boxes[i] = [];
                          return { ...prev, [currentGuildKey]: boxes };
                        })}
                        className="text-[#52525b] hover:text-[#f87171] transition"
                        title="Clear this party"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </p>
                  {slots.map((m, s) =>
                    m ? (() => {
                      const g = guilds.find(g => g.id === m.guild_id);
                      const c = g ? guildColor(g.name) : null;
                      return (
                      <div
                        key={m.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", m.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.stopPropagation();
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const memberId = e.dataTransfer.getData("text/plain");
                          if (memberId) handleDropInSlot(i, s, memberId);
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#09090b] border border-[#27272a] text-xs text-[#d4d4d8] group cursor-grab active:cursor-grabbing"
                      >
                        <span className="w-4 h-4 rounded bg-[#18181b] flex items-center justify-center text-[9px] text-[#71717a] font-bold shrink-0">
                          {m.name.charAt(0)}
                        </span>
                        <span className="truncate flex-1">{m.name}</span>
                        {g && c && (
                          <span className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border ${c.bg} ${c.text} ${c.border}`}>
                            <Shield className="w-2.5 h-2.5" />
                            {g.name}
                          </span>
                        )}
                        <button
                          onClick={() => handleRemoveFromBox(i, m.id)}
                          className="opacity-0 group-hover:opacity-100 text-[#52525b] hover:text-[#f87171] transition"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      );
                    })() : (
                      <div
                        key={`empty-${s}`}
                        className="flex items-center justify-center px-2 py-2 rounded border border-dashed border-[#3f3f46] text-[11px] text-[#52525b] cursor-default min-h-[32px]"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const memberId = e.dataTransfer.getData("text/plain");
                          if (memberId) handleDropInSlot(i, s, memberId);
                        }}
                      >
                        <span className="text-[#27272a]">Drop slot</span>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>
      )}

      {/* Search (Members tab only) */}
      {membersTab === "members" && members.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search members..."
            className="w-full pl-10 pr-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] text-sm placeholder-[#71717a] focus:outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition"
          />
          {searchText && (
            <button onClick={() => setSearchText("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-[#fafafa]">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Member list */}
      {membersTab === "members" && (
        members.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-10 h-10 text-[#3f3f46] mx-auto mb-2" />
          <p className="text-[#71717a] text-sm">No members yet</p>
        </div>
      ) : (
        <>
        <div className="relative">
          {carouselPages.length > 1 && (<>
            <button onClick={() => setCarouselPage(p => p === 0 ? carouselPages.length - 1 : p - 1)} className="absolute left-0 top-0 bottom-0 z-10 px-2 flex items-center bg-[#09090b]/40 hover:bg-[#09090b]/60 transition -ml-2 rounded-l-xl">
              <ChevronLeft className="w-6 h-6 text-[#d4d4d8]" />
            </button>
            <button onClick={() => setCarouselPage(p => p >= carouselPages.length - 1 ? 0 : p + 1)} className="absolute right-0 top-0 bottom-0 z-10 px-2 flex items-center bg-[#09090b]/40 hover:bg-[#09090b]/60 transition -mr-2 rounded-r-xl">
              <ChevronRight className="w-6 h-6 text-[#d4d4d8]" />
            </button>
          </>)}
          <div className="overflow-x-hidden px-10"
            onTouchStart={e => handleSwipeStart(e.touches[0].clientX)}
            onTouchMove={e => handleSwipeMove(e.touches[0].clientX)}
            onTouchEnd={() => handleSwipeEnd(carouselPages.length)}
            onMouseDown={e => { e.preventDefault(); handleSwipeStart(e.clientX); }}
            onMouseMove={e => handleSwipeMove(e.clientX)}
            onMouseUp={() => handleSwipeEnd(carouselPages.length)}
            onMouseLeave={() => handleSwipeEnd(carouselPages.length)}
          >
            <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${carouselPage * 100}%)` }}>
              {carouselPages.map((pageGroups, pageIdx) => (
                <div key={pageIdx} className="w-full flex-shrink-0 px-2">
                  <div className="flex flex-col lg:flex-row gap-4">
                    {pageGroups.map(group => {
                      const c = group.guild ? guildColor(group.guild.name) : null;
                      return (
                        <div key={group.guild?.id ?? "noguild"} className="flex-1 min-w-0">
                          <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            {group.guild && c ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border border-[#27272a] bg-[#18181b] ${c.text}`}>
                                <Shield className="w-3 h-3" />
                                {group.guild.name}
                              </span>
                            ) : (
                              <span className="text-[#71717a]">No Guild</span>
                            )}
                            <span className="text-[#52525b] font-normal normal-case text-[11px]">
                              {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                            </span>
                          </h3>
                          <div className="space-y-1">
                            {group.members.map(member => (
                      <div
                        key={member.id}
                        className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-lg bg-[#09090b]/50 border border-[#27272a]/50 group"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#18181b] text-[#a1a1aa] font-bold text-sm shrink-0">
                          {member.name.charAt(0).toUpperCase()}
                        </div>

                        {editingId === member.id ? (
                          <div className="flex-1 min-w-0 flex gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && handleEdit(member.id)}
                              autoFocus
                              className="flex-1 px-2 py-1 bg-[#18181b] border border-[#3f3f46] rounded text-[#fafafa] text-sm focus:outline-none focus:ring-1 focus:ring-[#52525b]"
                            />
                            <button onClick={() => handleEdit(member.id)} disabled={saving} className="p-1 text-[#a1a1aa] hover:text-[#fafafa] transition"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1 text-[#a1a1aa] hover:text-[#fafafa] transition"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <Link to={`/members/${member.id}`} className="flex-1 min-w-0 text-[#fafafa] text-sm font-medium truncate hover:text-[#e4e4e7] transition">{member.name}</Link>
                        )}

                        {/* Class selector */}
                        {editingId !== member.id && classes.length > 0 && (
                          <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs shrink-0">
                            <select
                              value={member.class ?? ""}
                              onChange={async (e) => {
                                const cls = e.target.value || null;
                                try {
                                  await supabase.rpc("update_member_stats", { p_member_id: member.id, p_combat_power: member.combat_power ?? null, p_class: cls });
                                  invalidate();
                                } catch {}
                              }}
                              className="bg-[#18181b] border border-[#27272a] rounded px-1.5 py-1 text-xs text-[#a1a1aa] outline-none focus:border-[#52525b] max-w-[90px] truncate"
                            >
                                <option value="">—</option>
                                {classes.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                          </div>
                        )}

                        {editingId !== member.id && canManageRaidMembers && (
                          <button onClick={() => startEdit(member)} className="p-1.5 text-[#71717a] hover:text-[#fafafa] transition rounded shrink-0 sm:opacity-0 group-hover:opacity-100" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        )}

                        {editingId !== member.id && guilds.length > 0 && !isViewer && (
                          <select
                            value={member.guild_id ?? ""}
                            onChange={async (e) => {
                              const gid = e.target.value || null;
                              try { await setMemberGuild(member.id, gid); invalidate(); } catch (err: any) {
                                setToast({ type: "error", message: err?.message || "Failed to change guild" });
                              }
                            }}
                            className="bg-[#18181b] border border-[#27272a] rounded px-1.5 py-1 text-[10px] sm:text-xs text-[#a1a1aa] outline-none focus:border-[#52525b] transition max-w-[100px] truncate shrink-0"
                          >
                            <option value="">No guild</option>
                            {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        )}

                        {editingId !== member.id && canManageRaidMembers && (
                          <button onClick={() => { setDeleteId(member.id); setDeleteConfirmName(""); }} className="p-1.5 text-[#71717a] hover:text-red-400 transition rounded shrink-0" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {carouselPages.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {carouselPages.map((_, i) => (
              <button key={i} onClick={() => setCarouselPage(i)} className={`w-2 h-2 rounded-full transition ${i === carouselPage ? "bg-[#fafafa]" : "bg-[#3f3f46] hover:bg-[#52525b]"}`} />
            ))}
          </div>
        )}
        </>
      ))}

      {/* Bulk add modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowBulkModal(false); setBulkNames(""); }} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[#27272a] shrink-0">
              <h2 className="text-lg font-bold text-[#fafafa] flex items-center gap-2">
                <Upload className="w-5 h-5 text-[#a1a1aa]" />
                Bulk Add Members
              </h2>
              <button onClick={() => { setShowBulkModal(false); setBulkNames(""); }} className="text-[#a1a1aa] hover:text-[#fafafa] transition p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4 flex-1">
              <p className="text-[#a1a1aa] text-xs">
                Paste names from a screenshot — one per line, or comma-separated.
                Members already in the list will be skipped.
              </p>
              {guilds.length > 0 && (
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-[#71717a] shrink-0" />
                  <select
                    value={bulkGuild}
                    onChange={(e) => setBulkGuild(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#d4d4d8] outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition"
                  >
                    <option value="">No guild (assign later)</option>
                    {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}
              <textarea
                value={bulkNames}
                onChange={(e) => setBulkNames(e.target.value)}
                placeholder={"Astro\nShadowKing\nLunaStar"}
                rows={6}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] placeholder-[#71717a] focus:outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition text-sm resize-none"
              />

              {/* Preview */}
              {parsedNames.length > 0 && (
                <div className="space-y-2">
                  {alreadyExisting.length > 0 && (
                    <div>
                      <p className="text-xs text-[#71717a] mb-1 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-[#a1a1aa]" />
                        Already in ranks ({alreadyExisting.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {alreadyExisting.map((name) => (
                          <span key={name} className="px-2 py-0.5 rounded-md bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {newNames.length > 0 && (
                    <div>
                      <p className="text-xs text-[#71717a] mb-1 flex items-center gap-1">
                        <UserPlus className="w-3 h-3 text-[#a1a1aa]" />
                        New members ({newNames.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {newNames.map((name) => (
                          <span key={name} className="px-2 py-0.5 rounded-md bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {newNames.length === 0 && alreadyExisting.length > 0 && (
                    <p className="text-[#71717a] text-xs">All names already exist — nothing to add.</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 p-4 border-t border-[#27272a] shrink-0">
              <button
                onClick={() => { setShowBulkModal(false); setBulkNames(""); }}
                className="flex-1 py-2 rounded-lg bg-[#18181b] text-[#d4d4d8] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAdd}
                disabled={bulkAdding || newNames.length === 0}
                className="flex-1 py-2 rounded-lg bg-[#fafafa] text-[#09090b] text-sm font-medium hover:bg-[#e4e4e7] disabled:opacity-50 flex items-center justify-center gap-1.5 transition"
              >
                {bulkAdding ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : null}
                Add {newNames.length > 0 ? newNames.length : ""} Member{newNames.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (() => {
        const targetName = members.find((m) => m.id === deleteId)?.name ?? "";
        const confirmed = deleteConfirmName.trim().toLowerCase() === targetName.toLowerCase();
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setDeleteId(null); setDeleteConfirmName(""); }} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-xs shadow-2xl p-4 space-y-4">
            <p className="text-[#fafafa] text-sm text-center">
              Delete <span className="font-bold">{targetName}</span>? This will also remove their attendance records.
            </p>
            <div>
              <p className="text-[10px] text-[#71717a] mb-1.5 text-center">Type <span className="text-[#fafafa] font-mono">{targetName}</span> to confirm:</p>
              <input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={targetName}
                autoFocus
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-red-500/50 text-center"
                onKeyDown={(e) => { if (e.key === "Enter" && confirmed) handleDelete(deleteId); }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setDeleteId(null); setDeleteConfirmName(""); }}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-[#18181b] text-[#d4d4d8] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={deleting || !confirmed}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 transition"
              >
                {deleting ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
    </div>
  );
}

/** Auto-dismissing toast notification */
function ToastMessage({
  toast,
  onDismiss,
}: {
  toast: { type: "success" | "error"; message: string };
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const isSuccess = toast.type === "success";

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border ${
          isSuccess
            ? "bg-[#09090b] border-[#27272a] text-[#fafafa]"
            : "bg-[#09090b] border-[#27272a] text-[#fafafa]"
        }`}
      >
        {isSuccess ? (
          <CheckCircle className="w-5 h-5 shrink-0" />
        ) : (
          <AlertTriangle className="w-5 h-5 shrink-0" />
        )}
        <span className="text-sm font-medium">{toast.message}</span>
        <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100 transition">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
