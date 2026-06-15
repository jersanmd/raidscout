import { useState } from "react";
import { Link } from "react-router-dom";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { PayPalSubscribeButton } from "@/components/PayPalSubscribeButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, CreditCard, Clock, Shield, AlertTriangle, Loader2, ExternalLink, Zap, Users, Bell, Eye, BarChart3, Skull } from "lucide-react";

const FEATURES = [
  { icon: Skull, label: "Boss Kill Recording" },
  { icon: Clock, label: "Live Spawn Timers" },
  { icon: Bell, label: "Discord Notifications" },
  { icon: Users, label: "Member Management" },
  { icon: BarChart3, label: "Leaderboards & Stats" },
  { icon: Eye, label: "Viewer Sharing" },
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
  const planName = isSubActive ? "Pro" : isTrialActive ? "Free Trial" : "No Plan";

  const stateConfig = {
    active:   { bg: "from-emerald-50 to-white", border: "border-emerald-200", text: "text-emerald-700", accent: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", icon: Zap, days: subDaysLeft, date: subEnd, label: "Your subscription is active" },
    trial:    { bg: "from-amber-50 to-white", border: "border-amber-200", text: "text-amber-700", accent: "text-amber-800", badge: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500", icon: Clock, days: trialDaysLeft, date: trialEnd, label: "Free trial in progress" },
    expired:  { bg: "from-red-50 to-white", border: "border-red-200", text: "text-red-700", accent: "text-red-800", badge: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", icon: AlertTriangle, days: 0, date: subEnd, label: "Access restricted" },
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
    <div className="min-h-screen bg-[#f8f9fa]">
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Link to="/server-settings" className="p-1.5 -ml-1.5 text-[#6b7280] hover:text-[#111827] transition rounded-md">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-semibold text-[#111827]">Billing &amp; Plan</h1>
      </div>

      {/* ── Hero Status ── */}
      <div className={`relative overflow-hidden rounded-2xl border ${stateConfig.border} bg-gradient-to-b ${stateConfig.bg} p-6`}>
        <div className="absolute top-0 right-0 w-40 h-40 opacity-[0.06]">
          <StatusIcon className="w-full h-full" />
        </div>
        <div className="relative flex items-start gap-4">
          <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${stateConfig.badge}`}>
            <StatusIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${stateConfig.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${stateConfig.dot}`} />
                {state === "active" ? "Active" : state === "trial" ? "Trial" : "Expired"}
              </span>
              <span className="text-xs text-[#6b7280]">{planName}</span>
            </div>
            <p className={`text-xl font-bold ${stateConfig.accent} tabular-nums`}>
              {state === "active" ? `${stateConfig.days} day${stateConfig.days !== 1 ? "s" : ""} remaining` :
               state === "trial" ? `${stateConfig.days} day${stateConfig.days !== 1 ? "s" : ""} left in trial` :
               "Access restricted"}
            </p>
            <p className={`text-xs ${stateConfig.text} mt-0.5`}>
              {stateConfig.date
                ? `${isSubActive ? "Renews" : isTrialActive ? "Trial ends" : "Expired"} ${stateConfig.date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`
                : stateConfig.label}
            </p>
          </div>
        </div>
      </div>

      {/* ── Plan + Payment ── */}
      <div className="grid grid-cols-1 gap-4">
        {/* Plan Details */}
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 space-y-4 shadow-sm">
          <h3 className="text-sm font-semibold text-[#111827] flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#6b7280]" />
            Plan Details
          </h3>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#6b7280]">Plan</span>
              <span className="text-sm font-medium text-[#111827]">{planName}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#6b7280]">Price</span>
              <span className="text-sm font-medium text-[#111827]">{isSubActive ? "$9.99 / month" : isTrialActive ? "Free" : "—"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#6b7280]">{isSubActive ? "Next renewal" : isTrialActive ? "Trial ends" : "Expired on"}</span>
              <span className="text-sm font-medium text-[#111827]">{stateConfig.date?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) || "—"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#6b7280]">Status</span>
              <span className={`text-sm font-medium ${state === "active" ? "text-emerald-600" : state === "trial" ? "text-amber-600" : "text-red-600"}`}>
                {state === "active" ? `${stateConfig.days}d remaining` : state === "trial" ? `${stateConfig.days}d left` : "Expired"}
              </span>
            </div>
          </div>
          {currentServer.paypal_subscription_id && (
            <div className="border-t border-[#e5e7eb] pt-3">
              <span className="text-[10px] text-[#9ca3af] uppercase tracking-wider">PayPal Subscription</span>
              <p className="text-[11px] text-[#6b7280] font-mono mt-1 truncate">{currentServer.paypal_subscription_id}</p>
            </div>
          )}
        </div>

        {/* Payment */}
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

      {/* ── What's Included ── */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[#111827] flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#6b7280]" />
          {isSubActive ? "Your Pro Benefits" : isTrialActive ? "Trial Includes" : "What You're Missing"}
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
      <p className="text-center text-[11px] text-[#9ca3af]">
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
    </div>
  );
}
