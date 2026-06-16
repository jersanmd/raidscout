import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Mail, Loader2, CheckCircle } from "lucide-react";

const COOLDOWN_SECONDS = 300; // 5 minutes
const COOLDOWN_KEY = "raidscout-pw-reset-cooldown";

function getCooldownRemaining(): number {
  const expiry = localStorage.getItem(COOLDOWN_KEY);
  if (!expiry) return 0;
  const remaining = Math.ceil((parseInt(expiry) - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(getCooldownRemaining);
  const [error, setError] = useState<string | null>(null);

  // Restore sent state if cooldown is active on mount
  useEffect(() => {
    if (cooldown > 0) setSent(true);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      localStorage.removeItem(COOLDOWN_KEY);
      return;
    }
    const timer = setInterval(() => {
      setCooldown(getCooldownRemaining());
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || cooldown > 0) return;
    setError(null);
    setLoading(true);

    const { error: err } = await supabase.functions.invoke("send-password-reset", {
      body: { email: email.trim() },
    });

    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setSent(true);
      localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_SECONDS * 1000));
      setCooldown(COOLDOWN_SECONDS);
    }
  };

  const formatCooldown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#a1a1aa] hover:text-[#fafafa] mb-8 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to RaidScout
        </Link>

        <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-6 sm:p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10">
                <CheckCircle className="w-7 h-7 text-emerald-400" />
              </div>
              <h1 className="text-xl font-bold text-[#fafafa]">Check your email</h1>
              <p className="text-sm text-[#a1a1aa] leading-relaxed">
                We sent a password reset link to <strong className="text-[#d4d4d8]">{email}</strong>.
                Click the link in the email to set a new password.
              </p>
              <p className="text-xs text-[#71717a]">
                {cooldown > 0 ? (
                  <>Resend available in <span className="text-[#a1a1aa] font-mono">{formatCooldown(cooldown)}</span></>
                ) : (
                  <>Didn't receive it? Check spam or{" "}
                  <button
                    onClick={() => setSent(false)}
                    className="text-[#a1a1aa] hover:text-[#fafafa] underline underline-offset-2 transition"
                  >
                    try again
                  </button></>
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-xl font-bold text-[#fafafa]">Reset your password</h1>
                <p className="text-sm text-[#a1a1aa] mt-1.5">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#a1a1aa] mb-1.5 ml-1">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52525b]" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className="w-full pl-10 pr-4 py-3 bg-[#09090b] border border-[#27272a] rounded-xl text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition"
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim() || cooldown > 0}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-40"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : cooldown > 0 ? (
                    formatCooldown(cooldown)
                  ) : (
                    <><Mail className="w-4 h-4" />Send Reset Link</>
                  )}
                </button>

                <p className="text-center text-xs text-[#71717a]">
                  Remember your password?{" "}
                  <Link to="/#get-started" className="text-[#a1a1aa] hover:text-[#fafafa] underline underline-offset-2 transition">
                    Sign in
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
