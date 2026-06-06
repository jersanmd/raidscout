export type SpawnType = "fixed_hours" | "fixed_schedule" | "one_time";

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
  /** Fixed weekly schedule (for fixed_schedule) or { time, start_date, utc_start } (for fixed_hours) */
  schedule: ScheduleSlot[] | null;
  server_id?: string;
  created_at: string;
  /** Points awarded per attendance (default 1) */
  boss_points?: number;
  /** Manual offset for guild rotation (+n forward, -n back) — deprecated, use rotation_counter */
  rotation_adjustment?: number;
  /** Current rotation index (0-based), wraps within guild count on each kill */
  rotation_counter?: number;
  // Multi-game extensions
  template_id?: string | null;
  is_recurring?: boolean;
  is_enabled?: boolean;
  category?: string | null;
  tags?: string[];
  is_custom?: boolean;
  points?: number;
  image_url?: string | null;
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
  is_final?: boolean;
}

// ── Attendance System ───────────────────────────────────────

export interface Member {
  id: string;
  name: string;
  guild_id?: string | null;
  combat_power?: number | null;
  class?: string | null;
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
  /** Per-guild point override (null = use server default boss_points) */
  points?: number | null;
  /** Per-guild salary toggle */
  has_salary?: boolean;
}

export interface ActivityGuild {
  id: string;
  activity_id: string;
  guild_id: string;
  sort_order: number | null;
  day_of_week: number | null;
  mode: "rotation" | "schedule" | "daily" | "all";
  points?: number | null;
  has_salary?: boolean;
}

export interface ActivityAssist {
  id: string;
  activity_id: string;
  owner_guild_id: string;
  assistant_guild_id: string;
  server_id: string;
  created_at: string;
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
  bossPoints?: number;
  activityPoints?: number;
  bossKills?: number;
  activitiesAttended?: number;
  bossesByKill?: Record<string, number>;
  activitiesByAttendance?: Record<string, number>;
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
  activities: ActivityInfo[];
}

// ── Point Rules ─────────────────────────────────────────────

export interface PointRule {
  id: string;
  server_id: string;
  guild_id: string;
  rule_type: "time_multiplier";
  config: PointRuleTimeMultiplierConfig;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PointRuleTimeMultiplierConfig {
  start_hour: number;  // 0-23
  end_hour: number;    // 0-23
  multiplier: number;  // e.g. 2.0 = double
}

// ── Multi-Game Types ───────────────────────────────────────

export interface Game {
  id: string;
  name: string;
  slug: string;
  icon_url?: string | null;
  supported_spawn_types: string[];
  created_at: string;
}

export interface BossTemplate {
  id: string;
  game_id: string;
  name: string;
  spawn_type: string;
  respawn_hours?: number | null;
  schedule?: ScheduleSlot[] | null;
  is_recurring: boolean;
  category?: string | null;
  tags?: string[];
  points: number;
  image_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityTemplate {
  id: string;
  game_id: string;
  name: string;
  schedule_type: "fixed_hours" | "fixed_schedule" | "one_time";
  schedule?: ScheduleSlot[] | null;
  duration_minutes?: number | null;
  points_per_participant: number;
  party_size?: number | null;
  category?: string | null;
  tags?: string[];
  image_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  server_id: string;
  template_id?: string | null;
  name: string;
  schedule_type: "fixed_hours" | "fixed_schedule" | "one_time";
  schedule?: ScheduleSlot[] | null;
  duration_minutes?: number | null;
  points_per_participant: number;
  party_size?: number | null;
  is_enabled: boolean;
  is_custom: boolean;
  created_at: string;
  image_url?: string | null;
}

export interface ActivityInstance {
  id: string;
  activity_id: string;
  start_time: string;
  end_time?: string | null;
  created_at: string;
}

export interface ActivityParty {
  id: string;
  activity_instance_id: string;
  party_number: number;
  member_ids: string[];
  created_at: string;
}

export interface ActivityAttendance {
  id: string;
  activity_instance_id: string;
  member_id: string;
  present: boolean;
  created_at: string;
}

export interface ActivityInfo {
  activity: Activity;
  activityInstance: ActivityInstance;
  startTime: Date;
  status: "countdown" | "active" | "completed";
}

// ── Boss Assists ────────────────────────────────────────────

/** A guild that assists another guild on a specific boss */
export interface BossAssist {
  id: string;
  boss_id: string;
  owner_guild_id: string;
  assistant_guild_id: string;
  server_id: string;
  created_at: string;
}
