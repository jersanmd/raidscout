import { supabase } from "./client";

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

export async function createBossTemplate(template: {
  game_id: string; name: string; spawn_type: string; respawn_hours?: number | null;
  schedule?: any; is_recurring?: boolean; category?: string | null;
  tags?: string[]; points?: number; image_url?: string;
}): Promise<any> {
  const { data, error } = await supabase.from("boss_templates").insert(template).select().single();
  if (error) throw error;
  return data;
}

export async function updateBossTemplate(id: string, updates: Record<string, any>): Promise<void> {
  const { error } = await supabase.from("boss_templates").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteBossTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("boss_templates").delete().eq("id", id);
  if (error) throw error;
}

export async function createActivityTemplate(template: {
  game_id: string; name: string; schedule_type: string; schedule?: any;
  duration_minutes?: number | null; points_per_participant?: number;
  party_size?: number | null; category?: string | null; tags?: string[];
  image_url?: string;
}): Promise<any> {
  const { data, error } = await supabase.from("activity_templates").insert(template).select().single();
  if (error) throw error;
  return data;
}

export async function updateActivityTemplate(id: string, updates: Record<string, any>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(updates).filter(([_, v]) => v !== undefined));
  const { error } = await supabase.from("activity_templates").update(clean).eq("id", id);
  if (error) throw error;
}

export async function deleteActivityTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("activity_templates").delete().eq("id", id);
  if (error) throw error;
}
