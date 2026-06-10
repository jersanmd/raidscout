import type { Boss, ScheduleSlot } from "@/types";

/**
 * All 39 LordNine bosses with their spawn configurations.
 * Times are interpreted in the user's local timezone.
 */
export const BOSSES: Omit<Boss, "id" | "created_at">[] = [
  // ── Fixed Hours ──────────────────────────────────────────
  { name: "Venatus", spawn_type: "fixed_hours", respawn_hours: 10, schedule: null },
  { name: "Viorent", spawn_type: "fixed_hours", respawn_hours: 10, schedule: null },
  { name: "Ego", spawn_type: "fixed_hours", respawn_hours: 21, schedule: null },
  { name: "Livera", spawn_type: "fixed_hours", respawn_hours: 24, schedule: null },
  { name: "Araneo", spawn_type: "fixed_hours", respawn_hours: 24, schedule: null },
  { name: "Undomiel", spawn_type: "fixed_hours", respawn_hours: 24, schedule: null },
  { name: "Lady Dalia", spawn_type: "fixed_hours", respawn_hours: 18, schedule: null },
  { name: "General Aquleus", spawn_type: "fixed_hours", respawn_hours: 29, schedule: null },
  { name: "Amentis", spawn_type: "fixed_hours", respawn_hours: 29, schedule: null },
  { name: "Baron", spawn_type: "fixed_hours", respawn_hours: 32, schedule: null },
  { name: "Wannitas", spawn_type: "fixed_hours", respawn_hours: 48, schedule: null },
  { name: "Metus", spawn_type: "fixed_hours", respawn_hours: 48, schedule: null },
  { name: "Duplican", spawn_type: "fixed_hours", respawn_hours: 48, schedule: null },
  { name: "Shuliar", spawn_type: "fixed_hours", respawn_hours: 35, schedule: null },
  { name: "Gareth", spawn_type: "fixed_hours", respawn_hours: 32, schedule: null },
  { name: "Titore", spawn_type: "fixed_hours", respawn_hours: 37, schedule: null },
  { name: "Larba", spawn_type: "fixed_hours", respawn_hours: 35, schedule: null },
  { name: "Catena", spawn_type: "fixed_hours", respawn_hours: 35, schedule: null },
  { name: "Secreta", spawn_type: "fixed_hours", respawn_hours: 62, schedule: null },
  { name: "Ordo", spawn_type: "fixed_hours", respawn_hours: 62, schedule: null },
  { name: "Asta", spawn_type: "fixed_hours", respawn_hours: 62, schedule: null },
  { name: "Supore", spawn_type: "fixed_hours", respawn_hours: 62, schedule: null },

  // ── Fixed Schedule ───────────────────────────────────────
  // Single-slot bosses
  { name: "Milavy", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 6, time: "15:00" }] },
  { name: "Ringor", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 6, time: "17:00" }] },
  { name: "Roderick", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 5, time: "19:00" }] },
  { name: "Chaiflock", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 0, time: "15:00" }] },
  { name: "Benji", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 0, time: "21:00" }] },
  { name: "Nevaeh", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 0, time: "22:00" }] },
  { name: "Tumier", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 0, time: "19:00" }] },
  { name: "Lucus", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 6, time: "22:00" }] },

  // Split multi-slot bosses into individual entries
  { name: "Clemantis · Mon", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 1, time: "11:30" }] },
  { name: "Clemantis · Thu", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 4, time: "19:00" }] },
  { name: "Saphirus · Sun", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 0, time: "17:00" }] },
  { name: "Saphirus · Tue", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 2, time: "11:30" }] },
  { name: "Neutro · Tue", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 2, time: "19:00" }] },
  { name: "Neutro · Thu", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 4, time: "11:30" }] },
  { name: "Thymele · Mon", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 1, time: "11:00" }] },
  { name: "Thymele · Wed", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 3, time: "03:30" }] },
  { name: "Auraq · Wed", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 3, time: "21:00" }] },
  { name: "Auraq · Fri", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 5, time: "22:00" }] },
  { name: "Libitina · Mon", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 1, time: "21:00" }] },
  { name: "Libitina · Sat", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 6, time: "21:00" }] },
  { name: "Rakajeth · Sun", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 0, time: "19:00" }] },
  { name: "Rakajeth · Tue", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 2, time: "22:00" }] },
  { name: "Icaruthia · Tue", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 2, time: "21:00" }] },
  { name: "Icaruthia · Fri", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 5, time: "21:00" }] },
  { name: "Motti · Wed", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 3, time: "19:00" }] },
  { name: "Motti · Sat", spawn_type: "fixed_schedule", respawn_hours: null, schedule: [{ day: 6, time: "19:00" }] },
];

/** Day-of-week names (JS: 0=Sun, 1=Mon, ..., 6=Sat) */
export const DAY_NAMES: [string, ...string[]] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Short day names */
export const DAY_NAMES_SHORT: [string, ...string[]] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

/** Filter window options in hours */
export const FILTER_WINDOWS = [1, 8, 24] as const;

/** Guild color palette — 10 distinct colors for guild differentiation */
const GUILD_COLORS = [
  { bg: "bg-purple-900/30", text: "text-purple-400", border: "border-purple-800/50" },
  { bg: "bg-emerald-900/30", text: "text-emerald-400", border: "border-emerald-800/50" },
  { bg: "bg-amber-900/30", text: "text-amber-400", border: "border-amber-800/50" },
  { bg: "bg-cyan-900/30", text: "text-cyan-400", border: "border-cyan-800/50" },
  { bg: "bg-pink-900/30", text: "text-pink-400", border: "border-pink-800/50" },
  { bg: "bg-indigo-900/30", text: "text-indigo-400", border: "border-indigo-800/50" },
  { bg: "bg-rose-900/30", text: "text-rose-400", border: "border-rose-800/50" },
  { bg: "bg-teal-900/30", text: "text-teal-400", border: "border-teal-800/50" },
  { bg: "bg-orange-900/30", text: "text-orange-400", border: "border-orange-800/50" },
  { bg: "bg-lime-900/30", text: "text-lime-400", border: "border-lime-800/50" },
];

/** Get a deterministic color for a guild name */
export function guildColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return GUILD_COLORS[Math.abs(hash) % GUILD_COLORS.length];
}
