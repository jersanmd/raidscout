import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Key } from "lucide-react";

export function ChangePasswordSection() {
  const { changePassword } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChangePassword = async () => {
    setMessage(null);
    if (!oldPassword) return setMessage({ type: "error", text: "Please enter your current password." });
    if (newPassword.length < 6) return setMessage({ type: "error", text: "New password must be at least 6 characters." });
    if (newPassword !== confirmPassword) return setMessage({ type: "error", text: "New passwords do not match." });
    if (oldPassword === newPassword) return setMessage({ type: "error", text: "New password must be different from your current password." });

    setSaving(true);
    const { error } = await changePassword(newPassword);
    setSaving(false);

    if (error) {
      setMessage({ type: "error", text: error });
    } else {
      setMessage({ type: "success", text: "Password changed successfully!" });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[#fafafa]">Change Password</h3>
        <p className="text-xs text-[#71717a]">Update your account password. You'll stay logged in after changing it.</p>

        {message && (
          <div className={`text-xs px-3 py-2 rounded-lg ${message.type === "success" ? "bg-emerald-900/20 border border-emerald-800/30 text-emerald-300" : "bg-red-900/20 border border-red-800/30 text-red-300"}`}>
            {message.text}
          </div>
        )}

        <div className="space-y-2.5">
          <div>
            <label className="text-[11px] font-medium text-[#a1a1aa] block mb-1">Current Password</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#a1a1aa] block mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#a1a1aa] block mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition"
            />
          </div>
        </div>

        <button
          onClick={handleChangePassword}
          disabled={saving || !oldPassword || !newPassword || !confirmPassword}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
          {saving ? "Changing..." : "Change Password"}
        </button>
      </section>
    </div>
  );
}
