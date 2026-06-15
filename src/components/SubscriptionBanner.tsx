import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { X, AlertTriangle, Clock, ArrowRight } from "lucide-react";

/**
 * Banner showing subscription status for server owners (all states) and moderators (expired only).
 * Links to /billing for plan management and subscription.
 */
export function SubscriptionBanner() {
  const { user } = useAuth();
  const { currentServer } = useServer();
  const [dismissed, setDismissed] = useState(false);

  if (!user || !currentServer) return null;

  const isOwner = currentServer.role === "owner";
  const isMod = currentServer.role === "moderator";

  if (isMod && !currentServer.isExpired) return null;
  if (!isOwner && !isMod) return null;

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

  if (isSubActive && dismissed) return null;
  if (isMod && isExpired && dismissed) return null;
  if (isOwner && isExpired && dismissed) return null;

  const state = isSubActive ? "active" : isTrialActive ? "trial" : "expired";

  const config = {
    active: {
      bg: "bg-emerald-950/40 border-emerald-800/40",
      iconBg: "bg-emerald-900/50",
      icon: <Clock className="w-4 h-4 text-emerald-400" />,
      title: `Access active — ${subDaysLeft} day${subDaysLeft !== 1 ? "s" : ""} remaining`,
      subtitle: subEnd ? `Until ${subEnd.toLocaleDateString()}. Thank you for supporting RaidScout!` : "",
      titleColor: "text-emerald-200",
      subColor: "text-emerald-400/70",
      linkColor: "text-emerald-300 hover:text-emerald-100 border-emerald-500/30 hover:border-emerald-500/50",
    },
    trial: {
      bg: "bg-amber-950/40 border-amber-800/40",
      iconBg: "bg-amber-900/50",
      icon: <Clock className="w-4 h-4 text-amber-400" />,
      title: `Free trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining`,
      subtitle: trialEnd ? `Until ${trialEnd.toLocaleDateString()}. Extend access to keep your server active.` : "",
      titleColor: "text-amber-200",
      subColor: "text-amber-400/80",
      linkColor: "text-amber-300 hover:text-amber-100 border-amber-500/30 hover:border-amber-500/50",
    },
    expired: {
      bg: "bg-red-950/60 border-red-800/60",
      iconBg: "bg-red-900/50",
      icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
      title: isOwner
        ? (subEnd && subEnd < now ? "Access expired" : "Free trial expired")
        : "Access expired",
      subtitle: isOwner
        ? "Restore full access via the billing dashboard."
        : "Contact the server owner to restore full access.",
      titleColor: "text-red-200",
      subColor: "text-red-400/80",
      linkColor: "text-red-300 hover:text-red-100 border-red-500/30 hover:border-red-500/50",
    },
  }[state];

  return (
    <div className={`border-b ${config.bg}`}>
      <div className="max-w-[90rem] mx-auto px-4 py-2.5 flex items-center gap-3">
        <div className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg ${config.iconBg}`}>
          {config.icon}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${config.titleColor}`}>{config.title}</p>
          <p className={`text-xs ${config.subColor}`}>{config.subtitle}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isOwner && (
            <Link
              to="/billing"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${config.linkColor}`}
            >
              Manage Billing
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
          <button
            onClick={() => setDismissed(true)}
            className={`p-1.5 ${
              state === "active" ? "text-emerald-500 hover:text-emerald-300 hover:bg-emerald-900/40" :
              state === "trial" ? "text-amber-500 hover:text-amber-300 hover:bg-amber-900/40" :
              "text-red-500 hover:text-red-300 hover:bg-red-900/40"
            } rounded-md transition`}
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
