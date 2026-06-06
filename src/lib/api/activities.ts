import { supabase } from "./client";

// ── Activity Parties ────────────────────────────────────────

export async function setActivityParties(activityInstanceId: string, parties: { party_number: number; member_ids: string[] }[]): Promise<void> {
  const { error } = await supabase.rpc("set_activity_parties", { p_activity_instance_id: activityInstanceId, p_parties: parties });
  if (error) throw error;
}

export async function markActivityAttendance(activityInstanceId: string, memberId: string, present: boolean = true): Promise<void> {
  const { error } = await supabase.rpc("mark_activity_attendance", { p_activity_instance_id: activityInstanceId, p_member_id: memberId, p_present: present });
  if (error) throw error;
}

export async function addActivityAttendance(activityInstanceId: string, memberId: string): Promise<void> {
  const { error } = await supabase.from("activity_attendance").upsert({
    activity_instance_id: activityInstanceId,
    member_id: memberId,
    present: true,
  }, { onConflict: "activity_instance_id,member_id" });
  if (error) throw error;
}

export async function removeActivityAttendance(activityInstanceId: string, memberId: string): Promise<void> {
  const { error } = await supabase.from("activity_attendance")
    .delete()
    .eq("activity_instance_id", activityInstanceId)
    .eq("member_id", memberId);
  if (error) throw error;
}

export async function finalizeActivity(activityId: string): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("activity_instances")
    .insert({ activity_id: activityId, start_time: now, end_time: now })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
