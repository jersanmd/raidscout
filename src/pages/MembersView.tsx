import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useMembers } from "@/hooks/useMembers";
import { useAuth } from "@/contexts/AuthContext";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { updateMemberName, deleteMember, upsertMember, isSupabaseConfigured, fetchGuilds, setMemberGuild, bulkAddMembers, supabase, fetchStaticParties, createParty, deleteParty, addMemberToParty, removeMemberFromParty, type StaticParty, sendCpReminder, createProgressThread, addBackdatedCpUpdate, fetchMemberCpHistory, editCpUpdate, deleteCpUpdate, unlinkMember } from "@/lib/supabase";
import { writeAuditEntry, AuditAction } from "@/lib/api/audit";
import { useServerId, useHasPermission, useServer } from "@/contexts/ServerContext";
import { ExpiredGate } from "@/components/ExpiredGate";
import type { Guild, Member, CpUpdate } from "@/types";
import { Users, Plus, Pencil, Trash2, Loader2, X, Check, UserPlus, CheckCircle, XCircle, AlertTriangle, Image, Upload, Copy, Shield, Search, ChevronLeft, ChevronRight, TrendingUp, ChevronUp, ChevronDown, Tag, Sword, Swords, ShieldHalf, ShieldCheck, Crosshair, Wand, Heart, Zap, Flame, Snowflake, Skull, Star, Crown, Anchor, Gavel, Axe, Target, Footprints, HandMetal, Megaphone, Calendar, Clock, Eye, EyeOff, Package, MoreHorizontal, Download } from "lucide-react";
import { guildColor } from "@/lib/constants";
import { GearTrackingTab } from "@/components/GearTrackingTab";

export function MembersView() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const { currentServer, refreshServers, servers } = useServer();
  const isStaff = currentServer?.role === "owner" || currentServer?.role === "moderator";
  const canManageRaidMembers = useHasPermission("can_manage_members");

  // Cross-server summary for staff on 2+ servers
  const navigate = useNavigate();
  const staffServers = useMemo(() => servers.filter(s => s.role === "owner" || s.role === "moderator"), [servers]);
  const showSummaryButton = staffServers.length >= 2 && !isViewer;

  if (currentServer?.isExpired) return <ExpiredGate page="Members" />;
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
  const [actionMenuMember, setActionMenuMember] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [unlinkId, setUnlinkId] = useState<string | null>(null);
  const [unlinkConfirmName, setUnlinkConfirmName] = useState("");
  const [unlinking, setUnlinking] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // CP Reminder
  const [cpReminding, setCpReminding] = useState(false);
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [demandConfirmText, setDemandConfirmText] = useState("");
  const [discordConfigs, setDiscordConfigs] = useState<any[]>([]);
  const [dcLoading, setDcLoading] = useState(false);
  const [excludedDiscordConfigIds, setExcludedDiscordConfigIds] = useState<Set<string>>(new Set());

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
  const [classSearchOpen, setClassSearchOpen] = useState(false);
  const classSearchRef = useRef<HTMLInputElement>(null);
  const [progressSearch, setProgressSearch] = useState("");
  const progressGuildKey = `progress-guild-${serverId ?? "global"}`;
  const [progressGuildFilter, setProgressGuildFilter] = useState<string>(() => {
    try { return localStorage.getItem(progressGuildKey) || ""; } catch { return ""; }
  });
  const [progressGuildOpen, setProgressGuildOpen] = useState(false);
  const [showClassCreator, setShowClassCreator] = useState(false);
  const classAssignGuildKey = `class-assign-guild-${serverId ?? "global"}`;
  const [classAssignGuildFilter, setClassAssignGuildFilter] = useState<string>(() => {
    try { return localStorage.getItem(classAssignGuildKey) || ""; } catch { return ""; }
  });
  const [classAssignGuildOpen, setClassAssignGuildOpen] = useState(false);

  // Sort state for guild member tables (persisted in localStorage)
  const sortKey = `members-sort-${serverId ?? "global"}`;
  const [sortColumn, setSortColumn] = useState<"name" | "cp" | "growth" | "score" | "weekly" | "status">(() => {
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

  const toggleSort = (col: "name" | "cp" | "growth" | "score" | "weekly" | "status") => {
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

  // Server timezone for week boundary
  const serverTz = currentServer?.timezone || "UTC";
  const weekStartISO = (() => {
    const now = new Date();
    // Get server-local wall-clock date/time
    const serverStr = now.toLocaleString("sv-SE", { timeZone: serverTz, hour12: false });
    const [sDate, sTime] = serverStr.split(" ");
    const [sy, sm, sd] = sDate.split("-").map(Number);
    const [sh, smm, ss] = sTime.split(":").map(Number);
    // Get UTC date/time for the same instant
    const utcStr = now.toLocaleString("sv-SE", { timeZone: "UTC", hour12: false });
    const [uDate, uTime] = utcStr.split(" ");
    const [uy, um, ud] = uDate.split("-").map(Number);
    const [uh, umm, us2] = uTime.split(":").map(Number);
    // Compute offset: server wall-clock ms - UTC wall-clock ms
    const offsetMs = Date.UTC(sy, sm - 1, sd, sh, smm, ss) - Date.UTC(uy, um - 1, ud, uh, umm, us2);
    // Compute day of week from server's local date (sy,sm,sd are already in server TZ)
    // Jan 1, 2000 = Saturday (UTC). Days from then:
    const jan1 = Date.UTC(2000, 0, 1);
    const target = Date.UTC(sy, sm - 1, sd);
    const diffDays = Math.round((target - jan1) / 86400000);
    const dow = ((diffDays + 6) % 7 + 7) % 7; // 0=Sun, 1=Mon … 6=Sat
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    const mondayUtc = Date.UTC(sy, sm - 1, sd - mondayOffset, 0, 0, 0) - offsetMs;
    return new Date(mondayUtc).toISOString();
  })();

  // Fetch member scores & growth from RPC
  const { data: memberStats = {} } = useQuery<Record<string, { score: number; growth: number; cpUpdatedAt?: string | null; weekly?: number }>>({
    queryKey: ["memberStats", serverId],
    queryFn: async () => {
      if (!serverId || !configured) return {};
      const { data, error } = await supabase.rpc("get_member_scores", { p_server_id: serverId });
      if (error || !data) return {};
      const map: Record<string, { score: number; growth: number; cpUpdatedAt?: string | null }> = {};
      (data as { member_id: string; score: number; cp_growth_30d: number; cp_updated_at?: string | null }[]).forEach(r => {
        map[r.member_id] = { score: r.score, growth: r.cp_growth_30d ?? 0, cpUpdatedAt: r.cp_updated_at };
      });
      return map;
    },
    staleTime: 120_000,
    enabled: !!serverId && configured,
  });

  // Fetch weekly attendance counts per member (numerator — uses RPC for consistency with profile page)
  const { data: weeklyStats = {} } = useQuery<Record<string, number>>({
    queryKey: ["weeklyAttendance", serverId, weekStartISO],
    queryFn: async () => {
      if (!serverId || !configured) return {};
      const { data, error } = await supabase.rpc("get_weekly_attendance", {
        p_server_id: serverId,
        p_since: weekStartISO,
      });
      if (error || !data) return {};
      const attended: Record<string, number> = {};
      (data as { member_id: string; count: number }[]).forEach(r => {
        attended[r.member_id] = (attended[r.member_id] || 0) + r.count;
      });
      return attended;
    },
    staleTime: 120_000,
    enabled: !!serverId && configured,
  });

  // Fetch per-GUILD weekly totals (denominator — uses RPC to work for both logged-in users and viewers)
  const { data: guildWeeklyTotals = {}, error: guildTotalsError } = useQuery<Record<string, number>>({
    queryKey: ["guildWeeklyTotals", serverId, weekStartISO],
    queryFn: async () => {
      if (!serverId || !configured) return {};
      const { data, error } = await supabase.rpc("get_guild_weekly_totals", {
        p_server_id: serverId,
        p_since: weekStartISO,
      });
      if (error) {
        console.error("[guildWeeklyTotals] RPC error:", error);
        return {};
      }
      const totals: Record<string, number> = {};
      (data as { guild_id: string; total: number }[] || []).forEach(r => {
        totals[r.guild_id] = (totals[r.guild_id] || 0) + r.total;
      });
      return totals;
    },
    staleTime: 120_000,
    enabled: !!serverId && configured,
  });

  // Toggle between percentage and fraction display for Weekly column
  const [showWeeklyFraction, setShowWeeklyFraction] = useState(false);

  // Merge weekly attendance into memberStats for sort & display
  const mergedStats = useMemo(() => {
    const merged: Record<string, { score: number; growth: number; cpUpdatedAt?: string | null; weekly?: number }> = {};
    for (const [id, s] of Object.entries(memberStats)) {
      merged[id] = { ...s, weekly: weeklyStats[id] ?? 0 };
    }
    for (const [id, w] of Object.entries(weeklyStats)) {
      if (!merged[id]) merged[id] = { score: 0, growth: 0, weekly: w };
    }
    return merged;
  }, [memberStats, weeklyStats]);

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
      // Delete existing parties (skip empty ones to avoid noise in audit log)
      for (const p of parties) {
        if (p.member_ids.length === 0) continue;
        await deleteParty(p.id, serverId ?? undefined, p.name).catch(() => {});
      }
      // Create new parties from all guild keys
      for (const [key, boxes] of Object.entries(allPartyBoxes)) {
        const guildId = key === "__all__" ? null : key;
        for (let i = 0; i < boxes.length; i++) {
          const box = boxes[i];
          if (box.length === 0) continue;
          const guildName = guildId ? guilds.find(g => g.id === guildId)?.name : null;
          const partyId = await createParty(`Party ${i + 1}`, guildId, null, null, null, null, guildName);
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
    } else {
      writeAuditEntry({ action: AuditAction.CLASS_CREATE, server_id: serverId, target_id: name, details: { class_name: name, icon, color } });
    }
  };

  const handleRemoveClass = async (name: string) => {
    if (!serverId) return;
    setClasses(prev => prev.filter(c => c !== name));
    const { error } = await supabase.from("server_classes").delete().eq("server_id", serverId).eq("name", name);
    if (error) console.error("Failed to remove class:", error);
    else writeAuditEntry({ action: AuditAction.CLASS_DELETE, server_id: serverId, target_id: name, details: { class_name: name } });
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
  useEscapeKey(() => { setShowBulkModal(false); setBulkNames(""); setDeleteId(null); setDeleteConfirmName(""); setUnlinkId(null); setUnlinkConfirmName(""); });

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
    setExcludedDiscordConfigIds(new Set());
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
    setExcludedDiscordConfigIds(new Set());
  };
  const executeDemandCpUpdate = async () => {
    if (!serverId || cpReminding) return;
    setDemandModalOpen(false);
    setDemandConfirmText("");
    setDiscordConfigs([]);
    setExcludedDiscordConfigIds(new Set());
    setCpReminding(true);
    try {
      // First try creating a progress thread, excluding toggled-off configs
      const excludeIds = [...excludedDiscordConfigIds];
      const threadResult = await createProgressThread(serverId, excludeIds);
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

  // Export state (after guildGroups so it can close over it)
  const [showExportPopover, setShowExportPopover] = useState(false);
  const [exportSelectedGuilds, setExportSelectedGuilds] = useState<Set<string>>(new Set());
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  // Refs to always access latest mergedStats / guildWeeklyTotals (avoids stale closures)
  const mergedStatsRef = useRef(mergedStats);
  mergedStatsRef.current = mergedStats;
  const guildTotalsRef = useRef(guildWeeklyTotals);
  guildTotalsRef.current = guildWeeklyTotals;

  // Excel export helper
  const handleExportMembers = useCallback(() => {
    const currentMerged = mergedStatsRef.current;
    const currentTotals = guildTotalsRef.current;
    const includeAll = exportSelectedGuilds.size === 0;
    const groups = includeAll
      ? guildGroups
      : guildGroups.filter(g => g.guild && exportSelectedGuilds.has(g.guild.id));
    if (groups.length === 0) return;

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const dataRows: { name: string; cls: string; guild: string; cp: number; attended: number; total: number; weeklyPct: number; growthPct: number; growthAbs: number }[] = [];
    for (const group of groups) {
      for (const m of group.members) {
        const stats = currentMerged[m.id];
        const cp = m.combat_power ?? 0;
        const guildTotal = m.guild_id ? (currentTotals[m.guild_id] ?? 0) : 0;
        const attended = stats?.weekly ?? 0;
        const weeklyPct = guildTotal > 0 ? parseFloat(((attended / guildTotal) * 100).toFixed(1)) : 0;
        const growthAbs = stats?.growth ?? 0;
        const growthPct = cp > 0 ? parseFloat(((growthAbs / cp) * 100).toFixed(1)) : 0;
        dataRows.push({ name: m.name, cls: m.class || "—", guild: group.guild?.name || "—", cp, attended, total: guildTotal, weeklyPct, growthPct, growthAbs });
      }
    }

    // Color helpers
    const cpColor = (cp: number): string => {
      if (cp >= 50000) return "#22c55e"; // green
      if (cp >= 30000) return "#facc15"; // yellow
      if (cp >= 15000) return "#fb923c"; // orange
      return "#ef4444"; // red
    };
    const growthColor = (pct: number): string => pct > 0 ? "#22c55e" : pct < 0 ? "#ef4444" : "#a1a1aa";
    const weeklyColor = (pct: number): string => {
      if (pct >= 80) return "#22c55e";
      if (pct >= 50) return "#facc15";
      if (pct >= 25) return "#fb923c";
      return "#ef4444";
    };

    const absencesColor = (missed: number): string => {
      if (missed === 0) return "#22c55e";
      if (missed <= 2) return "#facc15";
      if (missed <= 4) return "#fb923c";
      return "#ef4444";
    };

    const rowsHtml = dataRows.map((r, i) => {
      const bg = i % 2 === 0 ? "#18181b" : "#0d0d11";
      const absent = r.total > 0 ? r.total - r.attended : 0;
      const attDisplay = r.total > 0 ? `="${r.attended}/${r.total}"` : "—";
      const absentDisplay = r.total > 0 ? String(absent) : "—";
      const attPctDisplay = r.total > 0 ? `${r.weeklyPct.toFixed(1)}%` : "—";
      return `<tr style="background:${bg}">
        <td style="padding:6px 10px;border-bottom:1px solid #27272a;font-size:12px;color:#fafafa">${esc(r.name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #27272a;font-size:12px;color:#a1a1aa">${esc(r.cls)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #27272a;font-size:12px;color:#d4d4d8">${esc(r.guild)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #27272a;font-size:12px;font-weight:600;color:${cpColor(r.cp)};text-align:right;font-variant-numeric:tabular-nums">${r.cp.toLocaleString()}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #27272a;font-size:12px;color:${r.total > 0 ? "#d4d4d8" : "#52525b"};text-align:center;font-variant-numeric:tabular-nums">${attDisplay}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #27272a;font-size:12px;font-weight:600;color:${r.total > 0 ? weeklyColor(r.weeklyPct) : "#52525b"};text-align:right">${attPctDisplay}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #27272a;font-size:12px;font-weight:600;color:${r.total > 0 ? absencesColor(absent) : "#52525b"};text-align:center">${absentDisplay}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #27272a;font-size:12px;font-weight:600;color:${growthColor(r.growthPct)};text-align:right">${r.growthPct > 0 ? "+" : ""}${r.growthPct.toFixed(1)}%</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="background:#09090b;margin:0;padding:16px">
      <table style="border-collapse:collapse;width:100%;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">
        <thead><tr>
          <th style="padding:8px 10px;background:#18181b;color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #3f3f46;text-align:left">Name</th>
          <th style="padding:8px 10px;background:#18181b;color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #3f3f46;text-align:left">Class</th>
          <th style="padding:8px 10px;background:#18181b;color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #3f3f46;text-align:left">Guild</th>
          <th style="padding:8px 10px;background:#18181b;color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #3f3f46;text-align:right">Current CP</th>
          <th style="padding:8px 10px;background:#18181b;color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #3f3f46;text-align:center">Weekly Att</th>
          <th style="padding:8px 10px;background:#18181b;color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #3f3f46;text-align:right">Att %</th>
          <th style="padding:8px 10px;background:#18181b;color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #3f3f46;text-align:center">Absences</th>
          <th style="padding:8px 10px;background:#18181b;color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #3f3f46;text-align:right">30d Growth %</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body></html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Build filename with guild context
    const includedGuilds = includeAll ? [] : groups.map(g => g.guild?.name).filter(Boolean);
    const guildSuffix = includedGuilds.length === 1 ? `_${includedGuilds[0]}` : includedGuilds.length > 1 ? `_${includedGuilds.length}guilds` : "";
    a.download = `members_export${guildSuffix}_${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportPopover(false);
  }, [exportSelectedGuilds, guildGroups]);

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
      const guildName = guilds.find(g => g.id === addGuild)?.name;
      await upsertMember(name, addGuild || null, addCombatPower ? Number(addCombatPower) : null, addClass || null, guildName);
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
      const guildName = guilds.find(g => g.id === bulkGuild)?.name;
      added = await bulkAddMembers(newNames, bulkGuild || null, guildName);
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
      await updateMemberName(id, name, oldName);
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
      await deleteMember(id, serverId ?? undefined, memberName);
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

  const handleUnlink = async (id: string) => {
    const memberName = members.find((m) => m.id === id)?.name ?? "";
    setUnlinking(true);
    try {
      await unlinkMember(id);
      setUnlinkId(null);
      setUnlinkConfirmName("");
      invalidate();
      refreshServers();
      showToast("success", `"${memberName}" unlinked from user`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to unlink member");
    } finally {
      setUnlinking(false);
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
    <div className="max-w-[100%] 2xl:max-w-[1600px] mx-auto px-4 py-6 space-y-6">
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
          {showSummaryButton && (
            <button
              type="button"
              onClick={() => navigate("/members-summary")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs font-medium hover:bg-[#27272a] hover:text-[#fafafa] transition"
            >
              <Users className="w-3 h-3" />
              Summary ({staffServers.length})
            </button>
          )}
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
      <div className="flex flex-wrap items-center gap-1 border-b border-[#27272a] pb-2">
        <button
          onClick={() => setMembersTab("members")}
          className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition whitespace-nowrap shrink-0 ${
            membersTab === "members"
              ? "bg-[#18181b] text-[#fafafa] border border-[#27272a] border-b-transparent"
              : "text-[#71717a] hover:text-[#d4d4d8]"
          }`}
        >
          <Users className="w-3.5 h-3.5 inline mr-1" />
          Members{isViewer ? " (View Only)" : ""}
        </button>
        <button
          onClick={() => setMembersTab("progress")}
          className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition whitespace-nowrap shrink-0 ${
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
          className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition whitespace-nowrap shrink-0 ${
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
            className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition whitespace-nowrap shrink-0 ${
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
          className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition whitespace-nowrap shrink-0 ${
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
              {savingParties ? <><Loader2 className="w-3 h-3 animate-spin inline mr-1" /> Saving…</> : "Save Parties"}
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
            <p className="text-[11px] text-[#52525b] uppercase tracking-wider px-2 py-1">
              Unassigned ({unassignedMembers.length})
            </p>
            {/* Search in unassigned */}
            <div className="px-1">
              <input
                type="text"
                value={unassignedSearch}
                onChange={(e) => setUnassignedSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-2 py-1 bg-[#09090b] border border-[#27272a] rounded text-[11px] text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"
              />
            </div>
            {unassignedMembers.length === 0 ? (
              <p className="text-[11px] text-[#3f3f46] text-center py-4">All members placed</p>
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
                  <span className="w-5 h-5 rounded bg-[#09090b] flex items-center justify-center text-[11px] text-[#71717a] font-bold shrink-0">
                    {m.class && classIcons[m.class] ? (() => { const CIcon = getClassIcon(classIcons[m.class]); const color = classColors[m.class] || "#a1a1aa"; return <CIcon className="w-3 h-3" style={{ color }} />; })() : m.name.charAt(0)}
                  </span>
                  <span className="truncate flex-1">{m.name}</span>
                  {g && c && (
                    <span className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] border ${c.bg} ${c.text} ${c.border}`}>
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
                  <p className="text-[11px] text-[#52525b] uppercase tracking-wider px-1 flex items-center justify-between">
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
                        <span className="w-4 h-4 rounded bg-[#18181b] flex items-center justify-center text-[11px] text-[#71717a] font-bold shrink-0">
                          {m.class && classIcons[m.class] ? (() => { const CIcon = getClassIcon(classIcons[m.class]); const color = classColors[m.class] || "#a1a1aa"; return <CIcon className="w-2.5 h-2.5" style={{ color }} />; })() : m.name.charAt(0)}
                        </span>
                        <span className="truncate flex-1">{m.name}</span>
                        {g && c && (
                          <span className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] border ${c.bg} ${c.text} ${c.border}`}>
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
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <p className="text-sm text-[#a1a1aa] w-full sm:w-auto sm:flex-1">
            Track member combat power growth and manage profiles.
          </p>
          <div className="relative w-36 sm:w-48">
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
            <div className="relative">
              <button
                onClick={() => setProgressGuildOpen(!progressGuildOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa] hover:border-[#52525b] transition"
              >
                {progressGuildFilter ? (() => {
                  const g = guilds.find(x => x.id === progressGuildFilter);
                  if (!g) return <span>All Guilds</span>;
                  const c = guildColor(g.name);
                  return (
                    <span className="flex items-center gap-1.5">
                      <Shield className={`w-3 h-3 ${c.text}`} />
                      <span className={c.text}>{g.name}</span>
                    </span>
                  );
                })() : <span>All Guilds</span>}
                <ChevronDown className="w-3 h-3 ml-auto" />
              </button>
              {progressGuildOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProgressGuildOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl py-1 min-w-[140px]">
                    <button
                      onClick={() => { setProgressGuildFilter(""); setProgressGuildOpen(false); localStorage.setItem(progressGuildKey, ""); }}
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition ${!progressGuildFilter ? "bg-[#09090b] text-[#fafafa]" : "text-[#a1a1aa] hover:bg-[#09090b]"}`}
                    >
                      <span className="w-3 h-3 rounded-full border border-[#3f3f46]" />
                      All Guilds
                    </button>
                    {guilds.map(g => {
                      const c = guildColor(g.name);
                      return (
                        <button
                          key={g.id}
                          onClick={() => { setProgressGuildFilter(g.id); setProgressGuildOpen(false); localStorage.setItem(progressGuildKey, g.id); }}
                          className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition ${progressGuildFilter === g.id ? "bg-[#09090b] text-[#fafafa]" : "text-[#a1a1aa] hover:bg-[#09090b]"}`}
                        >
                          <Shield className={`w-3 h-3 ${c.text}`} />
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
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
              Demand<span className="hidden sm:inline"> Combat Power</span> Update<span className="hidden sm:inline"> Now</span>
            </button>
          )}
          {/* Export button */}
          <div className="relative">
            <button
              ref={exportBtnRef}
              onClick={() => {
                if (!showExportPopover && progressGuildFilter) {
                  setExportSelectedGuilds(new Set([progressGuildFilter]));
                }
                setShowExportPopover(p => !p);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#71717a] hover:text-[#d4d4d8] bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            {showExportPopover && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportPopover(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl p-3 space-y-2">
                  <span className="text-[11px] font-semibold text-[#71717a] uppercase tracking-wider">Export Guilds</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportSelectedGuilds.size === 0}
                      onChange={() => setExportSelectedGuilds(new Set())}
                      className="rounded"
                    />
                    <span className="text-xs text-[#d4d4d8]">All Guilds</span>
                  </label>
                  {guilds.map(g => (
                    <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportSelectedGuilds.has(g.id)}
                        onChange={() => {
                          setExportSelectedGuilds(prev => {
                            const next = new Set(prev);
                            if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                            return next;
                          });
                        }}
                        className="rounded"
                      />
                      <span className="text-xs text-[#d4d4d8]">{g.name}</span>
                    </label>
                  ))}
                  <button
                    onClick={handleExportMembers}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#27272a] text-xs font-medium text-[#fafafa] hover:bg-[#3f3f46] transition"
                  >
                    Export Excel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {(() => {
          const displayGroups = (progressGuildFilter
            ? sortedGuildGroups.filter(g => g.guild?.id === progressGuildFilter)
            : sortedGuildGroups).map(g => ({ ...g, members: g.members.filter(m => m.is_active !== false) })).filter(g => g.members.length > 0);
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
                <span className="text-[11px] text-[#52525b]">{group.members.length} member{group.members.length !== 1 ? "s" : ""}</span>
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
                    <tr className="text-[11px] text-[#71717a] uppercase tracking-wider border-b border-[#27272a]/50">
                      <th className="text-left py-2.5 px-2 w-[50%] cursor-pointer select-none hover:bg-[#27272a]/30 transition group" onClick={() => toggleSort("name")}>
                        <span className="inline-flex items-center gap-1">
                          <span className={sortColumn === "name" ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>Member</span>
                          <span className="inline-block w-3 text-center">{sortColumn === "name" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                        </span>
                      </th>
                      <th className="text-right py-2.5 px-2 w-[9%] cursor-pointer select-none hover:bg-[#27272a]/30 transition group" onClick={() => toggleSort("cp")}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          <span className={sortColumn === "cp" ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>Current CP</span>
                          <span className="inline-block w-3 text-center">{sortColumn === "cp" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                        </span>
                      </th>
                      <th className="text-center py-2.5 px-1 w-[7%] cursor-pointer select-none hover:bg-[#27272a]/30 transition group" onClick={() => toggleSort("weekly")} title="Weekly performance">
                        <span className="inline-flex items-center gap-1 justify-center">
                          <span className={sortColumn === "weekly" ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>Weekly Attendance</span>
                          {guildTotalsError && <span className="text-[10px] text-amber-400" title="Guild totals failed to load">⚠</span>}
                          <span className="inline-block w-3 text-center">{sortColumn === "weekly" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setShowWeeklyFraction(f => !f); }}
                            className="ml-1 text-[11px] text-[#52525b] hover:text-[#a1a1aa] transition leading-none"
                            title={showWeeklyFraction ? "Show percentage" : "Show fraction"}
                          >
                            {showWeeklyFraction ? "⅞" : "%"}
                          </button>
                        </span>
                      </th>
                      <th className="text-right py-2.5 px-2 w-[7%] cursor-pointer select-none hover:bg-[#27272a]/30 transition group" onClick={() => toggleSort("growth")} title="30d CP growth">
                        <span className="inline-flex items-center gap-1 justify-end">
                          <span className={sortColumn === "growth" ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>30d Growth</span>
                          <span className="inline-block w-3 text-center">{sortColumn === "growth" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                        </span>
                      </th>
                      <th className="text-center py-2.5 px-1 w-[7%] cursor-pointer select-none hover:bg-[#27272a]/30 transition group" onClick={() => toggleSort("score")} title="Sort by performance score">
                        <span className="inline-flex items-center gap-1 justify-center">
                          <span className={sortColumn === "score" ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>Score</span>
                          <span className="inline-block w-3 text-center">{sortColumn === "score" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                        </span>
                      </th>
                      <th className="text-center py-2.5 px-2 w-[5%] cursor-pointer select-none hover:bg-[#27272a]/30 transition group" onClick={() => toggleSort("status")} title="Sort by CP status">
                        <span className="inline-flex items-center gap-1 justify-center">
                          <span className={sortColumn === "status" ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>Status</span>
                          <span className="inline-block w-3 text-center">{sortColumn === "status" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
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
                          const aG = mergedStats[a.id]?.growth ?? -999999;
                          const bG = mergedStats[b.id]?.growth ?? -999999;
                          if (aG !== bG) return dir * (aG - bG);
                          return a.name.localeCompare(b.name);
                        }
                        if (sortColumn === "score") {
                          const aScore = mergedStats[a.id]?.score ?? -1;
                          const bScore = mergedStats[b.id]?.score ?? -1;
                          if (aScore !== bScore) return dir * (aScore - bScore);
                          return a.name.localeCompare(b.name);
                        }
                        if (sortColumn === "weekly") {
                          const aW = mergedStats[a.id]?.weekly ?? -1;
                          const bW = mergedStats[b.id]?.weekly ?? -1;
                          if (aW !== bW) return dir * (aW - bW);
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
                        <td className="py-2.5 px-2 align-middle">
                          <Link to={`/members/${m.id}`} className="flex items-center gap-2 text-[#fafafa] hover:text-[#e4e4e7] transition text-sm -m-2 p-2 rounded">
                            <span className="text-[11px] text-[#52525b] font-mono w-4 shrink-0 text-right">{i + 1}</span>
                            {m.class && classIcons[m.class] && (() => { const CIcon = getClassIcon(classIcons[m.class]); const color = classColors[m.class] || "#a1a1aa"; return <CIcon className="w-3.5 h-3.5 shrink-0" style={{ color }} />; })()}
                            <span>{m.name}</span>
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-sm align-middle">
                          <Link to={`/members/${m.id}`} className="block -m-2 p-2 rounded hover:bg-[#09090b]/50 transition">
                          <span className={m.combat_power != null ? "text-[#a1a1aa]" : "text-[#71717a]"}>
                            {m.combat_power != null ? m.combat_power.toLocaleString() : "—"}
                          </span>
                          </Link>
                        </td>
                        <td className="py-2.5 px-1 text-center font-mono text-xs align-middle">
                          <Link to={`/members/${m.id}`} className="block -m-2 p-2 rounded hover:bg-[#09090b]/50 transition">
                          {(() => {
                            const stats = mergedStats[m.id];
                            const w = stats?.weekly;
                            if (w == null) return <span className="text-[#71717a]">—</span>;
                            const guildTotal = m.guild_id ? (guildWeeklyTotals[m.guild_id] ?? 0) : 0;
                            const pct = guildTotal > 0 ? Math.round((w / guildTotal) * 100) : 0;
                            const color = pct >= 75 ? "text-green-400" : pct >= 50 ? "text-amber-400" : pct > 0 ? "text-red-400" : "text-[#71717a]";
                            return (
                              <span className={`font-bold ${color}`}>
                                {showWeeklyFraction ? `${w}/${guildTotal}` : `${pct}%`}
                              </span>
                            );
                          })()}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs align-middle">
                          <Link to={`/members/${m.id}`} className="block -m-2 p-2 rounded hover:bg-[#09090b]/50 transition">
                          {mergedStats[m.id]?.growth != null && mergedStats[m.id].growth !== 0 && m.combat_power != null ? (() => {
                            const base = m.combat_power - mergedStats[m.id].growth;
                            if (base <= 0) return <span className="text-[#71717a]">—</span>;
                            const pct = (mergedStats[m.id].growth / base) * 100;
                            const positive = mergedStats[m.id].growth > 0;
                            return (
                              <span className={positive ? "text-green-400" : "text-red-400"}>
                                {positive ? "+" : ""}{mergedStats[m.id].growth.toLocaleString()}
                                <span className="text-[#52525b] ml-0.5">({positive ? "+" : ""}{pct.toFixed(1)}%)</span>
                              </span>
                            );
                          })() : (
                            <span className="text-[#3f3f46]">—</span>
                          )}
                          </Link>
                        </td>
                        <td className="py-2.5 px-1 text-center font-mono text-xs align-middle">
                          <Link to={`/members/${m.id}`} className="block -m-2 p-2 rounded hover:bg-[#09090b]/50 transition">
                          {(() => {
                            const stats = mergedStats[m.id];
                            const s = stats?.score;
                            return s != null ? (
                              <span className={`font-bold ${s >= 75 ? "text-green-400" : s >= 50 ? "text-amber-400" : s > 0 ? "text-red-400" : "text-[#71717a]"}`}>{s}</span>
                            ) : (
                              <span className="text-[#3f3f46]">—</span>
                            );
                          })()}
                          </Link>
                        </td>
                        <td className="py-2.5 px-2 text-center align-middle">
                          <Link to={`/members/${m.id}`} className="block -m-2 p-2 rounded hover:bg-[#09090b]/50 transition">
                          {(() => {
                            const updatedAt = mergedStats[m.id]?.cpUpdatedAt;
                            if (!updatedAt && m.combat_power == null) {
                              return <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#3f3f46]" title="CP not set" />;
                            }
                            if (!updatedAt && m.combat_power != null) {
                              return <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#52525b]" title="CP set but never updated" />;
                            }
                            const daysAgo = (Date.now() - new Date(updatedAt!).getTime()) / (1000 * 60 * 60 * 24);
                            if (daysAgo <= 7) {
                              return <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" title={`Updated ${Math.round(daysAgo)}d ago`} />;
                            }
                            if (daysAgo <= 14) {
                              return <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" title={`Updated ${Math.round(daysAgo)}d ago`} />;
                            }
                            return <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" title={`Updated ${Math.round(daysAgo)}d ago`} />;
                          })()}
                          </Link>
                        </td>
                        {canManageRaidMembers && (
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                type="button"
                                onClick={() => openHistory(m)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[#09090b] border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#52525b] transition whitespace-nowrap"
                                title="View CP history & profile"
                              >
                                <Clock className="w-3 h-3 shrink-0" />
                                History
                              </button>
                              <button
                                type="button"
                                onClick={() => openCpModal(m)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-[#09090b] border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#52525b] transition whitespace-nowrap"
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

        <p className="text-[11px] text-[#52525b] text-center">
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
                  <label className="text-[11px] text-[#71717a] uppercase tracking-wider block mb-1">Member</label>
                  <p className="text-sm text-[#fafafa] font-medium">{cpModalMember.name}</p>
                </div>

                <div>
                  <label className="text-[11px] text-[#71717a] uppercase tracking-wider block mb-1">Combat Power</label>
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
                  <label className="text-[11px] text-[#71717a] uppercase tracking-wider block mb-1">Date (past week)</label>
                  <input
                    type="date"
                    value={cpModalDate}
                    onChange={(e) => { setCpModalDate(e.target.value); setCpModalError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleBackdatedCpSubmit(); }}
                    max={new Date().toISOString().slice(0, 10)}
                    className="w-full px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b] [color-scheme:dark]"
                  />
                  <p className="text-[11px] text-[#52525b] mt-1">You can update CP anytime — no weekly limit.</p>
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
                          <span className="text-[11px] text-[#52525b] font-mono">{fmtDate(entry.submitted_at)}</span>
                          <span className={`text-[11px] px-1.5 py-0.5 rounded ${entry.status === "approved" ? "bg-green-500/10 text-green-400" : entry.status === "rejected" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
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
                            <button onClick={() => handleHistoryEdit(entry.id)} className="px-2 py-1 rounded text-[11px] bg-green-600 text-white hover:bg-green-500 transition">Save</button>
                            <button onClick={() => setEditingHistoryId(null)} className="px-2 py-1 rounded text-[11px] bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">Cancel</button>
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
                          <span className="text-[11px] text-red-400">Delete?</span>
                          <button onClick={() => handleHistoryDelete(entry.id)} className="px-1.5 py-0.5 rounded text-[11px] bg-red-600 text-white hover:bg-red-500 transition">Yes</button>
                          <button onClick={() => setDeletingHistoryId(null)} className="px-1.5 py-0.5 rounded text-[11px] bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">No</button>
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
                {/* Discord servers with progress channel — click to toggle */}
                {discordConfigs.filter((c: any) => c.progress_channel_id).length > 0 && (
                  <div className="mb-3">
                    <p className="text-[11px] text-[#71717a] uppercase tracking-wider mb-1.5">Click to toggle — will create threads in:</p>
                    {discordConfigs.filter((c: any) => c.progress_channel_id).map((c: any) => {
                      const isExcluded = excludedDiscordConfigIds.has(c.progress_channel_id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setExcludedDiscordConfigIds(prev => {
                              const next = new Set(prev);
                              if (next.has(c.progress_channel_id)) next.delete(c.progress_channel_id);
                              else next.add(c.progress_channel_id);
                              return next;
                            });
                          }}
                          className={`flex items-center gap-2 text-xs py-1 w-full text-left rounded px-1 -mx-1 transition ${isExcluded ? "opacity-40 hover:opacity-70" : "hover:bg-[#09090b]"}`}
                        >
                          {isExcluded ? (
                            <XCircle className="w-3.5 h-3.5 text-[#52525b] shrink-0" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          )}
                          <span className={isExcluded ? "text-[#52525b] line-through" : "text-[#fafafa]"}>{c.label || "Unknown"}</span>
                          {c.notification_prefix && <span className="text-[11px] text-[#52525b]">({c.notification_prefix})</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Discord servers WITHOUT progress channel — warning */}
                {discordConfigs.filter((c: any) => !c.progress_channel_id).length > 0 && (
                  <div className="mb-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                    <p className="text-[11px] text-amber-400 font-medium uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      No progress channel:
                    </p>
                    {discordConfigs.filter((c: any) => !c.progress_channel_id).map((c: any) => (
                      <div key={c.id} className="text-xs text-amber-300/80 py-0.5">
                        • {c.label || "Unknown Discord server"} — use <code className="px-1 py-0.5 bg-amber-500/10 rounded text-[11px] text-amber-300">!progresshere</code> in their Discord
                      </div>
                    ))}
                    <p className="text-[11px] text-amber-400/60 mt-1.5">These servers need a progress channel configured to receive threads.</p>
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
                className="ml-auto text-[11px] text-[#52525b] hover:text-[#a1a1aa] transition flex items-center gap-1"
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
            <span className="text-[11px] text-[#52525b]">Color:</span>
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
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                {classSearchOpen ? (
                  <div className="relative w-48 ml-auto">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
                    <input
                      ref={classSearchRef}
                      type="text"
                      value={classSearch}
                      onChange={(e) => setClassSearch(e.target.value)}
                      placeholder="Search members..."
                      className="w-full pl-8 pr-3 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b] animate-slide-up"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button onClick={() => setClassSearchOpen(true)} className="ml-auto p-1 rounded text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition" title="Search">
                    <Search className="w-3.5 h-3.5" />
                  </button>
                )}
                {guilds.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setClassAssignGuildOpen(!classAssignGuildOpen)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#09090b] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa] hover:border-[#52525b] transition"
                  >
                    {classAssignGuildFilter ? (() => {
                      const g = guilds.find(x => x.id === classAssignGuildFilter);
                      if (!g) return <span>Filter By Guild</span>;
                      const c = guildColor(g.name);
                      return <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${c.text}`}><Shield className="w-2.5 h-2.5" />{g.name}</span>;
                    })() : <span>Filter By Guild</span>}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {classAssignGuildOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setClassAssignGuildOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-50 bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl py-1 min-w-[140px]">
                        <button
                          onClick={() => { setClassAssignGuildFilter(""); setClassAssignGuildOpen(false); localStorage.setItem(classAssignGuildKey, ""); }}
                          className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition ${!classAssignGuildFilter ? "bg-[#09090b] text-[#fafafa]" : "text-[#a1a1aa] hover:bg-[#09090b]"}`}
                        >
                          <span className="w-3 h-3 rounded-full border border-[#3f3f46]" />
                          All Guilds
                        </button>
                        {guilds.map(g => {
                          const c = guildColor(g.name);
                          return (
                            <button
                              key={g.id}
                              onClick={() => { setClassAssignGuildFilter(g.id); setClassAssignGuildOpen(false); localStorage.setItem(classAssignGuildKey, g.id); }}
                              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition ${classAssignGuildFilter === g.id ? "bg-[#09090b] text-[#fafafa]" : "text-[#a1a1aa] hover:bg-[#09090b]"}`}
                            >
                              <Shield className={`w-3 h-3 ${c.text}`} />
                              {g.name}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-[#52525b] text-center py-6">No members yet. Add members first, then assign classes here.</p>
          ) : classes.length === 0 ? (
            <p className="text-sm text-[#52525b] text-center py-6">Add classes above first, then assign them to members here.</p>
          ) : (
            <div className="space-y-3">
              {sortedGuildGroups
                .filter(g => !classAssignGuildFilter || g.guild?.id === classAssignGuildFilter)
                .map((group, gi) => {
                const activeMembers = group.members.filter(m => m.is_active !== false);
                const filtered = classSearch.trim()
                  ? activeMembers.filter(m => m.name.toLowerCase().includes(classSearch.toLowerCase()))
                  : activeMembers;
                if (filtered.length === 0) return null;
                return (
                  <div key={group.guild?.id ?? "__noguild__"} className="rounded-lg overflow-hidden border border-[#27272a]/50">
                    <div className="px-3 py-1.5 bg-[#09090b]/50 flex items-center gap-2">
                      {group.guild ? (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${(() => { const c = guildColor(group.guild!.name); return `${c.bg} ${c.text} ${c.border}`; })()}`}>
                          <Shield className="w-2.5 h-2.5" />
                          {group.guild.name}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#52525b] font-medium">No Guild</span>
                      )}
                      <span className="text-[11px] text-[#52525b]">{filtered.length} member{filtered.length !== 1 ? "s" : ""}</span>
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
                                    writeAuditEntry({ action: AuditAction.MEMBER_CLASS_SET, server_id: serverId!, target_id: m.id, details: { member_name: m.name, class: cls || "none" } });
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
          {/* Export button */}
          <div className="relative">
            <button
              ref={exportBtnRef}
              onClick={() => setShowExportPopover(p => !p)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-[#71717a] hover:text-[#d4d4d8] bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            {showExportPopover && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExportPopover(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl p-3 space-y-2">
                  <span className="text-[11px] font-semibold text-[#71717a] uppercase tracking-wider">Export Guilds</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportSelectedGuilds.size === 0}
                      onChange={() => setExportSelectedGuilds(new Set())}
                      className="rounded"
                    />
                    <span className="text-xs text-[#d4d4d8]">All Guilds</span>
                  </label>
                  {guilds.map(g => (
                    <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportSelectedGuilds.has(g.id)}
                        onChange={() => {
                          setExportSelectedGuilds(prev => {
                            const next = new Set(prev);
                            if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                            return next;
                          });
                        }}
                        className="rounded"
                      />
                      <span className="text-xs text-[#d4d4d8]">{g.name}</span>
                    </label>
                  ))}
                  <button
                    onClick={handleExportMembers}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#27272a] text-xs font-medium text-[#fafafa] hover:bg-[#3f3f46] transition"
                  >
                    Export Excel
                  </button>
                </div>
              </>
            )}
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
                            {(() => [...members].sort((a, b) => (a.is_active === false ? 1 : 0) - (b.is_active === false ? 1 : 0)))().map((member, idx) => (
                      <div
                        key={member.id}
                        className={`flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 rounded-lg border group transition ${
                          member.is_active === false
                            ? 'bg-[#18181b]/50 border-[#27272a]/30 opacity-60'
                            : 'bg-[#18181b] border-[#27272a] hover:border-[#3f3f46]'
                        }`}
                      >
                        <span className="text-[11px] font-mono text-[#52525b] w-5 shrink-0">{(idx + 1).toString().padStart(2, "\u00A0")}</span>
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
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <Link to={`/members/${member.id}`} className="text-[#fafafa] text-sm font-medium truncate hover:text-[#e4e4e7] transition">{member.name}</Link>
                            {(member as any).user_id && (
                              <>
                                <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium shrink-0" title="Claimed member">Claimed</span>
                                {isStaff && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setUnlinkId(member.id); setUnlinkConfirmName(""); }}
                                    className="text-[11px] text-[#52525b] hover:text-red-400 transition shrink-0 sm:opacity-0 group-hover:opacity-100"
                                    title="Unlink this member from their claimed user"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        {editingId !== member.id && canManageRaidMembers && (
                          <>
                            {/* Desktop: inline buttons */}
                            <button onClick={() => startEdit(member)} className="hidden sm:inline-flex p-1.5 text-[#71717a] hover:text-[#fafafa] transition rounded shrink-0 sm:opacity-0 group-hover:opacity-100" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                            {/* Mobile: more button → dropdown */}
                            <div className="relative sm:hidden shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); setActionMenuMember(actionMenuMember === member.id ? null : member.id); }}
                                className="p-1.5 text-[#71717a] hover:text-[#fafafa] transition rounded"
                                title="Actions"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>
                              {actionMenuMember === member.id && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setActionMenuMember(null)} />
                                  <div className="absolute right-0 top-full mt-1 z-50 bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl py-1 min-w-[130px]">
                                    <button
                                      onClick={() => { setActionMenuMember(null); startEdit(member); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#d4d4d8] hover:bg-[#09090b] transition"
                                    >
                                      <Pencil className="w-3.5 h-3.5" /> Edit Name
                                    </button>
                                    <button
                                      onClick={async () => {
                                        setActionMenuMember(null);
                                        const newActive = !(member.is_active !== false);
                                        try {
                                          await supabase.from("members").update({ is_active: newActive }).eq("id", member.id);
                                          writeAuditEntry({ action: AuditAction.MEMBER_ACTIVE_TOGGLE, server_id: serverId!, target_id: member.id, details: { member_name: member.name, is_active: newActive } });
                                          invalidate();
                                        } catch (err: any) {
                                          setToast({ type: "error", message: err?.message || "Failed to update member" });
                                        }
                                      }}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-[#d4d4d8] hover:bg-[#09090b] transition"
                                    >
                                      <EyeOff className="w-3.5 h-3.5" /> {member.is_active === false ? "Enable" : "Disable"}
                                    </button>
                                    <button
                                      onClick={() => { setActionMenuMember(null); setDeleteId(member.id); setDeleteConfirmName(""); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-[#09090b] transition"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        )}

                        {editingId !== member.id && guilds.length > 0 && !isViewer && isStaff && (
                          <select
                            value={member.guild_id ?? ""}
                            onChange={async (e) => {
                              const gid = e.target.value || null;
                              const oldName = guilds.find(g => g.id === member.guild_id)?.name || "(none)";
                              const newName = guilds.find(g => g.id === gid)?.name || "(none)";
                              try { await setMemberGuild(member.id, gid, member.name, oldName, newName); invalidate(); } catch (err: any) {
                                setToast({ type: "error", message: err?.message || "Failed to change guild" });
                              }
                            }}
                            className="bg-[#18181b] border border-[#27272a] rounded px-1.5 py-1 text-[11px] sm:text-xs text-[#a1a1aa] outline-none focus:border-[#52525b] transition max-w-[100px] truncate shrink-0"
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
                                writeAuditEntry({ action: AuditAction.MEMBER_ACTIVE_TOGGLE, server_id: serverId!, target_id: member.id, details: { member_name: member.name, is_active: newActive } });
                                invalidate();
                              } catch (err: any) {
                                setToast({ type: "error", message: err?.message || "Failed to update member" });
                              }
                            }}
                            className="hidden sm:inline-flex shrink-0 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                            title={member.is_active === false ? "Enable member" : "Disable member"}
                          >
                            <div className={`w-8 h-4.5 rounded-full relative transition-colors ${member.is_active === false ? 'bg-[#27272a]' : 'bg-green-500/60'}`}>
                              <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${member.is_active === false ? 'left-0.5' : 'left-4'}`} />
                            </div>
                          </button>
                        )}

                        {editingId !== member.id && canManageRaidMembers && (
                          <button onClick={() => { setDeleteId(member.id); setDeleteConfirmName(""); }} className="hidden sm:inline-flex p-1.5 text-[#71717a] hover:text-red-400 transition rounded shrink-0" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
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
                <label className="text-[11px] text-[#71717a] uppercase tracking-wider">Member Name</label>
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
                <label className="text-[11px] text-[#71717a] uppercase tracking-wider">Combat Power</label>
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
                  <label className="text-[11px] text-[#71717a] uppercase tracking-wider">Class</label>
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
                  <label className="text-[11px] text-[#71717a] uppercase tracking-wider">Guild</label>
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
              <p className="text-[11px] text-[#71717a] mb-1.5 text-center">Type <span className="text-[#fafafa] font-mono">{targetName}</span> to confirm:</p>
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

      {/* Unlink confirmation */}
      {unlinkId && (() => {
        const targetName = members.find((m) => m.id === unlinkId)?.name ?? "";
        const confirmed = unlinkConfirmName.trim().toLowerCase() === targetName.toLowerCase();
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setUnlinkId(null); setUnlinkConfirmName(""); }} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-xs shadow-2xl p-4 space-y-4">
            <p className="text-[#fafafa] text-sm text-center">
              Unlink <span className="font-bold">{targetName}</span> from their claimed user?
            </p>
            <p className="text-[11px] text-[#71717a] text-center -mt-2">
              This will remove the user association. The member can be claimed again later.
            </p>
            <div>
              <p className="text-[11px] text-[#71717a] mb-1.5 text-center">Type <span className="text-[#fafafa] font-mono">{targetName}</span> to confirm:</p>
              <input
                value={unlinkConfirmName}
                onChange={(e) => setUnlinkConfirmName(e.target.value)}
                placeholder={targetName}
                autoFocus
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-red-500/50 text-center"
                onKeyDown={(e) => { if (e.key === "Enter" && confirmed) handleUnlink(unlinkId); }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setUnlinkId(null); setUnlinkConfirmName(""); }}
                disabled={unlinking}
                className="flex-1 py-2 rounded-lg bg-[#18181b] text-[#d4d4d8] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUnlink(unlinkId)}
                disabled={unlinking || !confirmed}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 transition"
              >
                {unlinking ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Unlink"
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
            <p className="text-[11px] text-[#71717a] text-center -mt-2">This will unassign this class from all members.</p>
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

// ── Cross-Server Member Summary Page ─────────────────────────

type SummaryRow = { id: string; name: string; serverName: string; guildName: string; guildTextClass: string; cp: number | null; className: string; growth30d: number | null };

export function MembersSummaryView() {
  const { isViewer } = useAuth();
  const { servers, loading: serversLoading } = useServer();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const staffServers = useMemo(() => servers.filter(s => s.role === "owner" || s.role === "moderator"), [servers]);
  const [data, setData] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [sortCol, setSortCol] = useState<keyof SummaryRow>(() => (localStorage.getItem("ms_sortCol") as keyof SummaryRow) || "name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => (localStorage.getItem("ms_sortDir") as "asc" | "desc") || "asc");
  const [tab, setTab] = useState<"overview" | "members" | "gear">(() => {
    const t = searchParams.get("tab");
    return (t === "members" || t === "gear") ? t : "overview";
  });
  const switchTab = (t: "overview" | "members" | "gear") => {
    setTab(t);
    const params = new URLSearchParams(searchParams);
    params.delete("q");
    params.delete("gearq");
    if (t !== "overview") params.set("tab", t);
    setSearchParams(params, { replace: true });
  };
  const [gearData, setGearData] = useState<{ id: string; name: string; cp: number | null; serverName: string; guildName: string; slots: Record<string, { itemName?: string; rarity?: string; enh: number; imageUrl?: string }> }[]>([]);
  const [gearLoading, setGearLoading] = useState(false);
  const [gearSearch, setGearSearch] = useState(() => searchParams.get("gearq") || "");
  const [gearSortCol, setGearSortCol] = useState<string | null>(() => localStorage.getItem("ms_gearSortCol") || null);
  const [gearSortDir, setGearSortDir] = useState<"asc" | "desc">(() => (localStorage.getItem("ms_gearSortDir") as "asc" | "desc") || "desc");

  const handleGearSort = (col: string) => {
    if (gearSortCol === col) {
      const d = gearSortDir === "asc" ? "desc" : "asc";
      setGearSortDir(d);
      localStorage.setItem("ms_gearSortDir", d);
    } else {
      setGearSortCol(col);
      setGearSortDir("desc");
      localStorage.setItem("ms_gearSortCol", col);
      localStorage.setItem("ms_gearSortDir", "desc");
    }
  };

  const gearSortArrow = (col: string) =>
    gearSortCol === col ? (gearSortDir === "asc" ? " ▲" : " ▼") : " ⇅";

  // Rarity sort order: legendary > epic > rare > uncommon > common > empty
  const rarityRank: Record<string, number> = { mythic: 6, legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };

  useEffect(() => {
    if (serversLoading) return; // wait for servers to load
    if (isViewer || staffServers.length < 2) { navigate("/members", { replace: true }); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const allRows: SummaryRow[] = [];
      for (const srv of staffServers) {
        // Paginate to avoid Supabase 1000-row default limit
        let offset = 0;
        const limit = 900;
        let members: any[] = [];
        while (true) {
          const { data: batch } = await supabase.from("members").select("id, name, combat_power, class, guild_id, guilds(name)").eq("server_id", srv.id).eq("is_active", true).order("name").range(offset, offset + limit - 1);
          if (!batch || batch.length === 0) break;
          members = members.concat(batch);
          if (batch.length < limit) break;
          offset += limit;
        }
        const scoresRes = await supabase.rpc("get_member_scores", { p_server_id: srv.id });
        const scores = scoresRes.data || [];
        const growthByMember: Record<string, number> = {};
        for (const s of scores) {
          growthByMember[s.member_id] = s.cp_growth_30d ?? 0;
        }
        if (members && !cancelled) {
          for (const m of members) {
            const guildName = (m.guilds as any)?.name || "—";
            const growth = growthByMember[m.id] || 0;
            const gColor = guildName !== "—" ? guildColor(guildName) : { text: "text-zinc-500" } as ReturnType<typeof guildColor>;
            allRows.push({
              id: m.id,
              name: m.name,
              serverName: srv.name,
              guildName: guildName,
              guildTextClass: gColor.text,
              cp: m.combat_power ?? null,
              className: m.class || "—",
              growth30d: growth !== 0 ? growth : null,
            });
          }
        }
      }
      if (!cancelled) { setData(allRows); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [staffServers, isViewer, navigate, serversLoading]);

  const handleSort = (col: keyof SummaryRow) => {
    if (sortCol === col) {
      const d = sortDir === "asc" ? "desc" : "asc";
      setSortDir(d);
      localStorage.setItem("ms_sortDir", d);
    } else {
      setSortCol(col);
      setSortDir("asc");
      localStorage.setItem("ms_sortCol", col);
      localStorage.setItem("ms_sortDir", "asc");
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.serverName.toLowerCase().includes(q) ||
      r.guildName.toLowerCase().includes(q) ||
      r.className.toLowerCase().includes(q) ||
      (r.cp != null && String(r.cp).includes(q))
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortCol, sortDir]);

  const sortArrow = (col: keyof SummaryRow) =>
    sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅";

const [gearSlots, setGearSlots] = useState<{ id: string; name: string }[]>([]);

  const fetchGear = useCallback(async () => {
    setGearLoading(true);
    // Collect all server member IDs first
    const allMemberIds: string[] = [];
    const memberMap = new Map<string, { name: string; cp: number | null; serverName: string; guildName: string }>();
    for (const srv of staffServers) {
      // Paginate to avoid Supabase 1000-row default limit
      let offset = 0;
      const limit = 900;
      while (true) {
        const { data: members } = await supabase.from("members").select("id, name, combat_power, guilds(name)").eq("server_id", srv.id).eq("is_active", true).order("name").range(offset, offset + limit - 1);
        if (!members || members.length === 0) break;
        for (const m of members) {
          allMemberIds.push(m.id);
          memberMap.set(m.id, { name: m.name, cp: m.combat_power ?? null, serverName: srv.name, guildName: (m.guilds as any)?.name || "—" });
        }
        if (members.length < limit) break;
        offset += limit;
      }
    }
    if (allMemberIds.length === 0) { setGearData([]); setGearLoading(false); return; }

    // Fetch slots (global — scoped by game, readable by all)
    const { data: slots } = await supabase.from("gear_slots").select("id, name, sort_order").eq("game", "lordnine").order("sort_order");
    const slotList: { id: string; name: string }[] = (slots && slots.length > 0) ? slots as any : [
      { id: "helmet", name: "Helmet" },
      { id: "armor", name: "Armor" },
      { id: "gloves", name: "Gloves" },
      { id: "pants", name: "Pants" },
      { id: "shoes", name: "Shoes" },
      { id: "earrings", name: "Earrings" },
      { id: "necklace", name: "Necklace" },
      { id: "bracelet", name: "Bracelet" },
      { id: "ring", name: "Ring" },
      { id: "belt", name: "Belt" },
      { id: "cloak", name: "Cloak" },
      { id: "weapon", name: "Weapon" },
      { id: "passive", name: "Passive" },
    ];
    if (slots && slots.length > 0) setGearSlots(slots); else setGearSlots(slotList);

    // Fetch gear — paginate member_gear directly (avoids RPC 1000-row limit)
    const chunkSize = 300;
    const allGear: any[] = [];
    for (let i = 0; i < allMemberIds.length; i += chunkSize) {
      const chunk = allMemberIds.slice(i, i + chunkSize);
      // Paginate within each chunk too (member_gear can have many rows per member)
      let offset = 0;
      const batchSize = 500;
      while (true) {
        const { data: gear, error: gearErr } = await supabase
          .from("member_gear")
          .select("member_id, slot_id, catalog_item_id, enhancement_level, items:catalog_item_id(name, rarity, image_url)")
          .in("member_id", chunk)
          .range(offset, offset + batchSize - 1)
          .order("member_id");
        if (gearErr) {
          console.error("member_gear query error:", gearErr.message);
          break;
        }
        if (!gear || gear.length === 0) break;
        allGear.push(...gear);
        if (gear.length < batchSize) break;
        offset += batchSize;
      }
    }

    const rows: typeof gearData = [];
    for (const [mid, info] of memberMap) {
      const memberGear = allGear.filter(g => g.member_id === mid);
      const slotsMap: Record<string, { itemName?: string; rarity?: string; enh: number; imageUrl?: string }> = {};
      for (const slot of slotList) {
        const equipped = memberGear.find(g => g.slot_id === slot.name);
        const item = (equipped as any)?.catalog_item_id ? (equipped as any).items : null;
        slotsMap[slot.name] = equipped?.catalog_item_id ? {
          itemName: item?.name || undefined,
          rarity: item?.rarity || undefined,
          enh: equipped.enhancement_level || 0,
          imageUrl: item?.image_url || undefined,
        } : { enh: equipped?.enhancement_level || 0 };
      }
      rows.push({ id: mid, ...info, slots: slotsMap });
    }
    setGearData(rows);
    setGearLoading(false);
  }, [staffServers]);

  useEffect(() => { fetchGear(); }, [fetchGear]);

  return (
    <div className="w-full max-w-[100%] 2xl:max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-[#fafafa]">Member Summary</h2>
          <p className="text-sm text-[#a1a1aa]">{staffServers.length} servers · {tab === "members" ? `${data.length} members` : tab === "gear" ? `${gearData.length} gear profiles` : `${data.length} members`}</p>
        </div>
        <button
          onClick={() => navigate("/members")}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs font-medium hover:bg-[#27272a] hover:text-[#fafafa] transition"
        >
          <X className="w-3 h-3" />
          Back to Members
        </button>
      </div>

      {loading || gearLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" /></div>
      ) : (<>
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[#27272a] pb-2 mb-4">
        <button onClick={() => switchTab("overview")} className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition ${tab === "overview" ? "bg-[#18181b] text-[#fafafa] border border-[#27272a] border-b-transparent" : "text-[#71717a] hover:text-[#d4d4d8]"}`}>
          <TrendingUp className="w-3.5 h-3.5 inline mr-1" />Overview
        </button>
        <button onClick={() => switchTab("members")} className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition ${tab === "members" ? "bg-[#18181b] text-[#fafafa] border border-[#27272a] border-b-transparent" : "text-[#71717a] hover:text-[#d4d4d8]"}`}>
          <Users className="w-3.5 h-3.5 inline mr-1" />Members
        </button>
        <button onClick={() => switchTab("gear")} className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition ${tab === "gear" ? "bg-[#18181b] text-[#fafafa] border border-[#27272a] border-b-transparent" : "text-[#71717a] hover:text-[#d4d4d8]"}`}>
          <Package className="w-3.5 h-3.5 inline mr-1" />Gear Tracking
        </button>
      </div>

      {tab === "overview" && (() => {
        // --- computed data for charts ---
        const membersWithCp = data.filter(r => r.cp != null);
        const avgCp = membersWithCp.length > 0 ? Math.round(membersWithCp.reduce((s, r) => s + (r.cp ?? 0), 0) / membersWithCp.length) : null;
        const highestCp = membersWithCp.length > 0 ? Math.max(...membersWithCp.map(r => r.cp!)) : null;
        const lowestCp = membersWithCp.length > 0 ? Math.min(...membersWithCp.map(r => r.cp!)) : null;
        const growthValues = data.map(r => r.growth30d).filter((g): g is number => g != null);
        const highestGrowth = growthValues.length > 0 ? Math.max(...growthValues) : null;
        const lowestGrowth = growthValues.length > 0 ? Math.min(...growthValues) : null;

        // Server → guild → member count
        const serverGuilds: { server: string; guilds: { name: string; count: number }[]; total: number }[] = [];
        const serverMap = new Map<string, Map<string, number>>();
        for (const r of data) {
          if (!serverMap.has(r.serverName)) serverMap.set(r.serverName, new Map());
          const gm = serverMap.get(r.serverName)!;
          gm.set(r.guildName, (gm.get(r.guildName) || 0) + 1);
        }
        for (const [server, guildMap] of serverMap) {
          const guilds = [...guildMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
          serverGuilds.push({ server, guilds, total: guilds.reduce((s, g) => s + g.count, 0) });
        }

        // CP buckets — adaptive gap: wider at low CP, narrower at high CP, skip empties
        const cpValues = membersWithCp.map(r => r.cp!).sort((a, b) => a - b);
        const cpBuckets: { label: string; count: number; pct: number }[] = [];
        if (cpValues.length > 0) {
          const total = cpValues.length;
          const maxCp = cpValues[cpValues.length - 1];
          // gap shrinks linearly from ~20k at CP 0 to ~2k at high end
          const gapAt = (cp: number) => Math.max(2000, Math.round(20000 - cp * 0.08));
          let lo = Math.floor(cpValues[0] / 1000) * 1000;
          let idx = 0;
          while (lo <= maxCp && idx < cpValues.length) {
            const gap = gapAt(lo);
            const hi = lo + gap;
            let count = 0;
            while (idx < cpValues.length && cpValues[idx] < hi) { count++; idx++; }
            if (count > 0) {
              cpBuckets.push({ label: `${lo.toLocaleString()}-${hi.toLocaleString()}`, count, pct: count / total });
            }
            lo = hi;
          }
        }
        const cpMaxCount = cpBuckets.length > 0 ? Math.max(...cpBuckets.map(b => b.count)) : 1;

        // Class distribution
        const classCounts: Record<string, number> = {};
        for (const r of data) {
          const cls = r.className || "Unknown";
          classCounts[cls] = (classCounts[cls] || 0) + 1;
        }
        const classEntries = Object.entries(classCounts).sort((a, b) => b[1] - a[1]);
        const maxClassCount = Math.max(...classEntries.map(([, c]) => c), 1);

        // Gear completion by slot — with rarity breakdown
        const rarityOrder = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
        const rarityColors: Record<string, string> = { common: "#9ca3af", uncommon: "#22c55e", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b", mythic: "#f97316" };
        const slotStats: { name: string; equipped: number; empty: number; avgEnh: number; equippedPct: number; rarityCounts: Record<string, number> }[] = [];
        for (const slot of gearSlots) {
          let equipped = 0;
          let empty = 0;
          let totalEnh = 0;
          const rCounts: Record<string, number> = {};
          for (const g of gearData) {
            const s = g.slots[slot.name];
            if (s?.itemName) {
              equipped++;
              totalEnh += s.enh || 0;
              const r = (s.rarity || "common").toLowerCase();
              rCounts[r] = (rCounts[r] || 0) + 1;
            } else if ((s?.enh ?? 0) > 0) {
              equipped++;
              totalEnh += s.enh;
              rCounts["common"] = (rCounts["common"] || 0) + 1;
            } else {
              empty++;
            }
          }
          const total = equipped + empty;
          slotStats.push({
            name: slot.name,
            equipped,
            empty,
            avgEnh: equipped > 0 ? Math.round((totalEnh / equipped) * 10) / 10 : 0,
            equippedPct: total > 0 ? equipped / total : 0,
            rarityCounts: rCounts,
          });
        }

        return (
          <div className="space-y-5">
            {/* ── Key Metrics ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-[#71717a] uppercase tracking-wider">Members</p>
                  <p className="text-lg font-bold font-mono tabular-nums" style={{ color: "#3b82f6" }}>{data.length.toLocaleString()}</p>
                </div>
                <div className="space-y-1.5">
                  {serverGuilds.map(sg => (
                    <div key={sg.server} className="flex items-center gap-2 hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition">
                      <span className="text-[10px] text-[#a1a1aa] font-medium w-16 flex-shrink-0 truncate">{sg.server}</span>
                      <span className="flex flex-wrap gap-x-1.5 gap-y-0 text-[10px] flex-1 min-w-0">
                        {sg.guilds.map(g => (
                          <span key={g.name} className="whitespace-nowrap"><span className={guildColor(g.name).text}>{g.name}</span> <span className="text-[#52525b]">{g.count}</span></span>
                        ))}
                      </span>
                      <span className="text-[10px] text-[#52525b] tabular-nums flex-shrink-0">{sg.total}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-4">
                <p className="text-[11px] text-[#71717a] uppercase tracking-wider mb-2">Combat Power</p>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#52525b]">High</span>
                    <span className="text-sm font-mono tabular-nums" style={{ color: "#f59e0b" }}>{highestCp != null ? highestCp.toLocaleString() : "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#52525b]">Avg</span>
                    <span className="text-sm font-mono tabular-nums" style={{ color: "#22c55e" }}>{avgCp != null ? avgCp.toLocaleString() : "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#52525b]">Low</span>
                    <span className="text-sm font-mono tabular-nums" style={{ color: "#ef4444" }}>{lowestCp != null ? lowestCp.toLocaleString() : "—"}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-4">
                <p className="text-[11px] text-[#71717a] uppercase tracking-wider mb-2">30-Day Growth</p>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#52525b]">High</span>
                    <span className="text-sm font-mono tabular-nums" style={{ color: "#22c55e" }}>{highestGrowth != null ? (highestGrowth > 0 ? `+${highestGrowth.toLocaleString()}` : highestGrowth.toLocaleString()) : "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[#52525b]">Low</span>
                    <span className="text-sm font-mono tabular-nums" style={{ color: "#ef4444" }}>{lowestGrowth != null ? (lowestGrowth > 0 ? `+${lowestGrowth.toLocaleString()}` : lowestGrowth.toLocaleString()) : "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── CP Distribution ── */}
            <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-5">
              <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-4">CP Distribution</h3>
              {cpBuckets.length === 0 ? (
                <p className="text-sm text-[#52525b] py-8 text-center">No CP data available.</p>
              ) : (
                <div className="flex items-end gap-1 h-40">
                  {cpBuckets.map(b => (
                    <div key={b.label} className="flex-1 min-w-0 flex flex-col items-center h-full group relative">
                      <span className="text-[10px] text-[#71717a] tabular-nums flex-shrink-0">{b.count}</span>
                      <div className="flex-1 w-full relative min-h-0">
                        <div
                          className="absolute bottom-0 left-0 right-0 rounded-t-sm bg-[#3b82f6]/70 hover:bg-[#3b82f6] transition-colors"
                          style={{ height: `${Math.max((b.count / cpMaxCount) * 100, 1)}%` }}
                        />
                      </div>
                      <div className="flex-shrink-0 h-8 flex flex-col justify-start items-center w-full">
                        <span className="text-[9px] text-[#52525b] truncate w-full text-center leading-tight">{b.label}</span>
                        <span className="text-[9px] text-[#71717a] w-full text-center tabular-nums">{(b.pct * 100).toFixed(0)}%</span>
                      </div>
                      {/* tooltip */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-[#27272a] text-[#fafafa] text-[10px] px-2 py-1 rounded whitespace-nowrap z-10">
                        {b.label}: {b.count} members ({(b.pct * 100).toFixed(1)}%)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Class Distribution ── */}
            <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-5">
              <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-4">Class Distribution</h3>
              {classEntries.length === 0 ? (
                <p className="text-sm text-[#52525b] py-8 text-center">No class data available.</p>
              ) : (
                <div className="space-y-2.5">
                  {classEntries.map(([cls, count]) => {
                    const pct = (count / maxClassCount) * 100;
                    const sharePct = ((count / data.length) * 100);
                    return (
                      <div key={cls} className="flex items-center gap-2">
                        <span className="text-[11px] text-[#d4d4d8] w-20 truncate text-right">{cls}</span>
                        <div className="flex-1 h-5 bg-[#0d0d11] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#a855f7]/70 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-[#71717a] tabular-nums w-12 text-right">{count}</span>
                        <span className="text-[10px] text-[#52525b] tabular-nums w-10 text-right">{sharePct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Gear Completion by Slot ── */}
            <div className="rounded-xl border border-[#27272a] bg-[#18181b] p-5">
              <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-4">Gear Completion by Slot</h3>
              {slotStats.length === 0 ? (
                <p className="text-sm text-[#52525b] py-8 text-center">No gear data available.</p>
              ) : (
                <div className="space-y-3">
                  {slotStats.map(s => {
                    const total = s.equipped + s.empty;
                    return (
                      <div key={s.name} className="flex items-center gap-3">
                        <span className="text-[11px] text-[#d4d4d8] w-20 truncate text-right">{s.name}</span>
                        <div className="flex-1 h-6 bg-[#0d0d11] rounded-full overflow-hidden relative flex">
                          {rarityOrder.map(r => {
                            const c = s.rarityCounts[r] || 0;
                            if (c === 0) return null;
                            const w = (c / total) * 100;
                            return (
                              <div
                                key={r}
                                className="h-full flex items-center justify-center text-[9px] text-[#fafafa] font-mono drop-shadow-sm transition-all"
                                style={{ width: `${w}%`, backgroundColor: rarityColors[r], minWidth: w > 5 ? 0 : undefined }}
                                title={`${r}: ${c} members`}
                              >
                                {w > 8 ? c : ""}
                              </div>
                            );
                          })}
                        </div>
                        <span className="text-[10px] text-[#52525b] tabular-nums w-14 text-right">{s.equipped}/{total}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {(tab as string) === "members" && (<>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); const p = new URLSearchParams(searchParams); if (e.target.value) p.set("q", e.target.value); else p.delete("q"); setSearchParams(p, { replace: true }); }}
          placeholder="Search by name, server, guild, class, or CP..."
          className="w-full pl-9 pr-4 py-2 bg-[#0d0d11] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b] transition"
        />
        {search && (
          <button onClick={() => { setSearch(""); const p = new URLSearchParams(searchParams); p.delete("q"); setSearchParams(p, { replace: true }); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525b] hover:text-[#a1a1aa] transition">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>
      ) : data.length === 0 ? (
        <p className="text-sm text-[#52525b] text-center py-20">No members found.</p>
      ) : (
        <div className="rounded-xl border border-[#27272a] overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-[#0d0d11]">
              <tr className="border-b border-[#27272a]">
                <th className="text-left py-3 pl-4 pr-2 w-[40px] text-[11px] text-[#52525b] font-mono">#</th>
                <th className="text-left py-3 px-3 w-[16.66%] text-[11px] text-[#71717a] uppercase tracking-wider font-medium cursor-pointer hover:text-[#d4d4d8] select-none" onClick={() => handleSort("name")}>Player Name{sortArrow("name")}</th>
                <th className="text-left py-3 px-3 w-[16.66%] text-[11px] text-[#71717a] uppercase tracking-wider font-medium cursor-pointer hover:text-[#d4d4d8] select-none" onClick={() => handleSort("className")}>Class{sortArrow("className")}</th>
                <th className="text-left py-3 px-3 w-[16.66%] text-[11px] text-[#71717a] uppercase tracking-wider font-medium cursor-pointer hover:text-[#d4d4d8] select-none" onClick={() => handleSort("cp")}>Current CP{sortArrow("cp")}</th>
                <th className="text-left py-3 px-3 w-[16.66%] text-[11px] text-[#71717a] uppercase tracking-wider font-medium cursor-pointer hover:text-[#d4d4d8] select-none" onClick={() => handleSort("growth30d")}>30d Growth{sortArrow("growth30d")}</th>
                <th className="text-left py-3 px-3 w-[16.66%] text-[11px] text-[#71717a] uppercase tracking-wider font-medium cursor-pointer hover:text-[#d4d4d8] select-none" onClick={() => handleSort("serverName")}>Server{sortArrow("serverName")}</th>
                <th className="text-left py-3 pr-4 pl-3 w-[16.66%] text-[11px] text-[#71717a] uppercase tracking-wider font-medium cursor-pointer hover:text-[#d4d4d8] select-none" onClick={() => handleSort("guildName")}>Guild{sortArrow("guildName")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-sm text-[#52525b]">No results match your search.</td></tr>
              ) : (
                sorted.map((row, i) => (
                  <tr key={i} className="border-b border-[#27272a]/30 hover:bg-white/[0.02] transition cursor-pointer" onClick={() => navigate(`/members/${row.id}`)}>
                    <td className="py-2.5 pl-4 pr-2 text-[11px] text-[#52525b] font-mono">{i + 1}</td>
                    <td className="py-2.5 px-3 text-[#fafafa] font-medium truncate">{row.name}</td>
                    <td className="py-2.5 px-3 text-[#a1a1aa] truncate">{row.className}</td>
                    <td className="py-2.5 px-3 text-[#a1a1aa] font-mono tabular-nums">{row.cp != null ? row.cp.toLocaleString() : "—"}</td>
                    <td className="py-2.5 px-3 font-mono tabular-nums" style={{ color: row.growth30d != null ? (row.growth30d >= 0 ? "#22c55e" : "#ef4444") : "#52525b" }}>{row.growth30d != null ? (row.growth30d >= 0 ? `+${row.growth30d.toLocaleString()}` : row.growth30d.toLocaleString()) : "—"}</td>
                    <td className="py-2.5 px-3 text-[#a1a1aa] truncate">{row.serverName}</td>
                    <td className={`py-2.5 pr-4 pl-3 font-medium truncate ${row.guildTextClass}`}>{row.guildName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      </>)}  {/* end members tab */}

      {(tab as string) === "gear" && (
        gearLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>
        ) : gearData.length === 0 ? (
          <p className="text-sm text-[#52525b] text-center py-20">No gear data found.</p>
        ) : (
          <>
          {/* Gear Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
            <input
              type="text"
              value={gearSearch}
              onChange={e => { setGearSearch(e.target.value); const p = new URLSearchParams(searchParams); if (e.target.value) p.set("gearq", e.target.value); else p.delete("gearq"); setSearchParams(p, { replace: true }); }}
              placeholder="Search by name, server, or guild..."
              className="w-full pl-9 pr-4 py-2 bg-[#0d0d11] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b] transition"
            />
            {gearSearch && (
              <button onClick={() => { setGearSearch(""); const p = new URLSearchParams(searchParams); p.delete("gearq"); setSearchParams(p, { replace: true }); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525b] hover:text-[#a1a1aa] transition">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="rounded-xl border border-[#27272a] overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#0d0d11]">
                <tr className="border-b border-[#27272a]">
                  <th className="text-left py-3 pl-4 pr-2 w-[36px] text-[11px] text-[#52525b] font-mono">#</th>
                  <th className="text-left py-3 px-2 w-[130px] text-[11px] text-[#71717a] uppercase tracking-wider font-medium cursor-pointer hover:text-[#d4d4d8] select-none" onClick={() => handleGearSort("name")}>Player{gearSortArrow("name")}</th>
                  <th className="text-left py-3 px-2 w-[70px] text-[11px] text-[#71717a] uppercase tracking-wider font-medium cursor-pointer hover:text-[#d4d4d8] select-none" onClick={() => handleGearSort("cp")}>CP{gearSortArrow("cp")}</th>
                  {gearSlots.map(slot => (
                    <th key={slot.id} className="text-center py-3 px-1.5 text-[10px] text-[#71717a] uppercase tracking-wider font-medium cursor-pointer hover:text-[#d4d4d8] select-none" onClick={() => handleGearSort(slot.name)}>{slot.name}{gearSortArrow(slot.name)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const q = gearSearch.toLowerCase();
                  let filtered = q ? gearData.filter(r => r.name.toLowerCase().includes(q) || r.serverName.toLowerCase().includes(q) || r.guildName.toLowerCase().includes(q)) : gearData;
                  // Apply sort
                  if (gearSortCol) {
                    const dir = gearSortDir === "asc" ? 1 : -1;
                    filtered = [...filtered].sort((a, b) => {
                      if (gearSortCol === "name") return a.name.localeCompare(b.name) * dir;
                      if (gearSortCol === "cp") return ((a.cp ?? 0) - (b.cp ?? 0)) * dir;
                      // Gear slot column — sort by rarity then enhancement
                      const ga = a.slots[gearSortCol];
                      const gb = b.slots[gearSortCol];
                      const ra = ga?.rarity ? (rarityRank[ga.rarity.toLowerCase()] ?? 0) : 0;
                      const rb = gb?.rarity ? (rarityRank[gb.rarity.toLowerCase()] ?? 0) : 0;
                      if (ra !== rb) return (rb - ra) * dir; // higher rarity first for desc
                      return ((gb?.enh ?? 0) - (ga?.enh ?? 0)) * dir;
                    });
                  }
                  return filtered.length === 0 ? (
                    <tr><td colSpan={3 + gearSlots.length} className="py-8 text-center text-sm text-[#52525b]">No results match your search.</td></tr>
                  ) : filtered.map((row, i) => (
                  <tr key={i} className="border-b border-[#27272a]/30 hover:bg-white/[0.02] transition cursor-pointer" onClick={() => navigate(`/members/${row.id}`)}>
                    <td className="py-2 pl-4 pr-2 text-[11px] text-[#52525b] font-mono">{i + 1}</td>
                    <td className="py-2 px-2">
                      <span className="text-[#fafafa] font-medium text-xs truncate block">{row.name}</span>
                      <span className="text-[10px] text-[#52525b] block truncate">{row.serverName} — {row.guildName}</span>
                    </td>
                    <td className="py-2 px-2 text-left text-[#a1a1aa] font-mono text-xs">{row.cp != null ? row.cp.toLocaleString() : "—"}</td>
                    {(() => {
                      const rarityColors: Record<string, string> = { common: "#9ca3af", uncommon: "#22c55e", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b", mythic: "#f97316" };
                      return gearSlots.map(slot => {
                      const gear = row.slots[slot.name];
                      const hasItem = gear?.itemName != null;
                      const hasEnh = (gear?.enh ?? 0) > 0;
                      const rarityKey = gear?.rarity?.toLowerCase();
                      const rc = rarityKey ? (rarityColors[rarityKey] || "#a1a1aa") : "#52525b";
                      return (
                        <td key={slot.id} className="py-1.5 px-1 text-center" title={hasItem ? `${gear!.itemName}${hasEnh ? ` +${gear!.enh}` : ""}` : hasEnh ? `+${gear!.enh}` : "Empty"}>
                          {hasItem ? (
                            <div className="flex items-center justify-center">
                              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 relative" style={{ backgroundColor: `${rc}18` }}>
                                {gear!.imageUrl ? (
                                  <img src={gear!.imageUrl} alt={gear!.itemName} className="w-7 h-7 rounded object-cover" />
                                ) : (
                                  <span className="text-[10px] font-medium" style={{ color: rc }}>{gear!.itemName?.charAt(0)}</span>
                                )}
                                {hasEnh && (
                                  <span className="absolute right-0 bottom-0.5 text-[10px] font-black text-amber-400 bg-gradient-to-t from-black/20 to-transparent rounded-bl-lg rounded-tr-lg pl-1 pr-0.5 pt-0.5 pb-0 leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">+{gear!.enh}</span>
                                )}
                              </div>
                            </div>
                          ) : hasEnh ? (
                            <span className="text-[11px] text-amber-400/70 font-medium">+{gear!.enh}</span>
                          ) : (
                            <span className="text-[11px] text-[#3f3f46]">—</span>
                          )}
                        </td>
                      );
                    }); })()}
                  </tr>
                )); })()}
              </tbody>
            </table>
          </div>
          </>
        )
      )}
      </>)}
    </div>
  );
}
