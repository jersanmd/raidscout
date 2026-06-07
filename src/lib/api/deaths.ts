import { supabase, getCurrentServerId, getCurrentViewerKey } from "./client";
import type { DeathRecord } from "@/types";

// ── Death Records ───────────────────────────────────────────

export async function fetchDeathRecords(serverId?: string | null): Promise<DeathRecord[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  const { data, error } = await supabase
    .rpc("get_latest_deaths", { p_server_id: sid });
  if (error) throw error;
  return (data as DeathRecord[]) ?? [];
}

export async function insertDeathRecord(
  bossId: string,
  deathTime: Date,
  ownerGuildId?: string | null,
  partyLeaders?: Record<string, string> | null,
  rallyImageUrl?: string | null
): Promise<DeathRecord> {
  const sid = getCurrentServerId();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { data, error } = await supabase
      .from("death_records")
      .insert({
        boss_id: bossId,
        user_id: session.user.id,
        server_id: sid,
        death_time: deathTime.toISOString(),
        owner_guild_id: ownerGuildId ?? null,
        party_leaders: partyLeaders ?? {},
        rally_image_url: rallyImageUrl ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as DeathRecord;
  }

  const viewerKey = getCurrentViewerKey();
  if (viewerKey) {
    const { data, error } = await supabase
      .rpc("viewer_insert_death_record", {
        p_boss_id: bossId,
        p_death_time: deathTime.toISOString(),
        p_server_id: sid,
        p_viewer_key: viewerKey,
        p_owner_guild_id: ownerGuildId ?? null,
      });
    if (error) throw error;
    return (data as any[])[0] as DeathRecord;
  }

  throw new Error("Not authenticated");
}

export async function deleteDeathRecord(recordId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { error } = await supabase.from("death_records").delete().eq("id", recordId);
    if (error) throw error;
    return;
  }

  const viewerKey = getCurrentViewerKey();
  if (viewerKey) {
    const { error } = await supabase
      .rpc("viewer_delete_death_record", {
        p_record_id: recordId,
        p_viewer_key: viewerKey,
      });
    if (error) throw error;
    return;
  }

  throw new Error("Not authenticated");
}

export async function editDeathTime(deathRecordId: string, newDeathTime: Date): Promise<void> {
  const { error } = await supabase.rpc("edit_death_record_time", {
    p_death_record_id: deathRecordId,
    p_new_death_time: newDeathTime.toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function setDeathDisplayGuild(deathRecordId: string, guildId: string): Promise<void> {
  const { error } = await supabase
    .from("death_records")
    .update({ owner_guild_id: guildId })
    .eq("id", deathRecordId);
  if (error) throw new Error(error.message);
}
