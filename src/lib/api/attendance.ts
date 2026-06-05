import { supabase, supabaseUrl, supabaseKey, getCurrentServerId } from "./client";
import type { AttendanceRecord } from "@/types";

// ── Attendance ──────────────────────────────────────────────

export async function fetchAttendanceForDeath(deathRecordId: string): Promise<AttendanceRecord[]> {
  const sid = getCurrentServerId();

  // Try edge function first (bypasses RLS for viewers)
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/get-attendance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ death_record_ids: [deathRecordId], server_id: sid }),
    });
    if (resp.ok) return await resp.json();
  } catch { /* fall through */ }

  // Fallback: direct query (works for authenticated users)
  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("death_record_id", deathRecordId);

  if (error) throw error;
  return data as AttendanceRecord[];
}

export async function addAttendance(
  deathRecordId: string,
  memberId: string
): Promise<AttendanceRecord> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { data, error } = await supabase
      .from("attendance_records")
      .insert({
        death_record_id: deathRecordId,
        member_id: memberId,
        server_id: getCurrentServerId(),
      })
      .select()
      .single();
    if (error) throw error;
    return data as AttendanceRecord;
  }

  const viewerKey = getCurrentViewerKey();
  if (viewerKey) {
    const { data, error } = await supabase
      .rpc("viewer_add_attendance", {
        p_death_record_id: deathRecordId,
        p_member_id: memberId,
        p_viewer_key: viewerKey,
      });
    if (error) throw error;
    return (data as any[])[0] as AttendanceRecord;
  }

  throw new Error("Not authenticated");
}

export async function removeAttendance(attendanceId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { error } = await supabase
      .from("attendance_records")
      .delete()
      .eq("id", attendanceId);
    if (error) throw error;
    return;
  }

  const viewerKey = getCurrentViewerKey();
  if (viewerKey) {
    const { error } = await supabase
      .rpc("viewer_remove_attendance", {
        p_attendance_id: attendanceId,
        p_viewer_key: viewerKey,
      });
    if (error) throw error;
    return;
  }

  throw new Error("Not authenticated");
}

export async function clearAllData(): Promise<void> {
  const { error: attErr } = await supabase
    .from("attendance_records")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (attErr) throw attErr;

  const { error: drErr } = await supabase
    .from("death_records")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (drErr) throw drErr;

  const { error: memErr } = await supabase
    .from("members")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (memErr) throw memErr;
}
