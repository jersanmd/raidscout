import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase, fetchGames } from "@/lib/supabase";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { SEOHead } from "@/components/SEOHead";
import { detectTimezone, formatVersionInTimezone } from "@/hooks/useUserTimezone";
declare const APP_VERSION: string;
import {
  Timer, Shield, BarChart3, Sparkles, MessageSquare, Calendar, Skull, Eye, Trophy, Server, Clock, Lock, Image, Package, Archive, User, Users,
  LogIn, UserPlus, Mail, CheckCircle, AlertTriangle, Key, ChevronDown, Bot,
  Crosshair, Radio, Activity, Wifi, Copy, Terminal, Check, Hash, AtSign, Play, X, Gamepad2, Globe, EyeOff
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
// ── Simulated Boss Timer (zero server dependency) ──────────
const SIMULATED_BOSSES = [
  { name: "Venatus", respawnHours: 10 },
  { name: "Viorent", respawnHours: 12 },
  { name: "Ego", respawnHours: 21 },
  { name: "Lady Dalia", respawnHours: 8 },
  { name: "Livera", respawnHours: 24 },
  { name: "Clemantis", respawnHours: 48 },
  { name: "Icaruthia", respawnHours: 62 },
];

function SimulatedBossTimer() {
  const [timeStr, setTimeStr] = useState("--:--:--");
  const [bossName, setBossName] = useState(SIMULATED_BOSSES[0].name);
  const [alive, setAlive] = useState(false);
  const spawnRef = useRef<Map<string, Date>>(new Map());
  const bossIndexRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const cycleRef = useRef<number | null>(null);

  // Generate a realistic spawn time: -2h to +8h from now
  const randomSpawnTime = useCallback((respawnHours: number) => {
    const offsetMs = (Math.random() * 10 - 2) * 3600_000; // -2h to +8h
    return new Date(Date.now() + offsetMs);
  }, []);

  // Set up a boss: generate spawn time if needed, start counting
  const activateBoss = useCallback((index: number) => {
    const boss = SIMULATED_BOSSES[index % SIMULATED_BOSSES.length];
    let spawnTime = spawnRef.current.get(boss.name);
    if (!spawnTime) {
      spawnTime = randomSpawnTime(boss.respawnHours);
      spawnRef.current.set(boss.name, spawnTime);
    }
    setBossName(boss.name);

    // Clear old tick
    if (tickRef.current) clearInterval(tickRef.current);

    const tick = () => {
      const diff = spawnTime!.getTime() - Date.now();
      if (diff <= 0) {
        // Boss is alive — keep alive for ~2h, then regenerate
        const aliveDuration = Date.now() - spawnTime!.getTime();
        if (aliveDuration > 2 * 3600_000) {
          // "Killed" — generate next spawn
          const nextSpawn = new Date(Date.now() + boss.respawnHours * 3600_000);
          spawnRef.current.set(boss.name, nextSpawn);
          spawnTime = nextSpawn;
          setAlive(false);
          tick(); // re-run with new spawn
          return;
        }
        setTimeStr("ALIVE");
        setAlive(true);
        return;
      }
      setAlive(false);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeStr(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };

    tick();
    tickRef.current = window.setInterval(tick, 1000);
  }, [randomSpawnTime]);

  // Cycle through bosses every 8s
  useEffect(() => {
    activateBoss(0);
    cycleRef.current = window.setInterval(() => {
      bossIndexRef.current = (bossIndexRef.current + 1) % SIMULATED_BOSSES.length;
      activateBoss(bossIndexRef.current);
    }, 8000);
    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [activateBoss]);

  return (
    <div className="flex items-center gap-5">
      {/* Boss name + status */}
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${alive ? 'bg-emerald-400' : 'bg-emerald-400 animate-pulse'}`} />
        <div className="text-left">
          <span className="text-xs text-[#d4d4d8] font-medium">{bossName}</span>
          <span className={`ml-2 text-[10px] font-medium uppercase tracking-wider font-mono ${alive ? 'text-emerald-400/70' : 'text-emerald-400'}`}>
            {alive ? 'Alive' : 'Tracking'}
          </span>
        </div>
      </div>
      {/* Divider */}
      <span className="text-[#3f3f46] font-mono">|</span>
      {/* Countdown */}
      <div className="text-left">
        <span className="text-[10px] uppercase tracking-wider text-[#71717a] block mb-0.5">{alive ? 'Since' : 'Respawns in'}</span>
        <span className="font-mono text-xl font-bold tabular-nums tracking-tight text-[#fafafa]">
          {timeStr}
        </span>
      </div>
    </div>
  );
}

// ── Tester Credits ──────────────────────────────────────────
const TESTERS = [
  { name: "bruubruu", avatar: "/testers/bruubruu.png", discord: "277497499823112195" },
  { name: "itsyohboyjustin", avatar: "/testers/itsyohboyjustin.png", discord: "687362924385271813" },
  { name: "mr.handsome18", avatar: "/testers/mrhandsome18.png", discord: "1065905461158744094" },
  { name: "vn1tv", avatar: "/testers/vn1tv.png", discord: "568277430259941388" },
  { name: "megane7182", avatar: "/testers/megane7182.png", discord: "172272647562985472" },
  { name: "jshimura", avatar: "/testers/jshimura.png", discord: "553554185191292928" },
  { name: ".iwhiterabbit", avatar: "/testers/iwhiterabbit.png", discord: "721989425139154975" },
  { name: "itscj8", avatar: "/testers/itscj8.png", discord: "837693858124005396" },
];

// ── TypeWriter Effect ──────────────────────────────────────
function TypeWriter({ text, delay = 40, className = "" }: { text: string; delay?: number; className?: string }) {
  const [displayed, setDisplayed] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || displayed.length >= text.length) return;
    const timer = setTimeout(() => {
      setDisplayed(text.slice(0, displayed.length + 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [isVisible, displayed, text, delay]);

  return (
    <span ref={ref} className={className}>
      {displayed}
      {displayed.length < text.length && <span className="inline-block w-[2px] h-[1em] bg-emerald-400/60 ml-0.5 align-middle animate-pulse" />}
    </span>
  );
}
export function LandingPage() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const browserTz = useMemo(() => detectTimezone(), []);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [activeGuide, setActiveGuide] = useState<string | null>(null);
  useEscapeKey(() => { setShowVideo(false); setActiveGuide(null); });

  const GUIDES = [
    { id: import.meta.env.VITE_YOUTUBE_DEMO_ID || "dQw4w9WgXcQ", title: "What is RaidScout?", description: "Overview of the platform and all core features — boss timers, guild rotations, AI scanning, and more." },
    { id: "na_iii6gSwY", title: "How to Connect RaidScout to Your Discord Server", description: "Step-by-step guide: create a server, invite the bot, set up channels for commands, notifications, threads, and CP updates." },
    { id: "cjAEQ6Icbm0", title: "RaidScout DKP Guide: Complete Setup, Character Claims & Loot Auctions", description: "Learn how the RaidScout DKP system works from start to finish." },
  ];

  // Live stats from Supabase
  const [liveStats, setLiveStats] = useState({
    guilds: 0, kills: 0, players: 0, servers: 0,
  });
  const [games, setGames] = useState<any[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
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
    // Fetch supported games
    fetchGames().then(data => { setGames(data || []); setGamesLoading(false); }).catch(() => setGamesLoading(false));
  }, []);

  const SECTIONS = [
    { id: "hero", label: "Hero" },
    { id: "stats", label: "Games" },
    { id: "features", label: "Features" },
    { id: "how-it-works", label: "How It Works" },
    { id: "guides", label: "Guides" },
    { id: "pricing", label: "Pricing" },
    { id: "get-started", label: "Sign In" },
    { id: "faq", label: "FAQ" },
  ];

  // JavaScript scroll snap — only snaps when crossing section boundaries
  const [activeSection, setActiveSection] = useState("hero");
  const snapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnappedSection = useRef("hero");
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollingDown = currentScrollY > lastScrollY.current;
      lastScrollY.current = currentScrollY;

      if (snapTimeout.current) clearTimeout(snapTimeout.current);
      snapTimeout.current = setTimeout(() => {
        // Find the section closest to the viewport top
        let closestId = SECTIONS[0].id;
        let closestDist = Infinity;
        for (const s of SECTIONS) {
          const el = document.getElementById(s.id);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const dist = Math.abs(rect.top);
          if (dist < closestDist) { closestDist = dist; closestId = s.id; }
        }

        // Only snap if crossing into a different section
        if (closestId !== lastSnappedSection.current) {
          const el = document.getElementById(closestId);
          if (el) {
            if (scrollingDown) {
              // Scrolling down: snap to top of new section
              el.scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
              // Scrolling up: snap to bottom of new section (show what's above)
              el.scrollIntoView({ behavior: "smooth", block: "end" });
            }
          }
          lastSnappedSection.current = closestId;
        }

        setActiveSection(closestId);
      }, 600);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (snapTimeout.current) clearTimeout(snapTimeout.current);
    };
  }, []);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (isSignUp) {
      if (password !== confirmPassword) { setError("Passwords do not match."); return; }
      const strength = getPasswordStrength(password);
      if (strength === "weak") { setError("Password is too weak. Use at least 8 characters with a mix of uppercase, lowercase, numbers, and symbols."); return; }
    }

    setLoading(true);
    const { error: err } = isSignUp ? await signUp(email, password) : await signIn(email, password);
    if (err) setError(err);
    else if (isSignUp) setSuccess("Account created! You're signed in. Verify your email anytime in Account Settings.");
    setLoading(false);
  };

  const getPasswordStrength = (p: string): "weak" | "medium" | "strong" => {
    if (p.length < 8) return "weak";
    let score = 0;
    if (/[a-z]/.test(p)) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^a-zA-Z0-9]/.test(p)) score++;
    if (p.length >= 12) score++;
    if (score <= 2) return "weak";
    if (score <= 3) return "medium";
    return "strong";
  };

  const strengthLabel = isSignUp && password ? getPasswordStrength(password) : null;

  const handleForgotPassword = async () => {
    if (!email.trim()) { setError("Enter your email first."); return; }
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + "/" });
    if (err) setError(err.message);
    else setResetSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-[#fafafa] overflow-x-hidden scroll-smooth">
      <SEOHead
        title="RaidScout — Guild Operations Platform for Any MMO"
        description="Track bosses for any game with custom server support. Real-time timers, multi-guild rotations, AI rally scanning, DKP auctions, loot & inventory tracking, gear management, attendance, leaderboards, and Discord integration."
        canonicalUrl="/"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "RaidScout",
          description: "Complete guild operations platform for competitive MMO guilds. Track bosses for any game — supports custom servers, pre-seeded templates, and any number of bosses. Features real-time spawn timers, multi-guild kill rotation coordination, AI-powered rally screenshot scanning, DKP auction bidding system, loot distribution & inventory management, member gear & combat power tracking, attendance monitoring, live leaderboards, and Discord bot integration.",
          url: "https://www.raidscout.com",
          applicationCategory: "GameApplication",
          operatingSystem: "Web",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
          author: {
            "@type": "Organization",
            name: "RaidScout",
            url: "https://www.raidscout.com",
          },
        }}
      />

      {/* ── Hero ── */}
      <section id="hero" className="relative px-6 pt-32 pb-24 text-center overflow-hidden matrix-bg min-h-screen">
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
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] max-w-3xl mx-auto cyber-glitch">
            <span className="text-[#fafafa] cyber-glow">Your Guild,</span>
            <br />
            <span className="text-[#a1a1aa]">
              Your Raids,
            </span>
            <br />
            <span className="text-emerald-400/80">
              Perfectly Coordinated
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-sm md:text-base text-emerald-400/60 max-w-lg mx-auto leading-relaxed font-mono cyber-cursor">
            <TypeWriter text="Track any boss, any game, any guild. Custom servers, real-time timers, multi-guild rotations, loot & inventory, gear tracking, AI rally scanning, and Discord coordination. Built for competitive guilds — works with any MMO." delay={25} />
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
              onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}
              className="px-6 py-3 rounded-lg font-medium text-sm border border-emerald-500/30 text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-500/5 transition-all duration-200"
            >
              $9.99 / 30 days
            </button>
            <button
              onClick={() => setShowVideo(true)}
              className="px-6 py-3 rounded-lg font-medium text-sm border border-[#fafafa]/20 text-[#fafafa] hover:border-[#fafafa]/40 hover:bg-[#fafafa]/5 transition-all duration-200 flex items-center gap-2"
            >
              <Play className="w-4 h-4" fill="currentColor" />
              Watch Guides
            </button>
          </div>

          {/* Live Tracker */}
          <div className="pt-2">
            <div className="relative inline-flex flex-col gap-3 px-6 py-4 rounded-xl border border-[#27272a] bg-[#09090b]">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium tracking-wider uppercase text-emerald-400/60 font-mono">{">>"} Live Operations — Demo Server</span>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400/60 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  RECEIVING
                </span>
              </div>
              <SimulatedBossTimer />
            </div>
          </div>

          {/* Stats + Trust */}
          <div className="space-y-6 pt-2">
            {/* Stats — pure typography, no boxes */}
            <div className="flex items-center justify-center gap-8 md:gap-12 max-w-3xl mx-auto">
              {[
                { value: <AnimatedCounter value={liveStats.guilds} />, label: "Active Guilds" },
                { value: <AnimatedCounter value={liveStats.kills} />, label: "Kills Recorded" },
                { value: <AnimatedCounter value={liveStats.players} />, label: "Participants" },
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

            {/* Tester avatars */}
            <div className="flex flex-col items-center gap-2.5 pt-6">
              <div className="flex items-center">
                {TESTERS.map((tester, i) => (
                  <div
                    key={i}
                    className="group relative hover:z-10 transition-all duration-300"
                    style={{ marginLeft: i === 0 ? 0 : "-10px", zIndex: TESTERS.length - i }}
                  >
                    <img
                      src={tester.avatar}
                      alt={tester.name}
                      className="w-9 h-9 rounded-full object-cover ring-2 ring-[#09090b] group-hover:ring-amber-400/40 group-hover:scale-110 transition-all duration-300"
                    />
                  </div>
                ))}
              </div>
              <span className="text-[10px] tracking-wide text-[#52525b]">trusted by guild leaders and guild managers worldwide</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Games We Support ── */}
      {games.length > 0 && (
        <section id="stats" className="relative bg-[#09090b] px-6 py-16 border-b border-white/[0.04]" style={{ scrollSnapAlign: "start" }}>
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] text-[#a1a1aa] text-xs font-medium mb-6 backdrop-blur-sm">
              <Globe className="w-3.5 h-3.5" /> MULTI-GAME PLATFORM
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-[#fafafa] mb-3">
              One Platform, Any MMO
            </h2>
            <p className="text-[#71717a] text-sm max-w-xl mx-auto mb-10">
              RaidScout works with any game that has timed boss spawns, scheduled events, guild activities, loot drops, or gear progression.
              Select a game when creating your server and get pre-built templates — or start from scratch.
            </p>

            {/* Game Cards */}
            <div className="flex flex-wrap justify-center gap-4">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="group relative p-5 rounded-2xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.12] hover:bg-white/[0.02] hover:-translate-y-1 transition-all duration-300 text-center w-44"
                >
                  <div className="flex flex-col items-center gap-3">
                    {game.icon_url ? (
                      <img
                        src={game.icon_url}
                        alt={game.name}
                        className="w-12 h-12 rounded-xl object-cover ring-1 ring-white/[0.06] group-hover:ring-white/[0.15] transition-all"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center group-hover:border-white/[0.15] transition-all">
                        <Gamepad2 className="w-6 h-6 text-[#52525b] group-hover:text-[#a1a1aa] transition-colors" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-[#d4d4d8] group-hover:text-[#fafafa] transition-colors">
                        {game.name}
                      </p>
                      <p className="text-[10px] text-[#52525b] mt-0.5">
                        {(game.supported_spawn_types || []).length} spawn types
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Custom Game Card */}
              <div className="group relative p-5 rounded-2xl bg-[#18181b] border border-dashed border-white/[0.06] hover:border-white/[0.15] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300 text-center w-44">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.02] border border-dashed border-white/[0.08] flex items-center justify-center group-hover:border-white/[0.2] transition-all">
                    <Sparkles className="w-5 h-5 text-[#52525b] group-hover:text-[#a1a1aa] transition-colors" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#d4d4d8] group-hover:text-[#fafafa] transition-colors">
                      Custom Game
                    </p>
                    <p className="text-[10px] text-[#52525b] mt-0.5">
                      Start from scratch
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-[#52525b] mt-6 font-mono">
              Don't see your game? Create a server with "Custom Game" and add your own bosses & activities.
            </p>
          </div>
        </section>
      )}

      {/* ── Features Grid ── */}
      <section id="features" className="relative bg-[#09090b] px-6 py-24" style={{ scrollSnapAlign: "start" }}>
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
                      <p className="text-xs text-[#71717a]">Multi-game boss & activity tracking</p>
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

              {/* Gear & Equipment Tracking */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300">
                <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-2">Gear & Equipment</h3>
                <p className="text-xs text-[#fafafa]/80 leading-relaxed">Track every member's gear across all slots. Click-to-equip, enhancement badges, gear score summary.</p>
              </div>

              {/* Inventory & Loot */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300">
                <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                  <Archive className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-2">Inventory & Loot</h3>
                <p className="text-xs text-[#fafafa]/80 leading-relaxed">Full item catalog with rarity system. Track distributions, view recipient history, and analyze loot analytics.</p>
              </div>

              {/* DKP Auctions */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300">
                <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>
                </div>
                <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-2">DKP Auctions</h3>
                <p className="text-xs text-[#fafafa]/80 leading-relaxed">Live DKP bidding with auto-resolve, outbid refunds, soft-close, guild restrictions, and full auction history.</p>
              </div>

              {/* Member Profiles */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300 lg:col-span-2">
                <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                  <User className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-2">Member Profiles</h3>
                <p className="text-xs text-[#fafafa]/80 leading-relaxed">Per-member pages with CP trends, loot history, attendance stats, activity timeline, and equipped gear grid.</p>
              </div>

              {/* Viewer Mode (spans 2 cols on lg) */}
              <div className="group p-5 rounded-xl bg-[#18181b] border border-white/[0.04] hover:border-white/[0.10] hover:bg-white/[0.01] hover:-translate-y-1 transition-all duration-300 lg:col-span-2">
                <div className="p-2.5 rounded-xl bg-[#18181b] border border-[#27272a] text-[#a1a1aa] w-fit mb-4 group-hover:scale-110 transition-transform duration-200">
                  <Eye className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-sm text-[#fafafa] group-hover:text-[#fafafa] transition-colors mb-2">Viewer Mode</h3>
                <p className="text-xs text-[#fafafa]/80 leading-relaxed">Share a link so your members can watch timers. No account or login required.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Discord Bot Commands ── */}
      <section id="how-it-works" className="relative bg-[#09090b] px-6 py-24" style={{ scrollSnapAlign: "start" }}>
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
      <section id="guides" className="relative bg-[#09090b] px-4 py-24 flex items-center justify-center" style={{ scrollSnapAlign: "start" }}>
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

      {/* ── Pricing ── */}
      <section id="pricing" className="relative bg-[#09090b] px-6 py-24 overflow-hidden" style={{ scrollSnapAlign: "start" }}>
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-4xl mx-auto relative">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-6">
              <Shield className="w-3.5 h-3.5" /> SIMPLE PRICING
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#fafafa] mb-4">
              One price. Everything included.
              <div className="mx-auto mt-4 w-12 h-0.5 bg-emerald-400/30 rounded-full" />
            </h2>
            <p className="text-[#71717a] text-lg max-w-xl mx-auto">
              No plans, no tiers, no hidden fees. Every feature unlocked for every server.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-stretch">
            {/* Price Card */}
            <div className="relative rounded-2xl bg-[#0a0a0f] border border-[#27272a] p-8 flex flex-col group hover:border-emerald-500/20 transition-colors duration-300">
              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-[#52525b] text-lg">$</span>
                  <span className="text-5xl font-extrabold text-[#fafafa] tracking-tight">9.99</span>
                  <span className="text-[#52525b] text-lg">/ 30 days</span>
                </div>
                <p className="text-[#52525b] text-sm">That's just <span className="text-[#a1a1aa] font-medium">$0.33/day</span></p>
              </div>

              {/* What you get */}
              <div className="space-y-3 mb-8 flex-1">
                {[
                  "Unlimited bosses & activities",
                  "Multi-guild kill rotation tracking",
                  "AI-powered rally screenshot scanning",
                  "Live spawn timers & countdowns",
                  "Member management & attendance",
                  "Gear & combat power tracking",
                  "Leaderboards & analytics",
                  "Discord bot integration",
                  "Viewer/guest sharing links",
                ].map((feat) => (
                  <div key={feat} className="flex items-start gap-3">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-sm text-[#a1a1aa]">{feat}</span>
                  </div>
                ))}
              </div>

              {/* 7-day trial badge */}
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 mb-4">
                <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-sm text-emerald-300">Includes <span className="font-semibold">7-day free trial</span> — no card required</span>
              </div>

              <a href="#get-started"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm bg-[#fafafa] text-[#09090b] hover:bg-white transition-all duration-200 group/btn">
                Start Free Trial
                <span className="inline-block group-hover/btn:translate-x-0.5 transition-transform">→</span>
              </a>
            </div>

            {/* Value Props Card */}
            <div className="space-y-4">
              {/* No surprises */}
              <div className="rounded-2xl bg-[#0a0a0f] border border-[#27272a] p-6 hover:border-[#3f3f46] transition-colors duration-300">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h4 className="text-[#fafafa] font-semibold text-sm mb-1">Pay as you go</h4>
                    <p className="text-[#71717a] text-sm leading-relaxed">No auto-renewing subscriptions. Pay once, get 30 days. Days stack — extend anytime without losing your balance.</p>
                  </div>
                </div>
              </div>

              {/* Cancel anytime */}
              <div className="rounded-2xl bg-[#0a0a0f] border border-[#27272a] p-6 hover:border-[#3f3f46] transition-colors duration-300">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                    <Activity className="w-5 h-5 text-sky-400" />
                  </div>
                  <div>
                    <h4 className="text-[#fafafa] font-semibold text-sm mb-1">Runs itself</h4>
                    <p className="text-[#71717a] text-sm leading-relaxed">The Discord bot handles kill recording, spawn announcements, and member tracking automatically. Set it and forget it.</p>
                  </div>
                </div>
              </div>

              {/* Trust */}
              <div className="rounded-2xl bg-[#0a0a0f] border border-[#27272a] p-6 hover:border-[#3f3f46] transition-colors duration-300">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <h4 className="text-[#fafafa] font-semibold text-sm mb-1">Built for guilds, by guilds</h4>
                    <p className="text-[#71717a] text-sm leading-relaxed">Trusted by top MMO guilds. Every feature is built from real guild officer workflows — not guesses.</p>
                  </div>
                </div>
              </div>

              {/* Trial */}
              <div className="rounded-2xl bg-[#0a0a0f] border border-[#27272a] p-6 hover:border-[#3f3f46] transition-colors duration-300">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-[#fafafa] font-semibold text-sm mb-1">7-day free trial</h4>
                    <p className="text-[#71717a] text-sm leading-relaxed">No credit card required. Full access to every feature. Only pay when you're convinced it's right for your guild.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trust bar */}
          <div className="mt-14 flex flex-wrap items-center justify-center gap-6 text-[#3f3f46] text-xs">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" />
              <span>PayPal secure payments</span>
            </div>
            <span className="hidden sm:inline">·</span>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>No credit card for trial</span>
            </div>
            <span className="hidden sm:inline">·</span>
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" />
              <span>Cancel anytime — access stays until period ends</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Auth Section ── */}
      <section id="get-started" className="relative bg-[#09090b] px-6 py-24" style={{ scrollSnapAlign: "start" }}>
        <div className="max-w-md mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/20 text-emerald-400/60 text-xs font-medium mb-6 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{">>"}</span> GET STARTED
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#fafafa] mb-4 cyber-glow">
              Ready to start?
              <div className="mx-auto mt-4 w-12 h-0.5 bg-emerald-400/30 rounded-full" />
            </h2>
            <p className="text-emerald-400/50 text-sm font-mono">Create an account or view as guest.</p>
          </div>

          {/* Auth Card */}
          <div className="relative rounded-2xl bg-[#09090b] border border-[#27272a] p-6 shadow-2xl shadow-black/40 overflow-hidden">
            <div className="relative z-10">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Sign In / Sign Up tabs */}
                  <div className="flex bg-[#18181b] rounded-xl p-1 mb-2">
                    <button type="button" onClick={() => { setIsSignUp(false); setError(null); setSuccess(null); setResetSent(false); setAcceptedTerms(false); setConfirmPassword(""); }}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${!isSignUp ? "bg-white/[0.06] text-[#fafafa] shadow-sm" : "text-[#fafafa]/40 hover:text-[#fafafa]/70"}`}>Sign In</button>
                    <button type="button" onClick={() => { setIsSignUp(true); setError(null); setSuccess(null); setResetSent(false); setAcceptedTerms(false); setConfirmPassword(""); }}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${isSignUp ? "bg-white/[0.06] text-[#fafafa] shadow-sm" : "text-[#fafafa]/40 hover:text-[#fafafa]/70"}`}>Sign Up</button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-emerald-400/50 mb-2 ml-1 font-mono tracking-wider uppercase">{">>"} Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#fafafa]/30" />
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com"
                        className="w-full pl-10 pr-4 py-3 bg-[#18181b] border border-[#27272a] rounded-xl text-[#fafafa] placeholder-[#71717a] text-sm outline-none focus:border-[#52525b] transition" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-emerald-400/50 mb-2 ml-1 font-mono tracking-wider uppercase">{">>"} Password</label>
                    <div className="relative">
                      <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="••••••••"
                        className="w-full px-4 py-3 bg-[#18181b] border border-[#27272a] rounded-xl text-[#fafafa] placeholder-[#71717a] text-sm outline-none focus:border-[#52525b] transition pr-10" />
                      <button type="button" onClick={() => { setShowPassword(!showPassword); if (isSignUp) setShowConfirmPassword(!showPassword); }} className={`absolute right-3 top-1/2 -translate-y-1/2 transition ${showPassword ? "text-sky-400" : "text-[#fafafa]/25 hover:text-[#fafafa]/50"}`} tabIndex={-1}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {strengthLabel && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-300 ${
                            strengthLabel === "weak" ? "w-1/3 bg-red-500" :
                            strengthLabel === "medium" ? "w-2/3 bg-amber-500" :
                            "w-full bg-emerald-500"
                          }`} />
                        </div>
                        <span className={`text-[10px] font-mono uppercase tracking-wider ${
                          strengthLabel === "weak" ? "text-red-400" :
                          strengthLabel === "medium" ? "text-amber-400" :
                          "text-emerald-400"
                        }`}>{strengthLabel}</span>
                      </div>
                    )}
                  </div>
                  {isSignUp && (
                    <div>
                      <label className="block text-xs font-medium text-emerald-400/50 mb-2 ml-1 font-mono tracking-wider uppercase">{">>"} Confirm Password</label>
                      <div className="relative">
                        <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} placeholder="••••••••"
                          className={`w-full px-4 py-3 bg-[#18181b] border rounded-xl text-[#fafafa] placeholder-[#71717a] text-sm outline-none transition pr-10 ${
                            confirmPassword && password !== confirmPassword
                              ? "border-red-500/50 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
                              : confirmPassword && password === confirmPassword
                                ? "border-emerald-500/50 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
                                : "border-[#27272a] focus:border-[#52525b]"
                          }`} />
                        <button type="button" onClick={() => { setShowConfirmPassword(!showConfirmPassword); setShowPassword(!showConfirmPassword); }} className={`absolute right-3 top-1/2 -translate-y-1/2 transition ${showConfirmPassword ? "text-sky-400" : "text-[#fafafa]/25 hover:text-[#fafafa]/50"}`} tabIndex={-1}>
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {confirmPassword && password !== confirmPassword && (
                        <p className="text-[10px] text-red-400 mt-1 ml-1">Passwords do not match</p>
                      )}
                      {confirmPassword && password === confirmPassword && (
                        <p className="text-[10px] text-emerald-400 mt-1 ml-1">Passwords match ✓</p>
                      )}
                    </div>
                  )}
                  {!isSignUp && (
                    <div className="flex justify-end">
                      <Link to="/forgot-password" className="text-xs text-emerald-400/40 hover:text-emerald-400 transition font-mono">Forgot password?</Link>
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
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ Section ── */}
      <section id="faq" className="relative bg-[#09090b] px-6 py-24" style={{ scrollSnapAlign: "start" }}>
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
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-10 mb-16">
          <div>
            <h4 className="text-sm font-semibold text-[#fafafa] mb-5">Resources</h4>
            <div className="space-y-3 text-sm text-[#fafafa]/40">
              <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="block hover:text-[#fafafa] transition-colors">RaidScout Support</a>
              <Link to="/changelog" className="block hover:text-[#fafafa] transition-colors">Changelog</Link>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#fafafa] mb-5">Company</h4>
            <div className="space-y-3 text-sm text-[#fafafa]/40">
              <Link to="/terms" className="block hover:text-[#fafafa] transition-colors">Terms of Service</Link>
              <Link to="/privacy" className="block hover:text-[#fafafa] transition-colors">Privacy Policy</Link>
              <Link to="/refund" className="block hover:text-[#fafafa] transition-colors">Refund Policy</Link>
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
            <span className="text-sm">&copy; {new Date().toLocaleDateString("en-US", { timeZone: detectTimezone(), year: "numeric" })} RaidScout. All rights reserved.</span>
          </div>
          <span className="text-xs text-[#fafafa]/20 font-mono">v{formatVersionInTimezone(APP_VERSION, browserTz)}</span>
        </div>
      </footer>

      {/* Video Guides Modal */}
      {showVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => { setShowVideo(false); setActiveGuide(null); }} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[#27272a] shrink-0">
              <h3 className="text-sm font-medium text-[#fafafa] flex items-center gap-2">
                <Play className="w-4 h-4" fill="currentColor" />
                {activeGuide ? (GUIDES.find(g => g.id === activeGuide)?.title ?? "Watch Guide") : "RaidScout Video Guides"}
              </h3>
              <button
                onClick={() => { setShowVideo(false); setActiveGuide(null); }}
                className="p-1 text-[#71717a] hover:text-[#fafafa] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {activeGuide ? (
              <>
                <button
                  onClick={() => setActiveGuide(null)}
                  className="flex items-center gap-1 px-4 py-2 text-xs text-[#71717a] hover:text-[#fafafa] transition shrink-0"
                >
                  ← Back to guides
                </button>
                <div className="aspect-video">
                  <iframe
                    src={`https://www.youtube.com/embed/${activeGuide}?rel=0&autoplay=1`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="w-full h-full"
                    title="RaidScout Guide"
                  />
                </div>
                <div className="px-4 py-2 text-center">
                  <a
                    href={`https://www.youtube.com/watch?v=${activeGuide}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#71717a] hover:text-[#fafafa] transition underline underline-offset-2"
                  >
                    Open on YouTube ↗
                  </a>
                </div>
              </>
            ) : (
              <div className="p-4 space-y-3 overflow-y-auto">
                {GUIDES.map(guide => (
                  <button
                    key={guide.id}
                    onClick={() => setActiveGuide(guide.id)}
                    className="w-full flex items-start gap-4 p-3 rounded-lg bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] hover:bg-[#1f1f23] transition text-left group"
                  >
                    <div className="relative shrink-0 w-40 aspect-video rounded-md overflow-hidden bg-black">
                      <img
                        src={`https://img.youtube.com/vi/${guide.id}/mqdefault.jpg`}
                        alt={guide.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-black/70 flex items-center justify-center group-hover:bg-red-600 transition-colors">
                          <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-[#fafafa] group-hover:text-white transition-colors leading-snug">{guide.title}</h4>
                      <p className="text-xs text-[#71717a] mt-1 leading-relaxed line-clamp-2">{guide.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
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
      const t = setTimeout(() => setTyped(DEMO_CMD.slice(0, typed.length + 1)), 20 + Math.random() * 15);
      return () => clearTimeout(t);
    } else {
      setPhase("done");
    }
  }, [typed]);



  return (
    <div className="p-3 rounded-lg bg-[#18181b] border border-white/[0.03]">
      <span className="text-neutral-400 block font-bold tracking-wider text-[10px] uppercase mb-1">Command Input</span>
      <div className="flex items-center space-x-0.5 relative">
        <code className="text-emerald-400 font-mono font-bold text-sm block tracking-wide">
          {typed}
        </code>
        <span className={`w-1.5 h-4 ${phase === "typing" ? "bg-emerald-400 animate-pulse" : "bg-emerald-400"}`} />
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
              <span className="font-mono text-[11px] text-emerald-400 block font-bold tracking-tight">June 5, 2026 9:00 PM</span>
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
        className={`text-emerald-400 font-mono font-bold text-sm block tracking-wide cursor-pointer select-all hover:brightness-125 transition-all ${className}`}
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
  { cmd: "!nextspawn Arcane", desc: "List spawns for a specific guild", detail: "See all upcoming bosses owned by a guild" },
  { cmd: "!killed Venatus", desc: "Record a boss kill right now", detail: "Same as 'Mark Died' — advances rotation" },
  { cmd: "!forcespawnall", desc: "Force-spawn ALL fixed-timer bosses", detail: "Bulk spawn after maintenance. Schedule bosses unaffected." },
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
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Only animate when section is visible in the viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      setIsVisible(entry.isIntersecting);
    }, { threshold: 0.1, rootMargin: "0px 0px 100px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Type current command character by character — only when visible
  useEffect(() => {
    if (!isVisible) return;
    if (typingIndex >= TERMINAL_COMMANDS.length) {
      return; // Done — no loop, animate once per page load
    }
    
    const cmd = TERMINAL_COMMANDS[typingIndex].cmd;
    if (charIndex < cmd.length) {
      const delay = 10 + Math.random() * 15;
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
  }, [typingIndex, charIndex, loopKey, isVisible]);

  return (
    <div ref={containerRef} className="bg-[#18181b] divide-y divide-white/[0.03] min-h-[80px]">
      {!isVisible && (
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
    <section className="max-w-6xl mx-auto px-6 pb-24 overflow-hidden" style={{ scrollSnapAlign: "start" }}>
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
