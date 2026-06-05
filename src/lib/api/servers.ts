import { supabase, getCurrentServerId, getCurrentViewerKey } from "./client";

// ── Server Management ──────────────────────────────────────

export async function createServer(name: string, gameId: string | null, seed: boolean = true, guildName?: string): Promise<{ id: string; name: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .rpc("create_server_with_bosses", {
      p_name: name.trim(),
      p_game_id: gameId,
      p_seed: seed,
      p_guild_name: guildName?.trim() || null,
    });

  if (error) throw error;
  return { id: data as string, name: name.trim() };
}

export async function updateServerName(serverId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("servers")
    .update({ name: name.trim() })
    .eq("id", serverId);
  if (error) throw error;
}

export async function deleteServer(serverId: string): Promise<void> {
  const { error } = await supabase
    .from("servers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", serverId);
  if (error) throw error;
}

export async function restoreServer(serverId: string): Promise<void> {
  const { error } = await supabase
    .rpc("restore_server", { p_server_id: serverId });
  if (error) throw error;
}

export async function transferServerOwnership(serverId: string, newOwnerId: string): Promise<void> {
  const { error } = await supabase
    .rpc("transfer_server_ownership", { s_id: serverId, new_owner_id: newOwnerId });
  if (error) throw error;
}

export async function transferServerOwnershipByEmail(serverId: string, email: string): Promise<void> {
  const { data, error } = await supabase
    .rpc("get_user_id_by_email", { user_email: email.toLowerCase().trim() });

  if (error || !data) {
    throw new Error(`Could not find user with email "${email}". Ask them to sign up first.`);
  }

  const { error: transferErr } = await supabase
    .rpc("transfer_server_ownership", { s_id: serverId, new_owner_id: data as string });

  if (transferErr) throw transferErr;
}

export async function addServerModerator(serverId: string, email: string): Promise<void> {
  const { data, error } = await supabase
    .rpc("get_user_id_by_email", { user_email: email.toLowerCase().trim() });

  if (error || !data) {
    throw new Error(`Could not find user with email "${email}". Ask them to sign up first.`);
  }

  await addServerModeratorById(serverId, data as string);
}

export async function addServerModeratorById(serverId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("server_members")
    .upsert({ server_id: serverId, user_id: userId, role: "moderator" });
  if (error) throw error;
}

export async function removeServerModerator(serverId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("server_members")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ── Server Members ──────────────────────────────────────────

export interface ServerMember {
  user_id: string;
  role: "owner" | "moderator";
  email?: string;
}

export async function fetchServerMembers(serverId: string): Promise<ServerMember[]> {
  const { data, error } = await supabase
    .rpc("get_server_members", { s_id: serverId });
  if (error) throw error;
  return ((data as any[]) ?? []).map((row) => ({
    user_id: row.user_id,
    role: row.role,
    email: row.email ?? undefined,
  }));
}

// ── Moderator Permissions ────────────────────────────────────

export type ModeratorPermissions = {
  can_access_settings: boolean;
  can_manage_guilds: boolean;
  can_manage_viewer_key: boolean;
  can_change_timezone: boolean;
  can_manage_boss_guilds: boolean;
  can_manage_moderators: boolean;
  can_access_integrations: boolean;
  can_edit_participants: boolean;
  can_export_attendance: boolean;
  can_manage_raid_members: boolean;
  can_adjust_points: boolean;
  can_record_death: boolean;
  can_edit_death_records: boolean;
  can_set_spawn: boolean;
  can_rotate_guilds: boolean;
  can_announce_discord: boolean;
};

export const DEFAULT_MODERATOR_PERMISSIONS: ModeratorPermissions = {
  can_access_settings: false,
  can_manage_guilds: false,
  can_manage_viewer_key: false,
  can_change_timezone: false,
  can_manage_boss_guilds: false,
  can_manage_moderators: false,
  can_access_integrations: false,
  can_edit_participants: false,
  can_export_attendance: false,
  can_manage_raid_members: false,
  can_adjust_points: false,
  can_record_death: false,
  can_edit_death_records: false,
  can_set_spawn: false,
  can_rotate_guilds: false,
  can_announce_discord: false,
};

export async function fetchModeratorPermissions(serverId: string): Promise<Record<string, ModeratorPermissions>> {
  // Try RPC first (bypasses RLS), fall back to direct query
  let rows: any[] | null = null;
  
  try {
    const { data, error } = await supabase.rpc("fetch_moderator_permissions", { p_server_id: serverId });
    if (!error && data) rows = data as any[];
  } catch { /* RPC not deployed — fall through */ }
  
  if (!rows) {
    const { data, error } = await supabase
      .from("moderator_permissions")
      .select("*")
      .eq("server_id", serverId);
    if (error) throw error;
    rows = (data as any[]) ?? [];
  }
  
  const result: Record<string, ModeratorPermissions> = {};
  for (const row of rows) {
    result[row.user_id] = {
      can_access_settings: row.can_access_settings,
      can_manage_guilds: row.can_manage_guilds,
      can_manage_viewer_key: row.can_manage_viewer_key,
      can_change_timezone: row.can_change_timezone,
      can_manage_boss_guilds: row.can_manage_boss_guilds,
      can_manage_moderators: row.can_manage_moderators,
      can_access_integrations: row.can_access_integrations,
      can_edit_participants: row.can_edit_participants,
      can_export_attendance: row.can_export_attendance,
      can_manage_raid_members: row.can_manage_raid_members,
      can_adjust_points: row.can_adjust_points,
      can_record_death: row.can_record_death,
      can_edit_death_records: row.can_edit_death_records,
      can_set_spawn: row.can_set_spawn,
      can_rotate_guilds: row.can_rotate_guilds,
      can_announce_discord: row.can_announce_discord,
    };
  }
  return result;
}

export async function updateModeratorPermissions(
  serverId: string,
  userId: string,
  permissions: Partial<ModeratorPermissions>
): Promise<void> {
  // Try RPC first (bypasses RLS), fall back to direct query
  try {
    const { error } = await supabase.rpc("upsert_moderator_permissions", {
      p_server_id: serverId,
      p_user_id: userId,
      p_can_access_settings: permissions.can_access_settings ?? false,
      p_can_manage_guilds: permissions.can_manage_guilds ?? false,
      p_can_manage_viewer_key: permissions.can_manage_viewer_key ?? false,
      p_can_change_timezone: permissions.can_change_timezone ?? false,
      p_can_manage_boss_guilds: permissions.can_manage_boss_guilds ?? false,
      p_can_manage_moderators: permissions.can_manage_moderators ?? false,
      p_can_access_integrations: permissions.can_access_integrations ?? false,
      p_can_edit_participants: permissions.can_edit_participants ?? false,
      p_can_export_attendance: permissions.can_export_attendance ?? false,
      p_can_manage_raid_members: permissions.can_manage_raid_members ?? false,
      p_can_adjust_points: permissions.can_adjust_points ?? false,
      p_can_record_death: permissions.can_record_death ?? false,
      p_can_edit_death_records: permissions.can_edit_death_records ?? false,
      p_can_set_spawn: permissions.can_set_spawn ?? false,
      p_can_rotate_guilds: permissions.can_rotate_guilds ?? false,
      p_can_announce_discord: permissions.can_announce_discord ?? false,
    });
    if (!error) return; // RPC succeeded
    // If error is NOT "function not found", throw it
    if (error.code !== "42883" && !error.message?.includes("Could not find the function")) {
      throw error;
    }
  } catch (err: any) {
    // Only fall through if RPC doesn't exist; re-throw all other errors
    if (err?.code === "42883" || err?.message?.includes("Could not find")) {
      // fall through to direct operations
    } else {
      throw err;
    }
  }

  // Fallback: check-then-insert-or-update via direct table access
  const { data: existing } = await supabase
    .from("moderator_permissions")
    .select("server_id")
    .eq("server_id", serverId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("moderator_permissions")
      .update(permissions)
      .eq("server_id", serverId)
      .eq("user_id", userId);
    if (error) throw error;

    // Verify update actually persisted (RLS can silently skip rows)
    const { data: verify } = await supabase
      .from("moderator_permissions")
      .select("can_access_settings")
      .eq("server_id", serverId)
      .eq("user_id", userId)
      .maybeSingle();
    if (verify && permissions.can_access_settings !== undefined && verify.can_access_settings !== permissions.can_access_settings) {
      throw new Error("Permission update was blocked by access policy. Apply migration 055 (RPC) to fix.");
    }
  } else {
    const { error } = await supabase
      .from("moderator_permissions")
      .insert({ server_id: serverId, user_id: userId, ...permissions });
    if (error) throw error;
  }
}

// ── Viewer Toggles ──────────────────────────────────────────

export async function toggleViewerCanEdit(serverId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_viewer_can_edit", {
    p_server_id: serverId,
  });
  if (error) throw new Error(error.message);
  return data as boolean;
}

export async function toggleViewerCanMarkDied(serverId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_viewer_can_mark_died", {
    p_server_id: serverId,
  });
  if (error) throw new Error(error.message);
  return data as boolean;
}
