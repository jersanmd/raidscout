import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAnalytics, type AnalyticsData, isSupabaseConfigured, fetchGuilds, fetchMembers } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import { guildColor } from "@/lib/constants";
import type { Guild, Member } from "@/types";
import { BarChart3, TrendingUp, Users, Skull, Activity, Loader2, Shield } from "lucide-react";
import { useServerTimezone } from "@/hooks/useServerTimezone";

interface AnalyticsUIData {
  totalKills: number;
  totalAttendance: number;
  activeMembers: number;
  killsByWeek: { week: string; count: number }[];
  topBosses: { name: string; kills: number }[];
  topHunters: { name: string; attended: number }[];
  killsByDay: { day: string; count: number }[];
}

export function AnalyticsView() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const configured = isSupabaseConfigured();
  const [period, setPeriod] = useState<"week" | "month" | "all">("week");
  const [huntersPage, setHuntersPage] = useState(1);
  const HUNTERS_PER_PAGE = 10;
  const tz = useServerTimezone();

  // Reset pagination when period changes
  useEffect(() => { setHuntersPage(1); }, [period]);

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

      const raw = await fetchAnalytics(since, serverId);
      return {
        totalKills: raw.total_kills,
        totalAttendance: raw.total_attendance,
        activeMembers: raw.active_members,
        killsByWeek: (raw.kills_by_week ?? []).map((w: any) => ({
          week: w.week_label ?? w.week,
          count: w.count,
        })),
        topBosses: raw.top_bosses ?? [],
        topHunters: raw.top_hunters ?? [],
        killsByDay: raw.kills_by_day ?? [],
      };
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    enabled: configured && !!serverId,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  const maxWeeklyKills = Math.max(...data.killsByWeek.map((w) => w.count), 1);
  const maxBossKills = Math.max(...data.topBosses.map((b) => b.kills), 1);
  const maxAttended = Math.max(...data.topHunters.map((h) => h.attended), 1);
  const maxDaily = Math.max(...data.killsByDay.map((d) => d.count), 1);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-400">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Analytics</h2>
        </div>
        <div className="flex bg-slate-800 rounded-lg p-0.5">
          {(["week", "month", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setHuntersPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                period === p ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {p === "week" ? "This Week" : p === "month" ? "This Month" : "All Time"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Skull className="w-4 h-4" />} label="Total Kills" value={data.totalKills} color="text-red-400" bg="bg-red-900/20 border-red-800" />
        <StatCard icon={<Users className="w-4 h-4" />} label="Active Members" value={data.activeMembers} color="text-blue-400" bg="bg-blue-900/20 border-blue-800" />
        <StatCard icon={<Activity className="w-4 h-4" />} label="Attendances" value={data.totalAttendance} color="text-amber-400" bg="bg-amber-900/20 border-amber-800" />
      </div>

      {period !== "week" && (
      <Section title="Kills per Week" icon={<TrendingUp className="w-4 h-4" />}>
        <div className="space-y-1.5">
          {data.killsByWeek.slice(-12).reverse().map((w) => (
            <div key={w.week} className="flex items-center gap-2 text-sm">
              <span className="text-slate-400 w-20 shrink-0 text-left">{w.week}</span>
              <div className="flex-1 h-6 bg-slate-800 rounded overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-600 to-pink-500 rounded flex items-center justify-end px-2" style={{ width: `${Math.max((w.count / maxWeeklyKills) * 100, 8)}%` }}>
                  <span className="text-xs text-white font-mono font-bold drop-shadow">{w.count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      )}

      <Section title="Most Killed Bosses" icon={<Skull className="w-4 h-4" />}>
        <div className="space-y-1.5">
          {data.topBosses.map((b, i) => (
            <div key={b.name} className="flex items-center gap-2 text-sm">
              <span className="text-slate-400 w-5 shrink-0 text-left">{i + 1}.</span>
              <span className="text-white w-24 shrink-0 truncate text-left">{b.name}</span>
              <div className="flex-1 h-6 bg-slate-800 rounded overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-600 to-orange-500 rounded flex items-center justify-end px-2" style={{ width: `${Math.max((b.kills / maxBossKills) * 100, 8)}%` }}>
                  <span className="text-xs text-white font-mono font-bold drop-shadow">{b.kills}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Most Active Hunters" icon={<Users className="w-4 h-4" />}>
        <div className="space-y-1.5">
          {data.topHunters.slice(0, huntersPage * HUNTERS_PER_PAGE).map((h, i) => {
            const gid = memberGuildMap.get(h.name);
            const guild = gid ? guilds.find(g => g.id === gid) : null;
            const c = guild ? guildColor(guild.name) : null;
            return (
            <div key={h.name} className="flex items-center gap-2 text-sm">
              <span className="text-slate-400 w-5 shrink-0 text-left">{i + 1}.</span>
              <span className="text-white w-24 shrink-0 truncate text-left">{h.name}</span>
              {guild && c && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
                  <Shield className="w-2.5 h-2.5 inline mr-0.5" />{guild.name}
                </span>
              )}
              <div className="flex-1 h-6 bg-slate-800 rounded overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 rounded flex items-center justify-end px-2" style={{ width: `${Math.max((h.attended / maxAttended) * 100, 8)}%` }}>
                  <span className="text-xs text-white font-mono font-bold drop-shadow">{h.attended}</span>
                </div>
              </div>
            </div>
          )})}
          {data.topHunters.length > huntersPage * HUNTERS_PER_PAGE && (
            <button
              onClick={() => setHuntersPage(p => p + 1)}
              className="w-full py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-slate-800/50 rounded transition"
            >
              Show more ({data.topHunters.length - huntersPage * HUNTERS_PER_PAGE} remaining)
            </button>
          )}
          {huntersPage > 1 && (
            <button
              onClick={() => setHuntersPage(1)}
              className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded transition"
            >
              Show less
            </button>
          )}
        </div>
      </Section>

      <Section title="Activity by Day" icon={<Activity className="w-4 h-4" />}>
        <div className="space-y-1.5">
          {data.killsByDay.map((d) => (
            <div key={d.day} className="flex items-center gap-2 text-sm">
              <span className="text-slate-400 w-10 shrink-0">{d.day}</span>
              <div className="flex-1 h-6 bg-slate-800 rounded overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-600 to-yellow-500 rounded flex items-center justify-end px-2" style={{ width: `${Math.max((d.count / maxDaily) * 100, 8)}%` }}>
                  <span className="text-xs text-white font-mono font-bold drop-shadow">{d.count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function StatCard({ icon, label, value, color, bg }: { icon: React.ReactNode; label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-xl border ${bg} p-3 text-center`}>
      <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
      <div className="text-lg font-bold text-white tabular-nums">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">{icon} {title}</h3>
      {children}
    </div>
  );
}

function emptyAnalytics(): AnalyticsUIData {
  return {
    totalKills: 0,
    totalAttendance: 0,
    activeMembers: 0,
    killsByWeek: [],
    topBosses: [],
    topHunters: [],
    killsByDay: [],
  };
}
