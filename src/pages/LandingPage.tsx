import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { SEOHead } from "@/components/SEOHead";
import { version } from "../../package.json";
import {
  Timer, Shield, BarChart3, Sparkles, MessageSquare, Calendar, Skull, Eye, Trophy,
  LogIn, UserPlus, Mail, CheckCircle, AlertTriangle, Key, ChevronDown, Bot
} from "lucide-react";

const features = [
  { icon: <Timer className="w-6 h-6" />, color: "border-amber-500/30 bg-amber-500/5", title: "Live Countdown Timers", desc: "39+ bosses with real-time countdowns. Know exactly when each spawns — no guessing." },
  { icon: <Shield className="w-6 h-6" />, color: "border-blue-500/30 bg-blue-500/5", title: "Multi-Guild Rotation", desc: "Assign bosses to guilds. Per-kill or daily rotation. Weighted turns — Guild A gets 2, Guild B gets 1." },
  { icon: <BarChart3 className="w-6 h-6" />, color: "border-purple-500/30 bg-purple-500/5", title: "Leaderboard & Points", desc: "Configurable points per boss. Weekly, monthly, and all-time rankings. Finalize and snapshot results." },
  { icon: <Sparkles className="w-6 h-6" />, color: "border-violet-500/30 bg-violet-500/5", title: "AI Rally Scanning", desc: "Upload a rally screenshot and AI auto-detects player names. No manual typing." },
  { icon: <MessageSquare className="w-6 h-6" />, color: "border-emerald-500/30 bg-emerald-500/5", title: "Discord Alerts", desc: "Auto-post boss deaths and spawns to your Discord server per guild. @everyone pings and rich embeds included." },
  { icon: <Calendar className="w-6 h-6" />, color: "border-cyan-500/30 bg-cyan-500/5", title: "Weekly Schedule", desc: "Full week grid. See which guild owns which boss on every day. Click to manage." },
  { icon: <Skull className="w-6 h-6" />, color: "border-red-500/30 bg-red-500/5", title: "Death History", desc: "Complete kill log with guild badges. Attendance tracking per kill. Edit or delete entries." },
  { icon: <Bot className="w-6 h-6" />, color: "border-indigo-500/30 bg-indigo-500/5", title: "Discord Bot Commands", desc: "Manage bosses from Discord: !spawn, !kill, !list, !commands. Record kills and check timers without opening the website." },
  { icon: <Eye className="w-6 h-6" />, color: "border-orange-500/30 bg-orange-500/5", title: "Viewer Mode", desc: "Share a link so members can watch timers without an account. Read-only, always free." },
];

export function LandingPage() {
  const { signIn, signUp, viewerSignIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const [viewerMode, setViewerMode] = useState(false);
  const [viewerKey, setViewerKey] = useState("");

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
        title="RaidScout — Boss Spawn Timer & Hunt Scheduler"
        description="Track 39+ boss spawns, rotate multi-guild kills, scan rallies with AI, and compete on leaderboards. Forever free."
        canonicalUrl="/"
      />

      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "RaidScout",
          description: "Track 39+ boss spawns, rotate multi-guild kills, scan rallies with AI, and compete on leaderboards. Forever free.",
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
      <section className="relative px-6 pt-24 pb-16 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-950/20 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-72 h-72 rounded-full bg-red-500/5 blur-3xl animate-pulse" />
        <div className="absolute bottom-10 right-1/4 w-56 h-56 rounded-full bg-amber-500/5 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

        <div className="relative z-10 max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img src="/logo.png" alt="" className="w-12 h-12 rounded-xl hover:scale-110 transition-transform duration-300" />
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight animate-[fadeInUp_0.6s_ease-out]">
            Your Boss Timer,{" "}
            <span className="bg-gradient-to-r from-red-400 via-orange-400 to-red-400 bg-[length:200%_auto] animate-gradient bg-clip-text text-transparent">
              Supercharged
            </span>
          </h1>
          <p className="text-lg text-slate-400 max-w-xl mx-auto animate-[fadeInUp_0.6s_ease-out_0.2s_both]">
            Track spawns, rotate guilds, scan rallies with AI, and dominate the leaderboard — all in one place.{" "}
            <span className="text-emerald-400 font-semibold">Forever free.</span>
          </p>
          <div className="flex items-center justify-center gap-3 pt-2 animate-[fadeInUp_0.6s_ease-out_0.4s_both]">
            <button
              onClick={() => document.getElementById("get-started")?.scrollIntoView({ behavior: "smooth" })}
              className="group px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-500 hover:to-orange-400 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg shadow-red-900/30"
            >
              Get Started
              <span className="inline-block ml-1 group-hover:translate-x-0.5 transition-transform">→</span>
            </button>
            <button
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="px-6 py-3 rounded-xl font-semibold border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white hover:scale-105 active:scale-95 transition-all duration-200"
            >
              See Features
            </button>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-3 gap-4 text-center">
          {[{ value: "39+", label: "Bosses Tracked" }, { value: "24/7", label: "Live Timers" }, { value: "Free", label: "Forever" }].map((s, i) => (
            <div key={s.label} className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:scale-105 transition-all duration-300" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="text-2xl font-bold bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">{s.value}</div>
              <div className="text-xs text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="features" className="max-w-5xl mx-auto px-6 pb-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">Everything You Need</h2>
          <p className="text-slate-400 mt-2">Built for guilds running multi-party boss rotations.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <div key={f.title} className={`p-5 rounded-xl border ${f.color} hover:border-slate-500 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 group`} style={{ animationDelay: `${i * 0.05}s` }}>
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
          <p className="text-slate-400 mt-2 text-sm">Invite the bot to your server. Run commands in any channel.</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="divide-y divide-slate-800">
            {[
              { cmd: "!spawn", desc: "List boss spawns in the next 24 hours", detail: "Shows spawn time, countdown, and owner guild for every boss" },
              { cmd: "!spawn Venatus", desc: "Check spawn for a specific boss", detail: "Filter by boss name to see just that boss's timer" },
              { cmd: "!kill Venatus", desc: "Record a boss kill right now", detail: "Same as \"Mark Died\" on the website — advances rotation" },
              { cmd: "!kill Venatus 23:59", desc: "Record a kill at a custom time (yesterday by default)", detail: "Add `today` if the kill just happened" },
              { cmd: "!list", desc: "See all boss names", detail: "Numbered list with respawn hours and spawn type" },
              { cmd: "!commands", desc: "Show all available commands", detail: "Quick reference for your members" },
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
      </section>

      {/* ── Screenshot Showcase ── */}
      <ScreenshotShowcase />

      {/* ── Auth Section ── */}
      <section id="get-started" className="max-w-md mx-auto px-6 pb-24">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold">Ready to start?</h2>
          <p className="text-slate-400 text-sm mt-1">Create an account or view as guest.</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl hover:shadow-red-900/5 transition-shadow duration-500">
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
                  <input type="text" value={viewerKey} onChange={e => setViewerKey(e.target.value)} required placeholder="Paste your viewer key..." className="w-full pl-10 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition font-mono text-sm" />
                </div>
              </div>
              <p className="text-xs text-slate-500">Get this from your server owner. No account needed.</p>
              {error && <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>}
              <button type="submit" disabled={loading || !viewerKey.trim()} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium bg-gradient-to-r from-emerald-600 to-green-500 text-white hover:from-emerald-500 hover:to-green-400 disabled:opacity-50 transition">
                {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Eye className="w-4 h-4" />} View Server
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex bg-slate-800 rounded-lg p-0.5 mb-2">
                <button type="button" onClick={() => { setIsSignUp(false); setError(null); setSuccess(null); setResetSent(false); }} className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${!isSignUp ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}>Sign In</button>
                <button type="button" onClick={() => { setIsSignUp(true); setError(null); setSuccess(null); setResetSent(false); }} className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${isSignUp ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}>Sign Up</button>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" className="w-full pl-10 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition" />
              </div>
              {!isSignUp && (
                <div className="flex justify-end">
                  <button type="button" onClick={handleForgotPassword} disabled={loading} className="text-xs text-slate-500 hover:text-red-400 transition">Forgot password?</button>
                </div>
              )}
              {resetSent && !isSignUp && <div className="flex items-start gap-2 text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2"><CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>Reset link sent! Check your email.</span></div>}
              {success && <div className="flex items-start gap-2 text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2"><CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{success}</span></div>}
              {error && !resetSent && !success && <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>}
              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-500 hover:to-orange-400 disabled:opacity-50 transition shadow-lg shadow-red-900/20">
                {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                {isSignUp ? "Create Account" : "Sign In"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-4">
            <span>© 2026 RaidScout</span>
            <span>v{version}</span>
            <Link to="/terms" className="hover:text-slate-400 transition">Terms</Link>
            <Link to="/privacy" className="hover:text-slate-400 transition">Privacy</Link>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-indigo-400 transition">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
              Discord
            </a>
            <a href="https://www.facebook.com/profile.php?id=61590144185090" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-blue-400 transition">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Facebook
            </a>
          </div>
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
            className={`w-2 h-2 rounded-full transition-all duration-300 ${i === active ? "bg-red-400 w-6" : "bg-slate-700 hover:bg-slate-500"}`}
          />
        ))}
      </div>
    </section>
  );
}
