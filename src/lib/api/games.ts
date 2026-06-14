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

// ── Item Image Uploads ──────────────────────────────────────

export async function uploadItemImage(serverId: string, itemName: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `items/${serverId}/${itemName.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("game-icons").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from("game-icons").getPublicUrl(path);
  return publicUrl;
}

// ── Item Catalog (Admin — game-level items) ────────────────

export async function fetchItemCatalog(gameSlug: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("game", gameSlug)
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function fetchItemCatalogPaginated(
  gameSlug: string,
  limit: number,
  offset: number,
  search?: string,
): Promise<{ items: any[]; total: number }> {
  let query = supabase
    .from("items")
    .select("*")
    .eq("game", gameSlug);
  let countQuery = supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .eq("game", gameSlug);

  if (search && search.trim()) {
    query = query.ilike("name", `%${search.trim()}%`);
    countQuery = countQuery.ilike("name", `%${search.trim()}%`);
  }

  const [{ data, error }, { count }] = await Promise.all([
    query.order("name").range(offset, offset + limit - 1),
    countQuery,
  ]);
  if (error) throw error;
  return { items: data || [], total: count || 0 };
}

// ── Item Approval (Admin) ──

export async function fetchPendingItems(gameSlug?: string): Promise<any[]> {
  const { data, error } = await supabase.rpc("fetch_pending_items", {
    p_game: gameSlug || null,
  });
  if (error) throw error;
  return data || [];
}

export async function approveItem(itemId: string): Promise<void> {
  const { error } = await supabase.rpc("approve_item", { p_item_id: itemId });
  if (error) throw error;
}

export async function rejectItem(itemId: string): Promise<void> {
  const { error } = await supabase.rpc("reject_item", { p_item_id: itemId });
  if (error) throw error;
}

export async function createItemCatalogItem(item: {
  game: string;
  name: string;
  rarity?: string;
  description?: string;
  image_url?: string;
  category_id?: string;
}): Promise<any> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user?.id) throw new Error("You must be logged in to create items.");
  const username = userData.user?.email?.split("@")[0] || userData.user?.id?.slice(0, 8) || "unknown";

  const { data, error } = await supabase
    .from("items")
    .insert({
      game: item.game,
      name: item.name.trim(),
      rarity: item.rarity || "common",
      description: item.description || null,
      image_url: item.image_url || null,
      category_id: item.category_id || null,
      created_by: userData.user.id,
      created_by_username: username,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItemCatalogItem(itemId: string): Promise<void> {
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) throw error;
}

export async function updateItemCatalogItem(itemId: string, updates: {
  name?: string;
  rarity?: string;
  description?: string;
  image_url?: string;
  category_id?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from("items")
    .update(updates)
    .eq("id", itemId);
  if (error) throw error;
}

export async function uploadItemCatalogImage(gameSlug: string, itemName: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `items/${gameSlug}/${itemName.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("game-icons").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from("game-icons").getPublicUrl(path);
  return publicUrl;
}

// ── Item Categories (Admin) ─────────────────────────────────

export async function fetchItemCategories(gameSlug: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("item_categories")
    .select("*")
    .eq("game", gameSlug)
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function createItemCategory(cat: {
  game: string;
  name: string;
  parent_id?: string | null;
}): Promise<any> {
  const { data, error } = await supabase
    .from("item_categories")
    .insert({
      game: cat.game,
      name: cat.name.trim(),
      parent_id: cat.parent_id || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItemCategory(catId: string): Promise<void> {
  const { error } = await supabase.from("item_categories").delete().eq("id", catId);
  if (error) throw error;
}

export async function updateItemCategory(catId: string, updates: { name?: string; parent_id?: string | null }): Promise<void> {
  const { error } = await supabase
    .from("item_categories")
    .update(updates)
    .eq("id", catId);
  if (error) throw error;
}

// ── Item Rarities (Admin) ───────────────────────────────────

export async function fetchItemRarities(gameSlug: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("item_rarities")
    .select("*")
    .eq("game", gameSlug)
    .order("sort_order");
  if (error) throw error;
  return data || [];
}

export async function createItemRarity(rarity: {
  game: string;
  name: string;
  color: string;
  sort_order?: number;
}): Promise<any> {
  const { data, error } = await supabase
    .from("item_rarities")
    .insert({
      game: rarity.game,
      name: rarity.name.trim(),
      color: rarity.color,
      sort_order: rarity.sort_order || 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItemRarity(rarityId: string): Promise<void> {
  const { error } = await supabase.from("item_rarities").delete().eq("id", rarityId);
  if (error) throw error;
}

export async function updateItemRarity(rarityId: string, updates: {
  name?: string;
  color?: string;
  sort_order?: number;
}): Promise<void> {
  const { error } = await supabase
    .from("item_rarities")
    .update(updates)
    .eq("id", rarityId);
  if (error) throw error;
}

// ── Gear Slots (Admin — game-level) ──────────────────────

export async function fetchGearSlots(gameSlug: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("gear_slots")
    .select("*")
    .eq("game", gameSlug)
    .order("sort_order");
  if (error) throw error;
  return data || [];
}

export async function createGearSlot(slot: { game: string; name: string; sort_order?: number }): Promise<any> {
  const { data, error } = await supabase
    .from("gear_slots")
    .insert({ game: slot.game, name: slot.name.trim(), sort_order: slot.sort_order ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGearSlot(slotId: string): Promise<void> {
  const { error } = await supabase.from("gear_slots").delete().eq("id", slotId);
  if (error) throw error;
}

export async function updateGearSlot(slotId: string, updates: { name?: string; sort_order?: number }): Promise<void> {
  const { error } = await supabase
    .from("gear_slots")
    .update(updates)
    .eq("id", slotId);
  if (error) throw error;
}

// ── Gear Slot Categories (junction: slot ↔ item_categories) ──

export async function fetchGearSlotCategories(slotId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from("gear_slot_categories")
    .select("id, slot_id, category_id, created_at, category:category_id(id, name, parent_id, parent:parent_id(name))")
    .eq("slot_id", slotId)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

export async function assignGearSlotCategory(slotId: string, categoryId: string): Promise<any> {
  const { data, error } = await supabase
    .from("gear_slot_categories")
    .insert({ slot_id: slotId, category_id: categoryId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeGearSlotCategory(assignmentId: string): Promise<void> {
  const { error } = await supabase.from("gear_slot_categories").delete().eq("id", assignmentId);
  if (error) throw error;
}
