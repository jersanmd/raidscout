const NOTIFICATION_PREFS_KEY = "lordnine-notify-prefs";

export interface NotificationPrefs {
  /** Boss IDs for which notifications are enabled */
  enabledBossIds: string[];
  /** Global notification toggle */
  globalEnabled: boolean;
}

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { enabledBossIds: [], globalEnabled: false };
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/**
 * Schedule a browser notification `minutesBefore` minutes before the spawn time.
 * Returns a timer ID that can be used with clearTimeout.
 */
export function scheduleSpawnNotification(
  bossName: string,
  spawnTime: Date,
  minutesBefore: number = 5
): number {
  const now = Date.now();
  const targetTime = spawnTime.getTime() - minutesBefore * 60_000;
  const delay = targetTime - now;

  if (delay <= 0) return 0; // Already past notification time

  return window.setTimeout(() => {
    if (Notification.permission === "granted") {
      new Notification(`⚠️ ${bossName} spawning soon!`, {
        body: `Spawns in ${minutesBefore} minute${minutesBefore > 1 ? "s" : ""} (${spawnTime.toLocaleTimeString()})`,
        icon: "/vite.svg",
        tag: `boss-${bossName}`,
      });
    }
  }, delay);
}

/** Active notification timers */
let activeTimers: number[] = [];

export function clearAllNotifications(): void {
  activeTimers.forEach((id) => clearTimeout(id));
  activeTimers = [];
}

export function scheduleAllNotifications(
  bossNames: string[],
  spawnTimes: (Date | null)[],
  minutesBefore: number = 5
): void {
  clearAllNotifications();
  for (let i = 0; i < bossNames.length; i++) {
    if (spawnTimes[i]) {
      const id = scheduleSpawnNotification(bossNames[i], spawnTimes[i]!, minutesBefore);
      if (id) activeTimers.push(id);
    }
  }
}
