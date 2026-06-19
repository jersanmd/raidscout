import { supabase, supabaseUrl, supabaseKey, getCurrentServerId, getCurrentViewerKey } from "./client";
import { writeAuditEntry, AuditAction } from "./audit";
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
  } catch (err) { console.error("[attendance] edge function fetch failed, falling back to direct query:", err); }

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
  memberId: string,
  memberName?: string,
  bossName?: string
): Promise<AttendanceRecord> {
  const sid = getCurrentServerId();
  const { data: { session } } = await supabase.auth.getSession();
  // Fetch death time for audit detail
  let deathTime: string | undefined;
  try {
    const { data: dr } = await supabase.from("death_records").select("death_time").eq("id", deathRecordId).single();
    if (dr) deathTime = (dr as any).death_time;
  } catch { /* non-critical */ }
  if (session?.user) {
    const { data, error } = await supabase
      .from("attendance_records")
      .insert({
        death_record_id: deathRecordId,
        member_id: memberId,
        server_id: sid,
      })
      .select()
      .single();
    if (error) throw error;
    writeAuditEntry({ action: AuditAction.ATTENDANCE_ADD, server_id: sid!, target_id: deathRecordId, details: { member_name: memberName || memberId, boss_name: bossName || deathRecordId, death_time: deathTime } });
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
    writeAuditEntry({ action: AuditAction.ATTENDANCE_ADD, server_id: sid!, target_id: deathRecordId, details: { member_name: memberName || memberId, boss_name: bossName || deathRecordId, death_time: deathTime }, viewer_key: viewerKey });
    return (data as any[])[0] as AttendanceRecord;
  }

  throw new Error("Not authenticated");
}

export async function removeAttendance(attendanceId: string, memberName?: string, bossName?: string): Promise<void> {
  const sid = getCurrentServerId();
  const { data: { session } } = await supabase.auth.getSession();
  // Fetch death time for audit detail (look up via attendance record)
  let deathTime: string | undefined;
  try {
    const { data: att } = await supabase.from("attendance_records").select("death_record_id").eq("id", attendanceId).single();
    if (att) {
      const { data: dr } = await supabase.from("death_records").select("death_time").eq("id", (att as any).death_record_id).single();
      if (dr) deathTime = (dr as any).death_time;
    }
  } catch { /* non-critical */ }
  if (session?.user) {
    const { error } = await supabase
      .from("attendance_records")
      .delete()
      .eq("id", attendanceId);
    if (error) throw error;
    writeAuditEntry({ action: AuditAction.ATTENDANCE_REMOVE, server_id: sid!, target_id: attendanceId, details: { member_name: memberName || "Unknown", boss_name: bossName || "Unknown", death_time: deathTime } });
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
    writeAuditEntry({ action: AuditAction.ATTENDANCE_REMOVE, server_id: sid!, target_id: attendanceId, details: { member_name: memberName || "Unknown", boss_name: bossName || "Unknown", death_time: deathTime }, viewer_key: viewerKey });
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

/**
 * Copy all attendance records from one death record to another.
 * Skips members that already have attendance on the target.
 * Returns the number of records copied.
 */
export async function copyAttendanceToDeath(
  sourceDeathRecordId: string,
  targetDeathRecordId: string,
): Promise<{ copied: number; skipped: number }> {
  const sid = getCurrentServerId();

  // Fetch source attendance
  const sourceAttendance = await fetchAttendanceForDeath(sourceDeathRecordId);
  if (!sourceAttendance.length) return { copied: 0, skipped: 0 };

  // Fetch existing target attendance to avoid duplicates
  const targetAttendance = await fetchAttendanceForDeath(targetDeathRecordId);
  const existingMemberIds = new Set(targetAttendance.map(a => a.member_id));

  // Filter out members already on target
  const toInsert = sourceAttendance.filter(a => !existingMemberIds.has(a.member_id));
  const skipped = sourceAttendance.length - toInsert.length;

  if (!toInsert.length) return { copied: 0, skipped };

  const rows = toInsert.map(a => ({
    death_record_id: targetDeathRecordId,
    member_id: a.member_id,
    server_id: sid,
  }));

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    const { error } = await supabase
      .from("attendance_records")
      .insert(rows);
    if (error) throw error;
    writeAuditEntry({ action: AuditAction.ATTENDANCE_COPY, server_id: sid!, details: { source_death: sourceDeathRecordId, target_death: targetDeathRecordId, copied: rows.length, skipped } });
    return { copied: rows.length, skipped };
  }

  const viewerKey = getCurrentViewerKey();
  if (viewerKey) {
    // Insert one at a time via viewer RPC (there's no bulk viewer RPC)
    let copied = 0;
    for (const r of rows) {
      const { error } = await supabase
        .rpc("viewer_add_attendance", {
          p_death_record_id: r.death_record_id,
          p_member_id: r.member_id,
          p_viewer_key: viewerKey,
        });
      if (!error) copied++;
    }
    writeAuditEntry({ action: AuditAction.ATTENDANCE_COPY, server_id: sid!, details: { source_death: sourceDeathRecordId, target_death: targetDeathRecordId, copied, skipped: rows.length - copied }, viewer_key: viewerKey });
    return { copied, skipped: rows.length - copied };
  }

  throw new Error("Not authenticated");
}
