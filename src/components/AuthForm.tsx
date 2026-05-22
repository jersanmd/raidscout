import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { LogIn, UserPlus, Mail, CheckCircle, AlertTriangle, Timer, Users, BarChart3, MessageSquare, Eye, Key } from "lucide-react";

export function AuthForm() {
  const { signIn, signUp, viewerSignIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Viewer mode
  const [viewerMode, setViewerMode] = useState(false);
  const [viewerKey, setViewerKey] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const { error: err } = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);

    if (err) {
      setError(err);
    } else if (isSignUp) {
      setSuccess(
        "Account created! Please check your email for a verification link. After verifying, you can sign in."
      );
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/",
    });
    if (err) {
      setError(err.message);
    } else {
      setResetSent(true);
    }
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
    <div className="min-h-screen flex justify-center bg-slate-950 relative overflow-hidden">
      {/* ── Full-screen gradient background ── */}
      <div className="hidden lg:block absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-red-950/20">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-red-500 blur-3xl" />
          <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full bg-amber-500 blur-3xl" />
        </div>
      </div>

      <div className="flex w-full max-w-[90rem] relative z-10">
      {/* ── Left: Hero / Features ── */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center p-12">

        <div className="relative space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="w-10 h-10 rounded-lg" />
            <div>
              <h1 className="text-2xl font-bold text-white">RaidScout</h1>
              <p className="text-xs text-slate-500">Your LordNine Companion</p>
            </div>
          </div>

          {/* Tagline */}
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-white leading-tight">
              Hunt smarter,<br />
              <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
                together.
              </span>
            </h2>
            <p className="text-slate-400 text-sm max-w-md">
              Know exactly when bosses spawn, split loot fairly, and keep your guild on top — <span className="text-emerald-400 font-medium">forever free</span>.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-4 pt-4">
            <Feature icon={<Timer className="w-5 h-5" />} color="text-amber-400" bg="bg-amber-900/20 border-amber-800/30" title="Live Spawn Timers" desc="See exactly when each boss spawns. No more guessing or camping." />
            <Feature icon={<Users className="w-5 h-5" />} color="text-blue-400" bg="bg-blue-900/20 border-blue-800/30" title="Fair Guild Rotation" desc="Rotate boss ownership between guilds. Everyone gets their fair share." />
            <Feature icon={<BarChart3 className="w-5 h-5" />} color="text-purple-400" bg="bg-purple-900/20 border-purple-800/30" title="Member Stats" desc="Track who shows up. Celebrate your top performers." />
            <Feature icon={<MessageSquare className="w-5 h-5" />} color="text-emerald-400" bg="bg-emerald-900/20 border-emerald-800/30" title="Discord Alerts" desc="Let Discord notify your team. No need to keep checking the site." />
          </div>
        </div>

        {/* Bottom links */}
        <div className="relative flex items-center gap-4 text-xs text-slate-600 mt-12">
          <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition">Discord Community</a>
          <span className="text-slate-800">|</span>
          <a href="https://www.facebook.com/profile.php?id=61590144185090" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition">Facebook Page</a>
          <span className="text-slate-800">|</span>
          <span>© 2026 RaidScout</span>
        </div>
      </div>

      {/* ── Right: Login Form ── */}
      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        <div className="w-full max-w-sm">
          {/* Mobile logo (hidden on desktop) */}
          <div className="text-center mb-8 lg:hidden">
            <img src="/logo.png" alt="RaidScout" className="w-14 h-14 mx-auto rounded-xl mb-3" />
            <h1 className="text-2xl font-bold text-white">RaidScout</h1>
            <p className="text-slate-400 text-sm mt-1">Your LordNine Companion · <span className="text-emerald-400 font-medium">Free</span></p>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white">
              {viewerMode ? "Watch a Server" : isSignUp ? "Join RaidScout" : "Welcome back!"}
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {viewerMode ? "Paste a viewer key from your server owner. No account needed." : isSignUp ? "Start tracking in seconds." : "Pick up where you left off."}
            </p>
          </div>

          {/* Account / Viewer toggle */}
          <div className="flex bg-slate-800 rounded-lg p-0.5 mb-4">
            <button
              type="button"
              onClick={() => { setViewerMode(false); setError(null); }}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${!viewerMode ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              Account
            </button>
            <button
              type="button"
              onClick={() => { setViewerMode(true); setError(null); }}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${viewerMode ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              <Eye className="w-3 h-3 inline mr-1" />
              View as Guest
            </button>
          </div>

          {viewerMode ? (
            /* ── Viewer Key Form ── */
            <form onSubmit={handleViewerSignIn} className="space-y-4">
              <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Viewer Key</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={viewerKey}
                  onChange={(e) => setViewerKey(e.target.value)}
                  required
                  placeholder="Paste your viewer key..."
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition font-mono text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Get this from your server owner. Lets you watch boss spawns and activity without an account.
              </p>

              {error && (
                <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !viewerKey.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium bg-gradient-to-r from-emerald-600 to-green-500 text-white hover:from-emerald-500 hover:to-green-400 disabled:opacity-50 transition shadow-lg shadow-emerald-900/20"
              >
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                View Server
              </button>
            </form>
          ) : (
            /* ── Account Form ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
              />
            </div>

            {!isSignUp && (
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-xs text-slate-500 hover:text-red-400 transition disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {resetSent && !isSignUp && (
              <div className="flex items-start gap-2 text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>Password reset link sent! Check your email.</p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2 text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>{success}</p>
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(false); setSuccess(null); }}
                    className="text-emerald-300 hover:text-emerald-200 font-medium transition underline"
                  >
                    Go to Sign In
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-500 hover:to-orange-400 disabled:opacity-50 transition shadow-lg shadow-red-900/20"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isSignUp ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {isSignUp ? "Create Account" : "Sign In"}
            </button>
          </form>
          )}

          {!viewerMode && (
          <p className="text-center text-slate-400 text-sm mt-6">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setSuccess(null);
              }}
              className="text-red-400 hover:text-red-300 font-medium transition"
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </p>
          )}

          <p className="text-center text-xs text-slate-600 mt-4">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="hover:text-slate-400 transition">Terms of Service</Link>
            {" "}&{" "}
            <Link to="/privacy" className="hover:text-slate-400 transition">Privacy Policy</Link>
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

function Feature({ icon, color, bg, title, desc }: {
  icon: React.ReactNode;
  color: string;
  bg: string;
  title: string;
  desc: string;
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${bg}`}>
      <div className={`shrink-0 ${color}`}>{icon}</div>
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
