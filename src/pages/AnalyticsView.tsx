import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAnalytics, type AnalyticsData, isSupabaseConfigured, fetchGuilds, fetchMembers } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useServerId } from "@/contexts/ServerContext";
import { guildColor } from "@/lib/constants";
import type { Guild, Member } from "@/types";
import { BarChart3, TrendingUp, Users, Skull, Activity, Loader2, Shield, Download } from "lucide-react";
import { useServerTimezone } from "@/hooks/useServerTimezone";

interface AnalyticsUIData {
  totalKills: number;
  totalAttendance: number;
  activeMembers: number;
  killsByWeek: { week: string; count: number }[];
  topBosses: { name: string; kills: number }[];
  topHunters: { name: string; attended: number }[];
  killsByDay: { day: string; count: number }[];
  totalActivities: number;
  activityParticipation: number;
}

export function AnalyticsView() {
  const { user, isViewer } = useAuth();
  const serverId = useServerId();
  const configured = isSupabaseConfigured();
  const [period, setPeriod] = useState<"week" | "month" | "all">("week");
  const [huntersPage, setHuntersPage] = useState(1);
  const HUNTERS_PER_PAGE = 10;
  const BOSSES_PER_PAGE = 10;
  const [bossesPage, setBossesPage] = useState(1);
  const WEEKS_PER_PAGE = 5;
  const [weeksPage, setWeeksPage] = useState(1);
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
        totalActivities: raw.total_activities ?? 0,
        activityParticipation: raw.activity_participation ?? 0,
      };
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    enabled: configured && !!serverId,
  });

  const [exportLoading, setExportLoading] = useState(false);

  const handleExportAnalytics = () => {
    if (!data) return;
    setExportLoading(true);
    try {
      const periodLabel = period === "week" ? "This Week" : period === "month" ? "This Month" : "All Time";
      const memberGuildMap = new Map(members.map(m => [m.name, m.guild_id]));

      let c1 = "", c2 = "", c3 = "", c4 = "";

      if (data.killsByWeek.length > 0) {
        c1 += `<table><tr><th class="hdr" colspan="2">Kills per Week</th></tr><tr class="shdr"><td>Week</td><td style="text-align:center">Kills</td></tr>`;
        data.killsByWeek.slice(-12).reverse().forEach((w, i) => {
          c1 += `<tr class="${i % 2 === 0 ? "e" : "o"}"><td class="nm">${w.week}</td><td class="num">${w.count}</td></tr>`;
        });
        c1 += `</table>`;
      }

      c2 += `<table><tr><th class="hdr" colspan="2">Activity by Day</th></tr><tr class="shdr"><td>Day</td><td style="text-align:center">Kills</td></tr>`;
      data.killsByDay.forEach((d, i) => {
        c2 += `<tr class="${i % 2 === 0 ? "e" : "o"}"><td class="nm">${d.day}</td><td class="num">${d.count}</td></tr>`;
      });
      c2 += `</table>`;

      c3 += `<table><tr><th class="hdr" colspan="3">Most Killed Bosses</th></tr><tr class="shdr"><td>#</td><td>Boss</td><td style="text-align:center">Kills</td></tr>`;
      data.topBosses.forEach((b, i) => {
        c3 += `<tr class="${i % 2 === 0 ? "e" : "o"}"><td class="rnk">${i + 1}</td><td class="nm">${b.name}</td><td class="num">${b.kills}</td></tr>`;
      });
      c3 += `</table>`;

      c4 += `<table><tr><th class="hdr" colspan="4">Most Active Hunters</th></tr><tr class="shdr"><td>#</td><td>Player</td><td>Guild</td><td style="text-align:center">Att</td></tr>`;
      data.topHunters.forEach((h, i) => {
        const gid = memberGuildMap.get(h.name);
        const guild = gid ? guilds.find(g => g.id === gid) : null;
        c4 += `<tr class="${i % 2 === 0 ? "e" : "o"}"><td class="rnk">${i + 1}</td><td class="nm">${h.name}</td><td class="gld">${guild?.name || ""}</td><td class="num">${h.attended}</td></tr>`;
      });
      c4 += `</table>`;

      const html = `<html><head><meta charset="utf-8"><style>
        body { background: #0F172A; font-family: -apple-system, sans-serif; padding: 16px; }
        .title { color: #F8FAFC; font-size: 18px; font-weight: bold; margin-bottom: 4px; }
        .subtitle { color: #64748B; font-size: 12px; margin-bottom: 16px; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 0; }
        th, td { padding: 6px 10px; border: 1px solid #334155; font-size: 11px; }
        .hdr { background: #7C3AED; color: #fff; font-weight: bold; text-align: left; }
        .shdr { background: #1E293B; color: #94A3B8; font-weight: bold; }
        .e { background: #1E293B; color: #E2E8F0; }
        .o { background: #0F172A; color: #E2E8F0; }
        .num { text-align: center; font-weight: bold; color: #FBBF24; }
        .rnk { text-align: center; color: #64748B; width: 30px; }
        .nm { color: #E2E8F0; }
        .gld { color: #94A3B8; font-size: 10px; }
        .sum { background: #1E293B; }
        .sval { text-align: center; font-weight: bold; font-size: 20px; }
        .slbl { color: #94A3B8; text-align: center; font-size: 10px; padding-top: 2px; }
</style></head><body>
<div class="title">RaidScout Analytics</div>
<div class="subtitle">${periodLabel} · ${new Date().toLocaleDateString()}</div>
<table><tr>
  <td class="sum" style="width:33%"><div class="sval" style="color:#F87171">${data.totalKills}</div><div class="slbl">Total Kills</div></td>
  <td class="sum" style="width:33%"><div class="sval" style="color:#60A5FA">${data.activeMembers}</div><div class="slbl">Active Members</div></td>
  <td class="sum" style="width:33%"><div class="sval" style="color:#FBBF24">${data.totalAttendance}</div><div class="slbl">Attendances</div></td>
</tr></table>
<table><tr>
  <td style="width:25%;vertical-align:top;padding:0 6px 0 0">${c1}</td>
  <td style="width:25%;vertical-align:top;padding:0 6px">${c2}</td>
  <td style="width:25%;vertical-align:top;padding:0 6px">${c3}</td>
  <td style="width:25%;vertical-align:top;padding:0 0 0 6px">${c4}</td>
</tr></table></body></html>`;

      const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${period}-${new Date().toISOString().slice(0,10)}.xls`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error("Export failed:", err); alert("Export failed."); }
    finally { setExportLoading(false); }
  };

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" />
      </div>
    );
  }

  const maxWeeklyKills = Math.max(...data.killsByWeek.map((w) => w.count), 1);
  const maxBossKills = Math.max(...data.topBosses.map((b) => b.kills), 1);
  const maxAttended = Math.max(...data.topHunters.map((h) => h.attended), 1);
  const maxDaily = Math.max(...data.killsByDay.map((d) => d.count), 1);

  return (
    <div className="max-w-[99%] 2xl:max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#18181b] border border-[#27272a]">
            <BarChart3 className="w-5 h-5 text-[#fafafa]" />
          </div>
          <h2 className="text-xl font-bold text-[#fafafa]">Analytics</h2>
        </div>
        <div className="flex bg-[#18181b] rounded-lg p-0.5">
          {(["week", "month", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setHuntersPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                period === p ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
              }`}
            >
              {p === "week" ? "This Week" : p === "month" ? "This Month" : "All Time"}
            </button>
          ))}
        </div>
        {!isViewer && (
        <button
          onClick={handleExportAnalytics}
          disabled={exportLoading}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50"
        >
          {exportLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          Export
        </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard icon={<Skull className="w-4 h-4" />} label="Total Kills" value={data.totalKills} color="text-[#a1a1aa]" bg="bg-[#18181b] border-[#27272a]" />
        <StatCard icon={<Users className="w-4 h-4" />} label="Active Members" value={data.activeMembers} color="text-[#a1a1aa]" bg="bg-[#18181b] border-[#27272a]" />
        <StatCard icon={<Activity className="w-4 h-4" />} label="Attendances" value={data.totalAttendance} color="text-[#a1a1aa]" bg="bg-[#18181b] border-[#27272a]" />
        <StatCard icon={<span className="text-sm">📅</span>} label="Activities" value={data.totalActivities} color="text-[#a1a1aa]" bg="bg-[#18181b] border-[#27272a]" />
      </div>

      {period !== "week" && (
      <Section title="Kills per Week" icon={<TrendingUp className="w-4 h-4" />}>
        <div className="space-y-1.5">
          {data.killsByWeek.slice(-(weeksPage * WEEKS_PER_PAGE)).reverse().map((w) => (
            <div key={w.week} className="flex items-center gap-2 text-sm">
              <span className="text-[#a1a1aa] w-20 shrink-0 text-left">{w.week}</span>
              <div className="flex-1 h-6 bg-[#18181b] rounded overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#3f3f46] to-[#52525b] rounded flex items-center justify-end px-2" style={{ width: `${Math.max((w.count / maxWeeklyKills) * 100, 8)}%` }}>
                  <span className="text-xs text-[#fafafa] font-mono font-bold drop-shadow">{w.count}</span>
                </div>
              </div>
            </div>
          ))}
          {data.killsByWeek.length > weeksPage * WEEKS_PER_PAGE && (
            <button onClick={() => setWeeksPage(p => p + 1)} className="w-full py-1.5 text-xs text-[#a1a1aa] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 rounded transition">Show more ({data.killsByWeek.length - weeksPage * WEEKS_PER_PAGE} remaining)</button>
          )}
          {weeksPage > 1 && (
            <button onClick={() => setWeeksPage(1)} className="w-full py-1.5 text-xs text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 rounded transition">Show less</button>
          )}
        </div>
      </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Section title="Most Active Hunters" icon={<Users className="w-4 h-4" />}>
        <div className="space-y-1.5">
          {data.topHunters.slice(0, huntersPage * HUNTERS_PER_PAGE).map((h, i) => {
            const gid = memberGuildMap.get(h.name);
            const guild = gid ? guilds.find(g => g.id === gid) : null;
            const c = guild ? guildColor(guild.name) : null;
            return (
            <div key={h.name} className="flex items-center gap-2 text-sm">
              <span className="text-[#a1a1aa] w-5 shrink-0 text-left">{i + 1}.</span>
              <span className="text-[#fafafa] w-24 shrink-0 truncate text-left">{h.name}</span>
              {guild && c && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${c.bg} ${c.text} ${c.border}`}>
                  <Shield className="w-2.5 h-2.5 inline mr-0.5" />{guild.name}
                </span>
              )}
              <div className="flex-1 h-6 bg-[#18181b] rounded overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#3f3f46] to-[#52525b] rounded flex items-center justify-end px-2" style={{ width: `${Math.max((h.attended / maxAttended) * 100, 8)}%` }}>
                  <span className="text-xs text-[#fafafa] font-mono font-bold drop-shadow">{h.attended}</span>
                </div>
              </div>
            </div>
          )})}
          {data.topHunters.length > huntersPage * HUNTERS_PER_PAGE && (
            <button
              onClick={() => setHuntersPage(p => p + 1)}
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

      <Section title="Most Killed Bosses" icon={<Skull className="w-4 h-4" />}>
        <div className="space-y-1.5">
          {data.topBosses.slice(0, bossesPage * BOSSES_PER_PAGE).map((b, i) => (
            <div key={b.name} className="flex items-center gap-2 text-sm">
              <span className="text-[#a1a1aa] w-5 shrink-0 text-left">{i + 1}.</span>
              <span className="text-[#fafafa] w-24 shrink-0 truncate text-left">{b.name}</span>
              <div className="flex-1 h-6 bg-[#18181b] rounded overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#3f3f46] to-[#52525b] rounded flex items-center justify-end px-2" style={{ width: `${Math.max((b.kills / maxBossKills) * 100, 8)}%` }}>
                  <span className="text-xs text-[#fafafa] font-mono font-bold drop-shadow">{b.kills}</span>
                </div>
              </div>
            </div>
          ))}
          {data.topBosses.length > bossesPage * BOSSES_PER_PAGE && (
            <button onClick={() => setBossesPage(p => p + 1)} className="w-full py-1.5 text-xs text-[#a1a1aa] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 rounded transition">Show more ({data.topBosses.length - bossesPage * BOSSES_PER_PAGE} remaining)</button>
          )}
          {bossesPage > 1 && (
            <button onClick={() => setBossesPage(1)} className="w-full py-1.5 text-xs text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 rounded transition">Show less</button>
          )}
        </div>
      </Section>
      </div>

      <Section title="Activity by Day" icon={<Activity className="w-4 h-4" />}>
        <div className="space-y-1.5">
          {data.killsByDay.map((d) => (
            <div key={d.day} className="flex items-center gap-2 text-sm">
              <span className="text-[#a1a1aa] w-12 shrink-0 text-xs">{d.day.slice(0, 3)}</span>
              <div className="flex-1 h-6 bg-[#18181b] rounded overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#3f3f46] to-[#52525b] rounded flex items-center justify-end px-2" style={{ width: `${Math.max((d.count / maxDaily) * 100, 8)}%` }}>
                  <span className="text-xs text-[#fafafa] font-mono font-bold drop-shadow">{d.count}</span>
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
      <div className="text-lg font-bold text-[#fafafa] tabular-nums">{value}</div>
      <div className="text-xs text-[#71717a]">{label}</div>
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

function emptyAnalytics(): AnalyticsUIData {
  return {
    totalKills: 0, totalAttendance: 0, activeMembers: 0,
    killsByWeek: [], topBosses: [], topHunters: [], killsByDay: [],
    totalActivities: 0, activityParticipation: 0,
  };
}
