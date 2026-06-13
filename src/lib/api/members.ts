import { supabase, getCurrentServerId, getCurrentViewerKey } from "./client";
import type { Member } from "@/types";

// ── Members ─────────────────────────────────────────────────

export async function fetchMembers(serverId?: string | null, opts?: { includeInactive?: boolean }): Promise<Member[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase.from("members").select("*").order("name");
  if (sid) query = query.eq("server_id", sid);
  if (!opts?.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data as Member[];
}

export async function upsertMember(name: string, guildId?: string | null, combatPower?: number | null, memberClass?: string | null): Promise<Member> {
  const trimmed = name.trim();

  // Prefer direct upsert when user has a valid session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { data: existing } = await supabase
      .from("members")
      .select("*")
      .eq("name", trimmed)
      .eq("server_id", getCurrentServerId())
      .maybeSingle();

    if (existing) return existing as Member;

    const { data, error } = await supabase
      .from("members")
      .insert({ name: trimmed, server_id: getCurrentServerId(), guild_id: guildId || null, combat_power: combatPower ?? null, class: memberClass ?? null })
      .select()
      .single();

    if (error) throw error;
    return data as Member;
  }

  // Fall back to viewer RPC
  const viewerKey = getCurrentViewerKey();
  if (viewerKey) {
    const { data, error } = await supabase
      .rpc("viewer_upsert_member", {
        p_name: trimmed,
        p_server_id: getCurrentServerId(),
        p_viewer_key: viewerKey,
      });
    if (error) throw error;
    return (data as any[])[0] as Member;
  }

  throw new Error("Not authenticated");
}

export async function bulkAddMembers(names: string[], guildId?: string | null): Promise<number> {
  const sid = getCurrentServerId();
  const rows = names.map((name) => ({
    name: name.trim(),
    server_id: sid,
    guild_id: guildId || null,
  }));

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { data, error } = await supabase
      .from("members")
      .insert(rows)
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  }

  // Viewer fallback — insert one at a time via RPC
  const viewerKey = getCurrentViewerKey();
  if (viewerKey) {
    let added = 0;
    for (const row of rows) {
      try {
        await supabase.rpc("viewer_upsert_member", {
          p_name: row.name,
          p_server_id: sid,
          p_viewer_key: viewerKey,
          p_guild_id: row.guild_id,
        });
        added++;
      } catch { /* skip duplicates */ }
    }
    return added;
  }

  throw new Error("Not authenticated");
}

export async function updateMemberName(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from("members")
    .update({ name: name.trim() })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteMember(id: string): Promise<void> {
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) throw error;
}
