import { supabase } from "./client";
import { writeAuditEntry, AuditAction, GLOBAL_AUDIT_SERVER_ID } from "./audit";

// ── Templates ───────────────────────────────────────────────

export async function fetchBossTemplates(gameId: string): Promise<any[]> {
  const { data, error } = await supabase.from("boss_templates").select("*").eq("game_id", gameId).order("name");
  if (error) throw error;
  return data || [];
}

export async function fetchActivityTemplates(gameId: string): Promise<any[]> {
  const { data, error } = await supabase.from("activity_templates").select("*").eq("game_id", gameId).order("name");
  if (error) throw error;
  return data || [];
}

// Templates are game-wide: every server that seeds from a game inherits them,
// so an edit here reaches far beyond the admin who made it. Updates and deletes
// arrive with only an id, so the row is read first to give the entry a name.

type TemplateKind = "boss" | "activity";

const TEMPLATE_TABLE: Record<TemplateKind, string> = {
  boss: "boss_templates",
  activity: "activity_templates",
};

async function templateRow(kind: TemplateKind, id: string): Promise<{ name?: string; game_id?: string }> {
  try {
    const { data } = await supabase.from(TEMPLATE_TABLE[kind]).select("name, game_id").eq("id", id).single();
    return { name: (data as any)?.name, game_id: (data as any)?.game_id };
  } catch { return {}; }
}

function auditTemplate(
  action: string,
  kind: TemplateKind,
  id: string,
  ctx: { name?: string; game_id?: string },
  extra?: Record<string, any>
) {
  writeAuditEntry({
    action,
    server_id: GLOBAL_AUDIT_SERVER_ID,
    target_type: `${kind} template`,
    target_id: id,
    details: { kind, name: ctx.name ?? id, game_id: ctx.game_id, ...extra },
  }).catch(() => { /* auditing must never fail the admin's edit */ });
}

export async function createBossTemplate(template: {
  game_id: string; name: string; spawn_type: string; respawn_hours?: number | null;
  schedule?: any; is_recurring?: boolean; category?: string | null;
  tags?: string[]; points?: number; image_url?: string;
}): Promise<any> {
  const { data, error } = await supabase.from("boss_templates").insert(template).select().single();
  if (error) throw error;
  auditTemplate(AuditAction.GAME_TEMPLATE_CREATE, "boss", (data as any).id, template, { spawn_type: template.spawn_type, points: template.points });
  return data;
}

export async function updateBossTemplate(id: string, updates: Record<string, any>): Promise<void> {
  const ctx = await templateRow("boss", id);
  const { error } = await supabase.from("boss_templates").update(updates).eq("id", id);
  if (error) throw error;
  auditTemplate(AuditAction.GAME_TEMPLATE_UPDATE, "boss", id, { name: updates.name ?? ctx.name, game_id: ctx.game_id }, { old_name: ctx.name, fields: Object.keys(updates) });
}

export async function deleteBossTemplate(id: string): Promise<void> {
  const ctx = await templateRow("boss", id);
  const { error } = await supabase.from("boss_templates").delete().eq("id", id);
  if (error) throw error;
  auditTemplate(AuditAction.GAME_TEMPLATE_DELETE, "boss", id, ctx);
}

export async function createActivityTemplate(template: {
  game_id: string; name: string; schedule_type: string; schedule?: any;
  duration_minutes?: number | null; points_per_participant?: number;
  party_size?: number | null; category?: string | null; tags?: string[];
  image_url?: string;
}): Promise<any> {
  const { data, error } = await supabase.from("activity_templates").insert(template).select().single();
  if (error) throw error;
  auditTemplate(AuditAction.GAME_TEMPLATE_CREATE, "activity", (data as any).id, template, { schedule_type: template.schedule_type, points: template.points_per_participant });
  return data;
}

export async function updateActivityTemplate(id: string, updates: Record<string, any>): Promise<void> {
  const ctx = await templateRow("activity", id);
  const clean = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
  const { error } = await supabase.from("activity_templates").update(clean).eq("id", id);
  if (error) throw error;
  auditTemplate(AuditAction.GAME_TEMPLATE_UPDATE, "activity", id, { name: (clean as any).name ?? ctx.name, game_id: ctx.game_id }, { old_name: ctx.name, fields: Object.keys(clean) });
}

export async function deleteActivityTemplate(id: string): Promise<void> {
  const ctx = await templateRow("activity", id);
  const { error } = await supabase.from("activity_templates").delete().eq("id", id);
  if (error) throw error;
  auditTemplate(AuditAction.GAME_TEMPLATE_DELETE, "activity", id, ctx);
}
