import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { SEOHead } from "@/components/SEOHead";
import { version } from "../../package.json";
import {
  Timer, Shield, BarChart3, Sparkles, MessageSquare, Calendar, Skull, Eye, Trophy, Server, Clock, Lock, Image,
  LogIn, UserPlus, Mail, CheckCircle, AlertTriangle, Key, ChevronDown, Bot,
  Crosshair, Radio, Activity, Wifi, Copy, Terminal, Check, Hash, AtSign
} from "lucide-react";

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

  return <span ref={ref}>{display.toLocaleString()}{suffix}</span>;
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
      // First check if the demo server even exists (graceful on staging / new deploys)
      const { data: serverCheck, error: serverErr } = await supabase
        .from("servers")
        .select("id")
        .eq("id", YVONNE6_ID)
        .maybeSingle();
      if (serverErr || !serverCheck) return;

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
    <div className="flex items-center gap-5">
      {/* Boss name + status */}
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${status ? 'bg-emerald-400' : 'bg-emerald-400 animate-pulse'}`} />
        <div className="text-left">
          <span className="text-xs text-[#d4d4d8] font-medium">{bossName}</span>
          <span className={`ml-2 text-[10px] font-medium uppercase tracking-wider font-mono ${status ? 'text-emerald-400/70' : 'text-emerald-400'}`}>
            {status ? 'Alive' : 'Tracking'}
          </span>
        </div>
      </div>
      {/* Divider */}
      <span className="text-[#3f3f46] font-mono">|</span>
      {/* Countdown */}
      <div className="text-left">
        <span className="text-[10px] uppercase tracking-wider text-[#71717a] block mb-0.5">{status ? 'Since' : 'Respawns in'}</span>
        <span className="font-mono text-xl font-bold tabular-nums tracking-tight text-[#fafafa]">
          {timeStr}
        </span>
      </div>
    </div>
  );
}

// ── TypeWriter Effect ──────────────────────────────────────
function TypeWriter({ text, delay = 40, className = "" }: { text: string; delay?: number; className?: string }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        setStarted(true);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started || displayed.length >= text.length) return;
    const timer = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [started, displayed, text, delay]);

  return (
    <span ref={ref} className={className}>
      {displayed}
      {displayed.length < text.length && <span className="inline-block w-[2px] h-[1em] bg-emerald-400/60 ml-0.5 align-middle animate-pulse" />}
    </span>
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
    <div className="min-h-screen bg-slate-950 text-[#fafafa] overflow-x-hidden scroll-smooth">
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
      <section className="relative px-6 pt-32 pb-24 text-center overflow-hidden matrix-bg">
        {/* ── Background ── */}
        <div className="absolute inset-0 bg-[#09090b]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(250,250,250,0.02),transparent_70%)]" />

        {/* Data stream lines */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="data-stream absolute w-px bg-gradient-to-b from-transparent via-emerald-400/30 to-transparent"
              style={{ left: `${15 + i * 14}%`, height: "60%", top: `${-10 + (i % 3) * 15}%`, animationDelay: `${i * 0.5}s`, animationDuration: `${2.5 + i * 0.8}s` }} />
          ))}
        </div>

        {/* ── Content ── */}
        <div className="relative z-10 max-w-4xl mx-auto space-y-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/20 text-emerald-400/60 text-[11px] font-medium tracking-wider uppercase cyber-boot">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono">{">>"}</span> Guild Operations Platform
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.94] max-w-3xl mx-auto cyber-glitch">
            <span className="text-[#fafafa] cyber-glow">Command</span>
            <br />
            <span className="text-[#a1a1aa]">
              Your Guild
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-sm md:text-base text-emerald-400/60 max-w-lg mx-auto leading-relaxed font-mono cyber-cursor">
            <TypeWriter text="Real-time boss & activity tracking, multi-guild rotations, attendance monitoring, and Discord coordination. The command center competitive guilds trust." delay={25} />
          </p>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => document.getElementById("get-started")?.scrollIntoView({ behavior: "smooth" })}
              className="px-6 py-3 rounded-lg font-medium text-sm border border-[#fafafa]/20 text-[#fafafa] hover:border-[#fafafa]/40 hover:bg-[#fafafa]/5 transition-all duration-200"
            >
              Deploy Dashboard →
            </button>
            <button
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="px-6 py-3 rounded-lg font-medium text-sm text-[#71717a] hover:text-[#a1a1aa] transition-colors duration-200"
            >
              View Capabilities
            </button>
          </div>

          {/* Live Tracker */}
          <div className="pt-2">
            <div className="relative inline-flex flex-col gap-3 px-6 py-4 rounded-xl border border-[#27272a] bg-[#09090b]">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium tracking-wider uppercase text-emerald-400/60 font-mono">{">>"} Live Operations — Yvonne 6</span>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400/60 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  RECEIVING
                </span>
              </div>
              <LiveBossTimer />
            </div>
          </div>

          {/* Stats + Trust */}
          <div className="space-y-6 pt-2">
            {/* Stats — pure typography, no boxes */}
            <div className="flex items-center justify-center gap-8 md:gap-12 max-w-3xl mx-auto">
              {[
                { value: <AnimatedCounter value={liveStats.guilds} />, label: "Active Guilds" },
                { value: <AnimatedCounter value={liveStats.kills} />, label: "Kills Recorded" },
                { value: <AnimatedCounter value={liveStats.players} />, label: "Trackings" },
                { value: <AnimatedCounter value={liveStats.servers} />, label: "Servers Online" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold text-[#fafafa] tabular-nums tracking-tight">{s.value}</div>
                  <div className="text-[10px] text-[#71717a] uppercase tracking-wider mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            {/* Trust bar */}
            <div className="flex items-center justify-center gap-5 text-[10px] text-[#52525b]">
              <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" />SOC 2 Compliant</span>
              <span className="w-px h-3 bg-[#27272a]" />
              <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" />99.9% Uptime</span>
              <span className="w-px h-3 bg-[#27272a]" />
              <span className="flex items-center gap-1.5"><Lock className="w-3 h-3 hidden sm:block" />End-to-end Encrypted</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="features" className="relative bg-[#09090b] px-6 py-24">
        <div className="max-w-5xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#27272a] text-[#71717a] text-xs font-medium mb-6">
              <Sparkles className="w-3.5 h-3.5" /> PLATFORM CAPABILITIES
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#fafafa] mb-4">
              Everything Your Guild Needs
            </h2>
            <p className="text-[#71717a] text-lg">One platform to track, rotate, scan, and dominate.</p>
          </div>

          {/* Bento Grid */}
          <div className="space-y-4">
            {/* Row 1: Featured cards */}
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Live Countdown Timers (2×) */}
              <div className="group relative p-6 rounded-2xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10]  hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 opacity-0" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] group-hover:scale-110 transition-transform duration-200">
                      <Timer className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors">Live Countdown Timers</h3>
                      <p className="text-xs text-[#71717a]">39+ bosses tracked in real time</p>
                    </div>
                  </div>
                  {/* Mini countdown mock */}
                  <div className="space-y-2 mb-4">
                    {[{ name: "Venatus", time: "00:42:17", alive: true }, { name: "Viorent", time: "03:12:05", alive: false }, { name: "Lady Dalia", time: "07:58:33", alive: false }].map(b => (
                      <div key={b.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                        <span className="text-xs text-[#a1a1aa] font-mono">{b.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono tabular-nums text-[#d4d4d8]">{b.time}</span>
                          <span className={`w-1.5 h-1.5 rounded-full ${b.alive ? 'bg-[#a1a1aa] ' : 'bg-[#3f3f46]'}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[#fafafa]/80 leading-relaxed">Real-time countdowns for every boss. Know exactly when each spawns, no guessing.</p>
                </div>
              </div>

              {/* AI Rally Scanning (2×) */}
              <div className="group relative p-6 rounded-2xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10]  hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 opacity-0" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] group-hover:scale-110 transition-transform duration-200">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors">AI Rally Scanning</h3>
                      <p className="text-xs text-[#71717a]">Auto-detect players from screenshots</p>
                    </div>
                  </div>
                  {/* Mini upload mock */}
                  <div className="mb-4 p-4 rounded-xl border-2 border-dashed border-white/[0.06] bg-white/[0.01] text-center">
                    <div className="flex items-center justify-center gap-2 mb-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-[#52525b]"><Image className="w-4 h-4" /></div>
                      ))}
                    </div>
                    <p className="text-[10px] text-[#71717a]">Drop rally screenshots here</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {["DonAlas", "xSupladoo", "Livera"].map(n => (
                      <span key={n} className="text-[10px] px-2 py-0.5 rounded-full bg-[#18181b] border border-[#27272a] text-[#a1a1aa] border border-emerald-400/20 flex items-center gap-1">
                        <CheckCircle className="w-2.5 h-2.5" />{n}
                      </span>
                    ))}
                    <span className="text-[10px] text-[#71717a]">+3 detected</span>
                  </div>
                  <p className="text-xs text-[#fafafa]/80 leading-relaxed mt-4">Upload a rally screenshot and AI auto-detects player names. No manual typing.</p>
                </div>
              </div>
            </div>

            {/* Row 2 & 3: Standard cards */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Multi-Guild Rotation */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300">
                <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-2">Multi-Guild Rotation</h3>
                <p className="text-xs text-[#fafafa]/80 leading-relaxed">Assign bosses to guilds. Per-kill or daily rotation. Weighted turns.</p>
              </div>

              {/* Leaderboard & Points */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300">
                <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-2">Leaderboard & Points</h3>
                <p className="text-xs text-[#fafafa]/80 leading-relaxed">Configurable points per boss. Weekly, monthly, and all-time rankings.</p>
              </div>

              {/* Discord Alerts */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300">
                <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-2">Discord Alerts</h3>
                <p className="text-xs text-[#fafafa]/80 leading-relaxed">Auto-post boss kills, 5-min spawn warnings, and spawn confirmations.</p>
              </div>

              {/* Weekly Schedule */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300">
                <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                  <Calendar className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-2">Weekly Schedule</h3>
                <p className="text-xs text-[#fafafa]/80 leading-relaxed">Full week grid. See which guild owns which boss on every day.</p>
              </div>

              {/* Death History */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300">
                <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                  <Skull className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-2">Death History</h3>
                <p className="text-xs text-[#fafafa]/80 leading-relaxed">Complete kill log with guild badges. Attendance tracking per kill.</p>
              </div>

              {/* Discord Bot Commands */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300">
                <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                  <Bot className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-2">Discord Bot Commands</h3>
                <p className="text-xs text-[#fafafa]/80 leading-relaxed">Track multiple servers from one Discord. Export to Excel.</p>
              </div>

              {/* Viewer Mode (spans 2 cols on lg) */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300 lg:col-span-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] shrink-0 group-hover:scale-110 transition-transform duration-200">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-1">Viewer Mode</h3>
                    <p className="text-xs text-[#fafafa]/80 leading-relaxed">Share a link so your members can watch timers. No account or login required.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Discord Bot Commands ── */}
      <section className="relative bg-[#09090b] px-6 py-24">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-[#a1a1aa] text-xs font-medium mb-6 backdrop-blur-sm">
              <Bot className="w-3.5 h-3.5" /> DISCORD BOT
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#fafafa] mb-4">
              Control RaidScout from Discord
              <div className="mx-auto mt-4 w-12 h-0.5 bg-[#52525b] rounded-full" />
            </h2>
            <p className="text-[#fafafa]/60 text-sm max-w-xl mx-auto">
              Invite the bot, set alerts with <code className="bg-white/[0.05] px-1.5 py-0.5 rounded text-[#a1a1aa] font-mono text-xs">!notifhere</code>, restrict commands with <code className="bg-white/[0.05] px-1.5 py-0.5 rounded text-[#a1a1aa] font-mono text-xs">!cmdhere</code>, and auto-create spawn threads with <code className="bg-white/[0.05] px-1.5 py-0.5 rounded text-[#a1a1aa] font-mono text-xs">!threadhere</code>.
            </p>
          </div>

          {/* Terminal Window */}
          <div className="rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl shadow-black/40">
            {/* Window Chrome */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[#18181b] border-b border-white/[0.05]">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#52525b]" />
                <div className="w-3 h-3 rounded-full bg-[#52525b]" />
                <div className="w-3 h-3 rounded-full bg-[#52525b]" />
              </div>
              <div className="flex-1 text-center">
                <span className="text-[11px] text-[#71717a] font-mono tracking-wider">raidscout — terminal</span>
              </div>
              <Terminal className="w-3.5 h-3.5 text-[#52525b]" />
            </div>

            {/* Command Lines */}
            <AnimatedCommandList />
          </div>

          <p className="text-[#fafafa]/30 text-xs text-center mt-5 font-mono">💡 Also on the web: export attendance and analytics to Excel with styled tables.</p>
        </div>
      </section>

      {/* ── Screenshot Showcase ── */}
      {/* ── Terminal Mockup ── */}
      <section className="relative bg-[#09090b] px-4 py-24 flex items-center justify-center">
        {/* Backdrop Radial Laser Ambient Illumination Effect */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(147,51,234,0.08),rgba(6,182,212,0.03),transparent_70%)] pointer-events-none animate-pulse" style={{ animationDuration: '4s' }} />

        <div className="relative w-full max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-violet-300/80 text-xs font-medium mb-6 backdrop-blur-sm">
              <Eye className="w-3.5 h-3.5" /> SEE IT IN ACTION
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#fafafa] mb-4">
              Kill Tracking at Warp Speed
              <div className="mx-auto mt-4 w-12 h-0.5 bg-violet-400/60 rounded-full" />
            </h2>
            <p className="text-[#fafafa]/60 text-sm">Real-time kill tracking and Discord integration.</p>
          </div>

          {/* Perspective Mockup Canvas */}
          <div className="relative w-full transform transition-all duration-700 hover:scale-105 hover:-translate-y-4 shadow-[25px_35px_60px_-15px_rgba(0,0,0,0.8)] rounded-xl border border-white/5 bg-[#18181b] backdrop-blur-md overflow-hidden animate-float-mockup">
            {/* Top Terminal Window Title Bar */}
            <div className="bg-[#09090b] px-4 py-3 flex items-center justify-between border-b border-white/[0.03]">
              <div className="flex items-center space-x-2">
                <span className="text-purple-400 font-black text-base font-mono">#</span>
                <span className="text-neutral-300 font-semibold text-xs tracking-wide">raidscout-terminal</span>
                <span className="bg-[#18181b] text-[#a1a1aa] text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest border border-[#27272a] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a1a1aa] animate-ping" /> Live Feed
                </span>
              </div>
              <div className="flex space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60 shadow-[0_0_8px_rgba(234,179,8,0.4)]" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/60 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
              </div>
            </div>

            {/* Interface Main Content */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* LEFT BAR: Quick Status */}
              <div className="md:col-span-4 space-y-3 text-xs">
                <AnimatedCommandInput />
                <div className="p-3 rounded-lg bg-[#18181b] border border-white/[0.03]">
                  <span className="text-purple-300 block font-bold tracking-wider text-[10px] uppercase mb-1">Automation Dispatch</span>
                  <p className="text-neutral-300 leading-relaxed">Instantly syncs rotation matrix updates back to web dashboards.</p>
                </div>
              </div>

              {/* RIGHT BAR: Kill Notification Embed */}
              <div className="md:col-span-8">
                <AnimatedBotResponse />
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* ── Auth Section ── */}
      <section id="get-started" className="relative bg-[#09090b] px-6 py-24">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#27272a] text-[#71717a] text-xs font-medium mb-6">
              <LogIn className="w-3.5 h-3.5" /> GET STARTED
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#fafafa] mb-4">
              Ready to start?
              <div className="mx-auto mt-4 w-12 h-0.5 bg-[#a1a1aa]/60 rounded-full" />
            </h2>
            <p className="text-[#fafafa]/50 text-sm">Create an account or view as guest.</p>
          </div>

          {/* Auth Card */}
          <div className="relative rounded-2xl bg-[#18181b] border border-[#27272a] p-6 shadow-2xl shadow-black/40 overflow-hidden">
            <div className="relative z-10">
              {/* Top Toggle */}
              <div className="flex bg-white/[0.03] rounded-xl p-1 mb-6">
                {[{ mode: false, label: "Account", icon: <LogIn className="w-3.5 h-3.5" /> }, { mode: true, label: "View as Guest", icon: <Eye className="w-3.5 h-3.5" /> }].map(t => (
                  <button key={t.label} type="button" onClick={() => { setViewerMode(t.mode); setError(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${viewerMode === t.mode ? "bg-white/[0.06] text-[#fafafa] shadow-sm" : "text-[#fafafa]/40 hover:text-[#fafafa]/70"}`}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

              {viewerMode ? (
                <form onSubmit={handleViewerSignIn} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[#fafafa]/60 mb-2 ml-1">Viewer Key</label>
                    <div className="relative">
                      <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#fafafa]/30" />
                      <input type="text" value={viewerKey} onChange={e => setViewerKey(e.target.value)} required placeholder="Paste your viewer key..."
                        className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-[#fafafa] placeholder-white/20 text-sm font-mono outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all duration-200" />
                    </div>
                  </div>
                  <p className="text-xs text-[#fafafa]/30">Get this from your server owner. No account needed.</p>
                  {error && <div className="flex items-start gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>}
                  <button type="submit" disabled={loading || !viewerKey.trim()}
                    className="w-full relative group flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-[#F8FAFC] text-[#040816] hover:bg-white disabled:opacity-40 transition-all duration-200  text-sm">
                    {loading ? <span className="w-4 h-4 border-2 border-[#040816]/30 border-t-[#040816] rounded-full animate-spin" /> : <><Eye className="w-4 h-4" /> View Server <span className="inline-block group-hover:translate-x-0.5 transition-transform">→</span></>}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Sign In / Sign Up tabs */}
                  <div className="flex bg-white/[0.03] rounded-xl p-1 mb-2">
                    <button type="button" onClick={() => { setIsSignUp(false); setError(null); setSuccess(null); setResetSent(false); setAcceptedTerms(false); }}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${!isSignUp ? "bg-white/[0.06] text-[#fafafa] shadow-sm" : "text-[#fafafa]/40 hover:text-[#fafafa]/70"}`}>Sign In</button>
                    <button type="button" onClick={() => { setIsSignUp(true); setError(null); setSuccess(null); setResetSent(false); setAcceptedTerms(false); }}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${isSignUp ? "bg-white/[0.06] text-[#fafafa] shadow-sm" : "text-[#fafafa]/40 hover:text-[#fafafa]/70"}`}>Sign Up</button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#fafafa]/60 mb-2 ml-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#fafafa]/30" />
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com"
                        className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-[#fafafa] placeholder-white/20 text-sm outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all duration-200" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#fafafa]/60 mb-2 ml-1">Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="••••••••"
                      className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-[#fafafa] placeholder-white/20 text-sm outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all duration-200" />
                  </div>
                  {!isSignUp && (
                    <div className="flex justify-end">
                      <button type="button" onClick={handleForgotPassword} disabled={loading} className="text-xs text-[#fafafa]/40 hover:text-sky-400 transition">Forgot password?</button>
                    </div>
                  )}
                  {isSignUp && (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-white/[0.15] bg-white/[0.03] text-sky-500 focus:ring-sky-500 focus:ring-offset-0" />
                      <span className="text-xs text-[#fafafa]/50 leading-relaxed">
                        I agree to the <Link to="/terms" className="text-sky-400 hover:text-sky-300 underline" target="_blank">Terms of Service</Link> and <Link to="/privacy" className="text-sky-400 hover:text-sky-300 underline" target="_blank">Privacy Policy</Link>
                      </span>
                    </label>
                  )}
                  {resetSent && !isSignUp && <div className="flex items-start gap-2 text-emerald-400 text-sm bg-emerald-400/10 border border-emerald-400/20 rounded-xl px-3 py-2"><CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>Reset link sent! Check your email.</span></div>}
                  {success && <div className="flex items-start gap-2 text-emerald-400 text-sm bg-emerald-400/10 border border-emerald-400/20 rounded-xl px-3 py-2"><CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{success}</span></div>}
                  {error && !resetSent && !success && <div className="flex items-start gap-2 text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>}
                  <button type="submit" disabled={loading || (isSignUp && !acceptedTerms)}
                    className="w-full relative group flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-[#F8FAFC] text-[#040816] hover:bg-white disabled:opacity-40 transition-all duration-200  text-sm">
                    {loading ? <span className="w-4 h-4 border-2 border-[#040816]/30 border-t-[#040816] rounded-full animate-spin" /> : <>{isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}{isSignUp ? "Create Account" : "Sign In"} <span className="inline-block group-hover:translate-x-0.5 transition-transform">→</span></>}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ Section ── */}
      <section className="relative bg-[#09090b] px-6 py-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-sky-300/80 text-xs font-medium mb-6 backdrop-blur-sm">
              <MessageSquare className="w-3.5 h-3.5" /> FAQ
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#fafafa] mb-4">
              Frequently Asked Questions
              <div className="mx-auto mt-4 w-12 h-0.5 bg-[#a1a1aa]/60 rounded-full" />
            </h2>
            <p className="text-[#fafafa]/50 text-sm">Everything you need to know.</p>
          </div>
          <FAQ />
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.04] bg-[#09090b] py-20 px-6">
        <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-10 mb-16">
          <div>
            <h4 className="text-sm font-semibold text-[#fafafa] mb-5">Resources</h4>
            <div className="space-y-3 text-sm text-[#fafafa]/40">
              <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="block hover:text-[#fafafa] transition-colors">RaidScout Support</a>
              <a href="#" className="block hover:text-[#fafafa] transition-colors">Documentation</a>
              <a href="#" className="block hover:text-[#fafafa] transition-colors">API</a>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#fafafa] mb-5">Company</h4>
            <div className="space-y-3 text-sm text-[#fafafa]/40">
              <Link to="/terms" className="block hover:text-[#fafafa] transition-colors">Terms of Service</Link>
              <Link to="/privacy" className="block hover:text-[#fafafa] transition-colors">Privacy Policy</Link>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#fafafa] mb-5">Community</h4>
            <div className="space-y-3 text-sm text-[#fafafa]/40">
              <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-sky-400 transition-colors">
                <svg className="w-4 h-4 text-[#5865f2]" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>Discord
              </a>
              <a href="https://www.facebook.com/profile.php?id=61590144185090" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-sky-400 transition-colors">
                <svg className="w-4 h-4 text-[#1877f2]" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>Facebook
              </a>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto pt-8 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-[#fafafa]/30">
            <img src="/logo.png" alt="" className="w-5 h-5 rounded opacity-40" />
            <span className="text-sm">&copy; {new Date().getFullYear()} RaidScout. All rights reserved.</span>
          </div>
          <span className="text-xs text-[#fafafa]/20 font-mono">v{version}</span>
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

// ── Utility: Copy-to-Clipboard with Floating Badge ──────────

/**
 * Copies text to the clipboard. Uses the modern async Clipboard API
 * with a legacy execCommand fallback for older browsers.
 */
function copyToClipboard(text: string): boolean {
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      return true;
    }
    // Legacy fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Inline code snippet that copies to clipboard on click and shows a
 * floating "Copied!" badge for 2 seconds positioned above the element.
 */
// ── Animated Terminal Demo ──────────────────────────────

const DEMO_CMD = ";killed Icaruthia";

function AnimatedCommandInput() {
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "done">("typing");

  useEffect(() => {
    if (typed.length < DEMO_CMD.length) {
      const t = setTimeout(() => setTyped(DEMO_CMD.slice(0, typed.length + 1)), 60 + Math.random() * 40);
      return () => clearTimeout(t);
    } else {
      setPhase("done");
    }
  }, [typed]);

  // Loop: reset after pause
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => { setTyped(""); setPhase("typing"); }, 4000);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <div className="p-3 rounded-lg bg-[#18181b] border border-white/[0.03]">
      <span className="text-neutral-400 block font-bold tracking-wider text-[10px] uppercase mb-1">Command Input</span>
      <div className="flex items-center space-x-0.5 relative">
        <code className="text-cyan-400 font-mono font-bold text-sm block tracking-wide">
          {typed}
        </code>
        <span className={`w-1.5 h-4 ${phase === "typing" ? "bg-cyan-400 animate-pulse" : "bg-cyan-400"}`} />
      </div>
    </div>
  );
}

function AnimatedBotResponse() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show response after command typing (~2.5s), then loop
    const show = () => {
      setVisible(true);
      setTimeout(() => { setVisible(false); setTimeout(show, 1500); }, 6000);
    };
    const t = setTimeout(show, 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex items-start space-x-3">
      <div className="w-9 h-9 rounded-full bg-gradient-to-b from-slate-900 to-slate-950 border border-purple-500/30 flex items-center justify-center font-bold text-white shrink-0 shadow-xl text-xs font-mono">
        RSB
      </div>
      <div className="w-full">
        <div className="flex items-baseline space-x-1.5 mb-1.5">
          <span className="font-bold text-[#fafafa] text-sm">RaidScout Bot</span>
          <span className="bg-[#18181b] text-[#fafafa] text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">APP</span>
          <span className="text-[10px] text-neutral-400 font-mono ml-2">{visible ? "Synced just now" : "Waiting for input..."}</span>
        </div>

        {/* Embed Panel */}
        <div className={`border-l-4 border-[#27272a] bg-[#18181b] rounded-r-xl p-5 shadow-2xl relative overflow-hidden border-y border-white/[0.02] border-r-white/[0.02] transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          {/* Scanner Line */}
          <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent pointer-events-none z-20 animate-scan-line" />
          {/* Grid Pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

          <div className="text-sm font-black text-[#fafafa] tracking-wide mb-4 flex items-center gap-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
            <span className="text-red-400 text-base animate-pulse">☠️</span>
            <span>Icaruthia Killed by <span className="text-red-400 tracking-widest font-mono">PANORTH</span></span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-10">
            <div className="bg-[#18181b] p-2.5 rounded-lg border border-white/[0.03]">
              <span className="text-[#a1a1aa] block font-bold text-[10px] tracking-wider uppercase mb-1">Death Time</span>
              <span className="font-mono text-[11px] text-[#fafafa] block font-semibold">June 2, 2026 9:09 PM</span>
            </div>
            <div className="bg-[#18181b] p-2.5 rounded-lg border border-white/[0.03]">
              <span className="text-[#a1a1aa] block font-bold text-[10px] tracking-wider uppercase mb-1">Recorded By</span>
              <span className="font-mono text-[11px] text-[#d4d4d8] block font-semibold">._.r0cky</span>
            </div>
            <div className="bg-[#18181b] p-2.5 rounded-lg border border-white/[0.03] border-b-[#3f3f46]">
              <span className="text-[#a1a1aa] block font-bold text-[10px] tracking-wider uppercase mb-1">Next Spawn</span>
              <span className="font-mono text-[11px] text-cyan-400 block font-bold tracking-tight">June 5, 2026 9:00 PM</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.03] text-[10px] text-neutral-500 flex items-center justify-between font-mono">
            <span>Core Analytics Instance #04</span>
            <span className="text-purple-400/70 font-semibold tracking-wider animate-pulse">Powered by RaidScout</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyCodeBadge({ code, className = "" }: { code: string; className?: string }) {
  const [show, setShow] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (copyToClipboard(code)) {
      setShow(true);
      setTimeout(() => setShow(false), 2000);
    }
  }, [code]);

  return (
    <span className="relative inline-flex items-center">
      <code
        onClick={handleClick}
        className={`text-cyan-400 font-mono font-bold text-sm block tracking-wide cursor-pointer select-all hover:brightness-125 transition-all ${className}`}
        title="Click to copy"
      >
        {code}
      </code>
      {/* Floating "Copied!" badge — fades in/out above the code */}
      <span
        className={[
          "absolute -top-8 left-1/2 -translate-x-1/2",
          "px-2 py-0.5 rounded-md text-[10px] font-bold font-mono",
          "bg-emerald-500/90 text-[#fafafa] shadow-lg shadow-emerald-500/20",
          "pointer-events-none whitespace-nowrap z-50",
          "transition-all duration-200",
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
        ].join(" ")}
      >
        Copied!
      </span>
    </span>
  );
}

// ── Terminal Command Line ────────────────────────────────────
const TERMINAL_COMMANDS = [
  { cmd: "!nextspawn", desc: "List all boss spawns in the next 24 hours", detail: "Shows spawn time, live countdown, and guild ownership" },
  { cmd: "!nextspawn Venatus", desc: "Check spawn for a specific boss", detail: "Filter by boss name to see just that boss's timer" },
  { cmd: "!nextspawn Arcane", desc: "List spawns for a specific guild", detail: "See all upcoming bosses owned by a guild" },
  { cmd: "!killed Venatus", desc: "Record a boss kill right now", detail: "Same as 'Mark Died' — advances rotation" },
  { cmd: "!killed Venatus 14:30", desc: "Record a kill at a custom time", detail: "Auto: if time passed today → today. Otherwise → yesterday" },
  { cmd: "!killed Venatus 14:30 today", desc: "Force today's date", detail: "Always record on today's date" },
  { cmd: "!killed Venatus 14:30 yesterday", desc: "Force yesterday's date", detail: "Always record on yesterday's date" },
  { cmd: "!forcespawn Venatus", desc: "Force a boss to spawn immediately", detail: "Useful after server maintenance or resets" },
  { cmd: "!forcespawnall", desc: "Force-spawn ALL fixed-timer bosses", detail: "Bulk spawn after maintenance. Schedule bosses unaffected." },
  { cmd: "!list", desc: "See all boss names", detail: "Numbered list with respawn hours and spawn type" },
  { cmd: "!commands", desc: "Show all available commands", detail: "Quick reference for your members" },
  { cmd: "!notifhere", desc: "Set notification channel", detail: "Run in announcements channel for boss kill & spawn alerts" },
  { cmd: "!cmdhere", desc: "Restrict commands to one channel", detail: "Bot only responds in the channel you choose" },
  { cmd: "!threadhere", desc: "Set auto-spawn thread channel", detail: "Creates a thread per boss spawn for organized tracking" },
];

function AnimatedCommandList() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [typedCmds, setTypedCmds] = useState<string[]>(TERMINAL_COMMANDS.map(() => ""));
  const [typingIndex, setTypingIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [loopKey, setLoopKey] = useState(0);
  const [started, setStarted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  // Only start animation when section scrolls into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el || hasStarted.current) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        hasStarted.current = true;
        setStarted(true);
        obs.disconnect();
      }
    }, { threshold: 0.1, rootMargin: "0px 0px 100px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Type current command character by character
  useEffect(() => {
    if (!started) return;
    if (typingIndex >= TERMINAL_COMMANDS.length) {
      // All done — pause then restart
      const t = setTimeout(() => {
        setVisibleCount(0);
        setTypedCmds(TERMINAL_COMMANDS.map(() => ""));
        setTypingIndex(0);
        setCharIndex(0);
        setLoopKey(k => k + 1);
      }, 4000);
      return () => clearTimeout(t);
    }
    
    const cmd = TERMINAL_COMMANDS[typingIndex].cmd;
    if (charIndex < cmd.length) {
      const delay = 30 + Math.random() * 35;
      const t = setTimeout(() => {
        setTypedCmds(prev => {
          const next = [...prev];
          next[typingIndex] = cmd.slice(0, charIndex + 1);
          return next;
        });
        setCharIndex(c => c + 1);
      }, delay);
      return () => clearTimeout(t);
    } else {
      // Command done — show next after pause
      const t = setTimeout(() => {
        setVisibleCount(typingIndex + 1);
        setTypingIndex(i => i + 1);
        setCharIndex(0);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [typingIndex, charIndex, loopKey, started]);

  return (
    <div ref={containerRef} className="bg-[#18181b] divide-y divide-white/[0.03] min-h-[80px]">
      {!started && (
        <div className="flex items-center gap-4 px-5 py-3.5 font-mono">
          <span className="shrink-0 mt-0.5 text-emerald-400/60 select-none">❯</span>
          <span className="text-emerald-400/40 text-sm animate-pulse">_</span>
        </div>
      )}
      {TERMINAL_COMMANDS.map((item, i) => (
        <CommandLine
          key={`${loopKey}-${i}`}
          cmd={item.cmd}
          desc={item.desc}
          detail={item.detail}
          last={i === TERMINAL_COMMANDS.length - 1}
          visible={i < visibleCount || (i === typingIndex)}
          typedCmd={i === typingIndex ? typedCmds[i] : (i < visibleCount ? item.cmd : "")}
          isTyping={i === typingIndex}
        />
      ))}
    </div>
  );
}

function CommandLine({ cmd, desc, detail, last, visible = true, typedCmd, isTyping }: { cmd: string; desc: string; detail: string; last?: boolean; visible?: boolean; typedCmd?: string; isTyping?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copyCmd = () => { navigator.clipboard.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const displayCmd = typedCmd ?? (visible ? cmd : "");

  if (!visible && !isTyping) return <div className="h-[3px]" />;

  return (
    <div className={`group flex items-start gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition cursor-pointer font-mono ${last ? '' : ''}`} onClick={copyCmd}>
      {/* Prompt arrow */}
      <span className="shrink-0 mt-0.5 text-emerald-400/60 select-none">❯</span>
      {/* Command */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {displayCmd ? (
            <>
              <span className="text-[#a1a1aa] text-sm font-semibold">{displayCmd.split(' ')[0]}</span>
              {displayCmd.split(' ').slice(1).map((arg, i) => (
                <span key={i} className={arg.startsWith('!') ? 'text-[#a1a1aa] text-sm font-semibold' : 'text-amber-300/80 text-sm'}>{arg}</span>
              ))}
              {isTyping && <span className="w-1.5 h-4 bg-emerald-400/70 animate-pulse" />}
            </>
          ) : null}
          {/* Copy button */}
          <button className="ml-auto opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-white/[0.05]" onClick={e => { e.stopPropagation(); copyCmd(); }}>
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[#71717a]" />}
          </button>
        </div>
        {visible && !isTyping && (
          <>
            <p className="text-[#fafafa]/80 text-xs mt-0.5">{desc}</p>
            <p className="text-[#fafafa]/30 text-[10px] mt-0.5">{detail}</p>
          </>
        )}
      </div>
    </div>
  );
}

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
        <p className="text-[#a1a1aa] mt-2">Everything you need to dominate boss rotations.</p>
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
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-[#3f3f46] rounded-b-sm" />
          </div>
          <p className="text-center mt-3 text-sm text-[#a1a1aa]">Live Countdown Timers</p>
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
            className={`w-2 h-2 rounded-full transition-all duration-300 ${i === active ? "bg-[#a1a1aa] w-6" : "bg-[#3f3f46] hover:bg-[#52525b]"}`}
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
  const contentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [heights, setHeights] = useState<number[]>(new Array(faqs.length).fill(0));

  // Measure content heights on mount and when window resizes
  useEffect(() => {
    const measure = () => {
      const h = contentRefs.current.map(ref => ref?.scrollHeight ?? 0);
      setHeights(h);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Re-measure when any accordion opens (content may have rendered for first time)
  useEffect(() => {
    if (openIndex !== null && heights[openIndex] === 0) {
      const h = contentRefs.current[openIndex]?.scrollHeight ?? 0;
      if (h > 0) {
        setHeights(prev => { const next = [...prev]; next[openIndex] = h; return next; });
      }
    }
  }, [openIndex, heights]);

  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => (
        <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden backdrop-blur-sm transition-colors duration-200 hover:border-white/[0.10]">
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
          >
            <span className="text-sm font-medium text-[#fafafa] pr-4">{faq.q}</span>
            <ChevronDown
              className={`w-4 h-4 text-[#fafafa]/40 shrink-0 transition-transform duration-300 ${openIndex === i ? "rotate-180" : ""}`}
            />
          </button>
          {/* Animated collapsible panel */}
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{
              maxHeight: openIndex === i ? `${heights[i]}px` : "0px",
              opacity: openIndex === i ? 1 : 0,
            }}
          >
            <div
              ref={el => { contentRefs.current[i] = el; }}
              className="px-5 pb-4"
            >
              <p className="text-sm text-[#fafafa]/50 leading-relaxed">{faq.a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
