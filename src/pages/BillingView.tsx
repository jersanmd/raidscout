import { useState } from "react";
import { Link } from "react-router-dom";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { PayPalSubscribeButton } from "@/components/PayPalSubscribeButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Clock, Shield, AlertTriangle, Loader2, ExternalLink, Zap, Users, Bell, Eye, BarChart3, Skull, Calendar, Trophy, Settings, MessageCircle, Globe, Activity } from "lucide-react";

const FEATURES = [
  { icon: Skull, label: "Boss Kill Recording" },
  { icon: Clock, label: "Live Spawn Timers" },
  { icon: Bell, label: "Discord Notifications" },
  { icon: Calendar, label: "Weekly Schedule View" },
  { icon: Trophy, label: "Leaderboards & Rankings" },
  { icon: BarChart3, label: "Kill History & Analytics" },
  { icon: Users, label: "Member Management" },
  { icon: Activity, label: "Activity Tracking" },
  { icon: Settings, label: "Guild & Rotation Config" },
  { icon: MessageCircle, label: "Discord Bot Integration" },
  { icon: Eye, label: "Viewer Guest Sharing" },
  { icon: Globe, label: "Multi-Game Support" },
];

export function BillingView() {
  const { currentServer } = useServer();
  const { user, isViewer } = useAuth();
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  if (!currentServer || isViewer) return null;

  const isOwner = currentServer.role === "owner";
  const now = new Date();
  const trialEnd = currentServer.trial_ends_at ? new Date(currentServer.trial_ends_at) : null;
  const subEnd = currentServer.subscription_ends_at ? new Date(currentServer.subscription_ends_at) : null;

  const trialDaysLeft = trialEnd && trialEnd > now ? Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000) : 0;
  const subDaysLeft = subEnd && subEnd > now ? Math.ceil((subEnd.getTime() - now.getTime()) / 86400000) : 0;
  const isSubActive = subDaysLeft > 0;
  const isTrialActive = !isSubActive && trialDaysLeft > 0;
  const isExpired = !isSubActive && !isTrialActive;
  const state = isSubActive ? "active" : isTrialActive ? "trial" : "expired";

  const stateConfig = {
    active:   { cardBg: "bg-white border-emerald-200", iconBg: "bg-emerald-100", iconColor: "text-emerald-600", accent: "text-emerald-700", muted: "text-emerald-500", badge: "bg-emerald-100 text-emerald-700", icon: Zap, days: subDaysLeft, date: subEnd, label: "Active until", statusLabel: "Pro" },
    trial:    { cardBg: "bg-white border-amber-200", iconBg: "bg-amber-100", iconColor: "text-amber-600", accent: "text-amber-700", muted: "text-amber-500", badge: "bg-amber-100 text-amber-700", icon: Clock, days: trialDaysLeft, date: trialEnd, label: "Trial ends", statusLabel: "Free Trial" },
    expired:  { cardBg: "bg-white border-red-200", iconBg: "bg-red-100", iconColor: "text-red-600", accent: "text-red-700", muted: "text-red-500", badge: "bg-red-100 text-red-700", icon: AlertTriangle, days: 0, date: subEnd, label: "Expired on", statusLabel: "Expired" },
  }[state];

  const StatusIcon = stateConfig.icon;

  const handleCancel = async () => {
    setCancelConfirm(false);
    setCancelling(true);
    try {
      const { data: srv } = await supabase.from("servers").select("paypal_subscription_id").eq("id", currentServer.id).single();
      if (!srv?.paypal_subscription_id) { toast("error", "No PayPal subscription found."); return; }
      const { error } = await supabase.functions.invoke("cancel-subscription", { body: { server_id: currentServer.id } });
      if (error) throw error;
      toast("success", "Subscription cancelled. Access remains until period ends.");
    } catch (err: any) {
      toast("error", err?.message || "Failed to cancel.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Link to="/server-settings" className="p-1.5 -ml-1.5 text-[#71717a] hover:text-[#fafafa] transition rounded-md">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-semibold text-[#fafafa]">Billing &amp; Plan</h1>
      </div>

      {/* ── Plan Status ── */}
      <div className={`rounded-2xl border ${stateConfig.cardBg} p-6 shadow-sm`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${stateConfig.iconBg}`}>
              <StatusIcon className={`w-7 h-7 ${stateConfig.iconColor}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${stateConfig.badge}`}>
                  {stateConfig.statusLabel}
                </span>
                {isSubActive && <span className="text-xs text-[#6b7280]">$9.99/month</span>}
              </div>
              <p className="text-xs text-[#6b7280]">
                {stateConfig.date
                  ? `${stateConfig.label} ${stateConfig.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                  : stateConfig.label}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-3xl font-bold tabular-nums ${stateConfig.accent}`}>
              {stateConfig.days}
            </p>
            <p className={`text-xs font-medium ${stateConfig.muted}`}>
              {state === "expired" ? "days ago" : `day${stateConfig.days !== 1 ? "s" : ""} left`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Payment ── */}
      <div className="space-y-4">
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 space-y-4 shadow-sm">
          <h3 className="text-sm font-semibold text-[#111827] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#6b7280]" />
            {isOwner ? "Payment" : "Information"}
          </h3>

          {isOwner ? (
            isSubActive ? (
              <div className="space-y-2">
                <a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between w-full px-4 py-3 rounded-lg bg-[#f3f4f6] hover:bg-[#e5e7eb] transition group">
                  <span className="text-sm text-[#111827]">Manage in PayPal</span>
                  <ExternalLink className="w-4 h-4 text-[#9ca3af] group-hover:text-[#6b7280]" />
                </a>
                <button onClick={() => setCancelConfirm(true)} disabled={cancelling}
                  className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-red-200 hover:bg-red-50 transition disabled:opacity-50 text-sm text-red-600">
                  {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                  {cancelling ? "Cancelling..." : "Cancel Subscription"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-center space-y-1">
                  <p className="text-2xl font-bold text-[#111827]">$9.99<span className="text-sm text-[#6b7280] font-normal">/month</span></p>
                  <p className="text-xs text-[#6b7280]">{isTrialActive ? "Subscribe now to keep your server running" : "Restore full access to your server"}</p>
                </div>
                <div className="flex justify-center">
                  <PayPalSubscribeButton serverId={currentServer.id} onSuccess={() => toast("success", "Payment successful!")} />
                </div>
              </div>
            )
          ) : (
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-[#6b7280] mt-0.5 shrink-0" />
              <p className="text-xs text-[#6b7280]">Only the server owner can manage billing and subscriptions.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── All Features ── */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[#111827] flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#6b7280]" />
          All RaidScout Features
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {FEATURES.map((f) => (
            <div key={f.label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#f9fafb] border border-[#e5e7eb]">
              <f.icon className="w-3.5 h-3.5 text-[#6b7280] shrink-0" />
              <span className="text-xs text-[#374151]">{f.label}</span>
            </div>
          ))}
        </div>
        {isExpired && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-red-700 font-medium">These features are currently locked</p>
              <p className="text-[11px] text-red-500 mt-0.5">Subscribe to restore full access to all features.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer note ── */}
      <p className="text-center text-[11px] text-[#52525b]">
        Payments are processed securely by PayPal. Your subscription will expire after 30 days unless renewed.
      </p>

      <ConfirmDialog
        open={cancelConfirm}
        title="Cancel Subscription"
        message="Your server will retain full access until the current billing period ends. No refunds for partial periods."
        confirmLabel="Cancel Subscription"
        variant="danger"
        loading={cancelling}
        onConfirm={handleCancel}
        onCancel={() => setCancelConfirm(false)}
      />
    </div>
  );
}
