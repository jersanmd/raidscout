import { supabase, supabaseUrl, supabaseKey, getCurrentServerId } from "./client";
import { writeAuditEntry, AuditAction } from "./audit";

// ── Discord Notifications ──────────────────────────────────

const BOT_NOTIFY_URL = import.meta.env.VITE_BOT_NOTIFY_URL || "http://localhost:3003";

export async function notifyDiscord(
  serverId: string,
  event: "boss_died" | "boss_spawned" | "boss_spawning",
  data: { boss_name: string; attendees?: string[]; spawn_time?: string; guild_name?: string; recorded_by?: string },
  target?: "commands"
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return { ok: true };
  }
  try {
    const res = await fetch(`${BOT_NOTIFY_URL}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: serverId,
        event,
        boss_name: data.boss_name,
        guild_name: data.guild_name,
        recorded_by: data.recorded_by,
        ...(target ? { target } : {}),
      }),
    });
    if (!res.ok) {
      console.error(`Discord notify HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      return { ok: false };
    }
    const body = await res.json().catch(() => ({}));
    if (body.skipped) {
      console.warn(`Discord notify skipped: ${body.skipped}`);
      return { ok: false, skipped: true };
    }
    return { ok: true };
  } catch (err) {
    console.error("Discord notification failed:", err);
    return { ok: false };
  }
}

export async function updateThreadConfig(
  configId: string,
  threadChannelId: string | null,
  threadGuilds: string[]
): Promise<void> {
  await supabase
    .from("discord_configs")
    .update({
      thread_channel_id: threadChannelId || null,
      thread_guilds: threadGuilds,
    })
    .eq("id", configId);
}

export interface SpawnAnnounceBoss {
  name: string;
  spawn_time: string;
  unix_spawn_time?: number;
  guild_name?: string;
}

export async function announceSpawns(
  serverId: string,
  bosses: SpawnAnnounceBoss[]
): Promise<{ success: boolean; skipped: number; failed: number }> {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return { success: true, skipped: bosses.length, failed: 0 };
  }
  let skipped = 0;
  let failed = 0;
  for (const boss of bosses) {
    try {
      const res = await fetch(`${BOT_NOTIFY_URL}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server_id: serverId,
          event: "boss_spawning",
          boss_name: boss.name,
          guild_name: boss.guild_name,
        }),
      });
      if (!res.ok) { failed++; continue; }
      const body = await res.json().catch(() => ({}));
      if (body.skipped) { skipped++; }
    } catch {
      failed++;
    }
  }
  return { success: failed === 0, skipped, failed };
}

// ── CP Reminder ─────────────────────────────────────────────

export async function sendCpReminder(serverId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, reason: "Not authenticated" };

  try {
    const fnUrl = `${supabaseUrl}/functions/v1/discord-notify`;
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ server_id: serverId, event: "cp_reminder" }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { ok: false, reason: `HTTP ${res.status}: ${err}` };
    }
    const body = await res.json().catch(() => ({}));
    if (body.ok !== false) writeAuditEntry({ action: AuditAction.MEMBER_CP_REMINDER, server_id: serverId, details: { event: "cp_reminder" } });
    return { ok: body.ok !== false, reason: body.reason };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

// ── Progress Thread ─────────────────────────────────────────

export async function createProgressThread(serverId: string): Promise<{ ok: boolean; reason?: string; thread_name?: string; succeeded?: number; failed?: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, reason: "Not authenticated" };

  try {
    const fnUrl = `${supabaseUrl}/functions/v1/create-progress-thread`;
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({ server_id: serverId }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { ok: false, reason: `HTTP ${res.status}: ${err}` };
    }
    const body = await res.json().catch(() => ({}));
    return { ok: body.ok !== false, reason: body.reason, thread_name: body.thread_name, succeeded: body.succeeded, failed: body.failed };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}
