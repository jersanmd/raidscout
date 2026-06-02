import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { SEOHead } from "@/components/SEOHead";
import { version } from "../../package.json";
import {
  Timer, Shield, BarChart3, Sparkles, MessageSquare, Calendar, Skull, Eye, Trophy, Server, Clock, Lock,
  LogIn, UserPlus, Mail, CheckCircle, AlertTriangle, Key, ChevronDown, Bot,
  Crosshair, Radio, Activity, Wifi
} from "lucide-react";

const features = [
  { icon: <Timer className="w-6 h-6" />, color: "border-sky-500/30 bg-sky-500/5", title: "Live Countdown Timers", desc: "39+ bosses with real-time countdowns. Know exactly when each spawns, no guessing." },
  { icon: <Shield className="w-6 h-6" />, color: "border-blue-500/30 bg-blue-500/5", title: "Multi-Guild Rotation", desc: "Assign bosses to guilds. Per-kill or daily rotation. Weighted turns, Guild A gets 2, Guild B gets 1." },
  { icon: <BarChart3 className="w-6 h-6" />, color: "border-purple-500/30 bg-purple-500/5", title: "Leaderboard & Points", desc: "Configurable points per boss. Weekly, monthly, and all-time rankings. Finalize and snapshot results." },
  { icon: <Sparkles className="w-6 h-6" />, color: "border-violet-500/30 bg-violet-500/5", title: "AI Rally Scanning", desc: "Upload a rally screenshot and AI auto-detects player names. No manual typing." },
  { icon: <MessageSquare className="w-6 h-6" />, color: "border-emerald-500/30 bg-emerald-500/5", title: "Discord Alerts", desc: "Auto-post boss kills, 5-min spawn warnings, and spawn confirmations to your Discord server. Any member can set up with one command." },
  { icon: <Calendar className="w-6 h-6" />, color: "border-sky-500/30 bg-sky-500/5", title: "Weekly Schedule", desc: "Full week grid. See which guild owns which boss on every day. Click to manage." },
  { icon: <Skull className="w-6 h-6" />, color: "border-red-500/30 bg-red-500/5", title: "Death History", desc: "Complete kill log with guild badges. Attendance tracking per kill. Edit or delete entries." },
  { icon: <Bot className="w-6 h-6" />, color: "border-indigo-500/30 bg-indigo-500/5", title: "Discord Bot Commands", desc: "Track multiple servers from one Discord. Each gets its own prefix (!, ;, $, etc). Export attendance and analytics to Excel." },
  { icon: <Eye className="w-6 h-6" />, color: "border-orange-500/30 bg-orange-500/5", glow: "hover:shadow-[0_0_30px_rgba(249,115,22,0.15)]", title: "Viewer Mode", desc: "Share a link so your members can watch timers, no account or login required." },
];

// ── Animated Counter ────────────────────────────────────────
function AnimatedCounter({ value, suffix = "+" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0) return;
    // Reset when value changes so we re-animate
    started.current = false;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const duration = 1200;
        const start = performance.now();
        const animate = (now: number) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(eased * value));
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);

  return <span ref={ref}>{display}{suffix}</span>;
}

// ── Live Timer for Hero ──────────────────────────────────────
const HERO_BOSSES = ["Venatus", "Viorent", "Ego", "Lady Dalia", "Livera"];
const YVONNE6_ID = "b0379776-df4b-4b47-9cc3-52cbb7142948";

function LiveBossTimer() {
  const [timeStr, setTimeStr] = useState("--:--:--");
  const [bossName, setBossName] = useState("Venatus");
  const [nextSpawn, setNextSpawn] = useState<Date | null>(null);
  const [bossIndex, setBossIndex] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const cycleRef = useRef<number | null>(null);

  // Fetch timer for current boss
  const fetchBoss = useCallback(async (name: string) => {
    try {
      const { data: bosses } = await supabase
        .from("bosses")
        .select("id,name,respawn_hours")
        .eq("name", name)
        .eq("server_id", YVONNE6_ID)
        .limit(1);
      if (!bosses?.length) return;
      const boss = bosses[0];
      setBossName(boss.name);

      const { data: deaths } = await supabase
        .from("death_records")
        .select("death_time")
        .eq("boss_id", boss.id)
        .eq("server_id", YVONNE6_ID)
        .order("death_time", { ascending: false })
        .limit(1);
      if (deaths?.length) {
        const deathTime = new Date(deaths[0].death_time);
        setNextSpawn(new Date(deathTime.getTime() + (boss.respawn_hours ?? 10) * 3600_000));
      }
    } catch { /* keep fallback */ }
  }, []);

  // Initial fetch + cycle through bosses
  useEffect(() => {
    fetchBoss(HERO_BOSSES[0]);
    cycleRef.current = window.setInterval(() => {
      setBossIndex(prev => {
        const next = (prev + 1) % HERO_BOSSES.length;
        fetchBoss(HERO_BOSSES[next]);
        return next;
      });
    }, 8000);
    return () => { if (cycleRef.current) clearInterval(cycleRef.current); };
  }, [fetchBoss]);

  // Countdown tick
  useEffect(() => {
    if (!nextSpawn) return;
    const tick = () => {
      const diff = nextSpawn.getTime() - Date.now();
      if (diff <= 0) { setTimeStr("ALIVE"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeStr(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    intervalRef.current = window.setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [nextSpawn]);

  const status = timeStr === "ALIVE";

  return (
    <div className="flex items-center gap-6">
      {/* Boss name + status indicator */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-2.5 w-2.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status ? 'bg-sky-400' : 'bg-red-400'}`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${status ? 'bg-sky-400' : 'bg-red-400'}`} />
        </div>
        <div className="text-left">
          <span className="text-xs text-slate-400 font-medium">{bossName}</span>
          <span className={`ml-2 text-[10px] font-semibold uppercase tracking-wider ${status ? 'text-sky-400' : 'text-red-400'}`}>
            {status ? 'Alive' : 'Tracking'}
          </span>
        </div>
      </div>
      {/* Divider */}
      <div className="w-px h-8 bg-slate-700/50" />
      {/* Countdown */}
      <div className="text-left">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 block mb-0.5">{status ? 'Since' : 'Respawns in'}</span>
        <span className={`font-mono text-2xl font-bold tabular-nums tracking-tight ${status ? 'text-sky-300' : 'text-red-300'}`}>
          {timeStr}
        </span>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { signIn, signUp, viewerSignIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [viewerMode, setViewerMode] = useState(false);
  const [viewerKey, setViewerKey] = useState("");

  // Live stats from Supabase
  const [liveStats, setLiveStats] = useState({
    guilds: 0, kills: 0, players: 0, servers: 0,
  });
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/get_public_stats`,
          {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          }
        );
        const data = await res.json();
        if (data) {
          setLiveStats({
            guilds: data.guilds ?? 0,
            kills: data.kills ?? 0,
            players: data.players ?? 0,
            servers: data.servers ?? 0,
          });
        }
      } catch { /* keep fallback */ }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    const { error: err } = isSignUp ? await signUp(email, password) : await signIn(email, password);
    if (err) setError(err);
    else if (isSignUp) setSuccess("Account created! Check your email for a verification link, then sign in.");
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) { setError("Enter your email first."); return; }
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + "/" });
    if (err) setError(err.message);
    else setResetSent(true);
    setLoading(false);
  };

  const handleViewerSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewerKey.trim()) return;
    setError(null);
    setLoading(true);
    const { error: err } = await viewerSignIn(viewerKey.trim());
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden scroll-smooth">
      <SEOHead
        title="RaidScout"
        description="Track bosses & activities across any game. Manage guild rotations, monitor attendance, coordinate parties, and stay on top of every spawn. Forever free."
        canonicalUrl="/"
      />

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "RaidScout",
          description: "Track 39+ boss spawns, rotate multi-guild kills, scan rallies with AI, and compete on leaderboards.",
          url: "https://www.raidscout.com",
          applicationCategory: "GameApplication",
          operatingSystem: "Web",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
        })}
      </script>

      {/* ── Hero ── */}
      <section className="relative px-6 pt-32 pb-24 text-center overflow-hidden">
        {/* ── Background Layers ── */}
        <div className="absolute inset-0 bg-[#040816]" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-950/30 via-transparent to-[#040816]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(56,189,248,0.06),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_80%_100%,rgba(139,92,246,0.04),transparent_60%)]" />

        {/* Tactical grid */}
        <div className="absolute inset-0 opacity-[0.018]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(56,189,248,0.4) 1px, transparent 1px),
              linear-gradient(90deg, rgba(56,189,248,0.4) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px',
            backgroundPosition: 'center center',
          }}
        />

        {/* Radar texture */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgb(148 163 184) 0.5px, transparent 0.5px)',
            backgroundSize: '20px 20px',
          }}
        />

        {/* Scanning line */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/25 to-transparent animate-scan-line" />
        </div>

        {/* Ambient glow orbs */}
        <div className="absolute top-0 right-[10%] w-[600px] h-[600px] rounded-full bg-sky-500/[0.025] blur-[140px]" />
        <div className="absolute bottom-0 left-[5%] w-[500px] h-[500px] rounded-full bg-violet-500/[0.02] blur-[120px]" />

        {/* ── Content ── */}
        <div className="relative z-10 max-w-4xl mx-auto space-y-12">
          {/* Badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-sky-300/80 text-[11px] font-semibold tracking-[0.15em] uppercase animate-[fadeInUp_0.6s_ease-out] backdrop-blur-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400" />
            </span>
            Guild Operations Platform
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.92] animate-[fadeInUp_0.6s_ease-out] max-w-3xl mx-auto">
            <span className="text-[#F1F5F9]">Command Your</span>
            <br />
            <span className="bg-gradient-to-r from-sky-300 via-sky-400 to-violet-400 bg-[length:200%_auto] animate-gradient bg-clip-text text-transparent">
              Guild Operations
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-base md:text-lg text-slate-400/80 max-w-xl mx-auto leading-relaxed animate-[fadeInUp_0.6s_ease-out_0.1s_both]">
            Real-time boss tracking, multi-guild rotations, attendance monitoring, and Discord coordination — the command center competitive guilds trust.
          </p>

          {/* CTA */}
          <div className="flex items-center justify-center gap-4 pt-2 animate-[fadeInUp_0.6s_ease-out_0.2s_both]">
            <button
              onClick={() => document.getElementById("get-started")?.scrollIntoView({ behavior: "smooth" })}
              className="group relative px-8 py-4 rounded-xl font-semibold bg-white text-[#040816] hover:bg-sky-50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-[0_0_40px_rgba(56,189,248,0.12)] hover:shadow-[0_0_60px_rgba(56,189,248,0.2)] text-base"
            >
              <span className="relative z-10 flex items-center gap-2">
                Deploy Dashboard
                <span className="inline-block group-hover:translate-x-0.5 transition-transform">→</span>
              </span>
            </button>
            <button
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="px-8 py-4 rounded-xl font-semibold border border-white/[0.08] text-slate-400 hover:text-white hover:border-white/[0.15] hover:bg-white/[0.03] transition-all duration-200 text-base backdrop-blur-sm"
            >
              View Capabilities
            </button>
          </div>

          {/* Live Tracker — glassmorphism command card */}
          <div className="animate-[fadeInUp_0.6s_ease-out_0.35s_both] pt-2">
            <div className="relative inline-flex flex-col gap-4 px-8 py-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-xl overflow-hidden">
              {/* Card scanning line */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
                <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/15 to-transparent animate-scan-line" style={{ animationDuration: '6s' }} />
              </div>
              {/* Card header */}
              <div className="flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-slate-500">Live Operations — Yvonne 6</span>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] text-sky-400/70">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-400" />
                  </span>
                  RECEIVING
                </span>
              </div>
              <LiveBossTimer />
            </div>
          </div>

          {/* Stats + Trust */}
          <div className="animate-[fadeInUp_0.6s_ease-out_0.5s_both] space-y-6 pt-2">
            {/* Stats cards — glassmorphism */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto">
              {[
                { value: <AnimatedCounter value={liveStats.guilds} />, label: "Active Guilds", icon: Crosshair, color: "text-sky-400" },
                { value: <AnimatedCounter value={liveStats.kills} />, label: "Kills Recorded", icon: Activity, color: "text-violet-400" },
                { value: <AnimatedCounter value={liveStats.players} />, label: "Players Tracked", icon: Radio, color: "text-blue-400" },
                { value: <AnimatedCounter value={liveStats.servers} />, label: "Servers Online", icon: Wifi, color: "text-sky-400" },
              ].map((s) => (
                <div key={s.label} className="group relative flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-sm hover:bg-white/[0.04] hover:border-white/[0.1] hover:-translate-y-0.5 transition-all duration-300">
                  <div className={`p-1.5 rounded-lg bg-white/[0.03] ${s.color}`}>
                    <s.icon className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-lg font-bold text-white tracking-tight tabular-nums">{s.value}</div>
                    <div className="text-[10px] text-slate-500 font-medium">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
            {/* Trust bar — minimal */}
            <div className="flex items-center justify-center gap-6 text-[10px] text-slate-600">
              <span className="flex items-center gap-1.5"><Shield className="w-3 h-3 opacity-40" />SOC 2 Compliant</span>
              <span className="w-px h-3 bg-white/[0.06]" />
              <span className="flex items-center gap-1.5"><Activity className="w-3 h-3 opacity-40" />99.9% Uptime</span>
              <span className="w-px h-3 bg-white/[0.06]" />
              <span className="flex items-center gap-1.5"><Lock className="w-3 h-3 opacity-40 hidden sm:block" />End-to-end Encrypted</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="features" className="max-w-5xl mx-auto px-6 pb-28">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold">Everything Your Guild Needs</h2>
          <p className="text-slate-400 mt-3 text-lg">One platform to track, rotate, scan, and dominate.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <div key={f.title} className={`p-5 rounded-xl border ${f.color} ${(f as any).glow || ''} hover:border-slate-500 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 group`} style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="text-slate-400 group-hover:text-white group-hover:scale-110 transition-all duration-300 mb-3">{f.icon}</div>
              <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Discord Bot Commands ── */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-900/30 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-4">
            <Bot className="w-3.5 h-3.5" /> DISCORD BOT
          </div>
          <h2 className="text-3xl font-bold">Control RaidScout from Discord</h2>
          <p className="text-slate-400 mt-2 text-sm">Invite the bot, set alerts with <code className="bg-slate-800 px-1 rounded text-sky-400">!notifhere</code>, and restrict commands to one channel with <code className="bg-slate-800 px-1 rounded text-sky-400">!cmdhere</code>. Multiple RaidScout servers in one Discord? Give each its own prefix.</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="divide-y divide-slate-800">
            {[
              { cmd: "!nextspawn", desc: "List all boss spawns in the next 24 hours", detail: "Shows spawn time, live countdown, and which guild owns each boss" },
              { cmd: "!nextspawn Venatus", desc: "Check spawn for a specific boss", detail: "Filter by boss name to see just that boss's timer" },
              { cmd: "!killed Venatus", desc: "Record a boss kill right now", detail: "Same as Mark Died on the website — advances rotation" },
              { cmd: "!killed Venatus 14:30", desc: "Record a kill at a custom time", detail: "If 14:30 already passed today → records today. If it hasn't happened yet → records yesterday (auto)." },
              { cmd: "... 14:30 today", desc: "Force today's date", detail: "Add `today` to always record on today's date, even if the time hasn't happened yet" },
              { cmd: "... 14:30 yesterday", desc: "Force yesterday's date", detail: "Add `yesterday` to always record on yesterday's date" },
              { cmd: "!list", desc: "See all boss names", detail: "Numbered list with respawn hours and spawn type" },
              { cmd: "!commands", desc: "Show all available commands", detail: "Quick reference for your members" },
              { cmd: "!notifhere", desc: "Set notification channel", detail: "Run in your announcements channel to receive boss kill and spawn alerts" },
              { cmd: "!cmdhere", desc: "Restrict commands to one channel", detail: "Keeps your general chat clean, bot only responds in the channel you choose" },
            ].map((c, i) => (
              <div key={c.cmd} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-800/30 transition">
                <code className="shrink-0 mt-0.5 px-2.5 py-1 rounded-md bg-indigo-900/40 border border-indigo-500/20 text-indigo-300 font-mono text-sm">{c.cmd}</code>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium">{c.desc}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-600 text-center mt-4">💡 Also on the web: export attendance and analytics to Excel with styled tables and rankings.</p>
      </section>

      {/* ── Screenshot Showcase ── */}
      <ScreenshotShowcase />

      {/* ── Auth Section ── */}
      <section id="get-started" className="max-w-md mx-auto px-6 pb-24">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold">Ready to start?</h2>
          <p className="text-slate-400 text-sm mt-1">Create an account or view as guest.</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl hover:shadow-sky-900/5 transition-shadow duration-500">
          {/* Tabs */}
          <div className="flex bg-slate-800 rounded-lg p-0.5 mb-6">
            {[{ mode: false, label: "Account" }, { mode: true, label: "View as Guest", icon: <Eye className="w-3 h-3 inline mr-1" /> }].map(t => (
              <button
                key={t.label}
                type="button"
                onClick={() => { setViewerMode(t.mode); setError(null); }}
                className={`flex-1 py-2 rounded-md text-xs font-medium transition ${viewerMode === t.mode ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {viewerMode ? (
            <form onSubmit={handleViewerSignIn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Viewer Key</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="text" value={viewerKey} onChange={e => setViewerKey(e.target.value)} required placeholder="Paste your viewer key..." className="w-full pl-10 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition font-mono text-sm" />
                </div>
              </div>
              <p className="text-xs text-slate-500">Get this from your server owner. No account needed.</p>
              {error && <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>}
              <button type="submit" disabled={loading || !viewerKey.trim()} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium bg-gradient-to-r from-sky-500 to-violet-500 text-white hover:from-sky-400 hover:to-violet-400 disabled:opacity-50 transition">
                {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Eye className="w-4 h-4" />} View Server
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex bg-slate-800 rounded-lg p-0.5 mb-2">
                <button type="button" onClick={() => { setIsSignUp(false); setError(null); setSuccess(null); setResetSent(false); setAcceptedTerms(false); }} className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${!isSignUp ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}>Sign In</button>
                <button type="button" onClick={() => { setIsSignUp(true); setError(null); setSuccess(null); setResetSent(false); setAcceptedTerms(false); }} className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${isSignUp ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}>Sign Up</button>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" className="w-full pl-10 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition" />
              </div>
              {!isSignUp && (
                <div className="flex justify-end">
                  <button type="button" onClick={handleForgotPassword} disabled={loading} className="text-xs text-slate-500 hover:text-sky-400 transition">Forgot password?</button>
                </div>
              )}
              {isSignUp && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={e => setAcceptedTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500 focus:ring-offset-0"
                  />
                  <span className="text-xs text-slate-400 leading-relaxed">
                    I agree to the{" "}
                    <Link to="/terms" className="text-sky-400 hover:text-sky-300 underline" target="_blank">Terms of Service</Link>
                    {" "}and{" "}
                    <Link to="/privacy" className="text-sky-400 hover:text-sky-300 underline" target="_blank">Privacy Policy</Link>
                  </span>
                </label>
              )}
              {resetSent && !isSignUp && <div className="flex items-start gap-2 text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2"><CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>Reset link sent! Check your email.</span></div>}
              {success && <div className="flex items-start gap-2 text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2"><CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{success}</span></div>}
              {error && !resetSent && !success && <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>}
              <button type="submit" disabled={loading || (isSignUp && !acceptedTerms)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium bg-gradient-to-r from-sky-500 to-violet-500 text-white hover:from-sky-400 hover:to-violet-400 disabled:opacity-50 transition shadow-lg shadow-sky-900/20">
                {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                {isSignUp ? "Create Account" : "Sign In"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold">Frequently Asked Questions</h2>
          <p className="text-slate-400 text-sm mt-1">Everything you need to know.</p>
        </div>
        <FAQ />
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 bg-slate-900/20 py-16 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div><h4 className="text-sm font-semibold text-white mb-4">Product</h4><div className="space-y-2.5 text-sm text-slate-400"><a href="#" className="block hover:text-white transition">Boss Timer</a><a href="#" className="block hover:text-white transition">Weekly Schedule</a><a href="#" className="block hover:text-white transition">Leaderboard</a><a href="#" className="block hover:text-white transition">Viewer Mode</a></div></div>
          <div><h4 className="text-sm font-semibold text-white mb-4">Resources</h4><div className="space-y-2.5 text-sm text-slate-400"><a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="block hover:text-white transition">Discord Bot Setup</a><a href="#" className="block hover:text-white transition">Documentation</a><a href="#" className="block hover:text-white transition">API</a></div></div>
          <div><h4 className="text-sm font-semibold text-white mb-4">Company</h4><div className="space-y-2.5 text-sm text-slate-400"><Link to="/terms" className="block hover:text-white transition">Terms of Service</Link><Link to="/privacy" className="block hover:text-white transition">Privacy Policy</Link></div></div>
          <div><h4 className="text-sm font-semibold text-white mb-4">Community</h4><div className="space-y-2.5 text-sm text-slate-400"><a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-indigo-400 transition"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>Discord</a><a href="https://www.facebook.com/profile.php?id=61590144185090" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-blue-400 transition"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>Facebook</a></div></div>
        </div>
        <div className="max-w-6xl mx-auto pt-8 border-t border-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-slate-500"><img src="/logo.png" alt="" className="w-5 h-5 rounded opacity-50" /><span className="text-sm">&copy; {new Date().getFullYear()} RaidScout. All rights reserved.</span></div>
          <span className="text-xs text-slate-600">v{version}</span>
        </div>
      </footer>
    </div>
  );
}

// ── Screenshot Carousel ──────────────────────────────────────

const phoneSlides = [
  { src: "/screenshots/2.png", label: "Leaderboard Rankings" },
  { src: "/screenshots/3.png", label: "Guild Rotation" },
  { src: "/screenshots/4.png", label: "Death History" },
  { src: "/screenshots/5.png", label: "Weekly Schedule" },
  { src: "/screenshots/discord-notify.png", label: "Discord Alerts" },
];

function ScreenshotShowcase() {
  const [active, setActive] = useState(0);
  const dragStartX = useRef(0);
  const dragCurrentX = useRef(0);
  const isDragging = useRef(false);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pauseUntil = useRef(0);

  const goNext = useCallback(() => setActive(prev => (prev + 1) % phoneSlides.length), []);
  const goPrev = useCallback(() => setActive(prev => (prev - 1 + phoneSlides.length) % phoneSlides.length), []);

  const pauseAuto = useCallback(() => { pauseUntil.current = Date.now() + 15_000; }, []);

  // Auto-advance (pauses 15s after user interaction)
  useEffect(() => {
    autoTimer.current = setInterval(() => {
      if (Date.now() < pauseUntil.current) return;
      goNext();
    }, 4000);
    return () => { if (autoTimer.current) clearInterval(autoTimer.current); };
  }, [goNext]);

  // Mouse drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      dragCurrentX.current = e.clientX;
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      pauseAuto();
      const diff = dragStartX.current - dragCurrentX.current;
      if (Math.abs(diff) > 40) {
        if (diff > 0) goNext(); else goPrev();
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [goNext, goPrev, pauseAuto]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragCurrentX.current = e.clientX;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartX.current = e.touches[0].clientX;
    dragCurrentX.current = e.touches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => { dragCurrentX.current = e.touches[0].clientX; };
  const handleTouchEnd = () => {
    pauseAuto();
    const diff = dragStartX.current - dragCurrentX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) goNext(); else goPrev();
    }
  };

  return (
    <section className="max-w-6xl mx-auto px-6 pb-24 overflow-hidden">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold">See It in Action</h2>
        <p className="text-slate-400 mt-2">Everything you need to dominate boss rotations.</p>
      </div>

      {/* Laptop mockup */}
      <div className="flex justify-center mb-12">
        <div className="relative w-full max-w-[650px]">
          <div className="relative mx-auto border-[6px] border-slate-600 rounded-t-xl bg-slate-900 shadow-xl shadow-black/30">
            <div className="rounded-t-lg overflow-hidden bg-slate-950">
              <img src="/screenshots/1.png" alt="Live Countdown Timers" className="w-full" />
            </div>
          </div>
          <div className="relative mx-auto bg-slate-700 rounded-b-lg rounded-t-sm w-[105%] -mt-[2px] h-4">
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-slate-600 rounded-b-sm" />
          </div>
          <p className="text-center mt-3 text-sm text-slate-400">Live Countdown Timers</p>
        </div>
      </div>

      {/* Phone carousel */}
      <div
        className="relative flex items-center justify-center h-[540px] select-none cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {phoneSlides.map((slide, i) => {
          const half = Math.floor(phoneSlides.length / 2);
          let rawOffset = i - active;
          if (rawOffset < -half) rawOffset += phoneSlides.length;
          if (rawOffset > half) rawOffset -= phoneSlides.length;
          const isActive = rawOffset === 0;
          return (
            <div
              key={i}
              className="absolute transition-all duration-700 ease-in-out pointer-events-none"
              style={{
                transform: `translateX(${rawOffset * 280}px) scale(${isActive ? 1 : 0.85})`,
                opacity: Math.abs(rawOffset) > 1 ? 0 : isActive ? 1 : 0.4,
                zIndex: isActive ? 10 : 5 - Math.abs(rawOffset),
                filter: isActive ? "blur(0)" : "blur(1px)",
              }}
            >
              {/* iPhone frame */}
              <div className="relative w-[240px] h-[500px] rounded-xl border-[3px] border-slate-600 bg-slate-900 p-2 shadow-xl shadow-black/30">
                <div className="w-full h-full rounded-lg overflow-hidden bg-slate-950">
                  <img src={slide.src} alt={slide.label} className="w-full h-full object-cover object-top" />
                </div>
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-24 h-1 bg-slate-700 rounded-full" />
              </div>
              <p className="text-center mt-3 text-sm font-medium transition-colors duration-500" style={{ color: isActive ? "#fff" : "#64748b" }}>{slide.label}</p>
            </div>
          );
        })}
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 mt-4">
        {phoneSlides.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${i === active ? "bg-sky-400 w-6" : "bg-slate-700 hover:bg-slate-500"}`}
          />
        ))}
      </div>
    </section>
  );
}

// ── FAQ Component ────────────────────────────────────────────

const faqs = [
  { q: "How does guild rotation work?", a: "Assign multiple guilds to a boss and it rotates on each kill (or daily). You can customize the order and even give guilds weighted turns." },
  { q: "What's Viewer Mode?", a: "Generate a shareable link that lets your members watch timers in real-time — no account or login required." },
  { q: "How do I set up the Discord bot?", a: "Invite the bot, type ;link in your channel, copy the Server ID into Server Settings → Integrations. Full setup takes under 2 minutes." },
  { q: "Can I track multiple servers?", a: "Absolutely. Create separate RaidScout servers and link each to its own Discord server." },
  { q: "How does the AI rally scanner work?", a: "Upload a screenshot of your rally results and AI automatically detects player names." },
  { q: "What happens when a boss is killed?", a: "The timer resets. The kill is logged in History with timestamp, guild, and attendees. Discord gets notified." },
  { q: "Can I customize point values per boss?", a: "Yes! Set different point values per boss and per guild. Weekly/monthly/all-time leaderboards auto-update." },
  { q: "Is my data secure?", a: "Your data is stored on Supabase with Row-Level Security. Only invited members can access your server." },
  { q: "How do I invite members?", a: "Go to Server Settings → General and share the invite code. Or use Viewer Mode for read-only access." },
];

function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => (
        <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <button onClick={() => setOpenIndex(openIndex === i ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-800/50 transition">
            <span className="text-sm font-medium text-white pr-4">{faq.q}</span>
            <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition ${openIndex === i ? "rotate-180" : ""}`} />
          </button>
          {openIndex === i && (
            <div className="px-5 pb-4"><p className="text-sm text-slate-400 leading-relaxed">{faq.a}</p></div>
          )}
        </div>
      ))}
    </div>
  );
}
