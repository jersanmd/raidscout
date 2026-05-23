export interface HistoryEntry {
  id: string;
  bossName: string;
  deathTime: string;
  respawnTime: string;
  spawnType: "fixed_hours" | "fixed_schedule";
  /** Supabase death_record id — used to look up attendees */
  deathRecordId?: string;
  createdAt: string;
  /** Guild that killed the boss (from owner_guild_id) */
  ownerGuildName?: string;
}

const HISTORY_KEY = "lordnine-history";

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

function generateId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch { /* fall through */ }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function addHistoryEntry(entry: Omit<HistoryEntry, "id" | "createdAt">): HistoryEntry {
  const history = loadHistory();
  const newEntry: HistoryEntry = {
    ...entry,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  history.unshift(newEntry);
  // Keep last 200 entries max
  if (history.length > 200) history.length = 200;
  saveHistory(history);
  return newEntry;
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}
