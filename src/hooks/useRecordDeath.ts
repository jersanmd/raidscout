import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
  getCurrentServerId,
  getCurrentViewerKey,
  notifyDiscord,
  supabase,
  advanceBossRotation,
  uploadRallyImage,
  addRallyImageToDeath,
} from "@/lib/supabase";
import { writeAuditEntry, AuditAction } from "@/lib/supabase";

interface RecordDeathOptions {
  bossId: string;
  bossName: string;
  deathTime: Date;
  attendeeIds: string[];
  /** Parallel array of member names matching attendeeIds (for audit readability) */
  attendeeNames?: string[];
  /** Guild → member_id map for party leaders (from DeathRecordModal) */
  partyLeaders?: Record<string, string> | null;
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
  addAttendance: (deathRecordId: string, memberId: string, memberName?: string, bossName?: string) => Promise<any>,
) {
  const queryClient = useQueryClient();
  const { user, isViewer, userRole } = useAuth();
  const { toast } = useToast();

  const recordDeath = useCallback(async (opts: RecordDeathOptions): Promise<RecordDeathResult> => {
    const {
      bossId, bossName, deathTime, attendeeIds, attendeeNames, partyLeaders, ownerGuildName,
      scanResults, rallyImages, onRecordCreated, notifyDiscordChannel = true,
    } = opts;

    const errors: string[] = [];

    // 1. Insert death record
    const ownerGuildId = ownerGuildName || null;
    const record = await insertDeathRecord(bossId, deathTime, ownerGuildId as string | null);
    const deathRecordId = record.id;
    onRecordCreated?.(deathRecordId);

    // 2. Save party leaders (from DeathRecordModal)
    if (partyLeaders && Object.keys(partyLeaders).length > 0) {
      try {
        await supabase
          .from("death_records")
          .update({ party_leaders: partyLeaders })
          .eq("id", deathRecordId);
      } catch (err) {
        console.error("[useRecordDeath] savePartyLeaders failed:", err);
      }
    }

    // 3. Save AI scan results
    if (scanResults) {
      const { saveDeathScanResults } = await import("@/lib/supabase");
      try {
        await saveDeathScanResults(deathRecordId, scanResults);
      } catch (err) {
        console.error("[useRecordDeath] saveDeathScanResults failed:", err);
        errors.push("AI scan save failed");
      }
    }

    // 4. Upload rally images
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

    // 5. Delete spawn override
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

    // 6. Record attendance
    const attendanceErrors: string[] = [];
    const nameMap = attendeeNames
      ? new Map(attendeeIds.map((id, i) => [id, attendeeNames[i] ?? undefined] as const))
      : undefined;
    for (const memberId of attendeeIds) {
      try {
        await addAttendance(deathRecordId, memberId, nameMap?.get(memberId), bossName);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        attendanceErrors.push(msg);
        console.error("[useRecordDeath] addAttendance failed for member:", memberId, err);
      }
    }

    // 7. Audit log
    const serverId = getCurrentServerId();
    if (serverId) {
      // Resolve guild name from ID for readable audit
      let guildName = "";
      if (ownerGuildName) {
        try {
          const { data: g } = await supabase.from("guilds").select("name").eq("id", ownerGuildName).single();
          if (g) guildName = (g as any).name;
        } catch { /* use ID as fallback */ }
      }
      writeAuditEntry({
        action: AuditAction.BOSS_KILL,
        server_id: serverId,
        target_id: bossId,
        details: {
          boss_name: bossName,
          death_record_id: deathRecordId,
          attendees: attendeeIds.length,
          guild: guildName || ownerGuildName,
        },
        viewer_key: isViewer ? (getCurrentViewerKey() ?? undefined) : undefined,
      });
      // Party leaders audit
      if (partyLeaders && Object.keys(partyLeaders).length > 0) {
        const leaderIds = Object.values(partyLeaders).filter(Boolean);
        let leaderNames = leaderIds.join(", ");
        try {
          const { data: members } = await supabase.from("members").select("id, name").in("id", leaderIds);
          if (members) {
            const nameMap = new Map((members as any[]).map((m: any) => [m.id, m.name]));
            leaderNames = leaderIds.map(id => nameMap.get(id) ?? id).join(", ");
          }
        } catch { /* fall back to UUIDs */ }
        writeAuditEntry({
          action: AuditAction.PARTY_LEADERS_SET,
          server_id: serverId,
          target_id: deathRecordId,
          details: { boss_name: bossName, leaders: leaderNames },
          viewer_key: isViewer ? (getCurrentViewerKey() ?? undefined) : undefined,
        });
      }
    }

    // 8. Invalidate queries
    queryClient.invalidateQueries({ queryKey: ["death_records"] });
    queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    queryClient.invalidateQueries({ queryKey: ["members"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });

    // 9. Advance rotation
    try {
      await advanceBossRotation(bossId);
    } catch (err) {
      console.error("[useRecordDeath] advanceBossRotation failed:", err);
    }
    queryClient.invalidateQueries({ queryKey: ["bosses"] });

    // 10. Toast
    if (attendanceErrors.length > 0) {
      toast("error", `Attendance partially saved: ${attendeeIds.length - attendanceErrors.length}/${attendeeIds.length} succeeded.`);
    } else {
      toast("success", `Death recorded${attendeeIds.length > 0 ? ` with ${attendeeIds.length} attendee${attendeeIds.length !== 1 ? "s" : ""}` : ""}!`);
    }

    // 11. Discord notification
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
