import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface Notification {
  id: string;
  user_id: string;
  server_id?: string | null;
  type: string;
  title: string;
  body?: string | null;
  read: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

const TYPE_ICONS: Record<string, string> = {
  subscription_expiring: "⏳",
  payment_failed: "💳",
  trial_ending: "⏰",
  new_login: "🔐",
  password_changed: "🔑",
  email_verification: "📧",
  feature_announcement: "🚀",
  team_invitation: "👥",
  permission_change: "🛡️",
  ownership_transfer: "👑",
  moderator_joined: "🤝",
  role_change: "🔄",
  missing_member_data: "⚠️",
  discord_disconnected: "🔌",
  bot_permissions: "🤖",
  sync_failure: "❌",
  import_export: "📦",
  invite_code_change: "🔗",
  viewer_key_generated: "👁️",
  dkp_outbid: "↗️",
  dkp_won: "🏆",
  dkp_lost: "✖️",
  member_unlinked: "🔓",
};

export function typeIcon(type: string): string {
  return TYPE_ICONS[type] ?? "🔔";
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) { setNotifications([]); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setNotifications((data as Notification[]) ?? []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-" + user.id)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    try {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    } catch {}
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
    } catch {}
  }, [user]);

  return { notifications, unreadCount, loading, markRead, markAllRead, refresh: fetchNotifications };
}
