import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useLeaderboard, type LeaderboardPeriod } from "@/hooks/useAttendance";
import { useLeaderboardSnapshots } from "@/hooks/useLeaderboardSnapshots";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { guildColor } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useServerId, useServer, useHasPermission } from "@/contexts/ServerContext";
import { useServerTimezone } from "@/hooks/useServerTimezone";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { fetchMemberKills, fetchMemberActivityHistory, type MemberBossKill, type MemberActivityAttendance, isSupabaseConfigured, fetchGuilds, adjustMemberPoints, fetchPointAdjustments, fetchPointRules, resetGuildPoints, supabase } from "@/lib/supabase";
import { useAttendance } from "@/hooks/useAttendance";
import { useMembers } from "@/hooks/useMembers";
import type { Guild, LeaderboardSnapshot, PointAdjustment } from "@/types";
import { Trophy, Medal, Crown, Users, Loader2, X, Skull, CheckCheck, History, ChevronRight, ChevronLeft, Search, Shield, Plus, Minus, Edit3, RotateCcw, Calendar, Sword, Swords, ShieldHalf, ShieldCheck, Crosshair, Wand, Heart, Zap, Flame, Snowflake, Star, Anchor, Gavel, Axe, Target, Footprints, HandMetal, Tag, AlertTriangle } from "lucide-react";
import { TableRowSkeleton } from "@/components/Skeletons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BossImage } from "@/components/BossImage";
import { ExpiredGate } from "@/components/ExpiredGate";

const rankColors: Record<number, { icon: React.ReactNode; text: string; bg: string }> = {
  1: {
    icon: <Crown className="w-5 h-5 text-[#fafafa]" />,
    text: "text-[#fafafa]",
    bg: "bg-[#18181b] border-[#27272a]",
  },
  2: {
    icon: <Medal className="w-5 h-5 text-[#d4d4d8]" />,
    text: "text-[#d4d4d8]",
    bg: "bg-[#18181b] border-[#27272a]",
  },
  3: {
    icon: <Medal className="w-5 h-5 text-[#a1a1aa]" />,
    text: "text-[#a1a1aa]",
    bg: "bg-[#18181b] border-[#27272a]",
  },
};

/** Convert a YYYY-MM-DD date range to UTC ISO strings, interpreting dates in the given timezone */
function getUtcDayRange(startDateStr: string, endDateStr: string, timezone: string): { start: string; end: string } {
  const toUtc = (dateStr: string, isEnd: boolean): string => {
    const [y, m, d] = dateStr.split("-").map(Number);
    // Use noon UTC on that date to determine the timezone offset (handles DST)
    const utcNoon = Date.UTC(y, m - 1, d, 12, 0, 0);
    const tzTime = new Date(utcNoon).toLocaleTimeString("en-US", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const [tzH, tzM] = tzTime.split(":").map(Number);
    // Offset in ms: positive = target timezone is ahead of UTC
    const offsetMs = ((tzH - 12) * 60 + tzM) * 60000;
    // Midnight in target timezone = midnight UTC - offset
    const startMs = Date.UTC(y, m - 1, d) - offsetMs;
    return new Date(isEnd ? startMs + 86400000 - 1 : startMs).toISOString();
  };
  return { start: toUtc(startDateStr, false), end: toUtc(endDateStr, true) };
}

export function LeaderboardView() {
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const { data: entries = [], isLoading } = useLeaderboard(period);
  const { user, isViewer } = useAuth();
  const { toast } = useToast();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  // Helper: fetch all rows with pagination to avoid PostgREST 1000-row limit

  // Selected member for kill history modal
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string } | null>(null);
  const [memberKills, setMemberKills] = useState<MemberBossKill[]>([]);
  const [memberActivities, setMemberActivities] = useState<MemberActivityAttendance[]>([]);
  const [memberAdjustments, setMemberAdjustments] = useState<PointAdjustment[]>([]);
  const [killsLoading, setKillsLoading] = useState(false);

  // Participant modal (when clicking a boss in kill history)
  const [participantDeathId, setParticipantDeathId] = useState<string | null>(null);
  const [participantActivityInstanceId, setParticipantActivityInstanceId] = useState<string | null>(null);
  const [participantBossName, setParticipantBossName] = useState("");
  const [participantDeathTime, setParticipantDeathTime] = useState("");

  // Leaderboard snapshots
  const { snapshots, finalizeResults, viewingSnapshot, loadSnapshot, clearViewing } =
    useLeaderboardSnapshots();
  const [finalizing, setFinalizing] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState<string | null>(null);
  const prevShowSnapshots = useRef<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [guildFilter, setGuildFilter] = useState<string>("all");
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState<string | null>(null);
  const [finalizeTime, setFinalizeTime] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  // Attendance export state
  const { currentServer } = useServer();
  if (currentServer?.isExpired) return <ExpiredGate page="Leaderboard" />;
  const serverTimezone = useServerTimezone();
  const todayInServerTz = (() => { const d = new Date(); return d.toLocaleDateString("en-CA", { timeZone: serverTimezone }); })();
  const weekAgoInServerTz = (() => { const d = new Date(Date.now() - 6 * 86400000); return d.toLocaleDateString("en-CA", { timeZone: serverTimezone }); })();
  const [showExport, setShowExport] = useState<string | null>(null);
  const [exportStartDate, setExportStartDate] = useState(weekAgoInServerTz);
  const [exportEndDate, setExportEndDate] = useState(todayInServerTz);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportRankingsOnly, setExportRankingsOnly] = useState(false);

  // Point adjustment modal state
  const { timezone: userTz } = useUserTimezone(currentServer?.timezone);
  const canAdjustPoints = useHasPermission("can_manage_points");
  const canExportAttendance = useHasPermission("can_manage_points");
  const isStaff = !isViewer && (currentServer?.role === "owner" || currentServer?.role === "moderator");
  const isOwner = currentServer?.role === "owner";
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

  const [adjustMember, setAdjustMember] = useState<{ id: string; name: string; points: number } | null>(null);
  const [adjustValue, setAdjustValue] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustHistory, setAdjustHistory] = useState<PointAdjustment[]>([]);
  const [showAdjustHistory, setShowAdjustHistory] = useState<string | null>(null);
  useEscapeKey(() => {
    setSelectedMember(null);
    setShowSnapshots(null);
    setShowFinalizeConfirm(null);
    setShowResetConfirm(null);
    setShowExport(null);
    setShowAdjustHistory(null);
  });

  // Fetch guilds and members for filtering
  const { data: members = [] } = useMembers();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(true);
  useEffect(() => {
    if (!currentServer?.id) return;
    setGuildsLoading(true);
    fetchGuilds(currentServer.id)
      .then(setGuilds)
      .catch(() => setGuilds([]))
      .finally(() => setGuildsLoading(false));
  }, [currentServer?.id]);

  // Build member-guild lookup
  const memberGuildMap = new Map(members.map(m => [m.id, m.guild_id]));
  const memberGuildNameMap = new Map(members.map(m => { const g = guilds.find(g => g.id === m.guild_id); return [m.id, g?.name ?? null] as const; }));

  // ── Class system (icons + colors from server_classes table) ──
  const [classes, setClasses] = useState<string[]>([]);
  const [classIcons, setClassIcons] = useState<Record<string, string>>({});
  const [classColors, setClassColors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!serverId) return;
    supabase.from("server_classes")
      .select("name, icon, color")
      .eq("server_id", serverId)
      .order("name")
      .then(({ data }) => {
        if (data) {
          setClasses((data as any[]).map(r => r.name));
          const icons: Record<string, string> = {};
          const colors: Record<string, string> = {};
          (data as any[]).forEach(r => { icons[r.name] = r.icon; colors[r.name] = r.color; });
          setClassIcons(icons);
          setClassColors(colors);
        }
      });
  }, [serverId]);

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

  // Build member name → class lookup
  const memberClassMap = useMemo(() => {
    const map: Record<string, string | null> = {};
    members.forEach(m => { map[m.name] = m.class ?? null; });
    return map;
  }, [members]);

  const renderClassBadge = (memberName: string) => {
    const cls = memberClassMap[memberName];
    if (!cls) return null;
    const iconName = classIcons[cls];
    const color = classColors[cls];
    const IconComp = iconName ? getClassIcon(iconName) : null;
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
        style={{ backgroundColor: color ? `${color}20` : undefined, color: color ?? undefined, border: color ? `1px solid ${color}40` : undefined }}
        title={cls}
      >
        {IconComp && <IconComp className="w-3 h-3" />}
        {cls}
      </span>
    );
  };

  const filteredEntries = (() => { let r = entries; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter(e => e.name.toLowerCase().includes(q)); } return r; })();

  const guildGroups = (() => { const g = new Map<string | null, typeof entries>(); for (const e of filteredEntries) { const n = memberGuildNameMap.get(e.id) ?? null; if (!g.has(n)) g.set(n, []); g.get(n)!.push(e); } return [...g.entries()].sort(([a],[b]) => a === null ? 1 : b === null ? -1 : a.localeCompare(b)); })();

  // Group guild groups into carousel pages (2 per page on lg+, 1 on mobile)
  const carouselPages = useMemo(() => {
    const pages: (typeof guildGroups)[] = [];
    for (let i = 0; i < guildGroups.length; i += itemsPerPage) {
      pages.push(guildGroups.slice(i, i + itemsPerPage));
    }
    return pages;
  }, [guildGroups, itemsPerPage]);

  // Swipe handlers (must be after guildGroups)
  const handleSwipeStart = useCallback((clientX: number) => {
    touchStartX.current = clientX;
    isSwiping.current = true;
  }, []);

  const handleSwipeMove = useCallback((clientX: number) => {
    if (!isSwiping.current) return;
    touchDeltaX.current = clientX - touchStartX.current;
  }, []);

  const handleSwipeEnd = useCallback(() => {
    if (!isSwiping.current) return;
    isSwiping.current = false;
    const threshold = 50;
    if (touchDeltaX.current > threshold) {
      setCarouselPage(p => p === 0 ? carouselPages.length - 1 : p - 1);
    } else if (touchDeltaX.current < -threshold) {
      setCarouselPage(p => p >= carouselPages.length - 1 ? 0 : p + 1);
    }
    touchDeltaX.current = 0;
  }, [carouselPages.length]);

  useEffect(() => { if (!serverId) return; const s = localStorage.getItem(`raidscout-carousel-${serverId}`); if (s) setCarouselPage(parseInt(s, 10)); }, [serverId]);
  useEffect(() => { if (serverId) localStorage.setItem(`raidscout-carousel-${serverId}`, String(carouselPage)); }, [carouselPage, serverId]);
  useEffect(() => { setCarouselPage(p => p >= carouselPages.length && carouselPages.length > 0 ? carouselPages.length - 1 : p); }, [carouselPages.length]);

  // Auto-open member from URL param (linked from History page)
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    const memberName = searchParams.get("member");
    if (memberName && entries.length > 0) {
      const entry = entries.find((e) => e.name.toLowerCase() === memberName.toLowerCase());
      if (entry) {
        setSelectedMember({ id: entry.id, name: entry.name });
        setKillsLoading(true);
        // Calculate period start, accounting for last finalized snapshot reset
        (async () => {
          let since = "1970-01-01T00:00:00Z";
          try { const { data: snaps } = await supabase.from("leaderboard_snapshots").select("finalized_at").eq("period", period).eq("server_id", serverId).order("finalized_at", { ascending: false }).limit(1); if (snaps && snaps.length > 0) since = (snaps[0] as any).finalized_at; } catch (err) { console.error("[Leaderboard] snapshot fetch failed:", err); }
          const [kills, activities, adjustments] = await Promise.all([
            fetchMemberKills(entry.id, since, serverId, serverTimezone).catch(() => [] as MemberBossKill[]),
            fetchMemberActivityHistory(entry.id, since, serverId).catch(() => [] as MemberActivityAttendance[]),
            fetchPointAdjustments(serverId!, entry.id, since).catch(() => [] as PointAdjustment[]),
          ]);
          setMemberKills(kills);
          setMemberActivities(activities);
          setMemberAdjustments(adjustments);
          setKillsLoading(false);
        })();
        // Clear the param so it doesn't re-trigger
        searchParams.delete("member");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [entries]);

  // ── Realtime: refresh leaderboard when any boss is killed ──
  useEffect(() => {
    if (!configured || !serverId) return;

    const channel = supabase
      .channel(`leaderboard-live-${serverId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "death_records", filter: `server_id=eq.${serverId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("Leaderboard realtime channel error");
        }
      });

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [configured, serverId, queryClient]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "Never";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading || guildsLoading) {
    return (
    <div className="max-w-[100%] 2xl:max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="bg-[#09090b] border border-[#27272a] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={4} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const buildSnapshotShareText = (snap: LeaderboardSnapshot) => {
    const periodLabel = snap.period === "weekly" ? "Weekly" : snap.period === "monthly" ? "Monthly" : "All Time";
    const lines = snap.rankings.slice(0, 20).map((r, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      return `${medal} ${r.memberName} — ${r.points} pts`;
    });
    return `🏆 ${currentServer?.name} — ${periodLabel} Results\n\n${lines.join("\n")}\n\n📊 raidscout.com`;
  };

  // ── Attendance Export ─────────────────────────────────────

  const handleExportAttendance = async () => {
    if (!exportStartDate || !exportEndDate || !serverId || !showExport) return;
    const guildName = showExport;
    setExportLoading(true);
    try {
      const guild = guilds.find(g => g.name === guildName);
      if (!guild) { alert("Guild not found."); setExportLoading(false); return; }

      // Interpret dates as server-timezone calendar days, then convert to UTC for DB comparison
      const { start: startISO, end: endISO } = getUtcDayRange(exportStartDate, exportEndDate, serverTimezone);

      // Fetch members of this guild
      const { data: guildMembers } = await supabase
        .from("members")
        .select("id,name")
        .eq("guild_id", guild.id)
        .eq("server_id", serverId);
      if (!guildMembers?.length) { alert("No members in this guild."); setExportLoading(false); return; }
      const memberMap = new Map(guildMembers.map((m: any) => [m.id, m.name]));
      const memberIds = guildMembers.map((m: any) => m.id);

      // Fetch ALL death records where this guild's members participated (not just owned by guild)
      // Step 1: find which deaths guild members attended
      const { data: attForDeaths } = await supabase
        .from("attendance_records")
        .select("death_record_id")
        .in("member_id", memberIds);
      const allParticipatedDeathIds = [...new Set((attForDeaths || []).map((a: any) => a.death_record_id))];
      
      // Step 2: also include deaths owned by this guild
      const { data: ownedDeaths } = await supabase
        .from("death_records")
        .select("id")
        .eq("owner_guild_id", guild.id)
        .gte("death_time", startISO)
        .lte("death_time", endISO);
      const ownedDeathIds = (ownedDeaths || []).map((d: any) => d.id);
      
      // Step 3: combine and filter by date range
      const candidateDeathIds = [...new Set([...allParticipatedDeathIds, ...ownedDeathIds])];
      if (!candidateDeathIds.length) {
        // No boss kills — check if there are activities instead
        const { data: actCheck } = await supabase
          .from("activity_attendance")
          .select("activity_instance_id")
          .in("member_id", memberIds)
          .eq("present", true)
          .limit(1);
        if (!actCheck?.length) {
          alert("No boss kills or activities for " + guildName + " members in this date range.");
          setExportLoading(false);
          return;
        }
        // Continue with empty deaths — activities will populate the export
      }

      let deaths: any[] = [];
      let deathIds: string[] = [];
      let bossIds: string[] = [];
      if (candidateDeathIds.length > 0) {
        const { data: d, error: deathsErr } = await supabase
          .from("death_records")
          .select("id,boss_id,death_time,party_leaders,owner_guild_id")
          .in("id", candidateDeathIds)
          .gte("death_time", startISO)
          .lte("death_time", endISO)
          .order("death_time", { ascending: true });
        if (deathsErr) throw new Error(`Death records: ${deathsErr.message}`);
        deaths = d || [];
        deathIds = deaths.map((d: any) => d.id);
        bossIds = [...new Set(deaths.map((d: any) => d.boss_id))];
      }

      // Fetch bosses
      const { data: bosses } = await supabase
        .from("bosses")
        .select("id,name,boss_points")
        .in("id", bossIds);
      const bossMap = new Map((bosses || []).map((b: any) => [b.id, b]));

      // Fetch per-guild point overrides + salary flags for this guild's bosses
      const { data: bgData } = await supabase
        .from("boss_guilds")
        .select("boss_id,points,has_salary")
        .eq("guild_id", guild.id)
        .in("boss_id", bossIds);
      const bgPointsMap = new Map<string, number>();
      const salaryMap = new Map<string, boolean>();
      for (const bg of (bgData || [])) {
        if (bg.points != null) bgPointsMap.set(bg.boss_id, bg.points);
        if (bg.has_salary) salaryMap.set(bg.boss_id, true);
      }

      // Fetch boss assists — bosses where this guild assists another guild
      const { data: assistData } = await supabase
        .from("boss_assists")
        .select("boss_id,owner_guild_id,assistant_guild_id")
        .eq("assistant_guild_id", guild.id)
        .eq("server_id", serverId);
      // Build set of "boss_id|owner_guild_id" combos this guild assists on
      const assistCombos = new Set((assistData || []).map((a: any) => `${a.boss_id}|${a.owner_guild_id}`));
      // Fetch boss names for assist summary (all assisted bosses)
      const assistBossIds = [...new Set((assistData || []).map((a: any) => a.boss_id))];
      let assistBossMap = new Map<string, string>();
      if (assistBossIds.length > 0) {
        const { data: assistBosses } = await supabase
          .from("bosses")
          .select("id,name")
          .in("id", assistBossIds)
          .eq("server_id", serverId);
        assistBossMap = new Map((assistBosses || []).map((b: any) => [b.id, b.name]));
      }

      // Fetch all guilds for name lookup in assist column
      const { data: allGuilds } = await supabase
        .from("guilds")
        .select("id,name")
        .eq("server_id", serverId);
      const guildNameMap = new Map((allGuilds || []).map((g: any) => [g.id, g.name]));

      // Fetch time-based multipliers for this guild
      let guildMultipliers: { start_hour: number; end_hour: number; multiplier: number }[] = [];
      const { data: rules } = await supabase
        .from("point_rules")
        .select("config")
        .eq("server_id", serverId)
        .eq("guild_id", guild.id)
        .eq("rule_type", "time_multiplier")
        .eq("enabled", true);
      for (const rule of (rules || [])) {
        const cfg = (rule as any).config as any;
        if (cfg) guildMultipliers.push({ start_hour: cfg.start_hour, end_hour: cfg.end_hour, multiplier: cfg.multiplier });
      }

      const getMultiplier = (deathTime: string): number => {
        if (!guildMultipliers.length) return 1;
        const tz = serverTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const hour = parseInt(new Date(deathTime).toLocaleString("en-US", { timeZone: tz, hour: "2-digit", hour12: false }), 10);
        let mult = 1;
        for (const r of guildMultipliers) {
          const match = r.start_hour <= r.end_hour
            ? hour >= r.start_hour && hour < r.end_hour
            : hour >= r.start_hour || hour < r.end_hour;
          if (match) mult = Math.max(mult, r.multiplier);
        }
        return mult;
      };

      // Helper: get effective points for a boss (per-guild override > default)
      const getBossPoints = (bossId: string): number => {
        return bgPointsMap.get(bossId) ?? (bossMap.get(bossId) as any)?.boss_points ?? 1;
      };

      // Fetch attendance records for these deaths, filtered to guild members
      const { data: attRecords } = await supabase
        .from("attendance_records")
        .select("death_record_id,member_id")
        .in("death_record_id", deathIds)
        .in("member_id", memberIds);

      // Build per-death attendance
      const deathAttendees = new Map<string, Set<string>>();
      for (const att of (attRecords || [])) {
        if (!deathAttendees.has(att.death_record_id)) deathAttendees.set(att.death_record_id, new Set());
        deathAttendees.get(att.death_record_id)!.add(att.member_id);
      }

      // Sort members alphabetically
      const sortedMembers = memberIds.sort((a, b) => (memberMap.get(a) || "").localeCompare(memberMap.get(b) || ""));

      // Compute player totals with per-guild overrides + time multipliers
      const memberTotals = new Map<string, number>();
      for (const mid of memberIds) memberTotals.set(mid, 0);
      for (const [deathId, memberSet] of deathAttendees) {
        const death = deaths.find((d: any) => d.id === deathId);
        const basePts = getBossPoints(death?.boss_id);
        const mult = getMultiplier(death?.death_time);
        for (const mid of memberSet) {
          memberTotals.set(mid, (memberTotals.get(mid) || 0) + basePts * mult);
        }
      }

      // ── Activity Attendance ──
      // Fetch activity instances in date range for this server's activities that guild members attended
      let activityRows: any[][] = [];
      {
        const actDateFmt = new Intl.DateTimeFormat("en-US", { timeZone: serverTimezone, month: "short", day: "numeric", year: "numeric" });
        const actTimeFmt = new Intl.DateTimeFormat("en-US", { timeZone: serverTimezone, hour: "2-digit", minute: "2-digit" });
        const { data: actAtt } = await supabase
          .from("activity_attendance")
          .select("activity_instance_id,member_id")
          .in("member_id", memberIds)
          .eq("present", true);

        if (actAtt && actAtt.length > 0) {
          const actInstanceIds = [...new Set(actAtt.map((a: any) => a.activity_instance_id))];

          const { data: actInstances } = await supabase
            .from("activity_instances")
            .select("id,end_time,activity_id")
            .in("id", actInstanceIds)
            .gte("end_time", startISO)
            .lte("end_time", endISO);

          if (actInstances && actInstances.length > 0) {
            const filteredIds = new Set(actInstances.map((ai: any) => ai.id));
            const actInstanceMap = new Map(actInstances.map((ai: any) => [ai.id, ai]));

            const actIds = [...new Set(actInstances.map((ai: any) => ai.activity_id))];
            const { data: activities } = await supabase
              .from("activities")
              .select("id,name,points_per_participant")
              .in("id", actIds)
              .eq("server_id", serverId);
            const activityMap = new Map((activities || []).map((a: any) => [a.id, a]));

            // Build activity attendance sets
            const activityAttendees = new Map<string, Set<string>>();
            for (const att of actAtt) {
              if (!filteredIds.has(att.activity_instance_id)) continue;
              if (!activityAttendees.has(att.activity_instance_id)) {
                activityAttendees.set(att.activity_instance_id, new Set());
              }
              activityAttendees.get(att.activity_instance_id)!.add(att.member_id);
            }

            // Add activity points to member totals
            for (const [aiId, memberSet] of activityAttendees) {
              const ai = actInstanceMap.get(aiId);
              const activity = activityMap.get(ai?.activity_id);
              const pts = activity?.points_per_participant ?? 1;
              for (const mid of memberSet) {
                memberTotals.set(mid, (memberTotals.get(mid) || 0) + pts);
              }
            }

            // Build activity data rows (sorted by end_time, then by instance id)
            const sortedInstances = actInstances.sort((a: any, b: any) =>
              a.end_time.localeCompare(b.end_time) || a.id.localeCompare(b.id));

            for (const ai of sortedInstances) {
              const attendees = activityAttendees.get(ai.id);
              if (!attendees || attendees.size === 0) continue;
              const activity = activityMap.get(ai.activity_id);
              const pts = activity?.points_per_participant ?? 1;
              const row: any[] = [
                attendees.size,
                actDateFmt.format(new Date(ai.end_time)),
                actTimeFmt.format(new Date(ai.end_time)),
                `\u{1F3AF} ${activity?.name || "Activity"}`,  // 🎯 marker for activity
                "",  // no party leader
                "—", // no salary
              ];
              sortedMembers.forEach(mid => {
                row.push(attendees.has(mid) ? pts : "");
              });
              activityRows.push(row);
            }
          }
        }
      }

      const sortedRanking = [...memberTotals.entries()].sort((a, b) => b[1] - a[1]);

      // Build Excel-compatible HTML table
      let html = `<html><head><meta charset="utf-8"><style>
        table { border-collapse: collapse; font-family: -apple-system, sans-serif; font-size: 11px; }
        th, td { padding: 6px 10px; border: 1px solid #334155; text-align: center; }
        .hdr { background: #1E293B; color: #fff; font-weight: bold; }
        .boss { font-weight: bold; color: #F87171; text-align: left; }
        .even { background: #1E293B; color: #E2E8F0; }
        .odd { background: #0F172A; color: #E2E8F0; }
        .pts-yes { font-weight: bold; color: #FBBF24; }
        .pts-no { color: #475569; }
        .rnk { text-align: center; color: #94A3B8; }
        .nm { color: #E2E8F0; text-align: left; }
        .num { text-align: center; color: #FBBF24; font-weight: bold; }
        .summary { background: #1E293B; padding: 8px 12px; margin-bottom: 12px; border-radius: 6px; font-size: 11px; color: #94A3B8; }
        .summary span { color: #60A5FA; font-weight: bold; }
</style></head><body>`;

      // ── Assisted Bosses Summary ──
      if (assistData && assistData.length > 0) {
        // Group assists by owner guild
        const assistByOwner = new Map<string, { guildName: string; bosses: Set<string> }>();
        for (const a of assistData) {
          const ownerName = guildNameMap.get(a.owner_guild_id) || a.owner_guild_id.substring(0, 8);
          if (!assistByOwner.has(a.owner_guild_id)) {
            assistByOwner.set(a.owner_guild_id, { guildName: ownerName, bosses: new Set() });
          }
          const bossName = assistBossMap.get(a.boss_id) || bossMap.get(a.boss_id)?.name || a.boss_id.substring(0, 8);
          assistByOwner.get(a.owner_guild_id)!.bosses.add(bossName);
        }
        html += `<div class="summary"><strong>${guildName}</strong> assists: `;
        const parts: string[] = [];
        for (const [ownerId, info] of assistByOwner) {
          parts.push(`<span>${info.guildName}</span> → [${[...info.bosses].sort().join(", ")}]`);
        }
        html += parts.join(" &nbsp;|&nbsp; ") + `</div>`;
      }

      html += `<table>`;

      const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: serverTimezone, month: "short", day: "numeric", year: "numeric" });
      const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: serverTimezone, hour: "2-digit", minute: "2-digit" });

      if (exportRankingsOnly) {
        // ── Rankings only ──
        html += `<tr><th class="hdr">#</th><th class="hdr" style="text-align:left">Player</th><th class="hdr">Total Pts</th></tr>`;
        sortedRanking.forEach(([mid, pts], i) => {
          const cls = i % 2 === 0 ? "even" : "odd";
          const medal = i === 0 ? "\u{1F947}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : `${i + 1}`;
          html += `<tr><td class="rnk ${cls}">${medal}</td><td class="nm ${cls}">${memberMap.get(mid) || "?"}</td><td class="num ${cls}">${pts}</td></tr>`;
        });
      } else {
        // ── Data + Rankings ──
        const playerColors = ["#7C3AED","#059669","#D97706","#0891B2","#DB2777","#4F46E5"];
        // Header row 0: player names + ranking header
        html += `<tr><th class="hdr">#</th><th class="hdr">Date</th><th class="hdr">Time</th><th class="hdr boss" style="text-align:left">Boss / Activity</th><th class="hdr">Party Leader</th><th class="hdr">Salary</th>`;
        sortedMembers.forEach((mid, i) => {
          html += `<th class="hdr" style="background:${playerColors[i % 6]}">${memberMap.get(mid) || "?"}</th>`;
        });
        html += `<th class="hdr" style="background:#1E293B;min-width:16px"></th><th class="hdr" colspan="3" style="background:#7C3AED">\u{1F3C6} Ranking</th></tr>`;

        // Header row 1: player totals + ranking sub-header
        html += `<tr><th class="hdr">#</th><th class="hdr">Date</th><th class="hdr">Time</th><th class="hdr">Boss / Activity</th><th class="hdr">Party Leader</th><th class="hdr">Salary</th>`;
        sortedMembers.forEach((mid, i) => {
          html += `<th class="hdr" style="background:${playerColors[i % 6]};font-size:14px">${memberTotals.get(mid) || 0}</th>`;
        });
        html += `<th class="hdr" style="background:#1E293B"></th><th class="hdr" style="background:#1E293B;color:#94A3B8">#</th><th class="hdr" style="background:#1E293B;color:#94A3B8;text-align:left">Player</th><th class="hdr" style="background:#1E293B;color:#94A3B8">Pts</th></tr>`;

        // Data rows + ranking side by side
        const dataRows: any[][] = [];
        deaths.forEach((death: any) => {
          const attendees = deathAttendees.get(death.id);
          if (!attendees || attendees.size === 0) return;
          const boss = bossMap.get(death.boss_id);
          const pl = (death.party_leaders || {}) as Record<string, string>;
          const leaderName = pl[guild.id] ? (memberMap.get(pl[guild.id]) || "") : "";
          const salaryYes = salaryMap.get(death.boss_id) === true ? "YES" : "NO";
          // Determine assist status
          const isAssist = death.owner_guild_id && death.owner_guild_id !== guild.id;
          const assistKey = `${death.boss_id}|${death.owner_guild_id}`;
          const isConfiguredAssist = assistCombos.has(assistKey);
          const ownerGuildName = isAssist ? (guildNameMap.get(death.owner_guild_id) || "?") : "";
          const assistLabel = isAssist
            ? (isConfiguredAssist ? `Assist (${ownerGuildName})` : `Attended (${ownerGuildName})`)
            : "Own";
          const assistStyle = isAssist
            ? (isConfiguredAssist ? "color:#60A5FA" : "color:#9CA3AF")
            : "color:#34D399";
          const row: any[] = [
            attendees.size,
            dateFmt.format(new Date(death.death_time)),
            timeFmt.format(new Date(death.death_time)),
            boss?.name || "?",
            leaderName,
            salaryYes,
          ];
          sortedMembers.forEach(mid => {
            const effectivePts = getBossPoints(death.boss_id) * getMultiplier(death.death_time);
            row.push(attendees.has(mid) ? effectivePts : "");
          });
          dataRows.push(row);
        });

        // Append activity rows after boss rows
        for (const aRow of activityRows) {
          dataRows.push(aRow);
        }

        const maxR = Math.max(dataRows.length, sortedRanking.length);
        for (let ri = 0; ri < maxR; ri++) {
          const cls = ri % 2 === 0 ? "even" : "odd";
          html += `<tr>`;
          if (ri < dataRows.length) {
            const row = dataRows[ri];
            html += `<td class="${cls}">${row[0]}</td><td class="${cls}">${row[1]}</td><td class="${cls}">${row[2]}</td><td class="boss ${cls}">${row[3]}</td><td class="${cls}">${row[4] || ""}</td><td class="num ${cls}" style="color:${row[5] === 'YES' ? '#34D399' : '#64748B'}">${row[5]}</td>`;
            for (let c = 6; c < row.length; c++) {
              html += `<td class="${cls} ${row[c] > 0 ? 'pts-yes' : 'pts-no'}">${row[c] || ""}</td>`;
            }
          } else {
            html += `<td class="${cls}"></td><td class="${cls}"></td><td class="${cls}"></td><td class="${cls}"></td><td class="${cls}"></td><td class="${cls}"></td>`;
            for (let c = 0; c < sortedMembers.length; c++) html += `<td class="${cls}"></td>`;
          }
          html += `<td class="${cls}"></td>`;
          if (ri < sortedRanking.length) {
            const [mid, pts] = sortedRanking[ri];
            const name = memberMap.get(mid) || "?";
            const medal = ri === 0 ? "\u{1F947}" : ri === 1 ? "\u{1F948}" : ri === 2 ? "\u{1F949}" : `${ri + 1}`;
            html += `<td class="rnk ${cls}">${medal}</td><td class="nm ${cls}">${name}</td><td class="num ${cls}">${pts}</td>`;
          } else {
            html += `<td class="${cls}"></td><td class="${cls}"></td><td class="${cls}"></td>`;
          }
          html += `</tr>`;
        }
      }

      html += `</table></body></html>`;

      const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${guildName}-attendance-${exportStartDate}_to_${exportEndDate}.xls`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Check console for details.");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="max-w-[100%] 2xl:max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-2 sm:space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#18181b] border border-[#27272a]">
            <Trophy className="w-5 h-5 text-[#fafafa]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#fafafa]">Leaderboard</h2>
            <p className="text-sm text-[#a1a1aa]">
              {entries.length} member{entries.length !== 1 ? "s" : ""}
              {period === "all" ? "" : " · Since Reset"}
              {" · "}Points per boss set in Settings
            </p>
          </div>
        </div>
      </div>

      {/* Period tabs */}
      <div className="flex bg-[#18181b] rounded-lg p-0.5">
        {(["weekly", "all"] as LeaderboardPeriod[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${period === p ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#fafafa]"}`}>
            {p === "all" ? "All Time" : "Since Reset"}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 text-[#71717a] mx-auto mb-3" />
          <p className="text-[#71717a] text-lg">No members yet</p>
          <p className="text-[#52525b] text-sm mt-1">
            Record a boss death with attendees to start the leaderboard.
          </p>
        </div>
      ) : (
        <>
          {/* Search + Guild filter — always visible */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#71717a]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search member..."
                className="w-full pl-9 pr-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] placeholder-[#71717a] text-sm focus:outline-none focus:ring-2 focus:ring-[#fafafa]/30/50 focus:border-[#27272a] transition"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#a1a1aa] hover:text-[#fafafa]">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {guildGroups.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-[#71717a] mx-auto mb-3" />
              <p className="text-[#71717a] text-lg">No members found</p>
              <p className="text-[#52525b] text-sm mt-1">
                {searchQuery ? "Try adjusting your search." : "Record a boss death with attendees to start the leaderboard."}
              </p>
            </div>
          ) : (
            <>
            {/* Per-guild Export Attendance panel */}
            <div className={`transition-all duration-300 ease-out overflow-hidden ${showExport ? "max-h-48 opacity-100 mb-3" : "max-h-0 opacity-0"}`}>
              <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-[#d4d4d8]">
                    Export <span className="text-amber-400">{showExport}</span> Attendance
                  </p>
                  <button onClick={() => setShowExport(null)} className="text-[#71717a] hover:text-[#fafafa]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-[#71717a]">Start</label>
                    <input type="date" value={exportStartDate} onChange={(e) => setExportStartDate(e.target.value)} className="px-2 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] text-xs outline-none focus:ring-2 focus:ring-[#fafafa]/30/50 transition" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-[#71717a]">End</label>
                    <input type="date" value={exportEndDate} onChange={(e) => setExportEndDate(e.target.value)} className="px-2 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] text-xs outline-none focus:ring-2 focus:ring-[#fafafa]/30/50 transition" />
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer pb-1.5">
                    <input type="checkbox" checked={exportRankingsOnly} onChange={(e) => setExportRankingsOnly(e.target.checked)} className="w-3 h-3 rounded border-[#52525b] bg-[#18181b] text-[#a1a1aa] focus:ring-[#fafafa]/30 cursor-pointer" />
                    <span className="text-[10px] text-[#a1a1aa] whitespace-nowrap">Rankings only</span>
                  </label>
                  <button onClick={() => handleExportAttendance()} disabled={exportLoading || !exportStartDate || !exportEndDate} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-[#fafafa] hover:bg-amber-500 transition disabled:opacity-50 flex items-center gap-1.5">
                    {exportLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Export Excel
                  </button>
                </div>
                <p className="text-[10px] text-[#52525b]">{exportRankingsOnly ? "Exports a simple ranking list: rank, player, total points." : "Exports a pivot table + ranking side by side. Rows = bosses, columns = players."}</p>
              </div>
            </div>
            <div className="relative">
              {carouselPages.length > 1 && (<>
                <button onClick={() => setCarouselPage(p => p === 0 ? carouselPages.length - 1 : p - 1)} className="absolute left-0 top-0 bottom-0 z-10 px-2 flex items-center bg-[#09090b]/40 hover:bg-[#09090b]/60 transition -ml-2 rounded-l-xl">
                  <ChevronLeft className="w-6 h-6 text-[#d4d4d8]" />
                </button>
                <button onClick={() => setCarouselPage(p => p >= carouselPages.length - 1 ? 0 : p + 1)} className="absolute right-0 top-0 bottom-0 z-10 px-2 flex items-center bg-[#09090b]/40 hover:bg-[#09090b]/60 transition -mr-2 rounded-r-xl">
                  <ChevronRight className="w-6 h-6 text-[#d4d4d8]" />
                </button>
              </>)}
              <div className="overflow-hidden px-10"
                onTouchStart={e => handleSwipeStart(e.touches[0].clientX)}
                onTouchMove={e => handleSwipeMove(e.touches[0].clientX)}
                onTouchEnd={handleSwipeEnd}
                onMouseDown={e => { e.preventDefault(); handleSwipeStart(e.clientX); }}
                onMouseMove={e => handleSwipeMove(e.clientX)}
                onMouseUp={handleSwipeEnd}
                onMouseLeave={handleSwipeEnd}
              >
                <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${carouselPage * 100}%)` }}>
                  {carouselPages.map((pageGuilds, pageIdx) => (
                    <div key={pageIdx} className="w-full flex-shrink-0 px-2">
                      <div className="flex flex-col lg:flex-row gap-4">
                        {pageGuilds.map(([guildName, guildEntries]) => {
                          const gColor = guildName ? guildColor(guildName) : { bg: "bg-[#18181b]", text: "text-[#d4d4d8]", border: "border-[#27272a]" };
                          const guildSnapCount = guildName ? snapshots.filter(s => (s as any).period?.startsWith("weekly:") && (s as any).period.includes(guildName)).length : 0;
                          return (
                            <div key={guildName ?? "__unguilded__"} className="flex-1 min-w-0">
                              <div className="rounded-xl border border-[#27272a] bg-[#18181b] overflow-hidden">
                                {/* Guild header — subtle guild color accent */}
                                <div className={`px-3 py-2.5 border-b border-[#27272a] flex items-center gap-2 flex-wrap bg-[#09090b]/50`}>
                                  <Shield className={`w-5 h-5 shrink-0 ${gColor.text}`} />
                                  <span className={`text-sm font-semibold ${gColor.text} truncate`}>{guildName ?? "Unguilded"}</span>
                                  <span className="text-xs text-[#71717a] font-medium">{guildEntries.length}</span>
                                  {guildName && (
                                    <button onClick={(e) => { e.stopPropagation(); setShowSnapshots(guildName); }} className="text-xs px-2.5 py-1 rounded bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-amber-400 transition flex items-center gap-1" title={`${guildName} history (${guildSnapCount} results)`}>
                                      <History className="w-3.5 h-3.5" />History{guildSnapCount > 0 ? ` (${guildSnapCount})` : ""}
                                    </button>
                                  )}
                                  {isStaff && guildName && (
                                    <button onClick={async (e) => { e.stopPropagation(); setShowAdjustHistory(guildName); if (serverId) { try { setAdjustHistory(await fetchPointAdjustments(serverId)); } catch { setAdjustHistory([]); } } }} className="text-xs px-2.5 py-1 rounded bg-[#18181b] border border-[#27272a] text-purple-400 hover:text-purple-300 transition" title={`${guildName} point history`}>
                                      Points
                                    </button>
                                  )}
                                  {canExportAttendance && guildName && (
                                    <button onClick={(e) => { e.stopPropagation(); setShowExport(showExport === guildName ? null : guildName); }} className={`text-xs px-2.5 py-1 rounded border transition flex items-center gap-1 ${showExport === guildName ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "bg-[#18181b] border-[#27272a] text-[#a1a1aa] hover:text-amber-400"}`} title={`Export ${guildName} attendance`}>
                                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export
                                    </button>
                                  )}
                                  {isStaff && guildName && (
                                    <button onClick={(e) => { e.stopPropagation(); const now = new Date(); setFinalizeTime(now.toISOString().slice(0, 16)); setShowFinalizeConfirm(guildName); }} className="ml-auto text-xs px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition" title={`Finalize ${guildName} rankings`}>
                                      Finalize
                                    </button>
                                  )}
                                  {isOwner && guildName && (
                                    <button onClick={(e) => { e.stopPropagation(); setShowResetConfirm(guildName); }} className="text-xs px-2.5 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition flex items-center gap-1" title={`Reset all ${guildName} points`}>
                                      <RotateCcw className="w-3.5 h-3.5" />Reset
                                    </button>
                                  )}
                                </div>
                                {/* Member rows */}
                                <div className="divide-y divide-[#27272a]/50">
                                  {guildEntries.map((entry, i) => {
                                    const rank = i + 1;
                                    const style = rankColors[rank];
                                    return (
                                      <div
                                        key={entry.id}
                                        onClick={async () => {
                                          setSelectedMember({ id: entry.id, name: entry.name });
                                          setKillsLoading(true);
                                          try {
                                            let since = "1970-01-01T00:00:00Z";
                                            if (period !== "all" && guildName) {
                                              // Per-guild reset: use guild-specific reset date from app_settings
                                              const { data: settings } = await supabase
                                                .from("app_settings")
                                                .select("value")
                                                .eq("server_id", serverId)
                                                .eq("key", `leaderboard_reset_at:${guildName}`)
                                                .maybeSingle();
                                              if (settings) since = (settings as any).value;
                                            }
                                            if (configured) {
                                              const [kills, activities, adjustments] = await Promise.all([
                                                fetchMemberKills(entry.id, since, serverId, serverTimezone),
                                                fetchMemberActivityHistory(entry.id, since, serverId),
                                                fetchPointAdjustments(serverId!, entry.id, since).catch(() => [] as PointAdjustment[]),
                                              ]);
                                              setMemberKills(kills);
                                              setMemberActivities(activities);
                                              setMemberAdjustments(adjustments);
                                            }
                                          } catch { setMemberKills([]); setMemberActivities([]); setMemberAdjustments([]); }
                                          finally { setKillsLoading(false); }
                                        }}
                                        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 transition"
                                      >
                                        <div className="flex items-center justify-center w-6 h-6 shrink-0">
                                          {style ? <span className="scale-75">{style.icon}</span> : <span className="text-xs font-bold text-[#71717a]">{rank}</span>}
                                        </div>
                                        <span className="text-sm text-[#fafafa] flex-1 truncate flex items-center gap-1.5">
                                          {(() => { const cls = memberClassMap[entry.name]; if (!cls) return null; const iconName = classIcons[cls]; const IconComp = iconName ? getClassIcon(iconName) : null; const color = classColors[cls]; return IconComp ? <IconComp className="w-3.5 h-3.5 shrink-0" style={{ color }} /> : null; })()}
                                          {entry.name}
                                        </span>
                                        <span className="text-xs font-mono text-[#a1a1aa]">
                                          {entry.points}pt
                                        </span>
                                        {canAdjustPoints && (
                                          <button onClick={(e) => { e.stopPropagation(); setAdjustMember({ id: entry.id, name: entry.name, points: entry.points }); setAdjustValue(0); setAdjustReason(""); setAdjustError(null); }} className="p-0.5 rounded text-[#52525b] hover:text-amber-400 transition" title="Adjust points">
                                            <Edit3 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
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
          )}
        </>
      )}

      {/* Previous Results modal */}
      {showSnapshots !== null && snapshots.length > 0 && (() => {
        const guildSnaps = showSnapshots === "__all__"
          ? snapshots
          : snapshots.filter(s => (s as any).period?.startsWith("weekly:") && (s as any).period.includes(showSnapshots));
        if (guildSnaps.length === 0) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60" onClick={() => setShowSnapshots(null)} />
              <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-xs shadow-2xl p-6 text-center">
                <History className="w-8 h-8 text-[#52525b] mx-auto mb-2" />
                <p className="text-sm text-[#a1a1aa]">No finalized history for {showSnapshots} yet.</p>
                <button onClick={() => setShowSnapshots(null)} className="mt-3 text-xs text-amber-400 hover:text-amber-300 transition">Close</button>
              </div>
            </div>
          );
        }
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSnapshots(null)} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-[#27272a] shrink-0">
              <h3 className="text-[#fafafa] font-bold text-xs flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-amber-400" />
                {showSnapshots === "__all__" ? "All" : showSnapshots} History ({guildSnaps.length})
              </h3>
              <button onClick={() => setShowSnapshots(null)} className="text-[#a1a1aa] hover:text-[#fafafa] p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-2 space-y-1.5 flex-1">
              {guildSnaps.map((snap, idx) => {
                const finalized = new Date(snap.finalized_at);
                const hasPeriodStart = !!(snap as any).period_start;
                let periodStart: Date;
                if (hasPeriodStart && new Date((snap as any).period_start).toDateString() !== finalized.toDateString()) {
                  // Properly saved period_start — use as-is
                  periodStart = new Date((snap as any).period_start);
                } else {
                  // Old bug: period_start missing or equals finalized — derive from next older snapshot
                  const olderSnap = guildSnaps[idx + 1];
                  if (olderSnap) {
                    periodStart = new Date(olderSnap.finalized_at);
                  } else if (snap.period.startsWith("weekly")) {
                    periodStart = new Date(finalized);
                    periodStart.setDate(periodStart.getDate() - 7);
                  } else if (snap.period.startsWith("monthly")) {
                    periodStart = new Date(finalized);
                    periodStart.setMonth(periodStart.getMonth() - 1);
                  } else {
                    periodStart = new Date(0);
                  }
                }
                const fmt = (d: Date) =>
                  snap.period === "all_time"
                    ? "All time"
                    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

                const periodLabel = snap.period === "all_time"
                  ? "All Time"
                  : snap.period.startsWith("weekly:")
                    ? `Previous #${guildSnaps.length - idx}`
                    : "Monthly";

                return (
                  <button
                    key={snap.id}
                    onClick={() => { prevShowSnapshots.current = showSnapshots; setShowSnapshots(null); loadSnapshot(snap.id); }}
                    className="w-full flex items-start gap-2 px-2.5 py-2 rounded-lg bg-[#18181b]/50 border border-[#27272a]/50 hover:border-[#52525b] transition text-left"
                  >
                    <History className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-medium text-[#71717a] bg-[#27272a]/50 px-1.5 py-0.5 rounded">
                          {periodLabel}
                        </span>
                        <span className="text-[10px] text-[#71717a]">{snap.ranking_count} ranked</span>
                      </div>
                      <p className="text-[11px] text-[#d4d4d8]">
                        {fmt(periodStart)} → {fmt(finalized)}
                      </p>
                      {snap.top_name && (
                        <p className="text-[10px] text-amber-400/80 truncate">
                          🥇 {snap.top_name} · {snap.top_points} pt{snap.top_points !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[#52525b] mt-0.5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Viewing snapshot modal */}
      {viewingSnapshot && (
        (() => {
          const finalized = new Date(viewingSnapshot.finalized_at);
          const hasPeriodStart = !!(viewingSnapshot as any).period_start;
          const periodStart = new Date(
            (viewingSnapshot as any).period_start || viewingSnapshot.finalized_at
          );
          // Fallback: if period_start is missing or same day as finalized (old bug), derive it
          if (!hasPeriodStart || periodStart.toDateString() === finalized.toDateString()) {
            if (viewingSnapshot.period.startsWith("weekly")) periodStart.setDate(finalized.getDate() - 7);
            else if (viewingSnapshot.period.startsWith("monthly")) periodStart.setMonth(finalized.getMonth() - 1);
            else periodStart.setTime(0);
          }
          const fmt = (d: Date) =>
            viewingSnapshot.period === "all_time"
              ? "All time"
              : d.toLocaleDateString(undefined, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                });
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" key="snap-modal">
              <div className="absolute inset-0 bg-black/60" onClick={clearViewing} />
              <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-3 border-b border-[#27272a] shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { clearViewing(); setShowSnapshots(prevShowSnapshots.current ?? "__all__"); }}
                      className="text-[#a1a1aa] hover:text-[#fafafa] p-1 transition"
                      title="Back to list"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h3 className="text-[#fafafa] font-bold text-xs">Finalized Results</h3>
                      <p className="text-[10px] text-[#71717a]">
                        {fmt(periodStart)} → {fmt(finalized)}
                        {" · "}
                        {viewingSnapshot.period === "all_time" ? "" : "Previous"}
                      </p>
                    </div>
                  </div>
                  <button onClick={clearViewing} className="text-[#a1a1aa] hover:text-[#fafafa] p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="overflow-y-auto p-2 space-y-0.5 flex-1">
                  {(() => {
                    const filtered = viewingSnapshot.rankings;
                    if (filtered.length === 0) {
                      return <p className="text-[#71717a] text-xs text-center py-4">No rankings for this guild.</p>;
                    }
                    return filtered.map((r) => {
                      const style = rankColors[r.rank];
                      return (
                        <div
                          key={r.memberId}
                          className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border ${
                            style?.bg ?? "bg-[#09090b]/50 border-[#27272a]/50"
                          }`}
                        >
                          <div className="flex items-center justify-center w-5 h-5 shrink-0">
                            {style ? <span className="scale-75">{style.icon}</span> : <span className="text-[10px] font-bold text-[#71717a]">#{r.rank}</span>}
                          </div>
                          <span className={`flex-1 text-xs font-semibold ${style?.text ?? "text-[#fafafa]"}`}>{r.memberName}</span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Trophy className="w-2.5 h-2.5 text-[#a1a1aa]" />
                            <span className="text-[10px] font-bold text-[#fafafa] tabular-nums">{r.points}</span>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                {viewingSnapshot.rankings.length > 0 && (
                  <div className="p-2 border-t border-[#27272a] shrink-0 flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => {
                        const text = buildSnapshotShareText(viewingSnapshot);
                        navigator.clipboard.writeText(text);
                        setCopiedShare(true);
                        setTimeout(() => setCopiedShare(false), 2000);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#18181b] text-[#d4d4d8] hover:bg-[#27272a] transition"
                    >
                      {copiedShare ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <CheckCheck className="w-3 h-3" />}
                      {copiedShare ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => {
                        const text = buildSnapshotShareText(viewingSnapshot);
                        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://www.raidscout.com")}&quote=${encodeURIComponent(text)}`;
                        window.open(url, "_blank", "width=600,height=400");
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#1877F2]/20 text-[#1877F2] hover:bg-[#1877F2]/30 transition"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      FB
                    </button>
                    <button
                      onClick={() => {
                        const text = buildSnapshotShareText(viewingSnapshot);
                        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
                        window.open(url, "_blank", "width=600,height=400");
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#18181b] text-[#d4d4d8] hover:bg-[#27272a] transition"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      X
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}

      {/* Kill history modal */}
      {selectedMember && (() => {
        // Merge boss kills + activity attendance + point adjustments into one sorted history
        const combined = [
          ...memberKills.map(k => ({ type: "kill" as const, name: k.boss_name, points: k.points ?? 0, time: k.killed_at, deathRecordId: k.death_record_id, activityInstanceId: null as string | null, image_url: k.image_url ?? null, guild_name: k.guild_name ?? null })),
          ...memberActivities.map(a => ({ type: "activity" as const, name: a.activity_name, points: a.points ?? 0, time: a.attended_at, deathRecordId: null as string | null, activityInstanceId: a.activity_instance_id })),
          ...memberAdjustments.map(a => ({ type: "adjustment" as const, name: a.reason || "Point Adjustment", points: a.points, time: a.created_at, deathRecordId: null as string | null, activityInstanceId: null as string | null })),
        ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        const killTotal = memberKills.reduce((sum, k) => sum + (k.points ?? 0), 0);
        const activityTotal = memberActivities.reduce((sum, a) => sum + (a.points ?? 0), 0);
        const adjustmentTotal = memberAdjustments.reduce((sum, a) => sum + (a.points ?? 0), 0);
        const combinedTotal = killTotal + activityTotal + adjustmentTotal;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedMember(null)} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-[#27272a] shrink-0">
              <div>
                <h3 className="text-sm font-bold text-[#fafafa]">{selectedMember.name}</h3>
                <p className="text-[10px] text-[#71717a]">
                  {memberKills.length} kill{memberKills.length !== 1 ? "s" : ""}
                  {memberActivities.length > 0 && <> · {memberActivities.length} activit{memberActivities.length !== 1 ? "ies" : "y"}</>}
                  {" · "}
                  <span className="text-amber-400 font-medium">{combinedTotal}pt</span>
                </p>
              </div>
              <button onClick={() => setSelectedMember(null)} className="text-[#a1a1aa] hover:text-[#fafafa] transition p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {killsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-[#71717a] animate-spin" />
                </div>
              ) : combined.length === 0 ? (
                <p className="text-sm text-[#71717a] text-center py-4">
                  No activity recorded yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {combined.map((item, i) => {
                    const isAdjustment = item.type === "adjustment";
                    const isActivity = item.type === "activity";
                    return (
                    <button
                      key={i}
                      onClick={() => {
                        if (isAdjustment) return;
                        if (item.type === "kill") {
                          setParticipantDeathId(item.deathRecordId!);
                          setParticipantBossName(item.name);
                          setParticipantDeathTime(item.time);
                        } else {
                          setParticipantActivityInstanceId(item.activityInstanceId!);
                          setParticipantBossName(item.name);
                        }
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#18181b]/50 transition text-left ${isAdjustment ? "cursor-default" : "hover:bg-[#27272a]/50 cursor-pointer"}`}
                    >
                      {isAdjustment ? (
                        <Plus className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      ) : isActivity ? (
                        <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <BossImage
                          bossName={item.name}
                          imageUrl={item.image_url}
                          size="sm"
                          className="w-5 h-5 rounded shrink-0"
                        />
                      )}
                      <span className="text-sm text-[#fafafa]">{item.name}</span>
                      {!isAdjustment && !isActivity && item.guild_name && (
                        <span
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium border ${guildColor(item.guild_name).bg} ${guildColor(item.guild_name).text} ${guildColor(item.guild_name).border}`}
                        >
                          <Shield className="w-2 h-2" />
                          {item.guild_name}
                        </span>
                      )}
                      <span className={`text-[10px] font-medium ml-auto mr-2 ${isAdjustment ? (item.points >= 0 ? "text-emerald-400" : "text-red-400") : "text-amber-400"}`}>
                        {isAdjustment && item.points >= 0 ? "+" : ""}{item.points}
                      </span>
                      <span className="text-[10px] text-[#52525b]">
                        {new Date(item.time).toLocaleString("en-US", { timeZone: userTz,
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}
      {/* Participant modal (when clicking a boss/activity in history) */}
      {(participantDeathId || participantActivityInstanceId) && (
        <ParticipantModalInline
          deathRecordId={participantDeathId ?? undefined}
          activityInstanceId={participantActivityInstanceId ?? undefined}
          bossName={participantBossName}
          deathTime={participantDeathTime}
          onClose={() => { setParticipantDeathId(null); setParticipantActivityInstanceId(null); setParticipantBossName(""); setParticipantDeathTime(""); }}
        />
      )}

      {/* Point adjustment modal */}
      {adjustMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAdjustMember(null)} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
              <div>
                <h3 className="text-sm font-bold text-[#fafafa]">Adjust Points</h3>
                <p className="text-xs text-[#a1a1aa]">{adjustMember.name} · Current: {adjustMember.points} pt{adjustMember.points !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => setAdjustMember(null)} className="text-[#a1a1aa] hover:text-[#fafafa] transition p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Quick buttons */}
              <div className="flex gap-2">
                {[-3, -1, 1, 3, 5].map(v => (
                  <button
                    key={v}
                    onClick={() => setAdjustValue(v)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
                      adjustValue === v
                        ? (v > 0 ? "bg-emerald-900/40 border border-emerald-700 text-emerald-400" : "bg-red-900/40 border border-red-700 text-red-400")
                        : "bg-[#18181b] text-[#a1a1aa] hover:text-[#fafafa] border border-[#27272a]"
                    }`}
                  >
                    {v > 0 ? `+${v}` : v}
                  </button>
                ))}
              </div>

              {/* Custom value */}
              <div>
                <label className="text-xs text-[#a1a1aa] block mb-1">Custom value</label>
                <input
                  type="number"
                  value={adjustValue}
                  onChange={(e) => setAdjustValue(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-[#fafafa] text-sm outline-none focus:ring-2 focus:ring-[#fafafa]/30/50 focus:border-[#27272a]"
                  placeholder="e.g. -2 or 5"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs text-[#a1a1aa] block mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-[#fafafa] text-sm outline-none focus:ring-2 focus:ring-[#fafafa]/30/50 focus:border-[#27272a]"
                  placeholder="e.g. Not following instructions"
                />
              </div>

              {adjustError && (
                <p className="text-xs text-red-400 bg-[#18181b] rounded-lg px-3 py-2">{adjustError}</p>
              )}

              {/* New total preview */}
              <div className="flex items-center justify-between bg-[#18181b] rounded-lg px-3 py-2">
                <span className="text-xs text-[#a1a1aa]">New total</span>
                <span className={`text-sm font-bold tabular-nums ${adjustMember.points + adjustValue > adjustMember.points ? "text-emerald-400" : adjustMember.points + adjustValue < adjustMember.points ? "text-red-400" : "text-[#fafafa]"}`}>
                  {adjustMember.points + adjustValue} pt{(adjustMember.points + adjustValue) !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setAdjustMember(null)}
                  className="flex-1 py-2 rounded-lg font-medium bg-[#18181b] text-[#d4d4d8] hover:bg-[#27272a] transition text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!serverId || adjustValue === 0) return;
                    setAdjustLoading(true);
                    setAdjustError(null);
                    try {
                      await adjustMemberPoints(adjustMember.id, serverId, adjustValue, adjustReason);
                      // Refresh leaderboard
                      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
                      setAdjustMember(null);
                    } catch (err: any) {
                      setAdjustError(err?.message ?? "Failed to adjust points");
                    } finally {
                      setAdjustLoading(false);
                    }
                  }}
                  disabled={adjustValue === 0 || adjustLoading}
                  className={`flex-1 py-2 rounded-lg font-medium text-sm transition disabled:opacity-40 ${
                    adjustValue > 0
                      ? "bg-emerald-500/10 border border-emerald-800 text-emerald-400 hover:bg-emerald-900/50"
                      : adjustValue < 0
                        ? "bg-red-900/30 border border-red-800 text-red-400 hover:bg-red-900/50"
                        : "bg-[#18181b] text-[#71717a]"
                  }`}
                >
                  {adjustLoading ? (
                    <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin mx-auto" />
                  ) : adjustValue > 0 ? (
                    `Add ${adjustValue} pt${adjustValue !== 1 ? "s" : ""}`
                  ) : (
                    `Deduct ${Math.abs(adjustValue)} pt${Math.abs(adjustValue) !== 1 ? "s" : ""}`
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Point adjustment history modal */}
      {showAdjustHistory && (() => {
        const filteredAdjustments = showAdjustHistory === "__all__"
          ? adjustHistory
          : adjustHistory.filter(adj => {
              const gid = memberGuildMap.get(adj.member_id);
              const gname = guilds.find(g => g.id === gid)?.name;
              return gname === showAdjustHistory;
            });
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAdjustHistory(null)} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-[#27272a] shrink-0">
              <h3 className="text-[#fafafa] font-bold text-xs flex items-center gap-2">
                <Edit3 className="w-3.5 h-3.5 text-purple-400" />
                {showAdjustHistory === "__all__" ? "All" : showAdjustHistory} Point History ({filteredAdjustments.length})
              </h3>
              <button onClick={() => setShowAdjustHistory(null)} className="text-[#a1a1aa] hover:text-[#fafafa] p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-2 space-y-1 flex-1">
              {filteredAdjustments.length === 0 ? (
                <p className="text-xs text-[#71717a] text-center py-8">No adjustments for this guild yet.</p>
              ) : (
                filteredAdjustments.map((adj) => (
                  <div key={adj.id} className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-[#18181b]/50 border border-[#27272a]/50">
                    <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                      adj.points > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-900/30 text-red-400"
                    }`}>
                      {adj.points > 0 ? `+${adj.points}` : adj.points}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[#fafafa] font-medium">{adj.member_name}</span>
                      </div>
                      {adj.reason && (
                        <p className="text-[10px] text-[#a1a1aa] mt-0.5">{adj.reason}</p>
                      )}
                      <p className="text-[10px] text-[#52525b] mt-0.5">
                        by {adj.adjusted_by_name} · {new Date(adj.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Finalize modal with datetime picker */}
      {showFinalizeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowFinalizeConfirm(null)} />
          <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-sm shadow-lg p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#27272a] flex items-center justify-center shrink-0 ring-1 ring-[#27272a]">
                <AlertTriangle className="w-5 h-5 text-[#a1a1aa]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#fafafa]">Finalize {showFinalizeConfirm}</h3>
                <p className="text-xs text-[#71717a] mt-1">Save current rankings as a snapshot and reset points.</p>
              </div>
            </div>
            <div>
              <label className="text-xs text-[#71717a] block mb-1">Finalized at (server timezone)</label>
              <input
                type="datetime-local"
                value={finalizeTime}
                onChange={(e) => setFinalizeTime(e.target.value)}
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded-lg px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#52525b] [color-scheme:dark]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowFinalizeConfirm(null)} disabled={finalizing}
                className="px-4 py-2 rounded-md text-sm text-[#71717a] hover:text-[#fafafa] transition disabled:opacity-50">Cancel</button>
              <button onClick={async () => {
                setFinalizing(true);
                const guildName = showFinalizeConfirm!;
                const customTime = finalizeTime ? new Date(finalizeTime).toISOString() : new Date().toISOString();
                setShowFinalizeConfirm(null);
                setFinalizeTime("");
                try {
                  const guildEntries = guildGroups.find(([n]) => n === guildName)?.[1] ?? [];
                  const rankings = guildEntries.map((e, i) => ({ rank: i + 1, memberId: e.id, memberName: e.name, points: e.points }));
                  let resetAt = new Date(0).toISOString();
                  if (serverId) {
                    const { data: setting } = await supabase
                      .from("app_settings").select("value").eq("server_id", serverId).eq("key", `leaderboard_reset_at:${guildName}`).maybeSingle();
                    if (setting) resetAt = (setting as any).value;
                  }
                  await finalizeResults(`weekly:${guildName}`, rankings, resetAt, customTime);
                  toast("success", `${guildName} finalized`);
                } catch { toast("error", "Failed to finalize"); }
                finally { setFinalizing(false); }
              }} disabled={finalizing}
                className="px-4 py-2 rounded-md text-sm font-medium bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50 flex items-center gap-2">
                {finalizing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Finalize
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!showResetConfirm}
        title={`Reset ${showResetConfirm ?? ""} Points`}
        message="Permanently delete ALL attendance and point adjustments for this guild. All-time scores gone. Finalize History preserved."
        confirmLabel="Reset All Points"
        confirmText={showResetConfirm ?? ""}
        variant="danger"
        loading={resetLoading}
        onConfirm={async () => {
          setResetLoading(true);
          const guildName = showResetConfirm!;
          setShowResetConfirm(null);
          try { const gid = guilds.find(g => g.name === guildName)?.id; if (gid && serverId) { await resetGuildPoints(gid, serverId); queryClient.invalidateQueries({ queryKey: ["leaderboard"] }); } }
          catch {}
          finally { setResetLoading(false); }
        }}
        onCancel={() => setShowResetConfirm(null)}
      />
    </div>
  );
}

function ParticipantModalInline({
  deathRecordId,
  activityInstanceId,
  bossName,
  deathTime,
  onClose,
}: {
  deathRecordId?: string;
  activityInstanceId?: string;
  bossName: string;
  deathTime: string;
  onClose: () => void;
}) {
  const { data: attendance = [], isLoading } = useAttendance(deathRecordId ?? "");
  const [activityAttendance, setActivityAttendance] = useState<{ id: string; member_id: string }[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const { data: members = [] } = useMembers();
  const memberMap = new Map(members.map((m) => [m.id, m.name]));

  useEffect(() => {
    if (activityInstanceId) {
      setActivityLoading(true);
      supabase.rpc("fetch_activity_attendance", { p_activity_instance_id: activityInstanceId })
        .then(({ data }) => { if (data) setActivityAttendance(data as any[]); })
        .then(() => setActivityLoading(false), () => setActivityLoading(false));
    }
  }, [activityInstanceId]);

  const isLoading2 = isLoading || activityLoading;
  const allAttendees = deathRecordId ? attendance : activityAttendance;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-xs shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#27272a] shrink-0">
          <div>
            <h3 className="text-sm font-bold text-[#fafafa]">{bossName}</h3>
            <p className="text-[10px] text-[#71717a]">{new Date(deathTime).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="text-[#a1a1aa] hover:text-[#fafafa] transition p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {isLoading2 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-[#71717a] animate-spin" />
            </div>
          ) : allAttendees.length === 0 ? (
            <p className="text-sm text-[#71717a] text-center py-4">No participants recorded.</p>
          ) : (
            <div>
              <p className="text-[11px] font-medium text-[#a1a1aa] uppercase tracking-wider mb-2">
                Participants ({allAttendees.length})
              </p>
              <div className="space-y-1">
                {allAttendees.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#18181b]/50">
                    <Users className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0" />
                    <span className="text-sm text-[#fafafa]">{memberMap.get(a.member_id) ?? "Unknown"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
