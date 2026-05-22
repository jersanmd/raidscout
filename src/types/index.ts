export type SpawnType = "fixed_hours" | "fixed_schedule";

export interface ScheduleSlot {
  /** 0=Sunday, 1=Monday, ..., 6=Saturday (JavaScript convention) */
  day: number;
  /** "HH:MM" in 24h format, local timezone */
  time: string;
}

export interface Boss {
  id: string;
  name: string;
  spawn_type: SpawnType;
  /** Hours until respawn after death (only for fixed_hours bosses) */
  respawn_hours: number | null;
  /** Fixed weekly schedule (only for fixed_schedule bosses) */
  schedule: ScheduleSlot[] | null;
  server_id?: string;
  created_at: string;
  /** Points awarded per attendance (default 1) */
  boss_points?: number;
  /** Manual offset for guild rotation (+n forward, -n back) */
  rotation_adjustment?: number;
}

export interface DeathRecord {
  id: string;
  boss_id: string;
  user_id: string;
  death_time: string;
  rally_image_url: string | null;
  created_at: string;
  server_id?: string | null;
  owner_guild_id?: string | null;
  is_initial_spawn?: boolean | null;
  display_owner_guild_id?: string | null;
}

// ── Attendance System ───────────────────────────────────────

export interface Member {
  id: string;
  name: string;
  guild_id?: string | null;
  created_at: string;
}

export interface Guild {
  id: string;
  name: string;
  server_id: string;
  created_at: string;
}

export interface BossGuild {
  id: string;
  boss_id: string;
  guild_id: string;
  sort_order: number | null;  // rotation/daily mode
  day_of_week: number | null;  // schedule mode (0=Sun..6=Sat)
  mode?: "rotation" | "schedule" | "daily";  // assignment mode
}

export interface AttendanceRecord {
  id: string;
  death_record_id: string;
  member_id: string;
  created_at: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  points: number;
  last_attended: string | null;
}

/** A manual point adjustment by a moderator/owner */
export interface PointAdjustment {
  id: string;
  member_id: string;
  member_name: string;
  points: number;
  reason: string;
  adjusted_by_name: string;
  created_at: string;
}

/** A single ranked member in a leaderboard snapshot */
export interface SnapshotRanking {
  rank: number;
  memberId: string;
  memberName: string;
  points: number;
}

export interface LeaderboardSnapshot {
  id: string;
  finalized_at: string;
  period: "all_time" | "weekly" | "monthly";
  rankings: SnapshotRanking[];
  created_at: string;
}

export type SpawnStatus = "unknown" | "alive" | "countdown";

export interface SpawnInfo {
  boss: Boss;
  /** When the boss will next spawn, or null if unknown */
  nextSpawn: Date | null;
  /** Current status of the boss */
  status: SpawnStatus;
  /** The death record that determined this spawn (for fixed_hours only) */
  deathRecord: DeathRecord | null;
}

export interface BossWithSpawn extends SpawnInfo {
  /** Remaining ms until spawn (negative if already spawned) */
  remainingMs: number;
}

export interface WeekDaySpawns {
  day: number;
  dayName: string;
  date: Date;
  isToday: boolean;
  spawns: SpawnInfo[];
}
