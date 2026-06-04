import { useState, useEffect } from "react";
import { Wrench, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export function MaintenancePage() {
  const { user } = useAuth();
  const [endTime, setEndTime] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("app_settings").select("value")
      .eq("key", "maintenance_end").maybeSingle()
      .then(({ data }) => {
        if (data) setEndTime(new Date((data as any).value).toLocaleString(undefined, {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        }));
      }, () => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      // Check if user is admin — only admins can bypass maintenance
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
      if ((roleData as any)?.role !== "admin") {
        setError("Only administrators can access the site during maintenance.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }
      window.location.href = "/";
    } catch { setError("Login failed."); setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="text-center max-w-md space-y-6">
        <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-2xl bg-[#18181b] border border-[#27272a]">
          <Wrench className="w-8 h-8 text-amber-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-[#fafafa]">Under Maintenance</h1>
          <p className="text-[#a1a1aa] leading-relaxed">
            RaidScout is currently undergoing scheduled maintenance. The web app
            and Discord bot will be temporarily unavailable.
          </p>
          {endTime ? (
            <p className="text-sm text-[#71717a]">
              Expected to be back by{" "}
              <span className="text-[#fafafa] font-medium">{endTime}</span>
            </p>
          ) : (
            <p className="text-sm text-[#71717a]">
              We will be back shortly. Your data, guilds, and leaderboards are safe.
            </p>
          )}
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs text-[#52525b]">Maintenance in progress</span>
        </div>

        {!user && (
          !showLogin ? (
            <button onClick={() => setShowLogin(true)} className="text-xs text-[#52525b] hover:text-[#a1a1aa] transition flex items-center gap-1 mx-auto">
              <LogIn className="w-3 h-3" />Admin access
            </button>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3 pt-2 max-w-xs mx-auto">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder-[#52525b] outline-none focus:border-[#52525b] transition" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder-[#52525b] outline-none focus:border-[#52525b] transition" />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button type="submit" disabled={loading || !email || !password}
                className="w-full py-2 rounded-lg text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#d4d4d8] transition disabled:opacity-50">
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )
        )}

        <p className="text-xs text-[#52525b] pt-4">RaidScout v0.13.25</p>
      </div>
    </div>
  );
}