import { useState } from "react";
import { Link } from "react-router-dom";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { PayPalSubscribeButton } from "@/components/PayPalSubscribeButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, CreditCard, Clock, Shield, AlertTriangle, Loader2, ExternalLink } from "lucide-react";

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

  const trialDaysLeft = trialEnd && trialEnd > now
    ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const subDaysLeft = subEnd && subEnd > now
    ? Math.ceil((subEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const isSubActive = subDaysLeft > 0;
  const isTrialActive = !isSubActive && trialDaysLeft > 0;
  const isExpired = !isSubActive && !isTrialActive;

  const status = isSubActive ? "active" : isTrialActive ? "trial" : "expired";
  const planName = isSubActive ? "RaidScout Pro" : isTrialActive ? "Free Trial" : "No Active Plan";

  const handleCancel = async () => {
    setCancelConfirm(false);
    setCancelling(true);
    try {
      const { data: srv } = await supabase
        .from("servers")
        .select("paypal_subscription_id")
        .eq("id", currentServer.id)
        .single();

      if (!srv?.paypal_subscription_id) {
        toast("error", "No PayPal subscription found to cancel.");
        return;
      }

      const { error } = await supabase.functions.invoke("cancel-subscription", {
        body: { server_id: currentServer.id },
      });

      if (error) throw error;
      toast("success", "Subscription cancelled. Access will remain until the current period ends.");
    } catch (err: any) {
      toast("error", err?.message || "Failed to cancel subscription.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/server-settings" className="p-1.5 -ml-1.5 text-[#71717a] hover:text-[#fafafa] transition rounded-md">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-semibold text-[#fafafa]">Billing</h1>
      </div>

      {/* Current Plan Card */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#fafafa]">Current Plan</h2>
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
            status === "active" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" :
            status === "trial" ? "bg-amber-500/10 text-amber-300 border-amber-500/20" :
            "bg-red-500/10 text-red-300 border-red-500/20"
          }`}>
            {status === "active" ? "Active" : status === "trial" ? "Trial" : "Expired"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Plan</p>
            <p className="text-sm text-[#fafafa] font-medium">{planName}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Price</p>
            <p className="text-sm text-[#fafafa] font-medium">
              {isSubActive ? "$9.99/month" : isTrialActive ? "Free" : "—"}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">
              {isSubActive ? "Renews" : isTrialActive ? "Trial Ends" : "Expired"}
            </p>
            <p className="text-sm text-[#fafafa] font-medium">
              {isSubActive && subEnd ? subEnd.toLocaleDateString() :
               isTrialActive && trialEnd ? trialEnd.toLocaleDateString() :
               subEnd ? subEnd.toLocaleDateString() : "—"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Days Left</p>
            <p className={`text-sm font-medium tabular-nums ${
              status === "active" ? "text-emerald-300" :
              status === "trial" ? "text-amber-300" :
              "text-red-300"
            }`}>
              {isSubActive ? subDaysLeft : isTrialActive ? trialDaysLeft : 0}d
            </p>
          </div>
        </div>

        {/* Subscription ID */}
        <div className="border-t border-[#27272a] pt-3 space-y-1">
          <p className="text-[10px] text-[#71717a] uppercase tracking-wider">PayPal Subscription ID</p>
          <p className="text-xs text-[#a1a1aa] font-mono truncate">
            {currentServer.paypal_subscription_id || "—"}
          </p>
        </div>
      </div>

      {/* Actions */}
      {isOwner && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#fafafa]">Actions</h2>

          {isSubActive ? (
            <>
              {/* Manage Subscription — PayPal portal */}
              <a
                href="https://www.paypal.com/myaccount/autopay/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full px-4 py-3 rounded-lg bg-[#27272a] hover:bg-[#3f3f46] transition group"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-[#a1a1aa]" />
                  <span className="text-sm text-[#fafafa]">Manage Subscription</span>
                </div>
                <ExternalLink className="w-4 h-4 text-[#71717a] group-hover:text-[#a1a1aa] transition" />
              </a>

              {/* Cancel Subscription */}
              <button
                onClick={() => setCancelConfirm(true)}
                disabled={cancelling}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg border border-red-500/20 hover:bg-red-500/5 transition disabled:opacity-50"
              >
                {cancelling ? (
                  <Loader2 className="w-4 h-4 text-red-400 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
                <span className="text-sm text-red-400">
                  {cancelling ? "Cancelling..." : "Cancel Subscription"}
                </span>
              </button>
              <p className="text-[10px] text-[#52525b]">
                Your server will retain full access until the current billing period ends.
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[#a1a1aa]">
                {isTrialActive
                  ? "Subscribe now to keep your server active after the trial."
                  : "Subscribe to restore full access to your server."}
              </p>
              <div className="flex justify-center">
                <PayPalSubscribeButton
                  serverId={currentServer.id}
                  onSuccess={() => toast("success", "Subscription activated! Refreshing...")}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Non-owner notice */}
      {!isOwner && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-[#71717a] mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-[#fafafa] font-medium">Server Owner Only</p>
              <p className="text-xs text-[#71717a] mt-1">
                Only the server owner can manage billing and subscription. Contact them if the subscription needs attention.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Dialog */}
      <ConfirmDialog
        open={cancelConfirm}
        title="Cancel Subscription"
        message="Your server will retain full access until the current billing period ends. No refunds are issued for partial periods."
        confirmLabel="Cancel Subscription"
        variant="danger"
        loading={cancelling}
        onConfirm={handleCancel}
        onCancel={() => setCancelConfirm(false)}
      />
    </div>
  );
}
