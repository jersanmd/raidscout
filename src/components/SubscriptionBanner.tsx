import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { CreditCard, X, AlertTriangle } from "lucide-react";

/**
 * Banner shown when a server's trial has expired or subscription has ended.
 * Prompts the owner to subscribe. Admins can manually extend.
 * Viewers never see this — they get read-only access regardless.
 */
export function SubscriptionBanner() {
  const { user } = useAuth();
  const { currentServer } = useServer();
  const [dismissed, setDismissed] = useState(false);

  if (!user || !currentServer) return null;
  if (currentServer.role !== "owner") return null;
  if (!currentServer.isExpired) return null;
  if (dismissed) return null;

  const trialEnd = currentServer.trial_ends_at ? new Date(currentServer.trial_ends_at) : null;
  const subEnd = currentServer.subscription_ends_at ? new Date(currentServer.subscription_ends_at) : null;
  const now = new Date();

  const trialDaysLeft = trialEnd && trialEnd > now
    ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const subDaysLeft = subEnd && subEnd > now
    ? Math.ceil((subEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="bg-red-950/60 border-b border-red-800/60">
      <div className="max-w-[90rem] mx-auto px-4 py-2.5 flex items-center gap-3">
        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-red-900/50">
          {currentServer.isExpired ? (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          ) : (
            <CreditCard className="w-4 h-4 text-amber-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {currentServer.isExpired ? (
            <>
              <p className="text-sm text-red-200 font-medium">
                {subEnd && subEnd < now ? "Subscription expired" : "Free trial expired"}
              </p>
              <p className="text-xs text-red-400/80">
                Subscribe to restore full access — boss tracking, kill recording, inventory, and Discord notifications.
              </p>
            </>
          ) : trialDaysLeft > 0 ? (
            <>
              <p className="text-sm text-amber-200 font-medium">
                Free trial — {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining
              </p>
              <p className="text-xs text-amber-400/80">
                Subscribe now to keep your server active after the trial ends.
              </p>
            </>
          ) : subDaysLeft > 0 ? (
            <>
              <p className="text-sm text-emerald-200 font-medium">
                Subscription active — {subDaysLeft} day{subDaysLeft !== 1 ? "s" : ""} remaining
              </p>
              <p className="text-xs text-emerald-400/80">
                Your server has full access. Thank you for supporting RaidScout!
              </p>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* PayPal subscribe button */}
          {currentServer.isExpired && (
            <a
              href={`https://www.paypal.com/cgi-bin/webscr?cmd=_xclick-subscriptions&business=ceo%40raidscout.com&item_name=RaidScout+Server+30+Days&a3=9.99&p3=1&t3=M&custom=${currentServer.id}&currency_code=USD&notify_url=https%3A%2F%2Fcjuacehmienztxrhwnlg.supabase.co%2Ffunctions%2Fv1%2Fpaypal-ipn&return=https://www.raidscout.com`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-[#fafafa] hover:bg-red-500 transition"
            >
              <CreditCard className="w-3 h-3" />
              Subscribe $9.99/mo
            </a>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 text-red-500 hover:text-red-300 hover:bg-red-900/40 rounded-md transition"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
