import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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
    active:   { cardBg: "bg-white border-emerald-200", iconBg: "bg-emerald-50", iconColor: "text-emerald-500", accent: "text-emerald-600", muted: "text-emerald-400", badge: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-100", bar: "bg-emerald-500", icon: Zap, days: subDaysLeft, date: subEnd, label: "Active until", statusLabel: "Pro Plan" },
    trial:    { cardBg: "bg-white border-gray-300", iconBg: "bg-gray-100", iconColor: "text-gray-700", accent: "text-gray-800", muted: "text-gray-400", badge: "bg-gray-900 text-white", ring: "ring-gray-200", bar: "bg-gray-800", icon: Clock, days: trialDaysLeft, date: trialEnd, label: "Trial ends", statusLabel: "Free Trial" },
    expired:  { cardBg: "bg-white border-red-200", iconBg: "bg-red-50", iconColor: "text-red-500", accent: "text-red-600", muted: "text-red-400", badge: "bg-red-100 text-red-700", ring: "ring-red-100", bar: "bg-red-500", icon: AlertTriangle, days: 0, date: subEnd, label: "Expired on", statusLabel: "Expired" },
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
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">
      <div className="flex items-center gap-3 mb-3 sm:mb-0">
        <button onClick={() => navigate("/server-settings")} className="text-[#a1a1aa] hover:text-[#fafafa] p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg sm:text-xl font-bold text-[#fafafa]">Billing &amp; Plan</h2>
      </div>

      {/* ── Plan Status Banner ── */}
      <div className={`relative overflow-hidden rounded-2xl border ${stateConfig.cardBg} shadow-sm`}>
        <div className="p-6">
          <div className="flex items-center justify-between gap-6">
            {/* Left: icon + info */}
            <div className="flex items-center gap-5">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${stateConfig.iconBg} ring-4 ${stateConfig.ring}`}>
                <StatusIcon className={`w-8 h-8 ${stateConfig.iconColor}`} />
              </div>
              <div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${stateConfig.badge} mb-1.5`}>
                  {stateConfig.statusLabel}
                </span>
                <p className="text-sm text-[#6b7280] mt-1.5">
                  {stateConfig.date
                    ? `${stateConfig.label} ${stateConfig.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                    : stateConfig.label}
                </p>
                {isSubActive && (
                  <p className="text-[11px] text-[#9ca3af] mt-0.5">$9.99 extends access by 30 days</p>
                )}
              </div>
            </div>
            {/* Right: big countdown */}
            <div className="text-center shrink-0">
              <div className={`inline-flex items-baseline gap-1`}>
                <span className={`text-5xl font-extrabold tabular-nums tracking-tight ${stateConfig.accent}`}>
                  {stateConfig.days}
                </span>
              </div>
              <p className={`text-xs font-semibold uppercase tracking-wider mt-1 ${stateConfig.muted}`}>
                {state === "expired" ? "Days Ago" : `Day${stateConfig.days !== 1 ? "s" : ""} Left`}
              </p>
            </div>
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
                  <p className="text-2xl font-bold text-[#111827]">$9.99<span className="text-sm text-[#6b7280] font-normal"> / 30 days</span></p>
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
