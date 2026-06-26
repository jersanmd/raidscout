import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchAnalytics, type AnalyticsData, isSupabaseConfigured, fetchGuilds, fetchMembers, supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import { guildColor } from "@/lib/constants";
import type { Guild, Member } from "@/types";
import { BarChart3, TrendingUp, Users, Skull, Activity, Loader2, Shield, Swords, HandMetal, ShieldHalf, ShieldCheck, Gavel, Axe, Crosshair, Target, Wand, Heart, Zap, Flame, Snowflake, Star, Crown, Anchor, Footprints, Sword, Tag } from "lucide-react";
import { useServerTimezone } from "@/hooks/useServerTimezone";

const CLASS_ICONS: { name: string; icon: React.ElementType }[] = [
  { name: "Sword", icon: Sword }, { name: "Swords", icon: Swords },
  { name: "HandMetal", icon: HandMetal }, { name: "ShieldIcon", icon: Shield },
  { name: "ShieldHalf", icon: ShieldHalf }, { name: "ShieldCheck", icon: ShieldCheck },
  { name: "Gavel", icon: Gavel }, { name: "Axe", icon: Axe },
  { name: "Crosshair", icon: Crosshair }, { name: "Target", icon: Target },
  { name: "Wand", icon: Wand }, { name: "Heart", icon: Heart },
  { name: "Zap", icon: Zap }, { name: "Flame", icon: Flame },
  { name: "Snowflake", icon: Snowflake }, { name: "Star", icon: Star },
  { name: "Crown", icon: Crown }, { name: "Anchor", icon: Anchor },
  { name: "Footprints", icon: Footprints },
];

function getClassIcon(iconName: string): React.ElementType {
  return CLASS_ICONS.find(c => c.name === iconName)?.icon ?? Tag;
}

interface AnalyticsUIData {
  totalKills: number;
  totalAttendance: number;
  activeMembers: number;
  killsByDate: { date: string; count: number }[];
  killsByDateDetail: { date: string; count: number; bosses: { name: string; guild: string | null; kills: number }[] }[];
  killsByGuildSeries: { guild: string | null; data: { date: string; count: number }[] }[];
  topBosses: { name: string; kills: number }[];
  topBossesByGuild: { name: string; kills: number; avg_attendance: number; by_guild: { guild: string | null; count: number }[] }[];
  topHunters: { name: string; attended: number }[];
  killsByDay: { day: string; count: number }[];
  killsByDayByGuild: { day: string; count: number; by_guild: { guild: string | null; count: number }[] }[];
  totalActivities: number;
  activityParticipation: number;
  attendanceByGuild: { guild: string | null; count: number }[];
  activitiesByGuild: { guild: string | null; count: number }[];
  activeMembersByGuild: { guild: string | null; count: number }[];
}

export function AnalyticsView() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const configured = isSupabaseConfigured();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const period = (searchParams.get("period") as "week" | "month" | "all") || "week";
  const setPeriod = (p: "week" | "month" | "all") => {
    if (p === "week") {
      navigate("/analytics", { replace: true });
    } else {
      navigate(`/analytics?period=${p}`, { replace: true });
    }
  };
  const [huntersPage, setHuntersPage] = useState(1);
  const HUNTERS_PER_PAGE = 10;
  const [cpPage, setCpPage] = useState(1);
  const CP_PER_PAGE = 10;
  const BOSSES_PER_PAGE = 10;
  const [bossesPage, setBossesPage] = useState(1);
  const tz = useServerTimezone();

  // Reset pagination when period changes
  useEffect(() => { setHuntersPage(1); setCpPage(1); }, [period]);

  // Detail modal state for bar clicks
  const [detailModal, setDetailModal] = useState<{ title: string; rows: { label: string; value: string; color?: string }[] } | null>(null);

  // Guild & member data for badges — cached via React Query
  const { data: guilds = [] } = useQuery({
    queryKey: ["guilds", serverId],
    queryFn: () => fetchGuilds(serverId),
    staleTime: 60_000,
    enabled: !!serverId,
  });
  const { data: members = [] } = useQuery({
    queryKey: ["members", serverId],
    queryFn: () => fetchMembers(serverId),
    staleTime: 60_000,
    enabled: !!serverId,
  });
  const memberGuildMap = new Map(members.map(m => [m.name, m.guild_id]));
  const memberClassMap = new Map<string, string>();
  for (const m of members) {
    if (m.class) memberClassMap.set(m.name, m.class);
  }
  const { data: { classIcons, classColors } = { classIcons: {}, classColors: {} } } = useQuery({
    queryKey: ["classMeta", serverId],
    queryFn: async () => {
      const { data } = await supabase.from("server_classes").select("name, icon, color").eq("server_id", serverId);
      const icons: Record<string, string> = {};
      const colors: Record<string, string> = {};
      for (const row of (data ?? [])) {
        icons[row.name] = row.icon;
        colors[row.name] = row.color || "#a1a1aa";
      }
      return { classIcons: icons, classColors: colors };
    },
    staleTime: 60_000,
    enabled: !!serverId,
  });

  // CP growth data
  // CP growth — RPC returns 7d, 30d, and all-time growth
  const { data: cpGrowthMap } = useQuery({
    queryKey: ["cpGrowth", serverId],
    queryFn: async () => {
      const map7 = new Map<string, number>();
      const map30 = new Map<string, number>();
      const mapAll = new Map<string, number>();
      if (!serverId) return { map7, map30, mapAll };
      const { data, error } = await supabase.rpc("get_member_growth", { p_server_id: serverId });
      if (error || !data) return { map7, map30, mapAll };
      for (const r of (data as any[])) {
        if (r.growth_7d >= 0) map7.set(r.member_id, r.growth_7d);
        if (r.growth_30d >= 0) map30.set(r.member_id, r.growth_30d);
        if (r.growth_all >= 0) mapAll.set(r.member_id, r.growth_all);
      }
      return { map7, map30, mapAll };
    },
    staleTime: 60_000,
    enabled: !!serverId,
  });

  // Primary list: all members with CP, sorted highest first
  const cpList = useMemo(() => {
    const growthMap = period === "week" ? cpGrowthMap?.map7 ?? new Map()
      : period === "month" ? cpGrowthMap?.map30 ?? new Map()
      : cpGrowthMap?.mapAll ?? new Map();
    return members
      .filter(m => m.combat_power != null)
      .map(m => ({
        member_id: m.id, player_name: m.name,
        current_cp: m.combat_power ?? 0,
        growth: growthMap.get(m.id) ?? 0,
      }))
      .sort((a, b) => b.current_cp - a.current_cp);
  }, [members, cpGrowthMap, period]);

  const { data, isLoading } = useQuery<AnalyticsUIData>({
    queryKey: ["analytics", period, serverId, tz],
    queryFn: async () => {
      const now = new Date();
      let since: string;
      if (period === "week") {
        // Get current date parts in server timezone
        const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
        const parts = fmt.formatToParts(now);
        const year = Number(parts.find(p => p.type === "year")!.value);
        const month = Number(parts.find(p => p.type === "month")!.value) - 1;
        const day = Number(parts.find(p => p.type === "day")!.value);
        const dowStr = parts.find(p => p.type === "weekday")!.value;
        const daysBack: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
        const mondayDay = day - (daysBack[dowStr] ?? 0);

        // Build as UTC midnight, then adjust for server timezone offset
        const utcMidnight = Date.UTC(year, month, mondayDay, 0, 0, 0);
        // Get offset: compare server hours vs UTC hours at this instant
        const serverHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(utcMidnight));
        const utcHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", hour12: false }).format(utcMidnight));
        const offsetMs = (serverHour - utcHour) * 3600_000;
        since = new Date(utcMidnight - offsetMs).toISOString();
      } else if (period === "month") {
        const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" });
        const parts = fmt.formatToParts(now);
        const year = Number(parts[0].value);
        const month = Number(parts[2].value) - 1;
        const utcMidnight = Date.UTC(year, month, 1, 0, 0, 0);
        const serverHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(utcMidnight));
        const utcHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", hour12: false }).format(utcMidnight));
        const offsetMs = (serverHour - utcHour) * 3600_000;
        since = new Date(utcMidnight - offsetMs).toISOString();
      } else {
        since = "2020-01-01";
      }

      if (!configured || (!user && !isViewer)) {
        return emptyAnalytics();
      }

      const raw = await fetchAnalytics(since, serverId, tz, period !== "all");
      return {
        totalKills: raw.total_kills,
        totalAttendance: raw.total_attendance,
        activeMembers: raw.active_members,
        killsByDate: raw.kills_by_date ?? [],
        killsByDateDetail: raw.kills_by_date_detail ?? [],
        killsByGuildSeries: raw.kills_by_guild_series ?? [],
        topBosses: raw.top_bosses ?? [],
        topBossesByGuild: raw.top_bosses_by_guild ?? [],
        topHunters: raw.top_hunters ?? [],
        killsByDay: raw.kills_by_day ?? [],
        killsByDayByGuild: raw.kills_by_day_by_guild ?? [],
        totalActivities: raw.total_activities ?? 0,
        activityParticipation: raw.activity_participation ?? 0,
        attendanceByGuild: raw.attendance_by_guild ?? [],
        activitiesByGuild: raw.activities_by_guild ?? [],
        activeMembersByGuild: raw.active_members_by_guild ?? [],
      };
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    enabled: configured && !!serverId,
  });

  // Per-guild kill totals for stat cards (must be before early return!)
  const guildKillTotals = useMemo(() => {
    if (!guilds.length) return [];
    const colorMap = new Map<string, string>();
    return (data?.killsByGuildSeries ?? [])
      .filter((s: any) => s.guild)
      .map((s: any, si: number) => {
        if (!colorMap.has(s.guild!)) {
          colorMap.set(s.guild!, resolveSeriesColor(s.guild, si, guilds));
        }
        const total = s.data.reduce((sum: number, d: any) => sum + d.count, 0);
        return { label: s.guild!, value: total, color: colorMap.get(s.guild!)! };
      })
      .sort((a: any, b: any) => a.label.localeCompare(b.label));
  }, [data, guilds]);

  // Per-guild sub-items helpers
  const guildSubItems = (items: { guild: string | null; count: number }[]) => {
    if (!guilds.length || !items.length) return undefined;
    const colorMap = new Map<string, string>();
    return items
      .filter(s => s.guild)
      .map((s, si) => {
        if (!colorMap.has(s.guild!)) colorMap.set(s.guild!, resolveSeriesColor(s.guild, si, guilds));
        return { label: s.guild!, value: s.count, color: colorMap.get(s.guild!)! };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  };

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" />
      </div>
    );
  }

  const maxBossKills = Math.max(...data.topBosses.map((b) => b.kills), 1);
  const maxAttended = Math.max(...data.topHunters.map((h) => h.attended), 1);
  const maxDaily = Math.max(...data.killsByDay.map((d) => d.count), 1);

  return (
    <div className="max-w-[100%] 2xl:max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#18181b] border border-[#27272a]">
            <BarChart3 className="w-5 h-5 text-[#fafafa]" />
          </div>
          <h2 className="text-xl font-bold text-[#fafafa]">Analytics</h2>
        </div>
        <div className="flex bg-[#18181b] rounded-lg p-0.5 self-start sm:self-auto">
          {(["week", "month", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setHuntersPage(1); }}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition ${
                period === p ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
              }`}
            >
              {p === "week" ? "This Week" : p === "month" ? "This Month" : "All Time"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard icon={<Skull className="w-4 h-4" />} label="Total Kills" value={data.totalKills} color="text-[#a1a1aa]" bg="bg-[#18181b] border-[#27272a]" subItems={guildKillTotals} />
        <StatCard icon={<Users className="w-4 h-4" />} label="Active Members" value={data.activeMembers} color="text-[#a1a1aa]" bg="bg-[#18181b] border-[#27272a]" subItems={guildSubItems(data.activeMembersByGuild)} />
        <StatCard icon={<Activity className="w-4 h-4" />} label="Attendances" value={data.totalAttendance} color="text-[#a1a1aa]" bg="bg-[#18181b] border-[#27272a]" subItems={guildSubItems(data.attendanceByGuild)} />
        <StatCard icon={<span className="text-sm">📅</span>} label="Activities" value={data.totalActivities} color="text-[#a1a1aa]" bg="bg-[#18181b] border-[#27272a]" subItems={guildSubItems(data.activitiesByGuild)} />
      </div>

      <Section title="Kills per Day" icon={<TrendingUp className="w-4 h-4" />}>
        {data.killsByDate.length === 0 ? (
          <p className="text-sm text-[#52525b] text-center py-4">No kill data for this period.</p>
        ) : (
          <KillsTrendChart
            dates={data.killsByDate.map(d => d.date)}
            series={data.killsByGuildSeries}
            detail={data.killsByDateDetail}
            guilds={guilds}
          />
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Section title="Most Active Hunters" icon={<Users className="w-4 h-4" />}>
        <div className="space-y-1.5">
          {data.topHunters.slice(0, huntersPage * HUNTERS_PER_PAGE).map((h, i) => {
            const gid = memberGuildMap.get(h.name);
            const guild = gid ? guilds.find(g => g.id === gid) : null;
            const c = guild ? guildColor(guild.name) : null;
            const cls = memberClassMap.get(h.name);
            return (
            <div key={h.name} className="flex items-center gap-2 text-sm animate-slide-up" style={{ animationDelay: `${Math.min((i % 10) * 30, 300)}ms`, animationFillMode: "both" }}>
              <span className="text-[#a1a1aa] w-5 shrink-0 text-left">{i + 1}.</span>
              {cls && classIcons[cls] ? (() => { const CIcon = getClassIcon(classIcons[cls]); const color = classColors[cls] || "#a1a1aa"; return <CIcon className="w-3.5 h-3.5 shrink-0" style={{ color }} />; })() : <span className="w-3.5 h-3.5 shrink-0" />}
              <span className="text-[#fafafa] w-24 shrink-0 truncate text-left">{h.name}</span>
              <span className="w-20 shrink-0 inline-flex items-center">
                {guild && c && (
                  <span className={`text-[11px] px-1.5 py-0.5 rounded border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
                    <Shield className="w-2.5 h-2.5 inline mr-0.5" />{guild.name}
                  </span>
                )}
              </span>
              <div className="flex-1 h-6 bg-[#18181b] rounded overflow-hidden group/bar cursor-pointer"
                onClick={() => {
                  const gName = guild?.name ?? "Unguilded";
                  setDetailModal({
                    title: `${h.name} — ${h.attended} attendances`,
                    rows: [
                      { label: "Player", value: h.name },
                      { label: "Guild", value: gName, color: guild ? resolveBarColor(guild.name, guilds.findIndex(x => x.id === guild.id), guilds) : undefined },
                      { label: "Total Attendance", value: String(h.attended) },
                    ],
                  });
                }}
              >
                {(() => {
                  const barColor = guild ? resolveBarColor(guild.name, guilds.findIndex(x => x.id === guild.id), guilds) : "#3f3f46";
                  return (
                    <div className="h-full rounded flex items-center justify-end px-2 transition-all duration-200 group-hover/bar:brightness-125" style={{ width: `${Math.max((h.attended / maxAttended) * 100, 8)}%`, backgroundColor: barColor }}>
                      <span className="text-xs text-white/80 font-mono font-bold drop-shadow-sm">{h.attended}</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )})}
          {data.topHunters.length > huntersPage * HUNTERS_PER_PAGE && (
            <button
              onClick={() => setHuntersPage(999)}
              className="w-full py-1.5 text-xs text-[#a1a1aa] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 rounded transition"
            >
              Show more ({data.topHunters.length - huntersPage * HUNTERS_PER_PAGE} remaining)
            </button>
          )}
          {huntersPage > 1 && (
            <button
              onClick={() => setHuntersPage(1)}
              className="w-full py-1.5 text-xs text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 rounded transition"
            >
              Show less
            </button>
          )}
        </div>
      </Section>

      <Section title="Top Combat Power" icon={<TrendingUp className="w-4 h-4" />}>
        <div className="space-y-1.5">
          {cpList.length === 0 ? (
            <p className="text-sm text-[#52525b] text-center py-4">No members with CP yet.</p>
          ) : (<>
              {cpList.slice(0, cpPage * CP_PER_PAGE).map((e, i) => {
              const gid = memberGuildMap.get(e.player_name);
              const guild = gid ? guilds.find(g => g.id === gid) : null;
              const c = guild ? guildColor(guild.name) : null;
              const cls = memberClassMap.get(e.player_name);
              const minCp = e.growth > 0 && e.current_cp > e.growth ? e.current_cp - e.growth : e.current_cp;
              const pct = e.growth > 0 && minCp > 0 ? ((e.growth / minCp) * 100) : 0;
              const maxCp = cpList[0]?.current_cp ?? 1;
              return (
              <div key={e.member_id} className="flex items-center gap-1.5 sm:gap-2 text-sm animate-slide-up" style={{ animationDelay: `${Math.min((i % 10) * 30, 300)}ms`, animationFillMode: "both" }}>
                <span className="text-[#a1a1aa] w-4 sm:w-5 shrink-0 text-left text-xs sm:text-sm">{i + 1}.</span>
                {cls && classIcons[cls] ? (() => { const CIcon = getClassIcon(classIcons[cls]); const color = classColors[cls] || "#a1a1aa"; return <CIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" style={{ color }} />; })() : <span className="w-3 sm:w-3.5 shrink-0" />}
                <span className="text-[#fafafa] w-16 sm:w-24 shrink-0 truncate text-left text-xs sm:text-sm">{e.player_name}</span>
                <span className="w-14 sm:w-20 shrink-0 inline-flex items-center">
                  {guild && c && (
                    <span className={`text-[11px] sm:text-[11px] px-1 sm:px-1.5 py-0.5 rounded border shrink-0 truncate ${c.bg} ${c.text} ${c.border}`}>
                      <Shield className="w-2 h-2 sm:w-2.5 sm:h-2.5 inline mr-0.5" />{guild.name}
                    </span>
                  )}
                </span>
                <div className="flex-1 h-5 sm:h-6 bg-[#18181b] rounded overflow-hidden group/bar cursor-pointer min-w-[40px]"
                  onClick={() => navigate(`/members/${e.member_id}`)}
                >
                  {(() => {
                    const barColor = guild ? resolveBarColor(guild.name, guilds.findIndex(x => x.id === guild.id), guilds) : "#3f3f46";
                    return (
                      <div className="h-full rounded flex items-center justify-end px-1.5 sm:px-2 gap-1 transition-all duration-200 group-hover/bar:brightness-125" style={{ width: `${Math.max((e.current_cp / maxCp) * 100, 8)}%`, backgroundColor: barColor }}>
                        <span className="text-[11px] sm:text-[11px] text-white/80 font-mono font-bold drop-shadow-sm">{e.current_cp.toLocaleString()}</span>
                        {e.growth > 0 && (
                          <span className="text-[8px] sm:text-[11px] text-white/70 font-mono drop-shadow whitespace-nowrap">
                            +{e.growth.toLocaleString()}{pct > 0 ? ` (${pct.toFixed(1)}%)` : ""}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              )})}
              {cpList.length > cpPage * CP_PER_PAGE && (
                <button onClick={() => setCpPage(999)} className="w-full py-1.5 text-xs text-[#a1a1aa] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 rounded transition">
                  Show more ({cpList.length - cpPage * CP_PER_PAGE} remaining)
                </button>
              )}
              {cpPage > 1 && (
                <button onClick={() => setCpPage(1)} className="w-full py-1.5 text-xs text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 rounded transition">Show less</button>
              )}
            </>)}
        </div>
      </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Section title="Most Killed Bosses" icon={<Skull className="w-4 h-4" />}>
        <GuildLegend guilds={guilds} series={data.killsByGuildSeries} />
        <div className="space-y-1.5">
          {data.topBossesByGuild.slice(0, bossesPage * BOSSES_PER_PAGE).map((b, i) => (
            <div key={b.name} className="flex items-center gap-2 text-sm animate-slide-up" style={{ animationDelay: `${Math.min((i % 10) * 30, 300)}ms`, animationFillMode: "both" }}>
              <span className="text-[#a1a1aa] w-5 shrink-0 text-left">{i + 1}.</span>
              <span className="text-[#fafafa] w-24 shrink-0 truncate text-left">{b.name}</span>
              <span className="w-10 shrink-0">
                {b.avg_attendance > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-[#a1a1aa]" title={`Average ${b.avg_attendance} attendees per kill`}>
                    <Users className="w-3 h-3" />~{b.avg_attendance}
                  </span>
                )}
              </span>
              <div className="flex-1 h-6 bg-[#18181b] rounded overflow-hidden flex group/bar cursor-pointer"
                onClick={() => {
                  const rows: { label: string; value: string; color?: string }[] = [
                    { label: "Boss", value: b.name },
                    { label: "Total Kills", value: String(b.kills) },
                  ];
                  if (b.avg_attendance > 0) rows.push({ label: "Avg Attendance", value: `~${b.avg_attendance}` });
                  b.by_guild.forEach(g => {
                    rows.push({
                      label: g.guild ?? "Unguilded",
                      value: String(g.count),
                      color: resolveBarColor(g.guild, guilds.findIndex(x => x.name === g.guild), guilds),
                    });
                  });
                  setDetailModal({ title: `${b.name} — Breakdown`, rows });
                }}
              >
                {b.by_guild.map((g, gi) => {
                  const color = resolveBarColor(g.guild, gi, guilds);
                  const pct = Math.max((g.count / maxBossKills) * 100, 1);
                  return (
                    <div key={gi} className="h-full flex items-center justify-end px-1.5 relative transition-all duration-200 group-hover/bar:brightness-110" style={{ width: `${pct}%`, backgroundColor: color }}>
                      {pct >= 3 && (
                        <span className="text-[11px] text-white/80 font-mono font-bold drop-shadow-sm">{g.count}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {data.topBossesByGuild.length > bossesPage * BOSSES_PER_PAGE && (
            <button onClick={() => setBossesPage(999)} className="w-full py-1.5 text-xs text-[#a1a1aa] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 rounded transition">Show more ({data.topBossesByGuild.length - bossesPage * BOSSES_PER_PAGE} remaining)</button>
          )}
          {bossesPage > 1 && (
            <button onClick={() => setBossesPage(1)} className="w-full py-1.5 text-xs text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 rounded transition">Show less</button>
          )}
        </div>
      </Section>

      <Section title="Activity by Day" icon={<Activity className="w-4 h-4" />}>
        <GuildLegend guilds={guilds} series={data.killsByGuildSeries} />
        <div className="space-y-1.5">
          {data.killsByDayByGuild.map((d) => (
            <div key={d.day} className="flex items-center gap-2 text-sm">
              <span className="text-[#a1a1aa] w-12 shrink-0 text-sm">{d.day.slice(0, 3)}</span>
              <div className="flex-1 h-6 bg-[#18181b] rounded overflow-hidden flex group/bar cursor-pointer"
                onClick={() => {
                  const rows: { label: string; value: string; color?: string }[] = [
                    { label: "Day", value: d.day },
                    { label: "Total Kills", value: String(d.count) },
                  ];
                  d.by_guild.forEach(g => {
                    rows.push({
                      label: g.guild ?? "Unguilded",
                      value: String(g.count),
                      color: resolveBarColor(g.guild, guilds.findIndex(x => x.name === g.guild), guilds),
                    });
                  });
                  setDetailModal({ title: `${d.day} — Breakdown`, rows });
                }}
              >
                {d.by_guild.map((g, gi) => {
                  const color = resolveBarColor(g.guild, gi, guilds);
                  const pct = Math.max((g.count / maxDaily) * 100, 1);
                  return (
                    <div key={gi} className="h-full flex items-center justify-end px-1.5 relative transition-all duration-200 group-hover/bar:brightness-110" style={{ width: `${pct}%`, backgroundColor: color }}>
                      {pct >= 3 && (
                        <span className="text-[11px] text-white/80 font-mono font-bold drop-shadow-sm">{g.count}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>
      </div>

      {/* Detail Modal */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDetailModal(null)}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-full max-w-xs mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#fafafa] mb-3">{detailModal.title}</h3>
            <div className="space-y-1.5">
              {detailModal.rows.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-[#a1a1aa] flex items-center gap-1.5">
                    {r.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />}
                    {r.label}
                  </span>
                  <span className="text-[#fafafa] font-mono font-bold">{r.value}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setDetailModal(null)} className="mt-4 w-full py-1.5 text-xs text-[#a1a1aa] hover:text-[#fafafa] bg-[#27272a] rounded-lg transition">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, bg, subItems }: { icon: React.ReactNode; label: string; value: number; color: string; bg: string; subItems?: { label: string; value: number; color: string }[] }) {
  return (
    <div className={`rounded-xl border ${bg} p-3 text-center`}>
      <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
      <div className="text-lg font-bold text-[#fafafa] tabular-nums">{value}</div>
      <div className="text-xs text-[#71717a]">{label}</div>
      {subItems && subItems.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-[#27272a] flex flex-wrap justify-center gap-x-2 gap-y-0.5">
          {subItems.map((s, i) => (
            <span key={i} className="text-[11px] font-medium" style={{ color: s.color }}>
              {s.label} <span className="tabular-nums">{s.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-2">{icon} {title}</h3>
      {children}
    </div>
  );
}

// ── Guild color legend for bar charts ─────────────────────

function GuildLegend({ guilds, series }: { guilds: Guild[]; series: { guild: string | null; data: { date: string; count: number }[] }[] }) {
  return (
    <div className="flex items-center gap-3 mb-1">
      {series.map((s, si) => {
        const label = s.guild ?? "Unguilded";
        const color = resolveBarColor(s.guild, si, guilds);
        return (
          <div key={si} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[11px] text-[#71717a]">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function emptyAnalytics(): AnalyticsUIData {
  return {
    totalKills: 0, totalAttendance: 0, activeMembers: 0,
    killsByDate: [], killsByDateDetail: [], killsByGuildSeries: [], topBosses: [], topBossesByGuild: [], topHunters: [], killsByDay: [], killsByDayByGuild: [],
    totalActivities: 0, activityParticipation: 0,
    attendanceByGuild: [], activitiesByGuild: [], activeMembersByGuild: [],
  };
}

// ── SVG Multi-Series Trend Chart ───────────────────────────

const GUILD_LINE_COLORS = [
  "#a78bfa", // violet
  "#fbbf24", // amber
  "#34d399", // emerald
  "#60a5fa", // blue
  "#f87171", // red
  "#fb923c", // orange
  "#a3e635", // lime
  "#e879f9", // fuchsia
];
const UNASSIGNED_COLOR = "#71717a";

function KillsTrendChart({ dates, series, detail, guilds }: {
  dates: string[];
  series: { guild: string | null; data: { date: string; count: number }[] }[];
  detail: { date: string; count: number; bosses: { name: string; guild: string | null; kills: number }[] }[];
  guilds: Guild[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(800);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContainerW(entry.contentRect.width);
    });
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const W = Math.max(containerW || 800, 400);
  const isNarrow = W < 600;
  const H = isNarrow ? 280 : 220;
  const fontSize = isNarrow ? 14 : 12;
  const fontSizeSm = isNarrow ? 12 : 11;
  const fontSizeXs = isNarrow ? 10 : 9;
  const dotR = isNarrow ? 6 : 4.5;
  const dotHoverR = isNarrow ? 8 : 6;
  const hitR = isNarrow ? 30 : 24;
  const strokeW = isNarrow ? 2.5 : 2;
  const padL = 60, padR = isNarrow ? 10 : 30, padT = 22, padB = isNarrow ? 40 : 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const n = dates.length;

  // Global max across all series
  const maxCount = Math.max(1, ...series.flatMap(s => s.data.map(d => d.count)));

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hiddenGuilds, setHiddenGuilds] = useState<Set<string>>(new Set()); // guild keys to hide
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const showTooltip = useCallback((i: number) => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setHoverIdx(i);
  }, []);

  const hideTooltip = useCallback(() => {
    hideTimer.current = setTimeout(() => setHoverIdx(null), 150);
  }, []);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }, []);

  // Y-axis ticks
  const yTicks = [0, Math.round(maxCount / 2), maxCount];

  // Coordinate helpers
  const xFor = (i: number) => padL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const yFor = (count: number) => padT + chartH - (count / maxCount) * chartH;

  // X-axis labels
  const xLabelInterval = Math.max(1, Math.ceil(n / 7));

  // Tooltip position (anchored to the max guild count at hovered index) (anchored to the max guild count at hovered index)
  const maxAtIdx = hoverIdx != null
    ? Math.max(...series.map(s => s.data[hoverIdx]?.count ?? 0), 1)
    : 0;
  const tooltipPct = hoverIdx != null
    ? { left: `${(xFor(hoverIdx) / W) * 100}%`, top: `${(yFor(maxAtIdx) / H) * 100}%` }
    : null;

  return (
    <div ref={containerRef} className="relative">
      {/* Legend */}
      {series.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 px-1">
          {series.map((s, si) => {
            const guildKey = s.guild ?? "__unguilded__";
            const hidden = hiddenGuilds.has(guildKey);
            const label = s.guild ?? "Unguilded";
            const g = s.guild ? guilds.find(x => x.name === s.guild) : null;
            const c = g ? guildColor(g.name) : null;
            const color = resolveSeriesColor(s.guild, si, guilds);
            return (
              <button
                key={si}
                onClick={() => {
                  setHiddenGuilds(prev => {
                    const next = new Set(prev);
                    if (next.has(guildKey)) next.delete(guildKey); else next.add(guildKey);
                    return next;
                  });
                }}
                className={`flex items-center gap-1.5 transition ${hidden ? "opacity-30" : "opacity-100"}`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {c && s.guild ? (
                  <span className={`text-[11px] px-1.5 py-0 rounded border ${c.bg} ${c.text} ${c.border}`}>{s.guild}</span>
                ) : (
                  <span className="text-[11px] text-[#a1a1aa]">{label}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Tooltip */}
      {hoverIdx != null && tooltipPct && (
        <div
          ref={tooltipRef}
          className={`absolute z-20 pointer-events-auto ${hoverIdx > n * 0.4 ? "-translate-x-[calc(100%-16px)]" : hoverIdx < n * 0.12 ? "left-0" : "-translate-x-1/2"}`}
          style={hoverIdx > n * 0.4
            ? { left: tooltipPct.left, bottom: `${100 - parseFloat(tooltipPct.top)}%` }
            : hoverIdx < n * 0.12
            ? { left: `${Math.max(0, parseFloat(tooltipPct.left) - 2)}%`, bottom: `${100 - parseFloat(tooltipPct.top)}%` }
            : { left: tooltipPct.left, bottom: `${100 - parseFloat(tooltipPct.top)}%` }
          }
          onMouseEnter={cancelHide}
          onMouseLeave={hideTooltip}
        >
          <div className="bg-[#18181b] border border-[#3f3f46] rounded-lg px-4 py-3 text-sm shadow-xl max-w-[320px]"
               style={{ transform: "translateY(-12px)" }}>
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[#27272a]">
              <span className="text-[#a1a1aa] text-xs">{dates[hoverIdx]}</span>
            </div>
            {/* Per-guild counts */}
            {series.length > 0 && (
              <div className="mb-2 space-y-1">
                {series.map((s, si) => {
                  const cnt = s.data[hoverIdx]?.count ?? 0;
                  if (cnt === 0) return null;
                  const color = resolveSeriesColor(s.guild, si, guilds);
                  return (
                    <div key={si} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[#e4e4e7] text-xs">{s.guild ?? "Unguilded"}</span>
                      <span className="text-[#a1a1aa] font-mono text-xs ml-auto">{cnt}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Boss list */}
            {(() => {
              const d = detail.find(x => x.date === dates[hoverIdx]);
              if (!d || d.bosses.length === 0) return <span className="text-[#52525b] text-xs">No boss data</span>;
              return (
                <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1 border-t border-[#27272a] pt-2">
                  {d.bosses.map((b, j) => {
                    const g = b.guild ? guilds.find(x => x.name === b.guild) : null;
                    const c = g ? guildColor(g.name) : null;
                    return (
                      <div key={j} className="flex items-center gap-2">
                        <span className="text-[#52525b] text-xs w-5 shrink-0 text-right">{j + 1}.</span>
                        <span className="text-[#e4e4e7] truncate text-xs">{b.name}</span>
                        {b.kills > 1 && (
                          <span className="text-[#a1a1aa] font-mono text-xs shrink-0">×{b.kills}</span>
                        )}
                        {c && (
                          <span className={`text-[11px] px-1.5 py-0 rounded border shrink-0 ml-auto ${c.bg} ${c.text} ${c.border}`}>
                            {g!.name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {yTicks.map((v, i) => {
          const y = yFor(v);
          return (
            <g key={`gy-${i}`}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#27272a" strokeWidth="1" />
              <text x={padL - 10} y={y + 4} textAnchor="end" fontSize={fontSize} fill="#52525b" fontFamily="monospace">{v}</text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {dates.map((d, i) => {
          if (i % xLabelInterval !== 0 && i !== n - 1) return null;
          return (
            <text key={`gx-${i}`} x={xFor(i)} y={H - 4} textAnchor="middle" fontSize={fontSizeSm} fill="#52525b" fontFamily="monospace">{d.slice(5)}</text>
          );
        })}

        {/* Per-guild area fills */}
        {series.map((s, si) => {
          const guildKey = s.guild ?? "__unguilded__";
          if (hiddenGuilds.has(guildKey)) return null;
          if (s.data.length < 2) return null;
          const color = resolveSeriesColor(s.guild, si, guilds);
          const linePts = s.data.map((d, i) => `${xFor(i)},${yFor(d.count)}`).join(" ");
          const lastIdx = s.data.length - 1;
          const areaPts = `${xFor(0)},${padT + chartH} ${linePts} ${xFor(lastIdx)},${padT + chartH}`;
          return (
            <polygon key={`area-${si}`} points={areaPts} fill={color} fillOpacity="0.12" className="trend-area" />
          );
        })}

        {/* Lines */}
        {series.map((s, si) => {
          const guildKey = s.guild ?? "__unguilded__";
          if (hiddenGuilds.has(guildKey)) return null;
          return (
          <polyline
            key={`line-${si}`}
            points={s.data.map((d, i) => `${xFor(i)},${yFor(d.count)}`).join(" ")}
            fill="none"
            stroke={resolveSeriesColor(s.guild, si, guilds)}
            strokeWidth={strokeW}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="trend-line"
          />
        )})}

        {/* Full-width hover capture layer */}
        <rect
          x={padL} y={0} width={chartW} height={H}
          fill="transparent"
          onMouseMove={(e) => {
            const svg = (e.target as SVGRectElement).closest("svg")!;
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const ctm = svg.getScreenCTM();
            if (!ctm) return;
            const svgPt = pt.matrixTransform(ctm.inverse());
            const frac = Math.max(0, Math.min(1, (svgPt.x - padL) / chartW));
            showTooltip(Math.round(frac * (n - 1)));
          }}
          onMouseLeave={hideTooltip}
          onClick={() => setHoverIdx(prev => prev != null ? null : hoverIdx)}
          style={{ cursor: "crosshair" }}
        />

        {/* Hover vertical line */}
        {hoverIdx != null && (
          <line
            x1={xFor(hoverIdx)} y1={0}
            x2={xFor(hoverIdx)} y2={H}
            stroke="#3f3f46" strokeWidth="1" strokeDasharray="4 3"
          />
        )}

        {/* Per-guild data point dots + labels */}
        {series.map((s, si) => {
          const guildKey = s.guild ?? "__unguilded__";
          if (hiddenGuilds.has(guildKey)) return null;
          const color = resolveSeriesColor(s.guild, si, guilds);
          const labelInterval = n > 20 ? Math.ceil(n / 10) : 2;
          return dates.map((_, i) => {
            const cnt = s.data[i]?.count ?? 0;
            if (cnt === 0 && n > 10) return null;
            const cx = xFor(i);
            const cy = yFor(cnt);
            const isHovered = hoverIdx === i;
            const showLabel = cnt > 0 && (i % labelInterval === 0 || i === n - 1 || cnt === maxCount);
            return (
              <g key={`dp-${si}-${i}`}>
                {cnt > 0 && (
                  <>
                    <circle cx={cx} cy={cy} r={isHovered ? dotHoverR : dotR}
                      fill={isHovered ? color : "#18181b"}
                      stroke={color} strokeWidth={isHovered ? 2 : 1.5}
                      className="trend-dot transition-all duration-150"
                      style={{ pointerEvents: "none" }} />
                    {showLabel && (
                      <text x={cx} y={cy - (isNarrow ? 10 : 7)} textAnchor="middle" fontSize={fontSizeXs} fill={color} fontFamily="monospace" fontWeight="bold" style={{ pointerEvents: "none" }}>{cnt}</text>
                    )}
                  </>
                )}
              </g>
            );
          });
        })}
      </svg>

        {/* Animation styles */}
        <style>{`
          @keyframes dashDraw {
            to { stroke-dashoffset: 0; }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .trend-line {
            stroke-dasharray: 5000;
            stroke-dashoffset: 5000;
            animation: dashDraw 1.2s ease-out forwards;
          }
          .trend-area {
            opacity: 0;
            animation: fadeIn 0.6s ease-out 0.4s forwards;
          }
          .trend-dot {
            opacity: 0;
            animation: fadeIn 0.3s ease-out forwards;
          }
        `}</style>
    </div>
  );
}

// Resolve a hex color for a guild series (lighter — for trend lines)
function resolveSeriesColor(guildName: string | null, idx: number, guilds: Guild[]): string {
  if (!guildName) return UNASSIGNED_COLOR;
  const g = guilds.find(x => x.name === guildName);
  if (!g) return GUILD_LINE_COLORS[idx % GUILD_LINE_COLORS.length];
  const gc = guildColor(g.name);
  const colorMap: Record<string, string> = {
    "red": "#f87171", "orange": "#fb923c", "amber": "#fbbf24", "yellow": "#facc15",
    "lime": "#a3e635", "green": "#34d399", "emerald": "#34d399", "teal": "#2dd4bf",
    "cyan": "#22d3ee", "sky": "#38bdf8", "blue": "#60a5fa", "indigo": "#818cf8",
    "violet": "#a78bfa", "purple": "#c084fc", "fuchsia": "#e879f9", "pink": "#f472b6",
    "rose": "#fb7185",
  };
  const rawCls = gc?.text?.replace("text-", "") ?? "";
  const cls = rawCls.replace(/-\d+$/, "");
  return colorMap[cls] ?? GUILD_LINE_COLORS[idx % GUILD_LINE_COLORS.length];
}

// Darker variant for bar chart backgrounds
function resolveBarColor(guildName: string | null, idx: number, guilds: Guild[]): string {
  if (!guildName) return "#52525b";
  const g = guilds.find(x => x.name === guildName);
  if (!g) return GUILD_LINE_COLORS[idx % GUILD_LINE_COLORS.length];
  const gc = guildColor(g.name);
  const darkMap: Record<string, string> = {
    "red": "#7f1d1d", "orange": "#7c2d12", "amber": "#78350f", "yellow": "#713f12",
    "lime": "#365314", "green": "#14532d", "emerald": "#064e3b", "teal": "#134e4a",
    "cyan": "#164e63", "sky": "#0c4a6e", "blue": "#1e3a5f", "indigo": "#312e81",
    "violet": "#4c1d95", "purple": "#581c87", "fuchsia": "#701a75", "pink": "#831843",
    "rose": "#881337",
  };
  const rawCls = gc?.text?.replace("text-", "") ?? "";
  const cls = rawCls.replace(/-\d+$/, "");
  return darkMap[cls] ?? "#3f3f46";
}
