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
    active:   { cardBg: "bg-[#0d0d11] border-[#1e1e2a]", iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400", accent: "text-[#fafafa]", muted: "text-emerald-400/60", badge: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20", ring: "ring-emerald-500/10", bar: "bg-emerald-500", icon: Crown, days: subDaysLeft, date: subEnd, label: "Active until", statusLabel: "Pro Plan" },
    trial:    { cardBg: "bg-[#0d0d11] border-[#1e1e2a]", iconBg: "bg-[#27272a]", iconColor: "text-[#a1a1aa]", accent: "text-[#fafafa]", muted: "text-[#71717a]", badge: "bg-[#27272a] text-[#d4d4d8] border border-[#3f3f46]", ring: "ring-[#27272a]", bar: "bg-[#52525b]", icon: Clock, days: trialDaysLeft, date: trialEnd, label: "Trial ends", statusLabel: "Free Trial" },
    expired:  { cardBg: "bg-[#0d0d11] border-[#1e1e2a]", iconBg: "bg-red-500/10", iconColor: "text-red-400", accent: "text-[#fafafa]", muted: "text-red-400/60", badge: "bg-red-500/10 text-red-300 border border-red-500/20", ring: "ring-red-500/10", bar: "bg-red-500", icon: AlertTriangle, days: 0, date: subEnd, label: "Expired on", statusLabel: "Expired" },
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
      <div className="max-w-[100%] 2xl:max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">
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
                <p className="text-sm text-[#71717a] mt-1.5">
                  {stateConfig.date
                    ? `${stateConfig.label} ${stateConfig.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
                    : stateConfig.label}
                </p>
                {isSubActive && (
                  <p className="text-[11px] text-[#52525b] mt-0.5">$9.99 extends access by 30 days</p>
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
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <MailWarning className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-amber-300">Verify your email to manage billing</p>
                <p className="text-xs text-amber-400/70">You need a verified email address before making payments. This helps protect your account and ensures you receive payment receipts.</p>
                <button
                  onClick={() => navigate("/server-settings?tab=account")}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2 transition"
                >
                  Verify in Server Settings → Account →
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#52525b]" />
            {isOwner ? "Payment" : "Information"}
          </h3>

          {isOwner ? (
            isSubActive ? (
              <div className="text-center space-y-3">
                <p className="text-sm text-[#a1a1aa]">Your server has <span className="font-semibold text-[#fafafa]">{subDaysLeft} day{subDaysLeft !== 1 ? "s" : ""}</span> of access remaining.</p>
                <p className="text-xs text-[#52525b]">Extend anytime — days stack on top of your current balance.</p>
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
                  <p className="text-2xl font-bold text-[#fafafa]">$9.99<span className="text-sm text-[#71717a] font-normal"> / 30 days</span></p>
                  <p className="text-xs text-[#71717a]">{isTrialActive ? "Subscribe now to keep your server running" : "Restore full access to your server"}</p>
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
              <Shield className="w-4 h-4 text-[#52525b] mt-0.5 shrink-0" />
              <p className="text-xs text-[#71717a]">Only the server owner can manage billing.</p>
            </div>
          )}
        </div>
        )}
      </div>

      {/* ── Payment History ── */}
      {isOwner && isEmailVerified && (
      <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
          <Receipt className="w-4 h-4 text-[#52525b]" />
          Payment History
        </h3>

        {paymentsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-[#52525b] animate-spin" />
          </div>
        ) : payments.length === 0 ? (
          <div className="text-center py-6">
            <CreditCard className="w-8 h-8 text-[#3f3f46] mx-auto mb-2" />
            <p className="text-sm text-[#71717a]">No payments yet</p>
            <p className="text-xs text-[#52525b] mt-1">Your payment history will appear here after your first purchase.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-12 gap-3 text-[11px] font-semibold text-[#52525b] uppercase tracking-wider px-3 pb-2 border-b border-[#1e1e2a]">
              <span className="col-span-3">Date</span>
              <span className="col-span-2">Amount</span>
              <span className="col-span-2">Days</span>
              <span className="col-span-3">Transaction</span>
              <span className="col-span-2 text-right">Receipt</span>
            </div>
            {payments.map((p) => (
              <div key={p.id} className="grid grid-cols-12 gap-3 items-center px-3 py-2.5 rounded-lg hover:bg-[#18181b] transition-colors">
                <span className="col-span-3 text-xs text-[#d4d4d8] font-medium">
                  {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  <span className="block text-[10px] text-[#52525b] font-normal">
                    {new Date(p.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <span className="col-span-2 text-xs text-[#fafafa] font-semibold">${p.amount}</span>
                <span className="col-span-2 text-xs text-[#d4d4d8]">+{p.days_added}d</span>
                <span className="col-span-3 text-xs text-[#d4d4d8]">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    p.status === "completed" ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" : "bg-red-500/10 text-red-300 border border-red-500/20"
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
      <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#52525b]" />
          All RaidScout Features
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {FEATURES.map((f) => (
            <div key={f.label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#18181b] border border-[#27272a]">
              <f.icon className="w-3.5 h-3.5 text-[#52525b] shrink-0" />
              <span className="text-xs text-[#d4d4d8]">{f.label}</span>
            </div>
          ))}
        </div>
        {isExpired && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-red-300 font-medium">These features are currently locked</p>
              <p className="text-[11px] text-red-400/70 mt-0.5">Subscribe to restore full access to all features.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Notes ── */}
      <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#52525b]" />
          Note
        </h3>
        <ol className="space-y-2.5 list-decimal list-inside">
          <li className="text-xs text-[#a1a1aa] leading-relaxed pl-1">
            <span className="font-medium text-[#d4d4d8]">Server access is per-server.</span> Each payment extends <strong className="text-[#d4d4d8]">one server</strong> by 30 days. If you own multiple servers, each needs its own subscription. Days stack — pay early to build up a buffer.
          </li>
          <li className="text-xs text-[#a1a1aa] leading-relaxed pl-1">
            <span className="font-medium text-[#d4d4d8]">Payments usually process within minutes.</span> If your balance doesn't update immediately, wait a few minutes and refresh the page. If it's still not showing after 2 hours, check your email for a PayPal receipt or contact us on <a href="https://discord.gg/738AmkeQtU" target="_blank" rel="noopener noreferrer" className="text-[#a1a1aa] underline underline-offset-2 hover:text-[#fafafa] transition">Discord</a>.
          </li>
          <li className="text-xs text-[#a1a1aa] leading-relaxed pl-1">
            <span className="font-medium text-[#d4d4d8]">All features included — no tiers, no hidden fees.</span> $9.99 unlocks everything: boss tracking, Discord bot, leaderboards, analytics, inventory, multi-guild rotation, AI rally scanning, and more. No per-feature upsells.
          </li>
          <li className="text-xs text-[#a1a1aa] leading-relaxed pl-1">
            <span className="font-medium text-[#d4d4d8]">Refunds are available within 7 days</span> of purchase if you haven't used the service. See our <a href="/refund" className="text-[#a1a1aa] underline underline-offset-2 hover:text-[#fafafa] transition">Refund Policy</a> for details.
          </li>
          <li className="text-xs text-[#a1a1aa] leading-relaxed pl-1">
            <span className="font-medium text-[#d4d4d8]">Payments are secure.</span> All transactions are processed by PayPal — we never see or store your card or banking details.
          </li>
        </ol>
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
