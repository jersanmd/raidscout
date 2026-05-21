import { Bell, BellOff } from "lucide-react";
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  requestNotificationPermission,
} from "@/lib/notifications";

interface NotificationToggleProps {
  bossId: string;
  bossName: string;
}

export function NotificationToggle({ bossId }: NotificationToggleProps) {
  const prefs = loadNotificationPrefs();
  const isEnabled = prefs.enabledBossIds.includes(bossId);

  const toggle = async () => {
    // Request permission first if needed
    if (!isEnabled && Notification.permission !== "granted") {
      const granted = await requestNotificationPermission();
      if (!granted) return;
    }

    const newPrefs = { ...prefs };
    if (isEnabled) {
      newPrefs.enabledBossIds = newPrefs.enabledBossIds.filter((id) => id !== bossId);
    } else {
      newPrefs.enabledBossIds = [...newPrefs.enabledBossIds, bossId];
    }
    saveNotificationPrefs(newPrefs);
    // Force re-render hack — reload prefs on next render
    window.dispatchEvent(new Event("notify-prefs-changed"));
  };

  return (
    <button
      onClick={toggle}
      className={`p-1.5 rounded-lg transition ${
        isEnabled
          ? "bg-amber-900/30 text-amber-400 border border-amber-800"
          : "text-slate-600 hover:text-slate-400"
      }`}
      title={isEnabled ? "Notifications on" : "Notifications off"}
    >
      {isEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
    </button>
  );
}
