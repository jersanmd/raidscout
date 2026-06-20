import { supabase, getCurrentServerId } from "./client";
import type { HistoryEntry } from "../history";

// ── History from Supabase ──────────────────────────────────

export async function fetchHistoryFromSupabase(serverId?: string | null, since?: string, until?: string): Promise<HistoryEntry[]> {
  const sid = serverId ?? getCurrentServerId();
  if (!sid) return [];
  let query = supabase
    .from("death_records")
    .select(`
      id, death_time, owner_guild_id, display_owner_guild_id,
      bosses!inner(id, name, spawn_type, respawn_hours, schedule, image_url),
      attendance_records(id)
    `)
    .or("is_initial_spawn.is.null,is_initial_spawn.eq.false")
    .order("death_time", { ascending: false });
  if (sid) query = query.eq("server_id", sid);
  if (since) query = query.gte("death_time", since);
  if (until) query = query.lte("death_time", until);
  if (!since && !until) query = query.limit(500);
  const { data: deaths, error } = await query;

  if (error) throw error;

  // Deduplicate
  const seen = new Set<string>();
  const unique = (deaths as any[]).filter((d: any) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  // Fetch guild names
  const guildIds = [...new Set(
    unique.flatMap((d: any) => [d.owner_guild_id, d.display_owner_guild_id]).filter(Boolean)
  )];
  const guildMap = new Map<string, string>();
  if (guildIds.length > 0) {
    try {
      const { data: guildData } = await supabase
        .from("guilds")
        .select("id, name")
        .in("id", guildIds as string[]);
      if (guildData) {
        for (const g of guildData as any[]) guildMap.set(g.id, g.name);
      }
    } catch (err) { console.error("[history] guild name lookup failed:", err); }
  }

  const bossEntries = unique.map((d: any) => {
    const boss = d.bosses;
    const deathTime = new Date(d.death_time);
    let respawnTime: Date;

    if (boss.spawn_type === "fixed_hours") {
      respawnTime = new Date(deathTime.getTime() + boss.respawn_hours * 3600_000);
    } else {
      const schedule = boss.schedule as { day: number; time: string }[];
      respawnTime = new Date(deathTime);
      respawnTime.setHours(23, 59, 59, 999);

      for (let offset = 0; offset < 7; offset++) {
        const check = new Date(deathTime);
        check.setDate(check.getDate() + offset);
        for (const s of schedule) {
          const [h, m] = s.time.split(":").map(Number);
          const slot = new Date(check);
          slot.setHours(h, m, 0, 0);
          if (check.getDay() === s.day && slot > deathTime) {
            respawnTime = slot;
            offset = 99;
            break;
          }
        }
      }
    }

    return {
      id: d.id,
      type: "boss" as const,
      bossName: boss.name,
      deathTime: d.death_time,
      respawnTime: respawnTime.toISOString(),
      spawnType: boss.spawn_type,
      deathRecordId: d.id,
      createdAt: d.death_time,
      ownerGuildName: guildMap.get(d.display_owner_guild_id ?? d.owner_guild_id),
      ownerGuildId: d.display_owner_guild_id ?? d.owner_guild_id,
      bossImageUrl: boss.image_url ?? null,
    };
  });

  // Fetch and merge activity history
  const activityEntries = await fetchActivityHistory(sid, since, until);

  return [...bossEntries, ...activityEntries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** Fetch finished activity instances for history */
async function fetchActivityHistory(sid: string, since?: string, until?: string): Promise<HistoryEntry[]> {
  let query = supabase
    .from("activity_instances")
    .select(`
      id, start_time, end_time, activity_id,
      activities!inner(id, name, schedule_type, image_url, server_id)
    `)
    .eq("activities.server_id", sid)
    .not("end_time", "is", null)
    .order("end_time", { ascending: false });

  if (since) query = query.gte("end_time", since);
  if (until) query = query.lte("end_time", until);
  if (!since && !until) query = query.limit(200);

  const { data, error } = await query;
  if (error) throw error;

  return ((data as any[]) ?? []).map((inst: any) => {
    const act = inst.activities;
    return {
      id: inst.id,
      type: "activity" as const,
      activityName: act?.name ?? "Unknown",
      completionTime: inst.end_time,
      spawnType: act?.schedule_type,
      activityInstanceId: inst.id,
      activityImageUrl: act?.image_url ?? null,
      deathRecordId: undefined,
      createdAt: inst.end_time,
      ownerGuildName: undefined,
    };
  });
}
