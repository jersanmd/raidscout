import { supabase } from "./client";

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
