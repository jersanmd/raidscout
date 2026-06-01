export interface HistoryEntry {
  id: string;
  type: "boss" | "activity";
  bossName?: string;
  activityName?: string;
  deathTime?: string;
  completionTime?: string;
  respawnTime?: string;
  spawnType?: "fixed_hours" | "fixed_schedule";
  deathRecordId?: string;
  createdAt: string;
  ownerGuildName?: string;
  attendanceCount?: number;
}
