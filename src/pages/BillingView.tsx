import { useState } from "react";
import { Link } from "react-router-dom";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { PayPalSubscribeButton } from "@/components/PayPalSubscribeButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, CreditCard, Clock, Shield, AlertTriangle, Loader2, ExternalLink, Check, Zap, Users, Bell, Eye, BarChart3, Skull } from "lucide-react";

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
    active:   { bg: "from-emerald-950/60 to-[#09090b]", border: "border-emerald-800/40", text: "text-emerald-200", accent: "text-emerald-300", badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", dot: "bg-emerald-400", icon: Zap, days: subDaysLeft, date: subEnd, label: "Your subscription is active" },
    trial:    { bg: "from-amber-950/60 to-[#09090b]", border: "border-amber-800/40", text: "text-amber-200", accent: "text-amber-300", badge: "bg-amber-500/10 text-amber-300 border-amber-500/20", dot: "bg-amber-400", icon: Clock, days: trialDaysLeft, date: trialEnd, label: "Free trial in progress" },
    expired:  { bg: "from-red-950/60 to-[#09090b]", border: "border-red-800/40", text: "text-red-200", accent: "text-red-300", badge: "bg-red-500/10 text-red-300 border-red-500/20", dot: "bg-red-400", icon: AlertTriangle, days: 0, date: subEnd, label: "Access restricted" },
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

      {/* ── Hero Status ── */}
      <div className={`relative overflow-hidden rounded-2xl border ${stateConfig.border} bg-gradient-to-b ${stateConfig.bg} p-6`}>
        <div className="absolute top-0 right-0 w-40 h-40 opacity-[0.04]">
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
              <span className="text-xs text-[#71717a]">{planName}</span>
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
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#a1a1aa]" />
            Plan Details
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#a1a1aa]">Plan</span>
              <span className="text-sm font-medium text-[#fafafa]">{planName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#a1a1aa]">Price</span>
              <span className="text-sm font-medium text-[#fafafa]">{isSubActive ? "$9.99 / month" : isTrialActive ? "Free" : "—"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#a1a1aa]">{isSubActive ? "Next renewal" : isTrialActive ? "Trial ends" : "Expired on"}</span>
              <span className="text-sm font-medium text-[#fafafa]">{stateConfig.date?.toLocaleDateString() || "—"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[#a1a1aa]">Status</span>
              <span className={`text-sm font-medium ${state === "active" ? "text-emerald-300" : state === "trial" ? "text-amber-300" : "text-red-300"}`}>
                {state === "active" ? `${stateConfig.days}d remaining` : state === "trial" ? `${stateConfig.days}d left` : "Expired"}
              </span>
            </div>
          </div>
          {currentServer.paypal_subscription_id && (
            <div className="border-t border-[#27272a] pt-3">
              <span className="text-[10px] text-[#71717a] uppercase tracking-wider">PayPal Subscription</span>
              <p className="text-[11px] text-[#52525b] font-mono mt-1 truncate">{currentServer.paypal_subscription_id}</p>
            </div>
          )}
        </div>

        {/* Payment */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#a1a1aa]" />
            {isOwner ? "Payment" : "Information"}
          </h3>

          {isOwner ? (
            isSubActive ? (
              <div className="space-y-2">
                <a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between w-full px-4 py-3 rounded-lg bg-[#27272a] hover:bg-[#3f3f46] transition group">
                  <span className="text-sm text-[#fafafa]">Manage in PayPal</span>
                  <ExternalLink className="w-4 h-4 text-[#71717a] group-hover:text-[#a1a1aa]" />
                </a>
                <button onClick={() => setCancelConfirm(true)} disabled={cancelling}
                  className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-red-500/20 hover:bg-red-500/5 transition disabled:opacity-50 text-sm text-red-400">
                  {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                  {cancelling ? "Cancelling..." : "Cancel Subscription"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-center space-y-1">
                  <p className="text-2xl font-bold text-[#fafafa]">$9.99<span className="text-sm text-[#71717a] font-normal">/month</span></p>
                  <p className="text-xs text-[#a1a1aa]">{isTrialActive ? "Subscribe now to keep your server running" : "Restore full access to your server"}</p>
                </div>
                <div className="flex justify-center">
                  <PayPalSubscribeButton serverId={currentServer.id} onSuccess={() => toast("success", "Payment successful!")} />
                </div>
              </div>
            )
          ) : (
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-[#71717a] mt-0.5 shrink-0" />
              <p className="text-xs text-[#a1a1aa]">Only the server owner can manage billing and subscriptions.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── What's Included ── */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#a1a1aa]" />
          {isSubActive ? "Your Pro Benefits" : isTrialActive ? "Trial Includes" : "What You're Missing"}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {FEATURES.map((f) => (
            <div key={f.label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#09090b] border border-[#1f1f23]">
              <f.icon className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0" />
              <span className="text-xs text-[#d4d4d8]">{f.label}</span>
            </div>
          ))}
        </div>
        {isExpired && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-red-300 font-medium">These features are currently locked</p>
              <p className="text-[11px] text-red-400/70 mt-0.5">Subscribe to restore full access to all features.</p>
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
