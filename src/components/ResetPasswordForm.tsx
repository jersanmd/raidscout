import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Lock, Loader2, CheckCircle, AlertTriangle, ArrowLeft } from "lucide-react";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-orange-500 mb-4">
            <Lock className="w-6 h-6 text-[#fafafa]" />
          </div>
          <h1 className="text-2xl font-bold text-[#fafafa]">Set New Password</h1>
          <p className="text-slate-400 text-sm mt-1">Choose a new password for your RaidScout account.</p>
        </div>

        {success ? (
          <div className="space-y-4 text-center">
            <div className="flex items-start gap-2 text-emerald-400 text-sm bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-3">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="font-medium">Password updated successfully!</p>
                <p className="text-emerald-500 text-xs mt-1">You can now sign in with your new password.</p>
              </div>
            </div>
            <button
              onClick={() => window.location.href = "/"}
              className="w-full py-2.5 rounded-lg font-medium bg-gradient-to-r from-red-600 to-orange-500 text-[#fafafa] hover:from-red-500 hover:to-orange-400 transition"
            >
              Go to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                autoFocus
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-[#fafafa] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium bg-gradient-to-r from-red-600 to-orange-500 text-[#fafafa] hover:from-red-500 hover:to-orange-400 disabled:opacity-50 transition shadow-lg shadow-red-900/20"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              Update Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
