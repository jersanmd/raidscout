import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { X, AlertTriangle, Clock } from "lucide-react";
import { PayPalSubscribeButton } from "@/components/PayPalSubscribeButton";
import { useQueryClient } from "@tanstack/react-query";
import { fetchAllServers } from "@/lib/supabase";

/**
 * Banner showing subscription status for server owners (all states) and moderators (expired only).
 * - Green: active subscription — owner only, no action needed
 * - Amber: trial active — owner only, subscribe button shown
 * - Red: expired — owner sees subscribe button, moderator sees contact-owner notice
 */
export function SubscriptionBanner() {
  const { user } = useAuth();
  const { currentServer } = useServer();
  const [dismissed, setDismissed] = useState(false);
  const queryClient = useQueryClient();

  if (!user || !currentServer) return null;

  const isOwner = currentServer.role === "owner";
  const isMod = currentServer.role === "moderator";

  // Moderators only see the banner when expired
  if (isMod && !currentServer.isExpired) return null;
  // Only owners and moderators
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

  // Determine state for owner
  const isSubActive = subDaysLeft > 0;
  const isTrialActive = !isSubActive && trialDaysLeft > 0;
  const isExpired = !isSubActive && !isTrialActive;

  // Don't show active green banner if dismissed
  if (isSubActive && dismissed) return null;

  // Moderator expired state
  if (isMod && isExpired && dismissed) return null;

  const state = isSubActive ? "active" : isTrialActive ? "trial" : "expired";

  const config = {
    active: {
      bg: "bg-emerald-950/40 border-emerald-800/40",
      iconBg: "bg-emerald-900/50",
      icon: <Clock className="w-4 h-4 text-emerald-400" />,
      title: `Subscription active — ${subDaysLeft} day${subDaysLeft !== 1 ? "s" : ""} remaining`,
      subtitle: subEnd ? `Until ${subEnd.toLocaleDateString()}. Thank you for supporting RaidScout!` : "",
      titleColor: "text-emerald-200",
      subColor: "text-emerald-400/70",
      btnBg: "",
      showDismiss: true,
    },
    trial: {
      bg: "bg-amber-950/40 border-amber-800/40",
      iconBg: "bg-amber-900/50",
      icon: <Clock className="w-4 h-4 text-amber-400" />,
      title: `Free trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining`,
      subtitle: trialEnd ? `Until ${trialEnd.toLocaleDateString()}. Subscribe now to keep your server active.` : "",
      titleColor: "text-amber-200",
      subColor: "text-amber-400/80",
      btnBg: "bg-amber-600 hover:bg-amber-500",
      showDismiss: true,
    },
    expired: {
      bg: "bg-red-950/60 border-red-800/60",
      iconBg: "bg-red-900/50",
      icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
      title: isOwner
        ? (subEnd && subEnd < now ? "Subscription expired" : "Free trial expired")
        : "Subscription expired",
      subtitle: isOwner
        ? "Subscribe to restore full access — boss tracking, kill recording, inventory, and Discord notifications."
        : "Contact the server owner to restore full access — kill recording is currently disabled.",
      titleColor: "text-red-200",
      subColor: "text-red-400/80",
      btnBg: "bg-red-600 hover:bg-red-500",
      showDismiss: true,
    },
  }[state];

  if (isOwner && isExpired && dismissed) return null;

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
          {/* PayPal Smart Button — owners on trial or expired */}
          {isOwner && (isTrialActive || isExpired) && (
            <PayPalSubscribeButton
              serverId={currentServer.id}
              onSuccess={() => {
                // Optimistically refresh server data after approval
                queryClient.invalidateQueries({ queryKey: ["admin", "servers"] });
                queryClient.fetchQuery({
                  queryKey: ["admin", "servers"],
                  queryFn: fetchAllServers,
                  staleTime: 0,
                });
              }}
            />
          )}
          {config.showDismiss && (
            <button
              onClick={() => setDismissed(true)}
              className={`p-1.5 ${state === "active" ? "text-emerald-500 hover:text-emerald-300 hover:bg-emerald-900/40" : state === "trial" ? "text-amber-500 hover:text-amber-300 hover:bg-amber-900/40" : "text-red-500 hover:text-red-300 hover:bg-red-900/40"} rounded-md transition`}
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
