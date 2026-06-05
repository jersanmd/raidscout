import { supabase } from "./client";

// ── Games ───────────────────────────────────────────────────

export async function fetchGames(): Promise<any[]> {
  const { data, error } = await supabase.from("games").select("*").order("created_at");
  if (error) throw error;
  return data || [];
}

export async function createGame(name: string, slug: string, supportedSpawnTypes: string[], iconUrl?: string): Promise<any> {
  const { data, error } = await supabase.from("games").insert({ name, slug, supported_spawn_types: supportedSpawnTypes, icon_url: iconUrl || null }).select().single();
  if (error) throw error;
  return data;
}

export async function updateGame(id: string, updates: { name?: string; slug?: string; supported_spawn_types?: string[]; icon_url?: string | null }): Promise<void> {
  const { error } = await supabase.from("games").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteGame(id: string): Promise<void> {
  const { error } = await supabase.from("games").delete().eq("id", id);
  if (error) throw error;
}

// ── Game Icon Uploads ───────────────────────────────────────

export async function uploadGameIcon(gameSlug: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `${gameSlug}.${ext}`;
  const { error } = await supabase.storage.from("game-icons").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from("game-icons").getPublicUrl(path);
  return publicUrl;
}

export async function deleteGameIcon(gameSlug: string): Promise<void> {
  for (const ext of ["png", "jpg", "jpeg", "webp", "gif"]) {
    const { error } = await supabase.storage.from("game-icons").remove([`${gameSlug}.${ext}`]);
    if (!error) return;
  }
}

// ── Boss Image Uploads ──────────────────────────────────────

export async function uploadBossImage(gameSlug: string, bossName: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `bosses/${gameSlug}/${bossName.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
  const { error } = await supabase.storage.from("game-icons").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from("game-icons").getPublicUrl(path);
  return publicUrl;
}

// ── Activity Image Uploads ──────────────────────────────────

export async function uploadActivityImage(gameSlug: string, activityName: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `activities/${gameSlug}/${activityName.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
  const { error } = await supabase.storage.from("game-icons").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from("game-icons").getPublicUrl(path);
  return publicUrl;
}
