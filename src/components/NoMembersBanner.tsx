import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { supabase } from "@/lib/supabase";
import { ExternalLink, X, Users } from "lucide-react";

/**
 * Persistent warning banner shown to server owners/moderators
 * when no raid members have been added yet.
 * Members are required for participant tracking on death records.
 */
export function NoMembersBanner() {
  const { user } = useAuth();
  const { currentServer } = useServer();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [hasMembers, setHasMembers] = useState(true); // optimistic

  useEffect(() => {
    if (!currentServer?.id) return;
    (async () => {
      try {
        const { count } = await supabase
          .from("members")
          .select("*", { count: "exact", head: true })
          .eq("server_id", currentServer.id);
        setHasMembers((count ?? 0) > 0);
      } catch {
        setHasMembers(false);
      }
    })();
  }, [currentServer?.id]);

  if (!user || !currentServer) return null;
  if (currentServer.role !== "owner" && currentServer.role !== "moderator") return null;
  if (hasMembers) return null;
  if (dismissed) return null;

  return (
    <div className="bg-blue-950/60 border-b border-blue-800/60">
      <div className="max-w-[90rem] mx-auto px-4 py-2.5 flex items-center gap-3">
        {/* Icon */}
        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-blue-900/50">
          <Users className="w-4 h-4 text-blue-400" />
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-blue-200 font-medium">
            No raid members added yet
          </p>
          <p className="text-xs text-blue-400/80">
            Add your guild members so you can track participants on boss kills.
            This is required for attendance and leaderboard scoring.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate("/members?highlight=add-member")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition"
          >
            <ExternalLink className="w-3 h-3" />
            Add Members
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 text-blue-500 hover:text-blue-300 hover:bg-blue-900/40 rounded-md transition"
            title="Dismiss (will reappear on next visit)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
