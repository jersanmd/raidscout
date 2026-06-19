import { supabase } from "./client";

// ── Audit Action Constants ──────────────────────────────────

export const AuditAction = {
  // Server lifecycle
  SERVER_CREATE: "server_create",
  SERVER_DELETE: "server_delete",
  SERVER_RESTORE: "server_restore",

  // Roles & ownership
  OWNERSHIP_TRANSFER: "ownership_transfer",
  MODERATOR_ADD: "moderator_add",
  MODERATOR_REMOVE: "moderator_remove",
  MOD_PERMS_UPDATE: "mod_perms_update",

  // Bosses
  BOSS_KILL: "boss_kill",
  BOSS_CREATE: "boss_create",
  BOSS_UPDATE: "boss_update",
  BOSS_DELETE: "boss_delete",
  BOSS_TOGGLE: "boss_toggle",
  BOSS_TIME_EDIT: "boss_time_edit",
  BOSS_ROTATION_ADVANCE: "boss_rotation_advance",
  BOSS_GUILDS_SET: "boss_guilds_set",
  BOSS_SPAWN_SET: "boss_spawn_set",
  ATTENDANCE_COPY: "attendance_copy",
  ATTENDANCE_ADD: "attendance_add",
  ATTENDANCE_REMOVE: "attendance_remove",

  // Activities
  ACTIVITY_CREATE: "activity_create",
  ACTIVITY_UPDATE: "activity_update",
  ACTIVITY_DELETE: "activity_delete",
  ACTIVITY_TOGGLE: "activity_toggle",
  ACTIVITY_FINALIZE: "activity_finalize",
  ACTIVITY_END_RECORD: "activity_end_record",
  ACTIVITY_GUILDS_SET: "activity_guilds_set",
  ACTIVITY_ROTATION: "activity_rotation_advance",

  // Members
  MEMBER_ADD: "member_add",
  MEMBER_REMOVE: "member_remove",
  MEMBER_CP_ADD: "member_cp_add",
  MEMBER_CP_UPDATE: "member_cp_update",
  MEMBER_CP_DELETE: "member_cp_delete",
  MEMBER_NOTE_ADD: "member_note_add",
  MEMBER_NOTE_DELETE: "member_note_delete",
  MEMBER_PROGRESS_UPDATE: "member_progress_update",

  // Gear
  GEAR_EQUIP: "gear_equip",
  GEAR_UNEQUIP: "gear_unequip",

  // Parties & Classes
  PARTY_CREATE: "party_create",
  PARTY_DELETE: "party_delete",
  PARTY_ASSIGN: "party_assign",
  PARTY_UNLINK: "party_unlink",
  PARTY_MEMBER_ADD: "party_member_add",
  PARTY_MEMBER_REMOVE: "party_member_remove",
  CLASS_CREATE: "class_create",
  CLASS_UPDATE: "class_update",
  CLASS_DELETE: "class_delete",

  // Inventory & Catalog
  ITEM_CREATE: "item_create",
  ITEM_UPDATE: "item_update",
  ITEM_DELETE: "item_delete",
  ITEM_DISTRIBUTE: "item_distribute",
  ITEM_APPROVE: "item_approve",
  ITEM_REJECT: "item_reject",

  // Rally / Screenshots
  RALLY_IMAGE_DELETE: "rally_image_delete",

  // Leaderboard
  LEADERBOARD_FINALIZE: "leaderboard_finalize",

  // Settings
  SETTINGS_UPDATE: "settings_update",
  INVITE_REGENERATE: "invite_regenerate",
  VIEWER_KEY_REGENERATE: "viewer_key_regenerate",
  SEED_FROM_GAME: "seed_from_game",

  // Subscription
  SUBSCRIPTION_EXTEND: "subscription_extend",

  // Admin-only
  FORCE_SPAWN: "force_spawn",
  MAINTENANCE_ON: "maintenance_on",
  MAINTENANCE_OFF: "maintenance_off",
  GAME_CREATE: "game_create",
  GAME_UPDATE: "game_update",
  GAME_DELETE: "game_delete",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

// ── Audit Action Groups (for filter UI) ─────────────────────

export const AUDIT_ACTION_GROUPS: { label: string; actions: AuditActionType[] }[] = [
  {
    label: "Server",
    actions: [AuditAction.SERVER_CREATE, AuditAction.SERVER_DELETE, AuditAction.SERVER_RESTORE],
  },
  {
    label: "Roles",
    actions: [
      AuditAction.OWNERSHIP_TRANSFER,
      AuditAction.MODERATOR_ADD,
      AuditAction.MODERATOR_REMOVE,
      AuditAction.MOD_PERMS_UPDATE,
    ],
  },
  {
    label: "Bosses",
    actions: [
      AuditAction.BOSS_KILL,
      AuditAction.BOSS_CREATE,
      AuditAction.BOSS_UPDATE,
      AuditAction.BOSS_DELETE,
      AuditAction.BOSS_TOGGLE,
      AuditAction.BOSS_TIME_EDIT,
      AuditAction.ATTENDANCE_COPY,
      AuditAction.ATTENDANCE_ADD,
      AuditAction.ATTENDANCE_REMOVE,
    ],
  },
  {
    label: "Activities",
    actions: [
      AuditAction.ACTIVITY_CREATE,
      AuditAction.ACTIVITY_UPDATE,
      AuditAction.ACTIVITY_DELETE,
      AuditAction.ACTIVITY_TOGGLE,
      AuditAction.ACTIVITY_FINALIZE,
      AuditAction.ACTIVITY_GUILDS_SET,
      AuditAction.ACTIVITY_ROTATION,
    ],
  },
  {
    label: "Members",
    actions: [
      AuditAction.MEMBER_ADD,
      AuditAction.MEMBER_REMOVE,
      AuditAction.MEMBER_CP_ADD,
      AuditAction.MEMBER_CP_UPDATE,
      AuditAction.MEMBER_CP_DELETE,
      AuditAction.MEMBER_NOTE_ADD,
      AuditAction.MEMBER_NOTE_DELETE,
      AuditAction.MEMBER_PROGRESS_UPDATE,
    ],
  },
  {
    label: "Gear",
    actions: [AuditAction.GEAR_EQUIP, AuditAction.GEAR_UNEQUIP],
  },
  {
    label: "Parties & Classes",
    actions: [
      AuditAction.PARTY_CREATE,
      AuditAction.PARTY_UPDATE,
      AuditAction.PARTY_DELETE,
      AuditAction.CLASS_CREATE,
      AuditAction.CLASS_UPDATE,
      AuditAction.CLASS_DELETE,
    ],
  },
  {
    label: "Inventory",
    actions: [
      AuditAction.ITEM_CREATE,
      AuditAction.ITEM_UPDATE,
      AuditAction.ITEM_DELETE,
      AuditAction.ITEM_DISTRIBUTE,
      AuditAction.ITEM_APPROVE,
      AuditAction.ITEM_REJECT,
    ],
  },
  {
    label: "Leaderboard",
    actions: [AuditAction.LEADERBOARD_FINALIZE],
  },
  {
    label: "Settings",
    actions: [
      AuditAction.SETTINGS_UPDATE,
      AuditAction.INVITE_REGENERATE,
      AuditAction.VIEWER_KEY_REGENERATE,
      AuditAction.SEED_FROM_GAME,
      AuditAction.RALLY_IMAGE_DELETE,
    ],
  },
  {
    label: "Subscription",
    actions: [AuditAction.SUBSCRIPTION_EXTEND],
  },
  {
    label: "Admin",
    actions: [
      AuditAction.FORCE_SPAWN,
      AuditAction.MAINTENANCE_ON,
      AuditAction.MAINTENANCE_OFF,
      AuditAction.GAME_CREATE,
      AuditAction.GAME_UPDATE,
      AuditAction.GAME_DELETE,
    ],
  },
];

// ── Audit API ───────────────────────────────────────────────

export interface AuditEntry {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any>;
  server_id: string | null;
  viewer_key: string | null;
  created_at: string;
}

/** Write an audit entry. Uses the SECURITY DEFINER RPC so owners & moderators can write. */
export async function writeAuditEntry(entry: {
  action: string;
  server_id: string;
  target_type?: string;
  target_id?: string;
  details?: Record<string, any>;
  viewer_key?: string;
  discord_actor?: string;
}): Promise<void> {
  // Fire-and-forget: don't block the caller on audit failure
  supabase
    .rpc("write_audit_entry", {
      p_action: entry.action,
      p_server_id: entry.server_id,
      p_target_type: entry.target_type || null,
      p_target_id: entry.target_id || null,
      p_details: entry.details || {},
      p_viewer_key: entry.viewer_key || null,
      p_discord_actor: entry.discord_actor || null,
    })
    .then(
      ({ error }) => {
        if (error) console.warn("[audit] write failed:", error.message, error.code);
      },
      (err: any) => {
        console.warn("[audit] RPC error:", err?.message || err);
      },
    );
}

/** Fetch audit log entries with cursor pagination (by id) and optional action filter. */
export async function fetchAuditLog(
  limit = 200,
  serverId?: string | null,
  cursor?: number | null,
  actionFilter?: string | null,
  since?: string | null,
  until?: string | null
): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc("get_audit_log", {
    p_server_id: serverId || null,
    p_limit: limit,
    p_cursor: cursor || null,
    p_action_filter: actionFilter || null,
    p_since: since || null,
    p_until: until || null,
  });
  if (error) throw error;
  return (data as AuditEntry[]) ?? [];
}
