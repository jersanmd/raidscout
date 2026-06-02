import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { supabase } from "@/lib/supabase";
import { ExternalLink, X, MessageSquare } from "lucide-react";

/**
 * Banner shown to server owners when Discord notifications aren't configured.
 * Guides them to link their Discord server and type &lt;prefix&gt;notifhere.
 */
export function DiscordWebhookBanner() {
  const { user } = useAuth();
  const { currentServer } = useServer();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [hasNotifications, setHasNotifications] = useState(true);

  useEffect(() => {
    if (!currentServer?.id) return;
    // Check if server is linked to Discord via discord_configs
    (async () => {
      try {
        const { data } = await supabase
          .from("discord_configs")
          .select("id")
          .eq("raidscout_server_id", currentServer.id)
          .limit(1);
        setHasNotifications((data?.length ?? 0) > 0);
      } catch {
        setHasNotifications(false);
      }
    })();
  }, [currentServer?.id]);

  if (!user || !currentServer) return null;
  if (currentServer.role !== "owner" && currentServer.role !== "moderator") return null;
  // Hide once at least 1 Discord link exists
  if (hasNotifications) return null;
  if (dismissed) return null;

  return (
    <div className="bg-amber-950/60 border-b border-amber-800/60">
      <div className="max-w-[90rem] mx-auto px-4 py-2.5 flex items-center gap-3">
        {/* Icon */}
        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-amber-900/50">
          <MessageSquare className="w-4 h-4 text-amber-400" />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-amber-200 font-medium">
            Discord notifications not set up
          </p>
          <p className="text-xs text-amber-400/80">
            Add the RaidScout bot to your Discord server, then type <code className="bg-amber-900/40 px-1 rounded">&lt;prefix&gt;notifhere</code> in your announcements channel to enable boss kill and spawn alerts.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate("/server-settings?tab=integrations")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-[#fafafa] hover:bg-amber-500 transition"
          >
            <ExternalLink className="w-3 h-3" />
            Link Discord
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 text-amber-500 hover:text-amber-300 hover:bg-amber-900/40 rounded-md transition"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
