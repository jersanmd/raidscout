import { supabase, getCurrentServerId } from "./client";
import { writeAuditEntry, AuditAction } from "./audit";
import { mergePartyLeaders } from "./attendance";

// ── Activity Parties ────────────────────────────────────────

export async function setActivityParties(activityInstanceId: string, parties: { party_number: number; member_ids: string[] }[]): Promise<void> {
  const { error } = await supabase.rpc("set_activity_parties", { p_activity_instance_id: activityInstanceId, p_parties: parties });
  if (error) throw error;
}

export async function fetchActivityAttendance(activityInstanceId: string): Promise<{ id: string; member_id: string }[]> {
  const { data, error } = await supabase.rpc("fetch_activity_attendance", { p_activity_instance_id: activityInstanceId });
  if (error) throw error;
  return (data || []) as { id: string; member_id: string }[];
}

export async function markActivityAttendance(activityInstanceId: string, memberId: string, present: boolean = true): Promise<void> {
  const { error } = await supabase.rpc("mark_activity_attendance", { p_activity_instance_id: activityInstanceId, p_member_id: memberId, p_present: present });
  if (error) throw error;
}

export async function copyActivityAttendance(sourceInstanceId: string, targetInstanceId: string): Promise<{ copied: number; skipped: number; leadersCopied: number }> {
  const sid = getCurrentServerId();

  const { data: sourceRecords } = await supabase
    .from("activity_attendance")
    .select("member_id, present")
    .eq("activity_instance_id", sourceInstanceId);
  if (!sourceRecords?.length) return { copied: 0, skipped: 0, leadersCopied: 0 };

  const { data: existingRecords } = await supabase
    .from("activity_attendance")
    .select("member_id")
    .eq("activity_instance_id", targetInstanceId);
  const existingIds = new Set((existingRecords ?? []).map((r: any) => r.member_id));

  const toInsert = sourceRecords.filter((r: any) => !existingIds.has(r.member_id));
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("activity_attendance")
      .insert(toInsert.map((r: any) => ({
        activity_instance_id: targetInstanceId,
        member_id: r.member_id,
        present: r.present,
      })));
    if (error) throw error;
  }

  // Party leaders live on the instance, not on attendance rows — the same shape
  // as boss kills, where they live on the death record. Carry them over with the
  // identical fill-only-missing policy (shared, unit-tested mergePartyLeaders):
  // a leader set on the target deliberately is never overwritten. Runs even when
  // every member was skipped as already present, so a re-copy completes leaders.
  // One round trip fetches both instances' leaders and their activity names.
  let leadersCopied = 0;
  let sourceName = sourceInstanceId, targetName = targetInstanceId;
  try {
    const { data: instances } = await supabase
      .from("activity_instances")
      .select("id, party_leaders, activities:activity_id(name)")
      .in("id", [sourceInstanceId, targetInstanceId]);

    let sourceLeaders: Record<string, string> = {}, targetLeaders: Record<string, string> = {};
    for (const inst of (instances ?? []) as any[]) {
      const name = inst.activities?.name;
      if (inst.id === sourceInstanceId) { sourceLeaders = inst.party_leaders ?? {}; if (name) sourceName = name; }
      if (inst.id === targetInstanceId) { targetLeaders = inst.party_leaders ?? {}; if (name) targetName = name; }
    }

    const toAdd = mergePartyLeaders(sourceLeaders, targetLeaders);
    if (Object.keys(toAdd).length) {
      // Same RPC the participant modal's leader selector uses — no new permissions.
      await setActivityPartyLeaders(targetInstanceId, { ...targetLeaders, ...toAdd });
      leadersCopied = Object.keys(toAdd).length;
    }
  } catch {
    // Non-critical: a leader-step failure must not undo a successful copy.
  }

  if (sid) {
    writeAuditEntry({
      action: AuditAction.ATTENDANCE_COPY,
      server_id: sid,
      details: {
        copied: toInsert.length,
        skipped: sourceRecords.length - toInsert.length,
        party_leaders_copied: leadersCopied,
        from_activity: sourceName,
        to_activity: targetName,
      },
    });
  }

  return { copied: toInsert.length, skipped: sourceRecords.length - toInsert.length, leadersCopied };
}

export async function finalizeActivity(activityId: string, serverId?: string): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("activity_instances")
    .insert({ activity_id: activityId, start_time: now, end_time: now })
    .select("id")
    .single();
  if (error) throw error;
  if (serverId) {
    writeAuditEntry({ action: AuditAction.ACTIVITY_FINALIZE, server_id: serverId, target_id: activityId, details: { instance_id: data.id } });
  }
  return data.id;
}

// ── Activity Rally Images & Party Leaders ───────────────────

export async function fetchActivityInstance(activityInstanceId: string): Promise<{ rally_images?: string[]; party_leaders?: Record<string, string> }> {
  const { data, error } = await supabase
    .from("activity_instances")
    .select("rally_images, party_leaders")
    .eq("id", activityInstanceId)
    .single();
  if (error) throw error;
  return data ?? {};
}

export async function setActivityRallyImages(activityInstanceId: string, images: string[]): Promise<void> {
  const { error } = await supabase.rpc("set_activity_rally_images", { p_activity_instance_id: activityInstanceId, p_images: images });
  if (error) throw error;
}

export async function setActivityPartyLeaders(activityInstanceId: string, leaders: Record<string, string>): Promise<void> {
  const { error } = await supabase.rpc("set_activity_party_leaders", { p_activity_instance_id: activityInstanceId, p_leaders: leaders });
  if (error) throw error;
}
