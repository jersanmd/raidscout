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

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}
