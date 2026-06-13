import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useMembers } from "@/hooks/useMembers";
import { useAuth } from "@/contexts/AuthContext";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { updateMemberName, deleteMember, upsertMember, isSupabaseConfigured, fetchGuilds, setMemberGuild, bulkAddMembers, supabase, fetchStaticParties, createParty, deleteParty, addMemberToParty, removeMemberFromParty, type StaticParty, sendCpReminder, createProgressThread, addBackdatedCpUpdate, fetchMemberCpHistory, editCpUpdate, deleteCpUpdate } from "@/lib/supabase";
import { useServerId, useHasPermission } from "@/contexts/ServerContext";
import type { Guild, Member, CpUpdate } from "@/types";
import { Users, Plus, Pencil, Trash2, Loader2, X, Check, UserPlus, CheckCircle, AlertTriangle, Image, Upload, Copy, Shield, Search, ChevronLeft, ChevronRight, TrendingUp, ChevronUp, ChevronDown, Tag, Sword, Swords, ShieldHalf, ShieldCheck, Crosshair, Wand, Heart, Zap, Flame, Snowflake, Skull, Star, Crown, Anchor, Gavel, Axe, Target, Footprints, HandMetal, Megaphone, Calendar, Clock, Eye, EyeOff, Package } from "lucide-react";
import { guildColor } from "@/lib/constants";
import { GearTrackingTab } from "@/components/GearTrackingTab";

export function MembersView() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const canManageRaidMembers = useHasPermission("can_manage_members");
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();
  const { data: members = [], isLoading } = useMembers({ includeInactive: true });

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
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // CP Reminder
  const [cpReminding, setCpReminding] = useState(false);
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [demandConfirmText, setDemandConfirmText] = useState("");
  const [discordConfigs, setDiscordConfigs] = useState<any[]>([]);
  const [dcLoading, setDcLoading] = useState(false);

  // Backdated CP Update modal
  const [cpModalMember, setCpModalMember] = useState<Member | null>(null);
  const [cpModalCp, setCpModalCp] = useState("");
  const [cpModalDate, setCpModalDate] = useState("");
  const [cpModalError, setCpModalError] = useState("");
  const [cpModalSaving, setCpModalSaving] = useState(false);
  const [cpModalFocused, setCpModalFocused] = useState(false);

  // CP History modal
  const [historyMember, setHistoryMember] = useState<Member | null>(null);
  const [historyData, setHistoryData] = useState<CpUpdate[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingHistoryCp, setEditingHistoryCp] = useState("");
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);

  // Guilds
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(true);

  // Classes — fetched from server_classes table (shared across devices)
  const [classes, setClasses] = useState<string[]>([]);
  const [classIcons, setClassIcons] = useState<Record<string, string>>({});
  const [classColors, setClassColors] = useState<Record<string, string>>({});
  const [newClassName, setNewClassName] = useState("");
  const [newClassIcon, setNewClassIcon] = useState<string>("Sword");
  const [classSearch, setClassSearch] = useState("");
  const [progressSearch, setProgressSearch] = useState("");
  const progressGuildKey = `progress-guild-${serverId ?? "global"}`;
  const [progressGuildFilter, setProgressGuildFilter] = useState<string>(() => {
    try { return localStorage.getItem(progressGuildKey) || ""; } catch { return ""; }
  });
  const [showClassCreator, setShowClassCreator] = useState(false);

  // Sort state for guild member tables (persisted in localStorage)
  const sortKey = `members-sort-${serverId ?? "global"}`;
  const [sortColumn, setSortColumn] = useState<"name" | "cp" | "growth" | "score" | "status">(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(sortKey) || "{}");
      return saved.col || "name";
    } catch { return "name"; }
  });
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(sortKey) || "{}");
      return saved.dir || "asc";
    } catch { return "asc"; }
  });

  const toggleSort = (col: "name" | "cp" | "growth" | "score" | "status") => {
    if (sortColumn === col) {
      setSortDir(d => {
        const next = d === "asc" ? "desc" : "asc";
        localStorage.setItem(sortKey, JSON.stringify({ col, dir: next }));
        return next;
      });
    } else {
      const nextDir: "asc" | "desc" = col === "cp" || col === "growth" || col === "score" ? "desc" : "asc";
      setSortColumn(col);
      setSortDir(nextDir);
      localStorage.setItem(sortKey, JSON.stringify({ col, dir: nextDir }));
    }
  };

  // Fetch member scores & growth from RPC
  const { data: memberStats = {} } = useQuery<Record<string, { score: number; growth: number }>>({
    queryKey: ["memberStats", serverId],
    queryFn: async () => {
      if (!serverId || !configured) return {};
      const { data, error } = await supabase.rpc("get_member_scores", { p_server_id: serverId });
      if (error || !data) return {};
      const map: Record<string, { score: number; growth: number }> = {};
      (data as { member_id: string; score: number; cp_growth_30d: number }[]).forEach(r => {
        map[r.member_id] = { score: r.score, growth: r.cp_growth_30d ?? 0 };
      });
      return map;
    },
    staleTime: 120_000,
    enabled: !!serverId && configured,
  });

  // Fetch classes from DB
  useEffect(() => {
    if (!serverId) return;
    supabase.from("server_classes")
      .select("name, icon, color")
      .eq("server_id", serverId)
      .order("name")
      .then(({ data }) => {
        if (data) {
          setClasses(data.map((r: any) => r.name));
          const icons: Record<string, string> = {};
          const colors: Record<string, string> = {};
          data.forEach((r: any) => { icons[r.name] = r.icon; colors[r.name] = r.color; });
          setClassIcons(icons);
          setClassColors(colors);
        }
      });
  }, [serverId]);

  // Auto-pick first unused color
  const CLASS_COLORS = [
    "#f87171", "#fb923c", "#fbbf24", "#a3e635", "#34d399",
    "#22d3ee", "#60a5fa", "#818cf8", "#c084fc", "#e879f9",
    "#f472b6", "#a1a1aa", "#fafafa", "#f59e0b", "#ef4444",
    "#14b8a6", "#6366f1", "#ec4899", "#84cc16",
  ];
  const nextColor = useMemo(() => {
    const used = new Set(Object.values(classColors));
    return CLASS_COLORS.find(c => !used.has(c)) || CLASS_COLORS[0];
  }, [classColors]);
  const [newClassColor, setNewClassColor] = useState<string>(nextColor);
  useEffect(() => { setNewClassColor(nextColor); }, [nextColor]);

  // Icon palette for classes
  const CLASS_ICONS: { name: string; icon: React.ElementType; label: string }[] = [
    { name: "Sword", icon: Sword, label: "Sword / Greatsword" },
    { name: "Swords", icon: Swords, label: "Dual Daggers / Blades" },
    { name: "HandMetal", icon: HandMetal, label: "Knuckles / Fist" },
    { name: "ShieldIcon", icon: Shield, label: "Tank / Defense" },
    { name: "ShieldHalf", icon: ShieldHalf, label: "Sword & Shield" },
    { name: "ShieldCheck", icon: ShieldCheck, label: "Battle Shield / Paladin" },
    { name: "Gavel", icon: Gavel, label: "Hammer / Warhammer" },
    { name: "Axe", icon: Axe, label: "Axe / Great Axe" },
    { name: "Crosshair", icon: Crosshair, label: "Ranger / Crossbow" },
    { name: "Target", icon: Target, label: "Bow / Marksman" },
    { name: "Wand", icon: Wand, label: "Staff / Battlestaff" },
    { name: "Heart", icon: Heart, label: "Healer / Support" },
    { name: "Zap", icon: Zap, label: "Lightning / Elemental" },
    { name: "Flame", icon: Flame, label: "Fire Mage / Pyro" },
    { name: "Snowflake", icon: Snowflake, label: "Ice Mage / Cryo" },
    { name: "SkullIcon", icon: Skull, label: "Dark / Necromancer" },
    { name: "Star", icon: Star, label: "Rare / Special" },
    { name: "Crown", icon: Crown, label: "Leader / Officer" },
    { name: "Anchor", icon: Anchor, label: "Defense / Anchor" },
    { name: "Footprints", icon: Footprints, label: "Scout / Rogue" },
  ];

  const getClassIcon = (iconName: string) => {
    const entry = CLASS_ICONS.find(c => c.name === iconName);
    return entry ? entry.icon : Tag;
  };

  // Static parties — drag & drop UI
  const [parties, setParties] = useState<StaticParty[]>([]);
  const [partyGuildFilter, setPartyGuildFilter] = useState<string>("");
  const [partySize, setPartySize] = useState<number>(4);
  const [allPartyBoxes, setAllPartyBoxes] = useState<Record<string, string[][]>>({});
  const [unassignedSearch, setUnassignedSearch] = useState("");
  const [savingParties, setSavingParties] = useState(false);
  const tabParam = searchParams.get("tab");
  const [membersTab, setMembersTabState] = useState<"members" | "progress" | "gear" | "parties" | "classes">(() => {
    if (tabParam === "members" || tabParam === "progress" || tabParam === "gear" || tabParam === "parties" || tabParam === "classes") {
      return tabParam;
    }
    return isViewer ? "progress" : "members";
  });

  const setMembersTab = (tab: "members" | "progress" | "gear" | "parties" | "classes") => {
    setMembersTabState(tab);
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  // Guild order for Progress tab (persisted in localStorage per server)
  const guildOrderKey = `guild-order-${serverId ?? "global"}`;
  const [guildOrder, setGuildOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(guildOrderKey) || "[]"); } catch { return []; }
  });
  const saveGuildOrder = (order: string[]) => {
    setGuildOrder(order);
    localStorage.setItem(guildOrderKey, JSON.stringify(order));
  };
  // Auto-populate order from current guilds if not yet saved
  const ensureGuildOrder = (): string[] => {
    if (guildOrder.length > 0) return guildOrder;
    const ids = guilds.map(g => g.id);
    if (ids.length === 0) return [];
    saveGuildOrder(ids);
    return ids;
  };
  const moveGuildUp = (guildId: string) => {
    const order = ensureGuildOrder();
    const idx = order.indexOf(guildId);
    if (idx <= 0) return;
    const next = [...order];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    saveGuildOrder(next);
  };
  const moveGuildDown = (guildId: string) => {
    const order = ensureGuildOrder();
    const idx = order.indexOf(guildId);
    if (idx < 0 || idx >= order.length - 1) return;
    const next = [...order];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    saveGuildOrder(next);
  };

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
    if (!name || !serverId || classes.includes(name)) return;
    const icon = newClassIcon;
    const color = newClassColor;
    // Optimistic UI
    setClasses(prev => [...prev, name]);
    setClassIcons(prev => ({ ...prev, [name]: icon }));
    setClassColors(prev => ({ ...prev, [name]: color }));
    setNewClassName(""); setNewClassIcon("Sword");
    // Persist
    const { error } = await supabase.from("server_classes").insert({ server_id: serverId, name, icon, color });
    if (error) {
      setClasses(prev => prev.filter(c => c !== name));
      console.error("Failed to add class:", error);
    }
  };

  const handleRemoveClass = async (name: string) => {
    if (!serverId) return;
    setClasses(prev => prev.filter(c => c !== name));
    const { error } = await supabase.from("server_classes").delete().eq("server_id", serverId).eq("name", name);
    if (error) console.error("Failed to remove class:", error);
  };

  // Class delete confirmation
  const [deleteClassName, setDeleteClassName] = useState<string | null>(null);
  const [deleteClassConfirmText, setDeleteClassConfirmText] = useState("");

  const confirmDeleteClass = async () => {
    if (!deleteClassName) return;
    await handleRemoveClass(deleteClassName);
    setDeleteClassName(null);
    setDeleteClassConfirmText("");
  };

  // Guild selection for add / bulk
  const [addGuild, setAddGuild] = useState<string>("");

  // Bulk add
  const [showBulkModal, setShowBulkModal] = useState(false);
  useEscapeKey(() => { setShowBulkModal(false); setBulkNames(""); setDeleteId(null); setDeleteConfirmName(""); });

  useEscapeKey(() => { setCpModalMember(null); setCpModalFocused(false); }, !!cpModalMember);
  useEscapeKey(() => { setHistoryMember(null); setEditingHistoryId(null); setDeletingHistoryId(null); }, !!historyMember);
  useEscapeKey(() => { setDeleteClassName(null); setDeleteClassConfirmText(""); }, !!deleteClassName);
  const [bulkNames, setBulkNames] = useState("");
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkGuild, setBulkGuild] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState<"guild" | "class">("guild");

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
  }, []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["members", serverId] });

  // ── Demand CP Update ──────────────────────────────────────
  const startDemandConfirm = async () => {
    setDemandModalOpen(true);
    setDemandConfirmText("");
    setDcLoading(true);
    try {
      // Fetch discord configs to check which ones have progress_channel_id
      const { data } = await supabase
        .from("discord_configs")
        .select("id,label,discord_guild_id,progress_channel_id,notification_prefix")
        .eq("raidscout_server_id", serverId);
      setDiscordConfigs(data || []);
    } catch {
      setDiscordConfigs([]);
    } finally {
      setDcLoading(false);
    }
  };
  const cancelDemandConfirm = () => {
    setDemandModalOpen(false);
    setDemandConfirmText("");
    setDiscordConfigs([]);
  };
  const executeDemandCpUpdate = async () => {
    if (!serverId || cpReminding) return;
    setDemandModalOpen(false);
    setDemandConfirmText("");
    setDiscordConfigs([]);
    setCpReminding(true);
    try {
      // First try creating a progress thread
      const threadResult = await createProgressThread(serverId);
      if (threadResult.ok) {
        const s = threadResult.succeeded ?? 1;
        const f = threadResult.failed ?? 0;
        showToast("success", `Thread${s > 1 ? "s" : ""} created in ${s} server${s > 1 ? "s" : ""}${f > 0 ? ` (${f} failed)` : ""}`);
      } else if (threadResult.reason === "No progress channel configured") {
        // Fall back to sending a general reminder via Discord notify
        const r = await sendCpReminder(serverId);
        if (r.ok) {
          showToast("success", "CP update reminder sent to Discord!");
        } else {
          showToast("error", r.reason || "Failed to send reminder");
        }
      } else {
        showToast("error", threadResult.reason || "Failed to create thread");
      }
    } catch (e) {
      showToast("error", "Failed to send reminder");
    } finally {
      setCpReminding(false);
    }
  };

  // ── Backdated CP Update Modal ─────────────────────────────
  const openCpModal = (member: Member) => {
    setCpModalMember(member);
    setCpModalCp(member.combat_power?.toString() ?? "");
    setCpModalDate(new Date().toISOString().slice(0, 10)); // today
    setCpModalError("");
    setCpModalFocused(false);
  };

  const handleBackdatedCpSubmit = async () => {
    if (!cpModalMember || !serverId) return;
    const cp = parseInt(cpModalCp, 10);
    if (!cpModalCp.trim() || isNaN(cp) || cp < 1) {
      setCpModalError("Please enter a valid CP value.");
      return;
    }
    if (!cpModalDate) {
      setCpModalError("Please select a date.");
      return;
    }
    const selectedDate = new Date(cpModalDate + "T12:00:00");
    if (selectedDate > new Date()) {
      setCpModalError("Date cannot be in the future.");
      return;
    }
    setCpModalSaving(true);
    setCpModalError("");
    try {
      await addBackdatedCpUpdate({
        server_id: serverId,
        member_id: cpModalMember.id,
        player_name: cpModalMember.name,
        new_cp: cp,
        submitted_at: selectedDate.toISOString(),
      });
      showToast("success", `CP updated for ${cpModalMember.name}`);
      setCpModalMember(null);
      invalidate();
    } catch (e) {
      setCpModalError(e instanceof Error ? e.message : "Failed to update CP");
    } finally {
      setCpModalSaving(false);
    }
  };

  // ── CP History Modal ──────────────────────────────────────
  const openHistory = async (member: Member) => {
    setHistoryMember(member);
    setHistoryLoading(true);
    setEditingHistoryId(null);
    setDeletingHistoryId(null);
    try {
      const data = await fetchMemberCpHistory(member.id);
      setHistoryData(data);
    } catch {
      setHistoryData([]);
      showToast("error", "Failed to load CP history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleHistoryEdit = async (updateId: string) => {
    if (!historyMember) return;
    const cp = parseInt(editingHistoryCp, 10);
    if (!editingHistoryCp.trim() || isNaN(cp) || cp < 1) {
      showToast("error", "Invalid CP value");
      return;
    }
    try {
      await editCpUpdate(updateId, cp, historyMember.id);
      showToast("success", "CP entry updated");
      setEditingHistoryId(null);
      // Refresh history
      const data = await fetchMemberCpHistory(historyMember.id);
      setHistoryData(data);
      invalidate();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to edit entry");
    }
  };

  const handleHistoryDelete = async (updateId: string) => {
    if (!historyMember) return;
    try {
      await deleteCpUpdate(updateId, historyMember.id);
      showToast("success", "CP entry deleted");
      setDeletingHistoryId(null);
      // Refresh history
      const data = await fetchMemberCpHistory(historyMember.id);
      setHistoryData(data);
      invalidate();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to delete entry");
    }
  };

  const fmtDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

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

  // Group members by class (for class-based sort mode)
  const classGroups = useMemo(() => {
    const grouped = new Map<string, { className: string | null; members: Member[] }>();
    for (const m of filteredMembers) {
      const key = m.class || "__unassigned__";
      if (!grouped.has(key)) grouped.set(key, { className: m.class ?? null, members: [] });
      grouped.get(key)!.members.push(m);
    }
    return [...grouped.values()].sort((a, b) => {
      if (!a.className) return 1;
      if (!b.className) return -1;
      return a.className.localeCompare(b.className);
    });
  }, [filteredMembers]);

  // Active groups based on sort mode
  const activeGroups = sortMode === "class" ? classGroups : guildGroups;

  // Sort guild groups by custom order (Progress tab), fallback to alphabetical
  const sortedGuildGroups = useMemo(() => {
    if (guildOrder.length === 0) return guildGroups;
    const orderMap = new Map(guildOrder.map((id, i) => [id, i]));
    return [...guildGroups].sort((a, b) => {
      const aKey = a.guild?.id ?? "__noguild__";
      const bKey = b.guild?.id ?? "__noguild__";
      const aIdx = orderMap.get(aKey) ?? 999;
      const bIdx = orderMap.get(bKey) ?? 999;
      return aIdx - bIdx;
    });
  }, [guildGroups, guildOrder]);

  // Group guild groups into carousel pages (2 per page on lg+, 1 on mobile)
  const carouselPages = useMemo(() => {
    const pages: { guild: Guild | null; members: Member[] }[][] = [];
    for (let i = 0; i < guildGroups.length; i += itemsPerPage) {
      pages.push(guildGroups.slice(i, i + itemsPerPage));
    }
    return pages;
  }, [guildGroups, itemsPerPage]);

  // Class-based carousel pages
  const classCarouselPages = useMemo(() => {
    const pages: { className: string | null; members: Member[] }[][] = [];
    for (let i = 0; i < classGroups.length; i += itemsPerPage) {
      pages.push(classGroups.slice(i, i + itemsPerPage));
    }
    return pages;
  }, [classGroups, itemsPerPage]);

  // Unified type for rendering
  type GroupRow = { guild: Guild | null; members: Member[] } | { className: string | null; members: Member[] };
  const activeCarouselPages: GroupRow[][] = sortMode === "class" ? classCarouselPages : carouselPages;

  // Clamp carousel page when page count changes
  useEffect(() => {
    const len = activeCarouselPages.length;
    setCarouselPage(p => p >= len && len > 0 ? len - 1 : p);
  }, [activeCarouselPages.length]);

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

        {/* Add member — button only, opens modal */}
        {canManageRaidMembers && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#fafafa] text-[#09090b] text-xs font-medium hover:bg-[#e4e4e7] transition"
          >
            <UserPlus className="w-3 h-3" />
            Add Member
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
        {!isViewer && (
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
        )}
        <button
          onClick={() => setMembersTab("progress")}
          className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition ${
            membersTab === "progress"
              ? "bg-[#18181b] text-[#fafafa] border border-[#27272a] border-b-transparent"
              : "text-[#71717a] hover:text-[#d4d4d8]"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 inline mr-1" />
          Progress{isViewer ? " (View Only)" : ""}
        </button>
        <button
          onClick={() => setMembersTab("gear")}
          className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition ${
            membersTab === "gear"
              ? "bg-[#18181b] text-[#fafafa] border border-[#27272a] border-b-transparent"
              : "text-[#71717a] hover:text-[#d4d4d8]"
          }`}
        >
          <Package className="w-3.5 h-3.5 inline mr-1" />
          Gear Tracking
        </button>
        {!isViewer && canManageRaidMembers && (
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
        )}
        {!isViewer && canManageRaidMembers && (
        <button
          onClick={() => setMembersTab("classes")}
          className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition ${
            membersTab === "classes"
              ? "bg-[#18181b] text-[#fafafa] border border-[#27272a] border-b-transparent"
              : "text-[#71717a] hover:text-[#d4d4d8]"
          }`}
        >
          <Tag className="w-3.5 h-3.5 inline mr-1" />
          Classes {classes.length > 0 && `(${classes.length})`}
        </button>
        )}
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
                    {m.class && classIcons[m.class] ? (() => { const CIcon = getClassIcon(classIcons[m.class]); const color = classColors[m.class] || "#a1a1aa"; return <CIcon className="w-3 h-3" style={{ color }} />; })() : m.name.charAt(0)}
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
                          {m.class && classIcons[m.class] ? (() => { const CIcon = getClassIcon(classIcons[m.class]); const color = classColors[m.class] || "#a1a1aa"; return <CIcon className="w-2.5 h-2.5" style={{ color }} />; })() : m.name.charAt(0)}
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

      {/* Progress Tab — member CP & growth overview */}
      {membersTab === "progress" && (
      <div className="space-y-4">
        {isViewer && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span>View Only — CP updates are submitted via Discord using <code className="px-1 py-0.5 bg-blue-500/10 rounded text-blue-300">!updatestats</code> in the progress channel.</span>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm text-[#a1a1aa] flex-1">
            Track member combat power growth and manage profiles.
          </p>
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
            <input
              type="text"
              value={progressSearch}
              onChange={(e) => setProgressSearch(e.target.value)}
              placeholder="Search members..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
            />
          </div>
          {guilds.length > 0 && (
            <select
              value={progressGuildFilter}
              onChange={(e) => { setProgressGuildFilter(e.target.value); localStorage.setItem(progressGuildKey, e.target.value); }}
              className="px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa] outline-none focus:border-[#52525b] transition"
            >
              <option value="">All Guilds</option>
              {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          {canManageRaidMembers && members.length > 0 && (
            <button
              type="button"
              onClick={startDemandConfirm}
              disabled={cpReminding}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-600/30 text-green-400 text-xs font-medium hover:bg-green-600/30 disabled:opacity-50 transition shrink-0"
            >
              {cpReminding ? (
                <span className="w-3 h-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
              ) : (
                <Megaphone className="w-3.5 h-3.5" />
              )}
              Demand Combat Power Update Now
            </button>
          )}
        </div>

        {(() => {
          const displayGroups = progressGuildFilter
            ? sortedGuildGroups.filter(g => g.guild?.id === progressGuildFilter)
            : sortedGuildGroups;
          return displayGroups.length === 0 ? (
            <p className="text-sm text-[#52525b] text-center py-8">No members yet. Add members to start tracking CP.</p>
          ) : (
            displayGroups.map((group, gi) => (
            <div key={group.guild?.id ?? "__noguild__"} className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#27272a] flex items-center gap-2">
                {group.guild ? (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${(() => { const c = guildColor(group.guild!.name); return `${c.bg} ${c.text} ${c.border}`; })()}`}>
                    <Shield className="w-3 h-3" />
                    {group.guild.name}
                  </span>
                ) : (
                  <span className="text-[11px] text-[#52525b] font-medium">No Guild</span>
                )}
                <span className="text-[10px] text-[#52525b]">{group.members.length} member{group.members.length !== 1 ? "s" : ""}</span>
                {group.guild && (
                  <div className="flex items-center gap-0.5 ml-auto">
                    <button onClick={() => moveGuildUp(group.guild!.id)} disabled={gi === 0} className="p-0.5 rounded text-[#52525b] hover:text-[#fafafa] disabled:opacity-20 transition" title="Move up"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => moveGuildDown(group.guild!.id)} disabled={gi === sortedGuildGroups.filter(g => g.guild).length - 1} className="p-0.5 rounded text-[#52525b] hover:text-[#fafafa] disabled:opacity-20 transition" title="Move down"><ChevronDown className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] text-[#71717a] uppercase tracking-wider border-b border-[#27272a]/50">
                      <th className="text-left py-2.5 px-3 w-8"></th>
                      <th className="text-left py-2.5 px-2 w-[47%] cursor-pointer select-none hover:text-[#a1a1aa] transition" onClick={() => toggleSort("name")}>
                        <span className="inline-flex items-center gap-1">
                          Member
                          {sortColumn === "name" && (
                            sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          )}
                        </span>
                      </th>
                      <th className="text-right py-2.5 px-2 w-[9%] cursor-pointer select-none hover:text-[#a1a1aa] transition" onClick={() => toggleSort("cp")}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          <span className={sortColumn === "cp" ? "text-[#fafafa]" : ""}>Current CP</span>
                          {sortColumn === "cp" && (
                            sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          )}
                        </span>
                      </th>
                      <th className="text-right py-2.5 px-2 w-[7%] cursor-pointer select-none hover:text-[#a1a1aa] transition" onClick={() => toggleSort("growth")} title="30d CP growth">
                        <span className="inline-flex items-center gap-1 justify-end">
                          <span className={sortColumn === "growth" ? "text-[#fafafa]" : ""}>30d Growth</span>
                          {sortColumn === "growth" && (
                            sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          )}
                        </span>
                      </th>
                      <th className="text-center py-2.5 px-1 w-[7%] cursor-pointer select-none hover:text-[#a1a1aa] transition" onClick={() => toggleSort("score")} title="Sort by performance score">
                        <span className="inline-flex items-center gap-1 justify-center">
                          Score
                          {sortColumn === "score" && (
                            sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          )}
                        </span>
                      </th>
                      <th className="text-center py-2.5 px-2 w-[5%] cursor-pointer select-none hover:text-[#a1a1aa] transition" onClick={() => toggleSort("status")} title="Sort by CP status">
                        <span className="inline-flex items-center gap-1 justify-center">
                          Status
                          {sortColumn === "status" && (
                            sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          )}
                        </span>
                      </th>
                      {canManageRaidMembers && <th className="text-right py-2.5 px-3 w-[8%]"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filtered = group.members.filter(m => !progressSearch.trim() || m.name.toLowerCase().includes(progressSearch.toLowerCase()));
                      const sorted = [...filtered].sort((a, b) => {
                        const dir = sortDir === "asc" ? 1 : -1;
                        if (sortColumn === "name") return dir * a.name.localeCompare(b.name);
                        if (sortColumn === "cp") {
                          if (a.combat_power == null && b.combat_power == null) return 0;
                          if (a.combat_power == null) return 1;
                          if (b.combat_power == null) return -1;
                          return dir * ((a.combat_power ?? 0) - (b.combat_power ?? 0));
                        }
                        if (sortColumn === "growth") {
                          const aG = memberStats[a.id]?.growth ?? -999999;
                          const bG = memberStats[b.id]?.growth ?? -999999;
                          if (aG !== bG) return dir * (aG - bG);
                          return a.name.localeCompare(b.name);
                        }
                        if (sortColumn === "score") {
                          const aScore = memberStats[a.id]?.score ?? -1;
                          const bScore = memberStats[b.id]?.score ?? -1;
                          if (aScore !== bScore) return dir * (aScore - bScore);
                          return a.name.localeCompare(b.name);
                        }
                        if (sortColumn === "status") {
                          const aHas = a.combat_power != null ? 1 : 0;
                          const bHas = b.combat_power != null ? 1 : 0;
                          if (aHas !== bHas) return dir * (bHas - aHas);
                          return a.name.localeCompare(b.name);
                        }
                        return 0;
                      });
                      return sorted.map((m, i) => (
                      <tr key={m.id} className="border-b border-[#27272a]/30 hover:bg-[#09090b]/30 transition">
                        <td className="py-2.5 px-3 text-[10px] text-[#52525b] font-mono align-middle">{i + 1}</td>
                        <td className="py-2.5 px-2 align-middle">
                          <Link to={`/members/${m.id}`} className="flex items-center gap-2 text-[#fafafa] hover:text-[#e4e4e7] transition text-sm -m-2 p-2 rounded">
                            {m.class && classIcons[m.class] && (() => { const CIcon = getClassIcon(classIcons[m.class]); const color = classColors[m.class] || "#a1a1aa"; return <CIcon className="w-3.5 h-3.5 shrink-0" style={{ color }} />; })()}
                            <span>{m.name}</span>
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-sm align-middle">
                          <span className={m.combat_power != null ? "text-[#a1a1aa]" : "text-[#52525b]"}>
                            {m.combat_power != null ? m.combat_power.toLocaleString() : "—"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs align-middle">
                          {memberStats[m.id]?.growth != null && memberStats[m.id].growth !== 0 && m.combat_power != null ? (() => {
                            const base = m.combat_power - memberStats[m.id].growth;
                            if (base <= 0) return <span className="text-[#3f3f46]">—</span>;
                            const pct = (memberStats[m.id].growth / base) * 100;
                            const positive = memberStats[m.id].growth > 0;
                            return (
                              <span className={positive ? "text-green-400" : "text-red-400"}>
                                {positive ? "+" : ""}{memberStats[m.id].growth.toLocaleString()}
                                <span className="text-[#52525b] ml-0.5">({positive ? "+" : ""}{pct.toFixed(1)}%)</span>
                              </span>
                            );
                          })() : (
                            <span className="text-[#3f3f46]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-1 text-center font-mono text-xs align-middle">
                          {memberStats[m.id]?.score != null ? (
                            <span className={`font-bold ${memberStats[m.id].score >= 75 ? "text-green-400" : memberStats[m.id].score >= 50 ? "text-amber-400" : memberStats[m.id].score > 0 ? "text-red-400" : "text-[#52525b]"}`}>{memberStats[m.id].score}</span>
                          ) : (
                            <span className="text-[#3f3f46]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center align-middle">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${m.combat_power != null ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-[#3f3f46]"}`} title={m.combat_power != null ? "CP updated" : "CP not set"} />
                        </td>
                        {canManageRaidMembers && (
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => openHistory(m)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#09090b] border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#52525b] transition whitespace-nowrap"
                                title="View CP history & profile"
                              >
                                <Clock className="w-3 h-3 shrink-0" />
                                History
                              </button>
                              <button
                                type="button"
                                onClick={() => openCpModal(m)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#09090b] border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#52525b] transition whitespace-nowrap"
                              >
                                <Calendar className="w-3 h-3 shrink-0" />
                                Add CP
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )));
        })()}

        <p className="text-[10px] text-[#52525b] text-center">
          Members update their CP via Discord using <code className="px-1 py-0.5 bg-[#18181b] rounded text-[#a1a1aa]">!updatestats PlayerName CP</code>
        </p>

        {/* ── Backdated CP Update Modal ── */}
        {cpModalMember && canManageRaidMembers && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setCpModalMember(null)}>
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-[#fafafa]">Backdated CP Update</h3>
                <button onClick={() => setCpModalMember(null)} className="ml-auto p-1 rounded text-[#52525b] hover:text-[#fafafa] transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider block mb-1">Member</label>
                  <p className="text-sm text-[#fafafa] font-medium">{cpModalMember.name}</p>
                </div>

                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider block mb-1">Combat Power</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cpModalFocused ? cpModalCp : (cpModalCp && !isNaN(parseInt(cpModalCp, 10)) ? parseInt(cpModalCp, 10).toLocaleString() : cpModalCp)}
                    onChange={(e) => { setCpModalCp(e.target.value.replace(/[,\s]/g, "")); setCpModalError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleBackdatedCpSubmit(); }}
                    onFocus={() => setCpModalFocused(true)}
                    onBlur={() => setCpModalFocused(false)}
                    placeholder="e.g. 12,500"
                    className="w-full px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider block mb-1">Date (past week)</label>
                  <input
                    type="date"
                    value={cpModalDate}
                    onChange={(e) => { setCpModalDate(e.target.value); setCpModalError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleBackdatedCpSubmit(); }}
                    max={new Date().toISOString().slice(0, 10)}
                    className="w-full px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b] [color-scheme:dark]"
                  />
                  <p className="text-[9px] text-[#52525b] mt-1">You can update CP anytime — no weekly limit.</p>
                </div>

                {cpModalError && (
                  <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{cpModalError}</p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCpModalMember(null)}
                    className="flex-1 px-3 py-2 rounded-lg bg-[#27272a] text-[#a1a1aa] text-xs font-medium hover:bg-[#3f3f46] transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleBackdatedCpSubmit}
                    disabled={cpModalSaving}
                    className="flex-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                  >
                    {cpModalSaving ? (
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Save Update
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CP History Modal ── */}
        {historyMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setHistoryMember(null); setEditingHistoryId(null); setDeletingHistoryId(null); }}>
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-4 shrink-0">
                <Clock className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-[#fafafa]">{historyMember.name} — CP History</h3>
                <button onClick={() => { setHistoryMember(null); setEditingHistoryId(null); setDeletingHistoryId(null); }} className="ml-auto p-1 rounded text-[#52525b] hover:text-[#fafafa] transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-[#52525b] animate-spin" />
                </div>
              ) : historyData.length === 0 ? (
                <p className="text-sm text-[#52525b] text-center py-8">No CP history yet.</p>
              ) : (
                <div className="overflow-y-auto flex-1 -mx-2 px-2 space-y-1">
                  {historyData.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#09090b] border border-[#27272a]/40 group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#52525b] font-mono">{fmtDate(entry.submitted_at)}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${entry.status === "approved" ? "bg-green-500/10 text-green-400" : entry.status === "rejected" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                            {entry.status}
                          </span>
                        </div>
                        {editingHistoryId === entry.id ? (
                          <div className="flex items-center gap-1 mt-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={editingHistoryCp}
                              onChange={(e) => setEditingHistoryCp(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleHistoryEdit(entry.id); if (e.key === "Escape") setEditingHistoryId(null); }}
                              className="w-24 px-2 py-1 bg-[#18181b] border border-[#52525b] rounded text-xs text-[#fafafa] text-right focus:outline-none focus:border-[#a1a1aa]"
                              autoFocus
                            />
                            <button onClick={() => handleHistoryEdit(entry.id)} className="px-2 py-1 rounded text-[10px] bg-green-600 text-white hover:bg-green-500 transition">Save</button>
                            <button onClick={() => setEditingHistoryId(null)} className="px-2 py-1 rounded text-[10px] bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">Cancel</button>
                          </div>
                        ) : (
                          <p className="text-sm text-[#fafafa] mt-0.5">
                            {entry.old_cp != null ? (
                              <>
                                <span className="text-[#52525b]">{entry.old_cp.toLocaleString()}</span>
                                <span className="mx-1 text-[#52525b]">→</span>
                              </>
                            ) : null}
                            <span className="font-medium">{entry.new_cp.toLocaleString()}</span>
                          </p>
                        )}
                      </div>
                      {deletingHistoryId === entry.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-red-400">Delete?</span>
                          <button onClick={() => handleHistoryDelete(entry.id)} className="px-1.5 py-0.5 rounded text-[10px] bg-red-600 text-white hover:bg-red-500 transition">Yes</button>
                          <button onClick={() => setDeletingHistoryId(null)} className="px-1.5 py-0.5 rounded text-[10px] bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">No</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => { setEditingHistoryId(entry.id); setEditingHistoryCp(entry.new_cp.toString()); }}
                            className="p-1 rounded text-[#52525b] hover:text-[#fafafa] hover:bg-[#27272a] transition"
                            title="Edit CP"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setDeletingHistoryId(entry.id)}
                            className="p-1 rounded text-[#52525b] hover:text-red-400 hover:bg-[#27272a] transition"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── Demand CP Update Confirmation Modal ── */}
      {demandModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={cancelDemandConfirm}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Megaphone className="w-4 h-4 text-green-400" />
              <h3 className="text-sm font-semibold text-[#fafafa]">Demand Combat Power Update</h3>
              <button onClick={cancelDemandConfirm} className="ml-auto p-1 rounded text-[#52525b] hover:text-[#fafafa] transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            {dcLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-[#52525b] animate-spin" />
              </div>
            ) : (
              <>
                {/* Discord servers with progress channel */}
                {discordConfigs.filter((c: any) => c.progress_channel_id).length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-[#71717a] uppercase tracking-wider mb-1.5">Will create threads in:</p>
                    {discordConfigs.filter((c: any) => c.progress_channel_id).map((c: any) => (
                      <div key={c.id} className="flex items-center gap-2 text-xs text-[#a1a1aa] py-1">
                        <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                        <span className="text-[#fafafa]">{c.label || "Unknown"}</span>
                        {c.notification_prefix && <span className="text-[10px] text-[#52525b]">({c.notification_prefix})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Discord servers WITHOUT progress channel — warning */}
                {discordConfigs.filter((c: any) => !c.progress_channel_id).length > 0 && (
                  <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <p className="text-[10px] text-amber-400 font-medium uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Will NOT receive threads:
                    </p>
                    {discordConfigs.filter((c: any) => !c.progress_channel_id).map((c: any) => (
                      <div key={c.id} className="text-xs text-amber-300/80 py-0.5">
                        • {c.label || "Unknown Discord server"} — use <code className="px-1 py-0.5 bg-amber-500/10 rounded text-[10px] text-amber-300">!progresshere</code> in their Discord
                      </div>
                    ))}
                    <p className="text-[10px] text-amber-400/60 mt-1.5">Only servers with a progress channel configured will receive the update thread.</p>
                  </div>
                )}

                {discordConfigs.length === 0 && (
                  <p className="text-sm text-[#52525b] py-3 text-center">No Discord servers linked to this RaidScout server.</p>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="text"
                    value={demandConfirmText}
                    onChange={(e) => setDemandConfirmText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && demandConfirmText.toLowerCase() === "confirm") executeDemandCpUpdate(); if (e.key === "Escape") cancelDemandConfirm(); }}
                    placeholder="Type 'confirm' to proceed"
                    autoFocus
                    className="flex-1 px-3 py-1.5 bg-[#09090b] border border-[#27272a] rounded-lg text-xs text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#fafafa]"
                  />
                  <button
                    type="button"
                    onClick={executeDemandCpUpdate}
                    disabled={demandConfirmText.toLowerCase() !== "confirm" || cpReminding}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-600/30 text-green-400 text-xs font-medium hover:bg-green-600/30 disabled:opacity-30 transition shrink-0"
                  >
                    {cpReminding ? (
                      <span className="w-3 h-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                    ) : (
                      <Megaphone className="w-3.5 h-3.5" />
                    )}
                    Confirm
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Classes Tab — manage classes and assign to members */}
      {membersTab === "classes" && (
      <div className="space-y-4">
        {/* Class list management */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4 text-[#a1a1aa]" />
            Class List
            {classes.length > 0 && (
              <button
                onClick={() => setShowClassCreator(v => !v)}
                className="ml-auto text-[10px] text-[#52525b] hover:text-[#a1a1aa] transition flex items-center gap-1"
              >
                {showClassCreator ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showClassCreator ? "Hide creator" : "Add class"}
              </button>
            )}
          </h3>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {classes.length === 0 ? (
              <p className="text-sm text-[#52525b]">No classes defined yet. Add classes like Tank, Healer, DPS to organize members.</p>
            ) : (
              classes.map(c => {
                const IconComp = getClassIcon(classIcons[c] || "Sword");
                const color = classColors[c] || "#a1a1aa";
                return (
                <span key={c} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-[#09090b] text-[#d4d4d8] border border-[#27272a]">
                  <IconComp className="w-3 h-3" style={{ color }} />
                  {c}
                  <button type="button" onClick={(e) => { e.stopPropagation(); setDeleteClassName(c); setDeleteClassConfirmText(""); }} className="text-[#52525b] hover:text-[#f87171] transition"><X className="w-3 h-3" /></button>
                </span>
                );
              })
            )}
          </div>
          {(classes.length === 0 || showClassCreator) && (
          <>
          <div className="flex items-center gap-2 mb-3">
            <div className="relative">
              <button className="px-2.5 py-2 bg-[#09090b] border border-[#27272a] rounded-lg hover:border-[#52525b] transition" title="Pick icon" style={{ color: newClassColor }}>
                {(() => { const IIcon = getClassIcon(newClassIcon); return <IIcon className="w-4 h-4" />; })()}
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {CLASS_ICONS.map(({ name, icon: IconComp, label }) => (
                <button
                  key={name}
                  onClick={() => setNewClassIcon(name)}
                  className={`p-1.5 rounded-md transition border ${newClassIcon === name ? "border-[#52525b] bg-[#27272a]" : "border-[#27272a] hover:border-[#3f3f46]"}`}
                  title={label}
                >
                  <IconComp className={`w-3.5 h-3.5 ${newClassIcon === name ? "text-[#fafafa]" : "text-[#52525b]"}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[10px] text-[#52525b]">Color:</span>
            {CLASS_COLORS.map(color => {
              const used = Object.values(classColors).includes(color) && newClassColor !== color;
              return (
                <button
                  key={color}
                  onClick={() => !used && setNewClassColor(color)}
                  disabled={used}
                  className={`w-5 h-5 rounded-full border-2 transition ${used ? "opacity-20 cursor-not-allowed" : newClassColor === color ? "border-[#fafafa] scale-110" : "border-transparent hover:scale-105"}`}
                  style={{ backgroundColor: color }}
                  title={used ? `${color} (in use)` : color}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddClass())}
              placeholder="e.g. Tank, Healer, DPS"
              className="flex-1 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
            />
            <button onClick={handleAddClass} disabled={!newClassName.trim()} className="px-3 py-2 bg-[#fafafa] text-[#09090b] rounded-lg text-sm font-medium hover:bg-[#e4e4e7] transition disabled:opacity-50">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          </>
          )}
        </div>

        {/* Member class assignment */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#a1a1aa]" />
              Assign Classes to Members
            </h3>
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
              <input
                type="text"
                value={classSearch}
                onChange={(e) => setClassSearch(e.target.value)}
                placeholder="Search members..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#09090b] border border-[#27272a] rounded-lg text-xs text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
              />
            </div>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-[#52525b] text-center py-6">No members yet. Add members first, then assign classes here.</p>
          ) : classes.length === 0 ? (
            <p className="text-sm text-[#52525b] text-center py-6">Add classes above first, then assign them to members here.</p>
          ) : (
            <div className="space-y-3">
              {sortedGuildGroups.map((group, gi) => {
                const filtered = classSearch.trim()
                  ? group.members.filter(m => m.name.toLowerCase().includes(classSearch.toLowerCase()))
                  : group.members;
                if (filtered.length === 0) return null;
                return (
                  <div key={group.guild?.id ?? "__noguild__"} className="rounded-lg overflow-hidden border border-[#27272a]/50">
                    <div className="px-3 py-1.5 bg-[#09090b]/50 flex items-center gap-2">
                      {group.guild ? (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${(() => { const c = guildColor(group.guild!.name); return `${c.bg} ${c.text} ${c.border}`; })()}`}>
                          <Shield className="w-2.5 h-2.5" />
                          {group.guild.name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#52525b] font-medium">No Guild</span>
                      )}
                      <span className="text-[9px] text-[#52525b]">{filtered.length} member{filtered.length !== 1 ? "s" : ""}</span>
                      {group.guild && (
                        <div className="flex items-center gap-0.5 ml-auto">
                          <button onClick={() => moveGuildUp(group.guild!.id)} disabled={gi === 0} className="p-0.5 rounded text-[#52525b] hover:text-[#fafafa] disabled:opacity-20 transition" title="Move up"><ChevronUp className="w-3 h-3" /></button>
                          <button onClick={() => moveGuildDown(group.guild!.id)} disabled={gi === sortedGuildGroups.filter(g => g.guild).length - 1} className="p-0.5 rounded text-[#52525b] hover:text-[#fafafa] disabled:opacity-20 transition" title="Move down"><ChevronDown className="w-3 h-3" /></button>
                        </div>
                      )}
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {filtered.map(m => (
                          <tr key={m.id} className="border-t border-[#27272a]/30 hover:bg-[#09090b]/30 transition">
                            <td className="py-1.5 px-3">
                              <Link to={`/members/${m.id}`} className="flex items-center text-[#fafafa] hover:text-[#e4e4e7] transition text-sm -m-1.5 p-1.5 rounded">
                                {m.class && classIcons[m.class] && (() => { const CIcon = getClassIcon(classIcons[m.class]); const color = classColors[m.class] || "#a1a1aa"; return <CIcon className="w-3.5 h-3.5 mr-2 shrink-0" style={{ color }} />; })()}
                                <span>{m.name}</span>
                              </Link>
                            </td>
                            <td className="py-1.5 px-3 text-right w-40">
                              <select
                                value={m.class ?? ""}
                                onChange={async (e) => {
                                  const cls = e.target.value || null;
                                  try {
                                    await supabase.from("members").update({ class: cls }).eq("id", m.id);
                                    invalidate();
                                  } catch {}
                                }}
                                className="bg-[#09090b] border border-[#27272a] rounded px-2 py-1 text-xs text-[#a1a1aa] outline-none focus:border-[#52525b]"
                              >
                                <option value="">—</option>
                                {classes.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Gear Tracking Tab */}
      {membersTab === "gear" && <GearTrackingTab />}

      {/* Search + Sort toggle (Members tab only) */}
      {membersTab === "members" && members.length > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
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
          <div className="flex bg-[#18181b] rounded-lg p-0.5">
            <button
              onClick={() => setSortMode("guild")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition ${sortMode === "guild" ? "bg-[#27272a] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8]"}`}
            >
              <Shield className="w-3 h-3 inline mr-1" />
              By Guild
            </button>
            <button
              onClick={() => setSortMode("class")}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition ${sortMode === "class" ? "bg-[#27272a] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8]"}`}
            >
              <Tag className="w-3 h-3 inline mr-1" />
              By Class
            </button>
          </div>
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
          {activeCarouselPages.length > 1 && (<>
            <button onClick={() => setCarouselPage(p => p === 0 ? activeCarouselPages.length - 1 : p - 1)} className="absolute left-0 top-0 bottom-0 z-10 px-2 flex items-center bg-[#09090b]/40 hover:bg-[#09090b]/60 transition -ml-2 rounded-l-xl">
              <ChevronLeft className="w-6 h-6 text-[#d4d4d8]" />
            </button>
            <button onClick={() => setCarouselPage(p => p >= activeCarouselPages.length - 1 ? 0 : p + 1)} className="absolute right-0 top-0 bottom-0 z-10 px-2 flex items-center bg-[#09090b]/40 hover:bg-[#09090b]/60 transition -mr-2 rounded-r-xl">
              <ChevronRight className="w-6 h-6 text-[#d4d4d8]" />
            </button>
          </>)}
          <div className="overflow-x-hidden px-10"
            onTouchStart={e => handleSwipeStart(e.touches[0].clientX)}
            onTouchMove={e => handleSwipeMove(e.touches[0].clientX)}
            onTouchEnd={() => handleSwipeEnd(activeCarouselPages.length)}
            onMouseDown={e => { const tag = (e.target as HTMLElement).tagName; if (tag !== "SELECT" && tag !== "INPUT" && tag !== "BUTTON") e.preventDefault(); handleSwipeStart(e.clientX); }}
            onMouseMove={e => handleSwipeMove(e.clientX)}
            onMouseUp={() => handleSwipeEnd(activeCarouselPages.length)}
            onMouseLeave={() => handleSwipeEnd(activeCarouselPages.length)}
          >
            <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${carouselPage * 100}%)` }}>
              {activeCarouselPages.map((pageGroups, pageIdx) => (
                <div key={pageIdx} className="w-full flex-shrink-0 px-2">
                  <div className="flex flex-col lg:flex-row gap-4">
                    {pageGroups.map(group => {
                      const isClassGroup = "className" in group;
                      const c = !isClassGroup && group.guild ? guildColor(group.guild.name) : null;
                      const groupKey = isClassGroup ? (group as typeof classGroups[number]).className ?? "unassigned" : (group as typeof guildGroups[number]).guild?.id ?? "noguild";
                      const groupLabel = isClassGroup
                        ? ((group as typeof classGroups[number]).className ?? "Unassigned")
                        : ((group as typeof guildGroups[number]).guild?.name ?? "No Guild");
                      const members = isClassGroup ? (group as typeof classGroups[number]).members : (group as typeof guildGroups[number]).members;
                      return (
                        <div key={groupKey} className="flex-1 min-w-0">
                          <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            {isClassGroup ? (
                              <>
                                {(group as typeof classGroups[number]).className && classIcons[(group as typeof classGroups[number]).className!] ? (() => {
                                  const cls = (group as typeof classGroups[number]).className!;
                                  const CIcon = getClassIcon(classIcons[cls]);
                                  const color = classColors[cls] || "#a1a1aa";
                                  return (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border border-[#27272a] bg-[#18181b]" style={{ color, borderColor: `${color}40` }}>
                                      <CIcon className="w-3 h-3" />
                                      {cls}
                                    </span>
                                  );
                                })() : (
                                  <span className="text-[#71717a]">{groupLabel}</span>
                                )}
                              </>
                            ) : (
                              <>
                                {group.guild && c ? (
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border border-[#27272a] bg-[#18181b] ${c.text}`}>
                                    <Shield className="w-3 h-3" />
                                    {group.guild.name}
                                  </span>
                                ) : (
                                  <span className="text-[#71717a]">No Guild</span>
                                )}
                              </>
                            )}
                            <span className="text-[#52525b] font-normal normal-case text-[11px]">
                              {members.length} member{members.length !== 1 ? "s" : ""}
                            </span>
                          </h3>
                          <div className="space-y-1">
                            {members.map((member, idx) => (
                      <div
                        key={member.id}
                        className={`flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-lg border group transition ${
                          member.is_active === false
                            ? 'bg-[#09090b]/30 border-[#27272a]/30 opacity-60'
                            : 'bg-[#09090b]/50 border-[#27272a]/50'
                        }`}
                      >
                        <span className="text-[10px] font-mono text-[#52525b] w-5 shrink-0">{(idx + 1).toString().padStart(2, "\u00A0")}</span>
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#18181b] text-[#a1a1aa] font-bold text-sm shrink-0">
                          {member.class && classIcons[member.class] ? (() => {
                            const CIcon = getClassIcon(classIcons[member.class]);
                            const color = classColors[member.class] || "#a1a1aa";
                            return <CIcon className="w-4 h-4" style={{ color }} />;
                          })() : member.name.charAt(0).toUpperCase()}
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
                          <button
                            onClick={async () => {
                              const newActive = !(member.is_active !== false);
                              try {
                                await supabase.from("members").update({ is_active: newActive }).eq("id", member.id);
                                invalidate();
                              } catch (err: any) {
                                setToast({ type: "error", message: err?.message || "Failed to update member" });
                              }
                            }}
                            className={`p-1.5 transition rounded shrink-0 sm:opacity-0 group-hover:opacity-100 ${member.is_active === false ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10' : 'text-[#52525b] hover:text-[#a1a1aa]'}`}
                            title={member.is_active === false ? "Enable member" : "Disable member"}
                          >
                            {member.is_active === false ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
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
        {activeCarouselPages.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {activeCarouselPages.map((_, i) => (
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

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowAddModal(false); }} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
              <h2 className="text-lg font-bold text-[#fafafa] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#a1a1aa]" />
                Add Member
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-[#a1a1aa] hover:text-[#fafafa] transition p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Member Name</label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Member name..."
                  autoFocus
                  className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b] transition"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Combat Power</label>
                <input
                  type="number"
                  value={addCombatPower}
                  onChange={(e) => setAddCombatPower(e.target.value)}
                  placeholder="CP"
                  className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b] transition"
                />
              </div>
              {classes.length > 0 && (
                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Class</label>
                  <select
                    value={addClass}
                    onChange={(e) => setAddClass(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#a1a1aa] focus:outline-none focus:border-[#52525b] transition"
                  >
                    <option value="">—</option>
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              {guilds.length > 0 && (
                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Guild</label>
                  <select
                    value={addGuild}
                    onChange={(e) => setAddGuild(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#a1a1aa] focus:outline-none focus:border-[#52525b] transition"
                  >
                    <option value="">—</option>
                    {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t border-[#27272a]">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 rounded-lg bg-[#18181b] text-[#d4d4d8] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleAdd(); setShowAddModal(false); }}
                disabled={adding || !addName.trim()}
                className="flex-1 py-2 rounded-lg bg-[#fafafa] text-[#09090b] text-sm font-medium hover:bg-[#e4e4e7] disabled:opacity-50 flex items-center justify-center gap-1.5 transition"
              >
                {adding ? (
                  <span className="w-4 h-4 border-2 border-[#09090b]/30 border-t-[#09090b] rounded-full animate-spin" />
                ) : null}
                Add Member
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

      {/* Delete class confirmation */}
      {deleteClassName && (() => {
        const name = deleteClassName!;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setDeleteClassName(null); setDeleteClassConfirmText(""); }} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-xs shadow-2xl p-4 space-y-4">
            <p className="text-[#fafafa] text-sm text-center">
              Delete class <span className="font-bold">{name}</span>?
            </p>
            <p className="text-[10px] text-[#71717a] text-center -mt-2">This will unassign this class from all members.</p>
            <div>
              <input
                type="text"
                value={deleteClassConfirmText}
                onChange={(e) => setDeleteClassConfirmText(e.target.value)}
                placeholder={`Type "${name}" to confirm`}
                autoFocus
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-red-500/50 text-center"
                onKeyDown={(e) => { if (e.key === "Enter" && deleteClassConfirmText.trim().toLowerCase() === name.toLowerCase()) confirmDeleteClass(); }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setDeleteClassName(null); setDeleteClassConfirmText(""); }}
                className="flex-1 py-2 rounded-lg bg-[#18181b] text-[#d4d4d8] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteClass}
                disabled={deleteClassConfirmText.trim().toLowerCase() !== name.toLowerCase()}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
        );
      })()}

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
