import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { supabase } from "@/lib/supabase";
import { ExternalLink, X, Webhook } from "lucide-react";

/**
 * Persistent warning banner shown to server owners/moderators
 * when no webhook is configured — checks both legacy webhook
 * and per-guild Discord Bot & Webhook links.
 */
export function DiscordWebhookBanner() {
  const { user } = useAuth();
  const { currentServer } = useServer();
  const { webhookVersion } = useServer();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [hasWebhook, setHasWebhook] = useState(true); // optimistic

  useEffect(() => {
    if (!currentServer?.id) return;
    // Check legacy webhook
    if (currentServer.discord_webhook_url) {
      setHasWebhook(true);
      return;
    }
    // Check per-guild webhooks
    (async () => {
      try {
        const { data } = await supabase
          .from("discord_configs")
          .select("webhook_url")
          .eq("raidscout_server_id", currentServer.id)
          .not("webhook_url", "is", null)
          .limit(1);
        setHasWebhook((data?.length ?? 0) > 0);
      } catch {
        setHasWebhook(false);
      }
    })();
  }, [currentServer?.id, currentServer?.discord_webhook_url, webhookVersion]);

  if (!user || !currentServer) return null;
  if (currentServer.role !== "owner" && currentServer.role !== "moderator") return null;
  if (hasWebhook) return null;
  if (dismissed) return null;

  return (
    <div className="bg-amber-950/60 border-b border-amber-800/60">
      <div className="max-w-[90rem] mx-auto px-4 py-2.5 flex items-center gap-3">
        {/* Icon */}
        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-amber-900/50">
          <Webhook className="w-4 h-4 text-amber-400" />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-amber-200 font-medium">
            Discord Bot & Webhook not configured
          </p>
          <p className="text-xs text-amber-400/80">
            Boss kill alerts, spawn announcements, and @everyone pings will not
            work until you add your Discord Server ID and Webhook URL in settings.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate("/server-settings?tab=integrations&highlight=discord-id")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-500 transition"
          >
            <ExternalLink className="w-3 h-3" />
            Configure
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 text-amber-500 hover:text-amber-300 hover:bg-amber-900/40 rounded-md transition"
            title="Dismiss (will reappear on next visit)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
