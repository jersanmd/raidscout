import { supabase, getCurrentServerId, getCurrentViewerKey } from "./client";
import { writeAuditEntry, AuditAction } from "./audit";

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
  const serverId = data as string;
  writeAuditEntry({ action: AuditAction.SERVER_CREATE, server_id: serverId, details: { server_name: name.trim(), game_id: gameId } });
  return { id: serverId, name: name.trim() };
}

export async function updateServerName(serverId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("servers")
    .update({ name: name.trim() })
    .eq("id", serverId);
  if (error) throw error;
  writeAuditEntry({ action: AuditAction.SETTINGS_UPDATE, server_id: serverId, details: { setting: "server_name", value: name.trim() } });
}

export async function deleteServer(serverId: string): Promise<void> {
  const { data, error } = await supabase
    .from("servers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", serverId)
    .select("id, name");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Server not found or you lack permission to delete it.");
  writeAuditEntry({ action: AuditAction.SERVER_DELETE, server_id: serverId, details: { server_name: (data[0] as any).name } });
}

export async function restoreServer(serverId: string): Promise<void> {
  const { error } = await supabase
    .rpc("restore_server", { p_server_id: serverId });
  if (error) throw error;
  // Fetch server name for audit
  let serverName = serverId;
  try {
    const { data } = await supabase.from("servers").select("name").eq("id", serverId).single();
    if (data) serverName = (data as any).name;
  } catch { /* ignore */ }
  writeAuditEntry({ action: AuditAction.SERVER_RESTORE, server_id: serverId, details: { server_name: serverName } });
}

export async function transferServerOwnership(serverId: string, newOwnerId: string, newOwnerEmail?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .rpc("transfer_server_ownership", { s_id: serverId, new_owner_id: newOwnerId });
  if (error) throw error;
  writeAuditEntry({ action: AuditAction.OWNERSHIP_TRANSFER, server_id: serverId, details: { old_owner_email: user?.email || user?.id, new_owner_email: newOwnerEmail || newOwnerId } });
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

  const targetUserId = data as string;
  await addServerModeratorById(serverId, targetUserId);
  writeAuditEntry({ action: AuditAction.MODERATOR_ADD, server_id: serverId, details: { target_email: email.toLowerCase().trim(), target_user_id: targetUserId } });
}

export async function addServerModeratorById(serverId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("server_members")
    .upsert({ server_id: serverId, user_id: userId, role: "moderator" });
  if (error) throw error;
}

export async function removeServerModerator(serverId: string, userId: string, userEmail?: string): Promise<void> {
  const { error } = await supabase
    .from("server_members")
    .delete()
    .eq("server_id", serverId)
    .eq("user_id", userId);
  if (error) throw error;
  writeAuditEntry({ action: AuditAction.MODERATOR_REMOVE, server_id: serverId, details: { target_email: userEmail || userId } });
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
  can_record_death: boolean;
  can_manage_spawns: boolean;
  can_manage_members: boolean;
  can_manage_points: boolean;
  can_manage_integrations: boolean;
  can_manage_server_content: boolean;
  can_manage_dkp: boolean;
};

export const DEFAULT_MODERATOR_PERMISSIONS: ModeratorPermissions = {
  can_access_settings: false,
  can_manage_guilds: false,
  can_record_death: false,
  can_manage_spawns: false,
  can_manage_members: false,
  can_manage_points: false,
  can_manage_integrations: false,
  can_manage_server_content: false,
  can_manage_dkp: false,
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
      can_access_settings: row.can_access_settings ?? false,
      can_manage_guilds: row.can_manage_guilds ?? false,
      can_record_death: row.can_record_death ?? false,
      can_manage_spawns: row.can_manage_spawns ?? false,
      can_manage_members: row.can_manage_members ?? false,
      can_manage_points: row.can_manage_points ?? false,
      can_manage_integrations: row.can_manage_integrations ?? false,
      can_manage_server_content: row.can_manage_server_content ?? false,
      can_manage_dkp: row.can_manage_dkp ?? false,
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
      p_can_record_death: permissions.can_record_death ?? false,
      p_can_manage_spawns: permissions.can_manage_spawns ?? false,
      p_can_manage_members: permissions.can_manage_members ?? false,
      p_can_manage_points: permissions.can_manage_points ?? false,
      p_can_manage_integrations: permissions.can_manage_integrations ?? false,
      p_can_manage_server_content: permissions.can_manage_server_content ?? false,
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
  writeAuditEntry({ action: AuditAction.MOD_PERMS_UPDATE, server_id: serverId, details: { target_user_id: userId, permissions } });
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
