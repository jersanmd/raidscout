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
  activityInstanceId?: string;
  activityImageUrl?: string | null;
  bossImageUrl?: string | null;
  createdAt: string;
  ownerGuildName?: string;
  ownerGuildId?: string;
  attendanceCount?: number;
}
