import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
  getCurrentServerId,
  notifyDiscord,
  supabase,
  advanceBossRotation,
  uploadRallyImage,
  addRallyImageToDeath,
} from "@/lib/supabase";

interface RecordDeathOptions {
  bossId: string;
  bossName: string;
  deathTime: Date;
  attendeeIds: string[];
  ownerGuildName: string;
  scanResults?: import("@/types").ScanResults | null;
  rallyImages?: File[];
  /** Called after insert with the new death record ID */
  onRecordCreated?: (deathRecordId: string) => void;
  /** If false, skips Discord notification (default true) */
  notifyDiscordChannel?: boolean;
}

interface RecordDeathResult {
  ok: boolean;
  deathRecordId?: string;
  errors: string[];
}

/**
 * Shared hook for recording a boss death with all side effects:
 * scan save, image upload, override delete, attendance, rotation, notifications.
 *
 * Used by both BossListView and WeeklyScheduleView to eliminate ~50 lines
 * of duplicated post-death logic.
 */
export function useRecordDeath(
  insertDeathRecord: (bossId: string, deathTime: Date, ownerGuildId: string | null) => Promise<{ id: string }>,
  addAttendance: (deathRecordId: string, memberId: string) => Promise<any>,
) {
  const queryClient = useQueryClient();
  const { user, isViewer, userRole } = useAuth();
  const { toast } = useToast();

  const recordDeath = useCallback(async (opts: RecordDeathOptions): Promise<RecordDeathResult> => {
    const {
      bossId, bossName, deathTime, attendeeIds, ownerGuildName,
      scanResults, rallyImages, onRecordCreated, notifyDiscordChannel = true,
    } = opts;

    const errors: string[] = [];

    // 1. Insert death record
    const ownerGuildId = ownerGuildName || null;
    const record = await insertDeathRecord(bossId, deathTime, ownerGuildId as string | null);
    const deathRecordId = record.id;
    onRecordCreated?.(deathRecordId);

    // 2. Save AI scan results
    if (scanResults) {
      const { saveDeathScanResults } = await import("@/lib/supabase");
      try {
        await saveDeathScanResults(deathRecordId, scanResults);
      } catch (err) {
        console.error("[useRecordDeath] saveDeathScanResults failed:", err);
        errors.push("AI scan save failed");
      }
    }

    // 3. Upload rally images
    if (rallyImages?.length) {
      for (const img of rallyImages) {
        try {
          const url = await uploadRallyImage(img);
          if (url) await addRallyImageToDeath(deathRecordId, url);
        } catch (err) {
          console.error("[useRecordDeath] addRallyImageToDeath failed:", err);
          errors.push("Image upload failed");
        }
      }
    }

    // 4. Delete spawn override
    const sid = getCurrentServerId();
    if (sid) {
      try {
        await supabase.from("boss_spawn_overrides").delete().eq("boss_id", bossId).eq("server_id", sid);
      } catch (err) {
        console.error("[useRecordDeath] delete spawn override failed:", err);
      }
      queryClient.setQueryData(["spawn_overrides", sid], (old: any[]) =>
        (old ?? []).filter((o: any) => o.boss_id !== bossId),
      );
    }

    // 5. Record attendance
    const attendanceErrors: string[] = [];
    for (const memberId of attendeeIds) {
      try {
        await addAttendance(deathRecordId, memberId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        attendanceErrors.push(msg);
        console.error("[useRecordDeath] addAttendance failed for member:", memberId, err);
      }
    }

    // 6. Invalidate queries
    queryClient.invalidateQueries({ queryKey: ["death_records"] });
    queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["members"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });

    // 7. Advance rotation
    try {
      await advanceBossRotation(bossId);
    } catch (err) {
      console.error("[useRecordDeath] advanceBossRotation failed:", err);
    }
    queryClient.invalidateQueries({ queryKey: ["bosses"] });

    // 8. Toast
    if (attendanceErrors.length > 0) {
      toast("error", `Attendance partially saved: ${attendeeIds.length - attendanceErrors.length}/${attendeeIds.length} succeeded.`);
    } else {
      toast("success", `Death recorded${attendeeIds.length > 0 ? ` with ${attendeeIds.length} attendee${attendeeIds.length !== 1 ? "s" : ""}` : ""}!`);
    }

    // 9. Discord notification
    if (notifyDiscordChannel && (user || isViewer)) {
      try {
        const recordedBy = isViewer ? "Viewer"
          : userRole === "owner" ? "Owner"
          : userRole === "admin" ? "Admin"
          : "Moderator";
        const result = await notifyDiscord(getCurrentServerId()!, "boss_died", {
          boss_name: bossName,
          attendees: attendeeIds.length > 0 ? [`${attendeeIds.length} participant(s)`] : undefined,
          guild_name: ownerGuildName,
          recorded_by: recordedBy,
        }, "commands");
        if (result.skipped) {
          console.warn("[useRecordDeath] Discord notify skipped — commands channel may not be set via ;cmdhere");
        } else if (!result.ok) {
          toast("error", "Discord notification failed. Check bot status.");
        }
      } catch (err) {
        console.error("[useRecordDeath] Discord notification failed:", err);
      }
    }

    return { ok: attendanceErrors.length === 0, deathRecordId, errors: [...errors, ...attendanceErrors] };
  }, [queryClient, user, isViewer, userRole, toast, insertDeathRecord, addAttendance]);

  return recordDeath;
}
