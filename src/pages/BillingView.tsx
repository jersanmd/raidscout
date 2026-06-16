import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { SEOHead } from "@/components/SEOHead";
import { PayPalSubscribeButton } from "@/components/PayPalSubscribeButton";
import { PaymentSuccessModal } from "@/components/PaymentSuccessModal";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Clock, Shield, AlertTriangle, Zap, Crown, Users, Bell, Eye, BarChart3, Skull, Calendar, Trophy, Settings, MessageCircle, Globe, Activity, CreditCard, Receipt, Loader2, MailWarning } from "lucide-react";

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
  const { currentServer, refreshServers } = useServer();
  const { user, isViewer } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  if (isViewer) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-20 text-center">
        <p className="text-[#71717a] text-sm">Billing is not available in viewer mode.</p>
      </div>
    );
  }

  if (!currentServer) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-20 text-center">
        <p className="text-[#71717a] text-sm">Select a server to manage billing.</p>
      </div>
    );
  }

  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!currentServer?.id) return;
    setPaymentsLoading(true);
    supabase
      .from("payments")
      .select("*")
      .eq("server_id", currentServer.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setPayments(data);
        setPaymentsLoading(false);
      });
  }, [currentServer?.id]);

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
    active:   { cardBg: "bg-white border-amber-200", iconBg: "bg-amber-50", iconColor: "text-amber-500", accent: "text-amber-600", muted: "text-amber-400", badge: "bg-amber-100 text-amber-700", ring: "ring-amber-100", bar: "bg-amber-500", icon: Crown, days: subDaysLeft, date: subEnd, label: "Active until", statusLabel: "Pro Plan" },
    trial:    { cardBg: "bg-white border-gray-300", iconBg: "bg-gray-100", iconColor: "text-gray-700", accent: "text-gray-800", muted: "text-gray-400", badge: "bg-gray-900 text-white", ring: "ring-gray-200", bar: "bg-gray-800", icon: Clock, days: trialDaysLeft, date: trialEnd, label: "Trial ends", statusLabel: "Free Trial" },
    expired:  { cardBg: "bg-white border-red-200", iconBg: "bg-red-50", iconColor: "text-red-500", accent: "text-red-600", muted: "text-red-400", badge: "bg-red-100 text-red-700", ring: "ring-red-100", bar: "bg-red-500", icon: AlertTriangle, days: 0, date: subEnd, label: "Expired on", statusLabel: "Expired" },
  }[state];

  const StatusIcon = stateConfig.icon;

  // Email verification check (same logic as ConfirmEmailSection in ServerSettingsView)
  const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;
  const createdAt = user?.created_at;
  const isEmailVerified = confirmedAt && createdAt
    ? Math.abs(new Date(confirmedAt).getTime() - new Date(createdAt).getTime()) > 5000
    : false;

  return (
    <>
      <SEOHead
        title={`Billing — ${currentServer.name} — RaidScout`}
        description={`Manage billing and server access for ${currentServer.name} on RaidScout.`}
        canonicalUrl="/billing"
        noindex
      />
      <div className="max-w-[99%] 2xl:max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">
        <div className="flex items-center gap-3 mb-3 sm:mb-0">
          <button onClick={() => navigate("/server-settings")} className="text-[#a1a1aa] hover:text-[#fafafa] p-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-[#fafafa]">Billing &amp; Plan</h2>
          <span className="text-xs text-[#52525b] mt-0.5">Manage your billing and server access</span>
        </div>

      <div className="max-w-3xl mx-auto space-y-6 mt-8">

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
        {isOwner && !isEmailVerified ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3 shadow-sm">
            <div className="flex items-start gap-3">
              <MailWarning className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-amber-800">Verify your email to manage billing</p>
                <p className="text-xs text-amber-600">You need a verified email address before making payments. This helps protect your account and ensures you receive payment receipts.</p>
                <button
                  onClick={() => navigate("/server-settings?tab=account")}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 transition"
                >
                  Verify in Server Settings → Account →
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 space-y-4 shadow-sm">
          <h3 className="text-sm font-semibold text-[#111827] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#6b7280]" />
            {isOwner ? "Payment" : "Information"}
          </h3>

          {isOwner ? (
            isSubActive ? (
              <div className="text-center space-y-3">
                <p className="text-sm text-[#6b7280]">Your server has <span className="font-semibold text-[#111827]">{subDaysLeft} day{subDaysLeft !== 1 ? "s" : ""}</span> of access remaining.</p>
                <p className="text-xs text-[#9ca3af]">Extend anytime — days stack on top of your current balance.</p>
                <div className="flex justify-center">
                  <PayPalSubscribeButton
                    serverId={currentServer.id}
                    onSuccess={async () => {
                      await refreshServers();
                      supabase
                        .from("payments")
                        .select("*")
                        .eq("server_id", currentServer.id)
                        .order("created_at", { ascending: false })
                        .then(({ data }) => { if (data) setPayments(data); });
                      setPaymentResult({ success: true });
                    }}
                    onError={(err) => setPaymentResult({ success: false, error: err.message })}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-center space-y-1">
                  <p className="text-2xl font-bold text-[#111827]">$9.99<span className="text-sm text-[#6b7280] font-normal"> / 30 days</span></p>
                  <p className="text-xs text-[#6b7280]">{isTrialActive ? "Subscribe now to keep your server running" : "Restore full access to your server"}</p>
                </div>
                <div className="flex justify-center">
                  <PayPalSubscribeButton
                    serverId={currentServer.id}
                    onSuccess={async () => {
                      await refreshServers();
                      supabase
                        .from("payments")
                        .select("*")
                        .eq("server_id", currentServer.id)
                        .order("created_at", { ascending: false })
                        .then(({ data }) => { if (data) setPayments(data); });
                      setPaymentResult({ success: true });
                    }}
                    onError={(err) => setPaymentResult({ success: false, error: err.message })}
                  />
                </div>
              </div>
            )
          ) : (
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-[#6b7280] mt-0.5 shrink-0" />
              <p className="text-xs text-[#6b7280]">Only the server owner can manage billing.</p>
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── Payment History ── */}
      {isOwner && isEmailVerified && (
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-[#111827] flex items-center gap-2">
          <Receipt className="w-4 h-4 text-[#6b7280]" />
          Payment History
        </h3>

        {paymentsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-[#9ca3af] animate-spin" />
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-6">
            <CreditCard className="w-8 h-8 text-[#d1d5db] mx-auto mb-2" />
            <p className="text-sm text-[#9ca3af]">No payments yet</p>
            <p className="text-xs text-[#d1d5db] mt-1">Your payment history will appear here after your first purchase.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-12 gap-3 text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider px-3 pb-2 border-b border-[#f3f4f6]">
              <span className="col-span-3">Date</span>
              <span className="col-span-2">Amount</span>
              <span className="col-span-2">Days</span>
              <span className="col-span-3">Transaction</span>
              <span className="col-span-2 text-right">Receipt</span>
            </div>
            {payments.map((p) => (
              <div key={p.id} className="grid grid-cols-12 gap-3 items-center px-3 py-2.5 rounded-lg hover:bg-[#f9fafb] transition-colors">
                <span className="col-span-3 text-xs text-[#374151] font-medium">
                  {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  <span className="block text-[10px] text-[#9ca3af] font-normal">
                    {new Date(p.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <span className="col-span-2 text-xs text-[#111827] font-semibold">${p.amount}</span>
                <span className="col-span-2 text-xs text-[#374151]">+{p.days_added}d</span>
                <span className="col-span-3 text-xs text-[#374151]">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    p.status === "completed" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  }`}>
                    {p.status === "completed" ? "Completed" : "Refunded"}
                  </span>
                </span>
                <span className="col-span-2 text-right">
                  {p.paypal_order_id ? (
                    <a
                      href={`https://www.paypal.com/myaccount/transactions/details/${p.paypal_order_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-600 hover:text-sky-700 hover:underline transition"
                    >
                      <Receipt className="w-3 h-3" />
                      Receipt
                    </a>
                  ) : (
                    <span className="text-[10px] text-[#d1d5db]">—</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

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
        Payments are processed securely by PayPal. Each payment extends server access by 30 days.
      </p>

      {/* Payment Result Modal */}
      <PaymentSuccessModal
        open={!!paymentResult}
        onClose={() => setPaymentResult(null)}
        error={paymentResult?.success === false ? paymentResult.error : undefined}
        daysExtended={
          currentServer.subscription_ends_at
            ? Math.ceil((new Date(currentServer.subscription_ends_at).getTime() - Date.now()) / 86400000)
            : 30
        }
        newExpiryDate={
          currentServer.subscription_ends_at
            ? new Date(currentServer.subscription_ends_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
            : new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        }
      />

      </div>
    </div>
    </>
  );
}
