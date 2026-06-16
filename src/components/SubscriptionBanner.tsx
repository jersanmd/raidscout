import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { AlertTriangle, Clock, ArrowRight } from "lucide-react";

/**
 * Banner showing subscription status for server owners (all states) and moderators (expired only).
 * Links to /billing for plan management and subscription.
 */
export function SubscriptionBanner() {
  const { user, isViewer, userRole } = useAuth();
  const { currentServer } = useServer();

  if (!currentServer) return null;
  if (!user && !isViewer) return null;

  // Admins viewing a server should never see subscription banners
  if (userRole === "admin") return null;

  const isOwner = currentServer.role === "owner";
  const isMod = currentServer.role === "moderator";

  // Mods only see expired banner; viewers see trial and expired; owners see all
  if (isMod && !currentServer.isExpired) return null;
  if (!isOwner && !isMod && !isViewer) return null;

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

  // Never show banner for Pro users — the nav badge is enough
  if (isSubActive) return null;

  const isTrialActive = trialDaysLeft > 0;
  const state = isTrialActive ? "trial" : "expired";

  const config = {
    trial: {
      bg: "bg-[#18181b]/60 border-[#27272a]",
      iconBg: "bg-[#27272a]",
      icon: <Clock className="w-4 h-4 text-[#a1a1aa]" />,
      title: `Free trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining`,
      subtitle: trialEnd ? `Ends ${trialEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. We hope you're enjoying RaidScout!` : "",
      titleColor: "text-[#d4d4d8]",
      subColor: "text-[#71717a]",
      linkColor: "text-[#a1a1aa] hover:text-white border-[#3f3f46] hover:border-[#52525b]",
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
        </div>
      </div>
    </div>
  );
}
