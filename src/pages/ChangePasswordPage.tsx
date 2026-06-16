import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Lock, Loader2, CheckCircle, ArrowRight, Eye, EyeOff } from "lucide-react";

export function ChangePasswordPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Only accessible when coming from a password reset link (user has a recovery session)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // No session — redirect to forgot password
      navigate("/forgot-password", { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#71717a] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-6 sm:p-8">
          {success ? (
            <div className="text-center space-y-5">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10">
                <CheckCircle className="w-7 h-7 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#fafafa]">Password changed!</h1>
                <p className="text-sm text-[#a1a1aa] mt-1.5">
                  Your password has been updated successfully.
                </p>
              </div>
              <button
                onClick={() => navigate("/", { replace: true })}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition"
              >
                Go to RaidScout
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#27272a] mb-3">
                  <Lock className="w-5 h-5 text-[#a1a1aa]" />
                </div>
                <h1 className="text-xl font-bold text-[#fafafa]">Set new password</h1>
                <p className="text-sm text-[#a1a1aa] mt-1.5">
                  Enter a new password for {user?.email ? <strong className="text-[#d4d4d8]">{user.email}</strong> : "your account"}.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#a1a1aa] mb-1.5 ml-1">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      placeholder="At least 6 characters"
                      className="w-full px-4 py-3 bg-[#09090b] border border-[#27272a] rounded-xl text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525b] hover:text-[#a1a1aa] transition"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#a1a1aa] mb-1.5 ml-1">
                    Confirm New Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Re-enter new password"
                    className={`w-full px-4 py-3 bg-[#09090b] border rounded-xl text-sm text-[#fafafa] placeholder-[#71717a] outline-none transition ${
                      confirm && password !== confirm
                        ? "border-red-500/50 focus:border-red-500/50"
                        : confirm && password === confirm
                          ? "border-emerald-500/50 focus:border-emerald-500/50"
                          : "border-[#27272a] focus:border-[#52525b]"
                    }`}
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={saving || password.length < 6 || password !== confirm}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-40"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  {saving ? "Updating..." : "Set New Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
