import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMemberProfile, addMemberNote, deleteMemberNote, isSupabaseConfigured, fetchGuilds, supabase } from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { guildColor } from "@/lib/constants";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { BossImage } from "@/components/BossImage";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, LineChart, Line, BarChart, Bar, Legend } from "recharts";
import type { CpUpdate } from "@/types";
import {
  ArrowLeft, TrendingUp, ScrollText, Plus, Trash2, Loader2,
  User, MessageSquare, Clock, Package, Skull, Activity,
  Gift, AlertTriangle, Shield, Star, Calendar, X,
  Sword, Swords, HandMetal, ShieldHalf, ShieldCheck, Gavel, Axe, Crosshair,
  Target, Wand, Heart, Zap, Flame, Snowflake, Anchor, Footprints, Crown, Tag, ExternalLink,
} from "lucide-react";

// ── Score Gauge ──
function ScoreGauge({ score }: { score: number }) {
  const r = 22; const circ = 2 * Math.PI * r;
  const pct = Math.min(score / 100, 1);
  const colors = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="#27272a" strokeWidth="4"/>
      <circle cx="28" cy="28" r={r} fill="none" stroke={colors} strokeWidth="4"
        strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 28 28)"/>
      <text x="28" y="28" textAnchor="middle" dy="0.35em" fill="#fafafa" fontSize="14" fontWeight="bold">{score}</text>
    </svg>
  );
}

export function MemberProfileView() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const serverId = useServerId();
  const { isViewer } = useAuth();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["memberProfile", memberId],
    queryFn: () => fetchMemberProfile(memberId!),
    enabled: !!memberId && configured,
  });

  const { data: guilds = [] } = useQuery({
    queryKey: ["guilds", serverId],
    queryFn: () => fetchGuilds(serverId),
    staleTime: 60000,
    enabled: !!serverId && configured,
  });

  // ── Gear Planner data ──
  const { data: gameSlug } = useQuery({
    queryKey: ["serverGame", serverId],
    queryFn: async () => { const { data } = await supabase.from("servers").select("game").eq("id", serverId).single(); return data?.game || null; },
    enabled: !!serverId && configured,
  });
  const { data: gearSlotDefs = [] } = useQuery<any[]>({
    queryKey: ["gearSlots", gameSlug],
    queryFn: async () => { const { data } = await supabase.from("gear_slots").select("id, name, sort_order").eq("game", gameSlug).order("sort_order"); return data || []; },
    enabled: !!gameSlug && configured,
  });
  const { data: memberGear = [] } = useQuery<any[]>({
    queryKey: ["memberGearProfile", memberId],
    queryFn: async () => { const { data } = await supabase.from("member_gear").select("id, member_id, slot_id, catalog_item_id, enhancement_level").eq("member_id", memberId); return data || []; },
    enabled: !!memberId && configured && !!gameSlug,
  });
  const { data: gearItems = [] } = useQuery<any[]>({
    queryKey: ["gameItems", gameSlug],
    queryFn: async () => { if (!gameSlug) return []; const { data } = await supabase.from("items").select("*").eq("game", gameSlug).order("name"); return data || []; },
    enabled: !!gameSlug && configured,
  });

  const gearMap = useMemo(() => { const m: Record<string, any> = {}; memberGear.forEach((g: any) => { m[g.slot_id] = g; }); return m; }, [memberGear]);
  const gearItemMap = useMemo(() => { const m: Record<string, any> = {}; gearItems.forEach((i: any) => { m[i.id] = i; }); return m; }, [gearItems]);

  // Class icons & colors from server_classes
  const [classIcons, setClassIcons] = useState<Record<string, string>>({});
  const [classColors, setClassColors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!serverId) return;
    supabase.from("server_classes").select("name, icon, color").eq("server_id", serverId)
      .then(({ data }) => {
        if (data) {
          const icons: Record<string, string> = {}; const colors: Record<string, string> = {};
          (data as any[]).forEach(r => { icons[r.name] = r.icon; colors[r.name] = r.color; });
          setClassIcons(icons); setClassColors(colors);
        }
      });
  }, [serverId]);

  const CLASS_ICONS: { name: string; icon: React.ElementType }[] = [
    { name: "Sword", icon: Sword }, { name: "Swords", icon: Swords }, { name: "HandMetal", icon: HandMetal },
    { name: "ShieldIcon", icon: Shield }, { name: "ShieldHalf", icon: ShieldHalf }, { name: "ShieldCheck", icon: ShieldCheck },
    { name: "Gavel", icon: Gavel }, { name: "Axe", icon: Axe }, { name: "Crosshair", icon: Crosshair },
    { name: "Target", icon: Target }, { name: "Wand", icon: Wand }, { name: "Heart", icon: Heart },
    { name: "Zap", icon: Zap }, { name: "Flame", icon: Flame }, { name: "Snowflake", icon: Snowflake },
    { name: "SkullIcon", icon: Skull }, { name: "Star", icon: Star }, { name: "Crown", icon: Crown },
    { name: "Anchor", icon: Anchor }, { name: "Footprints", icon: Footprints },
  ];
  const getClassIcon = (iconName: string) => {
    const entry = CLASS_ICONS.find(c => c.name === iconName);
    return entry ? entry.icon : Tag;
  };

  const memberGuild = guilds.find(g => g.id === profile?.guild_id);
  const gColor = memberGuild ? guildColor(memberGuild.name) : null;

  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState<CpUpdate | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<string>("all");
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [timelineVisible, setTimelineVisible] = useState<number>(20);
  useEscapeKey(() => setSelectedUpdate(null), !!selectedUpdate);
  useEscapeKey(() => setFullScreenImage(null), !!fullScreenImage);

  // Reset timeline when member changes
  useEffect(() => { setTimelineVisible(20); }, [memberId]);

  // Reset timeline pagination when filter changes
  useEffect(() => { setTimelineVisible(20); }, [timelineFilter]);

  const addNoteMutation = useMutation({
    mutationFn: (note: string) => addMemberNote({ server_id: serverId!, member_id: memberId!, note }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["memberProfile", memberId] }); setNewNote(""); },
  });
  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => deleteMemberNote(noteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memberProfile", memberId] }),
  });

  const handleAddNote = async () => {
    if (!newNote.trim() || addingNote) return;
    setAddingNote(true);
    try { await addNoteMutation.mutateAsync(newNote.trim()); } finally { setAddingNote(false); }
  };

  const fmtCp = (cp: number | null | undefined) => cp != null ? cp.toLocaleString() : "—";
  const fmtDateTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " · " +
      date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const timeAgo = (d: string | null) => {
    if (!d) return "Never";
    const ms = Date.now() - new Date(d).getTime();
    const days = Math.floor(ms / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return fmtDate(d);
  };

  // ── Computed Data (must be before early returns — hooks order) ──
  const approvedUpdates = useMemo(() =>
    profile ? profile.cp_history.filter((u: CpUpdate) => u.status === "approved") : [],
  [profile]);
  const lastAttended = useMemo(() => {
    if (!profile) return null;
    const dates: number[] = [];
    (profile.attendance_history || []).forEach((a: any) => dates.push(new Date(a.created_at).getTime()));
    (profile.activity_attendance || []).forEach((a: any) => dates.push(new Date(a.created_at).getTime()));
    return dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null;
  }, [profile]);
  const totalEvents = profile ? (profile.attendance_history?.length || 0) + (profile.activity_attendance?.length || 0) : 0;

  // 7-day and 30-day event counts (computed fresh each render)
  const events7d = (() => {
    if (!profile) return 0;
    const now = Date.now();
    const cutoff = now - 7 * 86400000;
    const hunts = (profile.attendance_history || []).filter((a: any) => new Date(a.created_at).getTime() >= cutoff).length;
    const acts = (profile.activity_attendance || []).filter((a: any) => new Date(a.created_at).getTime() >= cutoff).length;
    return hunts + acts;
  })();
  const events30d = (() => {
    if (!profile) return 0;
    const now = Date.now();
    const cutoff = now - 30 * 86400000;
    const hunts = (profile.attendance_history || []).filter((a: any) => new Date(a.created_at).getTime() >= cutoff).length;
    const acts = (profile.activity_attendance || []).filter((a: any) => new Date(a.created_at).getTime() >= cutoff).length;
    return hunts + acts;
  })();
  const loot14d = (() => {
    if (!profile) return 0;
    const cutoff = Date.now() - 14 * 86400000;
    return (profile.loot_history || []).filter((l: any) => new Date(l.distributed_at).getTime() >= cutoff).length;
  })();
  const loot3mo = (() => {
    if (!profile) return 0;
    const cutoff = Date.now() - 90 * 86400000;
    return (profile.loot_history || []).filter((l: any) => new Date(l.distributed_at).getTime() >= cutoff).length;
  })();
  const loot6mo = (() => {
    if (!profile) return 0;
    const cutoff = Date.now() - 180 * 86400000;
    return (profile.loot_history || []).filter((l: any) => new Date(l.distributed_at).getTime() >= cutoff).length;
  })();
  const loot1yr = (() => {
    if (!profile) return 0;
    const cutoff = Date.now() - 365 * 86400000;
    return (profile.loot_history || []).filter((l: any) => new Date(l.distributed_at).getTime() >= cutoff).length;
  })();
  const loot2yr = (() => {
    if (!profile) return 0;
    const cutoff = Date.now() - 730 * 86400000;
    return (profile.loot_history || []).filter((l: any) => new Date(l.distributed_at).getTime() >= cutoff).length;
  })();
  const risks: string[] = useMemo(() => {
    if (!profile) return [];
    const r: string[] = [];
    const daysActive = lastAttended ? Math.floor((Date.now() - new Date(lastAttended).getTime()) / 86400000) : 999;
    if (daysActive >= 7) r.push(`Inactive ${daysActive} days`);
    const lastCp = approvedUpdates.length > 0 ? approvedUpdates[0].submitted_at : null;
    const daysCp = lastCp ? Math.floor((Date.now() - new Date(lastCp).getTime()) / 86400000) : 999;
    if (daysCp >= 14) r.push("No CP update in 14+ days");
    if (profile.cp_growth_7d != null && profile.cp_growth_7d < 0) r.push("Declining CP");
    return r;
  }, [profile, lastAttended, approvedUpdates]);
  const daysSinceActive = lastAttended ? Math.floor((Date.now() - new Date(lastAttended).getTime()) / 86400000) : 999;
  const score = useMemo(() => {
    if (!profile) return 0;
    let s = 0;
    s += Math.min(40, totalEvents * 2);
    const growth = profile.cp_growth_30d ?? 0;
    s += Math.min(30, Math.max(0, growth / 100));
    s += Math.max(0, 20 - daysSinceActive * 1.5);
    const recent = (profile.attendance_history || []).filter((a: any) => new Date(a.created_at).getTime() > Date.now() - 14 * 86400000);
    s += Math.min(10, recent.length * 2);
    return Math.round(Math.min(100, Math.max(0, s)));
  }, [profile, totalEvents, daysSinceActive]);
  const cpSparkData = useMemo(() => {
    const items = approvedUpdates.slice(0, 20).reverse(); // oldest first
    return items.map((u: CpUpdate, i: number) => {
      const prev = i > 0 ? items[i - 1].new_cp : null;
      const pct = prev && prev > 0 ? ((u.new_cp - prev) / prev * 100) : null;
      return {
        cp: u.new_cp,
        date: new Date(u.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        change: pct != null ? (pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`) : null,
      };
    });
  }, [approvedUpdates]);

  // CP trend: "up" (green) / "down" (red) / "flat" (neutral)
  const cpTrend: "up" | "down" | "flat" = useMemo(() => {
    if (cpSparkData.length < 2) return "flat";
    const first = cpSparkData[0].cp;
    const last = cpSparkData[cpSparkData.length - 1].cp;
    if (last > first) return "up";
    if (last < first) return "down";
    return "flat";
  }, [cpSparkData]);
  const cpTrendColor = cpTrend === "up" ? "#22c55e" : cpTrend === "down" ? "#ef4444" : "#a1a1aa";
  const cpPctChange: number | null = useMemo(() => {
    if (cpSparkData.length < 2) return null;
    const first = cpSparkData[0].cp;
    const last = cpSparkData[cpSparkData.length - 1].cp;
    return first > 0 ? ((last - first) / first * 100) : null;
  }, [cpSparkData]);

  // Account status summary — natural language commentary
  const accountSummary = useMemo(() => {
    if (!profile) return null;
    const lines: { text: string; colorClass: string }[] = [];

    // CP progress commentary
    if (cpTrend === "up" && cpPctChange != null) {
      lines.push({ text: `CP is trending up +${cpPctChange.toFixed(1)}% over your last ${cpSparkData.length} updates — great progress!`, colorClass: "text-green-400" });
    } else if (cpTrend === "down" && cpPctChange != null) {
      lines.push({ text: `CP is down ${cpPctChange.toFixed(1)}% — time to gear up and catch up!`, colorClass: "text-red-400" });
    } else if (cpTrend === "flat") {
      lines.push({ text: `CP has been steady — keep pushing to grow stronger.`, colorClass: "text-[#a1a1aa]" });
    }

    // Attendance commentary
    if (totalEvents >= 20) {
      lines.push({ text: `Very active — ${totalEvents} events attended. Keep it up!`, colorClass: "text-green-400" });
    } else if (totalEvents >= 5) {
      lines.push({ text: `Moderately active with ${totalEvents} events attended.`, colorClass: "text-amber-400" });
    } else if (totalEvents > 0) {
      lines.push({ text: `Just getting started — ${totalEvents} event${totalEvents !== 1 ? "s" : ""} attended so far.`, colorClass: "text-[#a1a1aa]" });
    }

    if (daysSinceActive >= 7 && daysSinceActive < 999) {
      lines.push({ text: `Last seen ${daysSinceActive} days ago — time to check in!`, colorClass: "text-red-400" });
    }

    // Score commentary
    if (score >= 75) {
      lines.push({ text: `Excellent performance score of ${score}/100.`, colorClass: "text-green-400" });
    } else if (score >= 50) {
      lines.push({ text: `Decent score of ${score}/100 — room to grow.`, colorClass: "text-amber-400" });
    } else if (score > 0) {
      lines.push({ text: `Low score of ${score}/100 — focus on attendance and CP growth.`, colorClass: "text-red-400" });
    }

    if (risks.length > 0) {
      lines.push({ text: risks.join(" · "), colorClass: "text-red-400" });
    }

    if (lines.length === 0) {
      lines.push({ text: "Not enough data yet — start attending events and updating CP to see your summary.", colorClass: "text-[#a1a1aa]" });
    }

    return lines;
  }, [profile, cpTrend, cpPctChange, cpSparkData.length, totalEvents, daysSinceActive, score, risks]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Weekly Performance Score (12 weeks) ──
  const weeklyPerf = useMemo(() => {
    if (!profile) return [];
    const weeks: { label: string; score: number }[] = [];
    const now = Date.now();
    for (let w = 11; w >= 0; w--) {
      const start = now - (w + 1) * 7 * 86400000;
      const end = now - w * 7 * 86400000;
      const attCount = (profile.attendance_history || []).filter((a: any) => {
        const t = new Date(a.created_at).getTime(); return t >= start && t < end;
      }).length + (profile.activity_attendance || []).filter((a: any) => {
        const t = new Date(a.created_at).getTime(); return t >= start && t < end;
      }).length;
      const weekUps = approvedUpdates.filter((u: CpUpdate) => {
        const t = new Date(u.submitted_at).getTime(); return t >= start && t < end;
      });
      const growthVal = weekUps.length >= 2
        ? Math.max(...weekUps.map(u => u.new_cp)) - Math.min(...weekUps.map(u => u.new_cp)) : 0;
      const actCount = weekUps.length + (profile.loot_history || []).filter((l: any) => {
        const t = new Date(l.distributed_at).getTime(); return t >= start && t < end;
      }).length;
      const total = Math.round(Math.min(100, attCount * 20) * 0.4 + Math.min(100, growthVal / 10) * 0.4 + Math.min(100, actCount * 20) * 0.2);
      weeks.push({ label: new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" }), score: total });
    }
    return weeks;
  }, [profile, approvedUpdates]);

  // ── Daily Activity (filterable) ──
  const [activityDays, setActivityDays] = useState<number>(30);
  const activityRanges = [
    { days: 1, label: "1d" },
    { days: 7, label: "7d" },
    { days: 30, label: "30d" },
    { days: 60, label: "60d" },
    { days: 90, label: "90d" },
    { days: 0, label: "Max" },
  ];

  const dailyActivity = useMemo(() => {
    if (!profile) return [];
    const now = Date.now();
    const rangeDays = activityDays > 0 ? activityDays : 365; // "Max" = 365 days
    const bucketDays = rangeDays <= 7 ? 1 : rangeDays <= 30 ? 1 : rangeDays <= 60 ? 2 : 7;
    const buckets: { label: string; hunts: number; activities: number; loot: number }[] = [];

    for (let i = 0; i < rangeDays; i += bucketDays) {
      const start = now - (rangeDays - i) * 86400000;
      const end = Math.min(now, start + bucketDays * 86400000);
      buckets.push({
        label: bucketDays >= 7
          ? new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        hunts: (profile.attendance_history || []).filter((a: any) => { const t = new Date(a.created_at).getTime(); return t >= start && t < end; }).length,
        activities: (profile.activity_attendance || []).filter((a: any) => { const t = new Date(a.created_at).getTime(); return t >= start && t < end; }).length,
        loot: (profile.loot_history || []).filter((l: any) => { const t = new Date(l.distributed_at).getTime(); return t >= start && t < end; }).length,
      });
    }
    return buckets;
  }, [profile, activityDays]);

  const timeline = useMemo(() => {
    if (!profile) return [];
    const items: { type: "cp"|"attendance"|"loot"|"note"; date: string; data: any }[] = [];
    profile.cp_history.forEach((u: CpUpdate) => items.push({ type: "cp", date: u.submitted_at, data: u }));
    (profile.attendance_history || []).forEach((a: any) => items.push({ type: "attendance", date: a.created_at, data: a }));
    (profile.loot_history || []).forEach((l: any) => items.push({ type: "loot", date: l.distributed_at, data: l }));
    profile.notes.forEach((n: any) => items.push({ type: "note", date: n.created_at, data: n }));
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [profile]);

  // CP change per entry — computed chronologically (by date), not by entry order
  const cpChronoChange = useMemo(() => {
    const map = new Map<string, number | null>(); // cpUpdate.id → delta
    const approved = (profile?.cp_history || [])
      .filter(u => u.status === "approved")
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()); // oldest first
    for (let i = 0; i < approved.length; i++) {
      const prev = i > 0 ? approved[i - 1].new_cp : null;
      map.set(approved[i].id, prev != null ? approved[i].new_cp - prev : null);
    }
    return map;
  }, [profile]);

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[#71717a] animate-spin"/></div>;
  if (!profile) return <div className="text-center py-20"><p className="text-[#71717a]">Member not found.</p><button onClick={() => navigate(-1)} className="mt-4 text-[#a1a1aa] hover:text-[#fafafa] text-sm">← Go back</button></div>;

  const filteredTimeline = timelineFilter === "all" ? timeline : timeline.filter(e => e.type === timelineFilter);

  const typeConfig: Record<string, { icon: React.ReactNode; dot: string; label: string }> = {
    cp: { icon: <TrendingUp className="w-3.5 h-3.5"/>, dot: "bg-green-500", label: "CP Update" },
    attendance: { icon: <Skull className="w-3.5 h-3.5"/>, dot: "bg-blue-500", label: "Attendance" },
    loot: { icon: <Gift className="w-3.5 h-3.5"/>, dot: "bg-amber-500", label: "Loot" },
    note: { icon: <ScrollText className="w-3.5 h-3.5"/>, dot: "bg-purple-500", label: "Note" },
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
      {/* Back */}
      <button onClick={() => navigate(isViewer ? "/" : "/members")} className="flex items-center gap-1.5 text-[#a1a1aa] hover:text-[#fafafa] text-sm transition">
        <ArrowLeft className="w-4 h-4"/>{isViewer ? "Back to RaidScout" : "Back to Members"}
      </button>

      {/* ── Profile Header ── */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="w-14 h-14 rounded-full bg-[#27272a] flex items-center justify-center shrink-0 ring-2 ring-[#3f3f46]">
              {profile.class && classIcons[profile.class] ? (() => {
                const CIcon = getClassIcon(classIcons[profile.class]);
                const color = classColors[profile.class] || "#a1a1aa";
                return <CIcon className="w-7 h-7" style={{ color }} />;
              })() : (
                <User className="w-7 h-7 text-[#a1a1aa]" />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[#fafafa] truncate">{profile.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {memberGuild && gColor && <span className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${gColor.bg} ${gColor.text} ${gColor.border}`}><Shield className="w-2.5 h-2.5"/>{memberGuild.name}</span>}
                {profile.class && classIcons[profile.class] && (() => {
                  const CIcon = getClassIcon(classIcons[profile.class]);
                  const color = classColors[profile.class] || "#a1a1aa";
                  return (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1" style={{ color, borderColor: `${color}40`, backgroundColor: `${color}15` }}>
                      <CIcon className="w-2.5 h-2.5"/>{profile.class}
                    </span>
                  );
                })()}
                {profile.discord_user_id && <span className="text-[10px] text-[#52525b] flex items-center gap-1"><MessageSquare className="w-2.5 h-2.5"/>Discord linked</span>}
                <span className="text-[10px] text-[#52525b] flex items-center gap-1"><Calendar className="w-2.5 h-2.5"/>Joined {fmtDate(profile.created_at)}</span>
              </div>
            </div>
          </div>
          {/* Risk indicators */}
          {risks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 sm:self-center">
              {risks.map(r => (
                <span key={r} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-red-500/10 border border-red-500/20 text-red-400">
                  <AlertTriangle className="w-3 h-3"/>{r}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
          <div className="bg-[#09090b] rounded-lg p-3 flex items-center gap-3">
            <ScoreGauge score={score}/>
            <div><p className="text-[10px] text-[#71717a] uppercase tracking-wider">Score</p><p className="text-xs text-[#52525b]">/100</p></div>
          </div>
          <div className="bg-[#09090b] rounded-lg p-3">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Current CP</p>
            <p className="text-lg font-bold text-[#fafafa] mt-0.5">{fmtCp(profile.current_cp)}</p>
          </div>
          <div className="bg-[#09090b] rounded-lg p-3">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">30d Growth</p>
            <p className={`text-lg font-bold mt-0.5 ${(profile.cp_growth_30d ?? 0) > 0 ? "text-green-400" : (profile.cp_growth_30d ?? 0) < 0 ? "text-red-400" : "text-[#a1a1aa]"}`}>
              {profile.cp_growth_30d != null ? `${profile.cp_growth_30d > 0 ? "+" : ""}${profile.cp_growth_30d.toLocaleString()}` : "—"}
            </p>
          </div>
          <div className="bg-[#09090b] rounded-lg p-3">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Events Attended</p>
            <p className="text-lg font-bold text-[#fafafa] mt-0.5">{totalEvents}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-[#52525b]">7d: <span className="text-[#a1a1aa]">{events7d}</span></span>
              <span className="text-[10px] text-[#52525b]">30d: <span className="text-[#a1a1aa]">{events30d}</span></span>
            </div>
          </div>
          <div className="bg-[#09090b] rounded-lg p-3 col-span-2 sm:col-span-1">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Items Received</p>
            <p className="text-lg font-bold text-[#fafafa] mt-0.5">{profile.loot_count}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
              <span className="text-[10px] text-[#52525b]">14d: <span className="text-[#a1a1aa]">{loot14d}</span></span>
              <span className="text-[10px] text-[#52525b]">3mo: <span className="text-[#a1a1aa]">{loot3mo}</span></span>
              <span className="text-[10px] text-[#52525b]">6mo: <span className="text-[#a1a1aa]">{loot6mo}</span></span>
              <span className="text-[10px] text-[#52525b]">1yr: <span className="text-[#a1a1aa]">{loot1yr}</span></span>
              <span className="text-[10px] text-[#52525b]">2yr: <span className="text-[#a1a1aa]">{loot2yr}</span></span>
            </div>
          </div>
        </div>

        {/* Gear Equipment Row */}
        {gearSlotDefs.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[10px] text-[#71717a] uppercase tracking-wider">Equipment</span>
              <span className="text-[10px] text-[#52525b]">
                {gearSlotDefs.filter((s: any) => gearMap[s.name]?.catalog_item_id).length}/{gearSlotDefs.length} equipped
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
              {gearSlotDefs.map((slot: any) => {
                const gear = gearMap[slot.name];
                const item = gear?.catalog_item_id ? gearItemMap[gear.catalog_item_id] : null;
                const rarity = item?.rarity?.toLowerCase() || "";
                const rc: string = ({"legendary":"#f59e0b","epic":"#a855f7","rare":"#3b82f6","uncommon":"#22c55e","common":"#a1a1aa","mythic":"#ef4444"} as any)[rarity] || "#3f3f46";
                const enh = gear?.enhancement_level || 0;
                return (
                  <div
                    key={slot.name}
                    className="group relative"
                    title={item ? `${item.name}${enh > 0 ? ` +${enh}` : ""}` : `${slot.name} — Not Equipped`}
                  >
                    <div
                      className={`w-[96px] rounded-lg flex flex-col items-center justify-center py-2 px-1 transition-all duration-200 ${
                        item
                          ? "hover:scale-[1.03] cursor-default"
                          : "border border-dashed border-[#27272a]"
                      }`}
                      style={undefined}
                    >
                      <p className="text-[7px] text-[#52525b] uppercase tracking-wider mb-0.5">{slot.name}</p>
                      {item ? (
                        <>
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center relative" style={{ backgroundColor: `${rc}14` }}>
                            {item.image_url ? (
                              <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                            ) : (
                              <Star className="w-5 h-5" style={{ color: rc }} />
                            )}
                            {enh > 0 && (
                              <span className="absolute -right-1 -bottom-1 text-[6px] font-black text-white bg-black/60 rounded-full px-1 leading-none py-px">+{enh}</span>
                            )}
                          </div>
                          <p className="text-[7px] font-medium mt-0.5 text-center w-full leading-tight" style={{ color: rc }}>{item.name}</p>
                        </>
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-transparent">
                          <Shield className="w-5 h-5 text-[#27272a]" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CP Trend Sparkline */}
        {cpSparkData.length > 0 && (() => {
          const lastCp = cpSparkData[cpSparkData.length - 1].cp;
          return (
          <div className="mt-3 bg-[#09090b] rounded-lg p-2.5 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2 mb-1 flex-wrap">
              {cpTrend === "up" ? <TrendingUp className="w-3.5 h-3.5 text-green-400 shrink-0"/> : cpTrend === "down" ? <TrendingUp className="w-3.5 h-3.5 text-red-400 rotate-180 shrink-0"/> : <TrendingUp className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0"/>}
              <span className="text-[10px] text-[#71717a] uppercase tracking-wider">CP Trend</span>
              <span className="hidden sm:inline text-[10px] text-[#52525b]">(last {cpSparkData.length})</span>
              <span className="flex-1 hidden sm:block"/>
              <span className="text-xs sm:text-sm font-bold font-mono" style={{ color: cpTrendColor }}>{fmtCp(lastCp)}</span>
              {cpPctChange != null && (
                <span className={`text-xs sm:text-sm font-bold font-mono ${cpPctChange > 0 ? "text-green-400" : cpPctChange < 0 ? "text-red-400" : "text-[#a1a1aa]"}`}>
                  {cpPctChange > 0 ? "+" : ""}{cpPctChange.toFixed(1)}%
                </span>
              )}
            </div>
            <div style={{ height: isMobile ? 80 : 100, minHeight: 80, minWidth: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cpSparkData} margin={{ top: isMobile ? 6 : 28, right: isMobile ? 4 : 16, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: isMobile ? 7 : 8, fill: "#52525b" }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(cpSparkData.length / (isMobile ? 4 : 6)) - 1)} />
                  <YAxis domain={["dataMin - 1000", "dataMax + 1000"]} tick={{ fontSize: isMobile ? 7 : 8, fill: "#52525b" }} axisLine={false} tickLine={false} width={isMobile ? 48 : 60}
                    tickFormatter={(v: number) => isMobile && v >= 10000 ? `${Math.round(v / 1000)}k` : v.toLocaleString()} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 6, fontSize: 11, padding: "4px 8px" }}
                    labelStyle={{ color: "#52525b" }}
                    formatter={(v: any) => [Number(v).toLocaleString(), "CP"]}
                    labelFormatter={(label: any) => label ?? ""}
                  />
                  <Line type="monotone" dataKey="cp" stroke={cpTrendColor} strokeWidth={1.5} dot={{ r: isMobile ? 3 : 4, fill: "#18181b", stroke: cpTrendColor, strokeWidth: 2 }}
                    label={!isMobile ? ({ x, y, value, index }: any) => {
                      const entry = cpSparkData[index];
                      const pctColor = entry?.change?.startsWith("+") ? "#22c55e" : entry?.change?.startsWith("-") ? "#ef4444" : "#a1a1aa";
                      return (
                        <g>
                          <text x={x} y={y - 18} textAnchor="middle" fill={cpTrendColor} fontSize={10} fontWeight={700} fontFamily="monospace">
                            {Number(value).toLocaleString()}
                          </text>
                          {entry?.change && (
                            <text x={x} y={y - 7} textAnchor="middle" fill={pctColor} fontSize={9} fontWeight={600} fontFamily="monospace">
                              {entry.change}
                            </text>
                          )}
                        </g>
                      );
                    } : undefined}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          );
        })()}
      </div>

      {/* ── Daily Activity ── */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Activity className="w-4 h-4 text-blue-400"/>
          <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">Activity</h2>
          <div className="flex gap-0.5 ml-auto">
            {activityRanges.map(r => (
              <button
                key={r.days}
                onClick={() => setActivityDays(r.days)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${activityDays === r.days ? "bg-[#27272a] text-[#fafafa]" : "text-[#52525b] hover:text-[#a1a1aa]"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {dailyActivity.length > 0 ? (
          <div style={{ height: 200, minHeight: 200, minWidth: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyActivity} margin={{ top: 20, right: 40, left: 40, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#52525b" }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(dailyActivity.length / 8) - 1)}/>
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#a1a1aa" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, color: "#71717a" }}
                  iconType="line"
                  iconSize={10}
                  formatter={(v: string) => <span className="text-[#a1a1aa]">{v}</span>}
                />
                <Line type="monotone" dataKey="hunts" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#18181b", stroke: "#3b82f6", strokeWidth: 2 }} name="Hunts"
                  label={({ x, y, value }: any) => value > 0 ? <text x={x} y={y - 8} textAnchor="middle" fontSize={9} fill="#60a5fa">{value}</text> : null}
                />
                <Line type="monotone" dataKey="activities" stroke="#a855f7" strokeWidth={2} dot={{ r: 3, fill: "#18181b", stroke: "#a855f7", strokeWidth: 2 }} name="Acts"
                  label={({ x, y, value }: any) => value > 0 ? <text x={x} y={y - 8} textAnchor="middle" fontSize={9} fill="#c084fc">{value}</text> : null}
                />
                <Line type="monotone" dataKey="loot" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#18181b", stroke: "#f59e0b", strokeWidth: 2 }} name="Loot"
                  label={({ x, y, value }: any) => value > 0 ? <text x={x} y={y - 8} textAnchor="middle" fontSize={9} fill="#fbbf24">{value}</text> : null}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-[#52525b] py-4 text-center">No activity data yet</p>
        )}
      </div>

      {/* ── Timeline + Loot (side by side on large screens) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Timeline */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#27272a] flex items-center gap-2 flex-wrap">
            <Clock className="w-4 h-4 text-[#a1a1aa]"/>
            <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">Activity Timeline</h2>
            <div className="flex gap-1 ml-auto">
              {["all","cp","attendance","loot","note"].map(f => (
                <button key={f} onClick={() => setTimelineFilter(f)}
                  className={`px-2 py-1 rounded text-[10px] font-medium capitalize transition ${timelineFilter === f ? "bg-[#27272a] text-[#fafafa]" : "text-[#52525b] hover:text-[#a1a1aa]"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="p-3 sm:p-4 max-h-96 overflow-y-auto">
            {filteredTimeline.length === 0 ? (
              <p className="text-sm text-[#52525b] text-center py-8">No activity yet</p>
            ) : (
              <div className="space-y-1">
                {filteredTimeline.slice(0, timelineVisible).map((entry, i) => {
                  const cfg = typeConfig[entry.type];
                  return (
                    <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-[#09090b]/50 transition group">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dot}`}/>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-medium text-[#71717a] uppercase">{cfg.label}</span>
                          <span className="text-[10px] text-[#52525b]">{fmtDateTime(entry.date)}</span>
                        </div>
                        {entry.type === "cp" && (() => {
                          const change = cpChronoChange.get(entry.data.id) ?? null;
                          return (
                          <>
                            <p className="text-sm text-[#fafafa] mt-0.5">
                              CP: {fmtCp(entry.data.new_cp)}
                              {change != null && (
                                <span className={`ml-1.5 text-xs ${change > 0 ? "text-green-400" : change < 0 ? "text-red-400" : "text-[#a1a1aa]"}`}>
                                  {change > 0 ? "+" : ""}{change.toLocaleString()}
                                </span>
                              )}
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${entry.data.status === "approved" ? "bg-green-500/10 text-green-400" : entry.data.status === "rejected" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                                {entry.data.status}
                              </span>
                            </p>
                            {entry.data.screenshot_url && (
                              <img src={entry.data.screenshot_url} alt="Screenshot"
                                onClick={() => setFullScreenImage(entry.data.screenshot_url)}
                                className="mt-1.5 rounded-md max-h-24 object-contain bg-[#09090b] border border-[#27272a] cursor-pointer hover:border-[#52525b] transition"
                              />
                            )}
                          </>
                        );
                        })()}
                        {entry.type === "attendance" && (
                          <div className="flex items-center gap-2 mt-0.5">
                            {entry.data.death_records ? (
                              <BossImage bossName={entry.data.death_records.bosses?.name || "Boss"} imageUrl={entry.data.death_records.bosses?.image_url} size="sm" className="shrink-0"/>
                            ) : (
                              <img
                                src={entry.data.activity_instances?.activities?.image_url || "/activities/default.png"}
                                alt=""
                                className="w-8 h-8 rounded object-cover shrink-0 bg-[#09090b] border border-[#27272a]"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            )}
                            <p className="text-sm text-[#d4d4d8]">
                              {entry.data.death_records?.bosses?.name || entry.data.activity_instances?.activities?.name || "Event"}
                              {" — "}<span className="text-green-400">Attended ✓</span>
                            </p>
                          </div>
                        )}
                        {entry.type === "loot" && (
                          <p className="text-sm text-[#d4d4d8] mt-0.5">
                            {entry.data.items?.name || "Item"} ×{entry.data.quantity}
                            {entry.data.reason && <span className="text-[#52525b] ml-1">— {entry.data.reason}</span>}
                          </p>
                        )}
                        {entry.type === "note" && (
                          <p className="text-sm text-[#d4d4d8] mt-0.5">{entry.data.note}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredTimeline.length > timelineVisible && (
                  <button
                    onClick={() => setTimelineVisible(v => Math.min(v + 20, filteredTimeline.length))}
                    className="w-full py-2 mt-2 text-xs text-[#a1a1aa] hover:text-[#fafafa] bg-[#09090b] border border-[#27272a] rounded-lg hover:border-[#52525b] transition"
                  >
                    Load More ({timelineVisible}/{filteredTimeline.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Loot History (or Performance Score if empty) */}
        {(profile.loot_history || []).length === 0 ? (
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-purple-400"/>
              <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">Performance Score</h2>
              <span className="text-[10px] text-[#52525b] ml-auto">{weeklyPerf.length} weeks</span>
            </div>
            {weeklyPerf.length > 1 ? (
              <div style={{ height: 180, minHeight: 180, minWidth: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyPerf} margin={{ top: 24, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="perfGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3}/>
                        <stop offset="100%" stopColor="#a855f7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#52525b" }} axisLine={false} tickLine={false} interval={1}/>
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "#a1a1aa" }}
                      formatter={(v: any) => [`${v}/100`, "Score"]}
                    />
                    <Area type="monotone" dataKey="score" stroke="#a855f7" strokeWidth={2.5} fill="url(#perfGrad2)" dot={{ r: 5, fill: "#18181b", stroke: "#a855f7", strokeWidth: 2 }}
                      label={{ position: "top", fontSize: 10, fontWeight: "bold", fill: "#c084fc", formatter: (v: any) => v > 0 ? v : "" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-[#52525b] py-4 text-center">Collecting data for performance tracking</p>
            )}
            <p className="text-[10px] text-[#52525b] mt-2 leading-relaxed border-t border-[#27272a] pt-2">
              <span className="text-[#a1a1aa] font-medium">How it works:</span> Your score is based on <span className="text-blue-400">attendance (40%)</span>, <span className="text-purple-400">CP growth (40%)</span>, and <span className="text-amber-400">activity (20%)</span> each week. Score increases as you attend more events, grow your combat power, and stay active.
            </p>
            {accountSummary && accountSummary.length > 0 && (
              <div className="border-t border-[#27272a] pt-2 mt-2 space-y-1">
                {accountSummary.map((line, i) => (
                  <p key={i} className={`text-xs flex items-start gap-1.5 ${line.colorClass}`}>
                    <span className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "currentColor" }} />
                    {line.text}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-amber-400"/>
              <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">Loot History</h2>
              <span className="text-[10px] text-[#52525b] ml-auto">{profile.loot_count} items</span>
            </div>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {(profile.loot_history || []).map((loot: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-[#09090b]/50 transition">
                  <Gift className="w-3.5 h-3.5 text-amber-400 shrink-0"/>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#fafafa] truncate">{loot.items?.name || "Unknown Item"}</p>
                    <p className="text-[10px] text-[#52525b]">{timeAgo(loot.distributed_at)}{loot.reason ? ` · ${loot.reason}` : ""}</p>
                  </div>
                  <span className="text-[10px] font-mono text-[#a1a1aa]">×{loot.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Performance Score (only when Loot History has items) ── */}
      {(profile.loot_history || []).length > 0 && (
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-purple-400"/>
          <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">Performance Score</h2>
          <span className="text-[10px] text-[#52525b] ml-auto">{weeklyPerf.length} weeks</span>
        </div>
        {weeklyPerf.length > 1 ? (
          <div style={{ height: 180, minHeight: 180, minWidth: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyPerf} margin={{ top: 24, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3}/>
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#52525b" }} axisLine={false} tickLine={false} interval={1}/>
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#a1a1aa" }}
                  formatter={(v: any) => [`${v}/100`, "Score"]}
                />
                <Area type="monotone" dataKey="score" stroke="#a855f7" strokeWidth={2.5} fill="url(#perfGrad)" dot={{ r: 5, fill: "#18181b", stroke: "#a855f7", strokeWidth: 2 }}
                  label={{ position: "top", fontSize: 10, fontWeight: "bold", fill: "#c084fc", formatter: (v: any) => v > 0 ? v : "" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-[#52525b] py-4 text-center">Collecting data for performance tracking</p>
        )}
        <p className="text-[10px] text-[#52525b] mt-2 leading-relaxed border-t border-[#27272a] pt-2">
          <span className="text-[#a1a1aa] font-medium">How it works:</span> Your score is based on <span className="text-blue-400">attendance (40%)</span>, <span className="text-purple-400">CP growth (40%)</span>, and <span className="text-amber-400">activity (20%)</span> each week. Score increases as you attend more events, grow your combat power, and stay active.
        </p>
        {accountSummary && accountSummary.length > 0 && (
          <div className="border-t border-[#27272a] pt-2 mt-2 space-y-1">
            {accountSummary.map((line, i) => (
              <p key={i} className={`text-xs flex items-start gap-1.5 ${line.colorClass}`}>
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "currentColor" }} />
                {line.text}
              </p>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ── Notes ── */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <ScrollText className="w-4 h-4 text-purple-400"/>
            <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">Notes</h2>
          </div>
          {!isViewer && (
          <div className="flex gap-2 mb-3">
            <input value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
              placeholder="Add a note..." className="flex-1 px-3 py-1.5 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"/>
            <button onClick={handleAddNote} disabled={!newNote.trim() || addingNote}
              className="px-3 py-1.5 bg-[#27272a] text-[#fafafa] rounded-lg text-sm hover:bg-[#3f3f46] transition disabled:opacity-50"><Plus className="w-4 h-4"/></button>
          </div>
          )}
          {profile.notes.length === 0 ? (
            <p className="text-sm text-[#52525b] py-4 text-center">No notes yet</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {profile.notes.map((note: any) => (
                <div key={note.id} className="bg-[#09090b] rounded-lg p-3 group">
                  <p className="text-sm text-[#d4d4d8]">{note.note}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-[#52525b]">{timeAgo(note.created_at)}</span>
                    {!isViewer && (
                    <button onClick={() => deleteNoteMutation.mutate(note.id)}
                      className="opacity-0 group-hover:opacity-100 text-[#52525b] hover:text-red-400 transition"><Trash2 className="w-3 h-3"/></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      {/* CP Update Detail Modal */}
      {selectedUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedUpdate(null)}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-3 h-3 rounded-full ${selectedUpdate.status === "approved" ? "bg-green-500" : selectedUpdate.status === "rejected" ? "bg-red-500" : "bg-yellow-500"}`}/>
              <span className="text-sm font-semibold capitalize text-[#fafafa]">{selectedUpdate.status}</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[#71717a]">CP</span><span className="text-[#fafafa] font-mono">{fmtCp(selectedUpdate.new_cp)}</span></div>
              {selectedUpdate.old_cp != null && (
                <div className="flex justify-between"><span className="text-[#71717a]">Previous</span><span className="text-[#fafafa] font-mono">{fmtCp(selectedUpdate.old_cp)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-[#71717a]">Submitted</span><span className="text-[#fafafa]">{fmtDate(selectedUpdate.submitted_at)}</span></div>
              {selectedUpdate.discord_username && (
                <div className="flex justify-between"><span className="text-[#71717a]">By</span><span className="text-[#fafafa]">{selectedUpdate.discord_username}</span></div>
              )}
            </div>
            {selectedUpdate.screenshot_url && (
              <img src={selectedUpdate.screenshot_url} alt="Screenshot proof"
                onClick={() => setFullScreenImage(selectedUpdate.screenshot_url!)}
                className="mt-3 rounded-lg w-full max-h-48 object-contain bg-[#09090b] cursor-pointer hover:opacity-90 transition"
              />
            )}
            <button onClick={() => setSelectedUpdate(null)} className="w-full mt-4 py-2 bg-[#27272a] text-[#fafafa] rounded-lg text-sm hover:bg-[#3f3f46] transition">Close</button>
          </div>
        </div>
      )}

      {/* Full-Screen Image Lightbox */}
      {fullScreenImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-pointer"
          onClick={() => setFullScreenImage(null)}>
          <button
            onClick={() => setFullScreenImage(null)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-[#18181b]/80 text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] transition z-10"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={fullScreenImage}
            alt="Screenshot full view"
            className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#27272a] bg-[#09090b] py-5 mt-8" style={{ marginLeft: "calc(-1 * (100vw - 100%) / 2)", marginRight: "calc(-1 * (100vw - 100%) / 2)", marginBottom: "-24px", paddingLeft: "calc((100vw - 100%) / 2)", paddingRight: "calc((100vw - 100%) / 2)" }}>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-[#71717a]">
            <img src="/logo.png" alt="" className="w-4 h-4 rounded opacity-40" />
            <span>RaidScout — Track boss respawn timers across any game, schedule hunts, and monitor member performance across your guild.</span>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-[#52525b] uppercase tracking-wider">Resources</span>
            <div className="flex items-center gap-3 text-xs text-[#a1a1aa] flex-wrap mt-1">
              <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#5865f2] transition">
                <ExternalLink className="w-3 h-3" />Discord
              </a>
              <a href="https://www.facebook.com/profile.php?id=61590144185090" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#1877f2] transition">
                <ExternalLink className="w-3 h-3" />Facebook
              </a>
              <Link to="/terms" className="hover:text-[#d4d4d8] transition">Terms</Link>
              <Link to="/privacy" className="hover:text-[#d4d4d8] transition">Privacy</Link>
              <Link to="/changelog" className="hover:text-[#d4d4d8] transition">Changelog</Link>
            </div>
          </div>
          <p className="text-xs text-[#fafafa]/20">© 2026 RaidScout. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
