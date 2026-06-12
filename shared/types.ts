// ── Shared Types — single source of truth for frontend + bot ──
// Import from here in both src/ and scripts/bot/
// Edge functions (Deno): keep a copy — add "// Keep in sync with shared/types.ts"

export interface ScheduleSlot {
  day: number;  // 0=Sun, 6=Sat — UTC for templates, local for legacy seed data
  time: string; // "HH:MM"
}

export interface MemberBossKill {
  boss_name: string;
  killed_at: string;
  death_record_id: string;
  points?: number;
  image_url?: string | null;
  guild_name?: string | null;
}

export interface MemberActivityAttendance {
  activity_name: string;
  attended_at: string;
  activity_instance_id: string;
  points?: number;
}

export interface Boss {
  id: string;
  name: string;
  server_id: string;
  spawn_type: string; // "fixed_hours" | "fixed_schedule"
  respawn_hours: number | null;
  schedule: ScheduleSlot[] | null;
  is_enabled: boolean;
  is_recurring: boolean;
  is_custom?: boolean;
  template_id?: string | null;
  image_url?: string | null;
  category?: string | null;
  tags?: string[];
  points?: number;
  rotation_counter?: number;
  created_at?: string;
  deleted_at?: string | null;
}

export interface Activity {
  id: string;
  name: string;
  server_id: string;
  schedule_type: string; // "fixed_hours" | "fixed_schedule" | "one_time"
  schedule: any; // object or array depending on schedule_type
  is_enabled: boolean;
  is_custom?: boolean;
  template_id?: string | null;
  duration_minutes?: number | null;
  points_per_participant?: number;
  party_size?: number | null;
  image_url?: string | null;
  category?: string | null;
  tags?: string[];
  created_at?: string;
  deleted_at?: string | null;
}

export interface ActivityInstance {
  id: string;
  activity_id: string;
  start_time: string | null;
  end_time: string | null;
  created_at?: string;
}
