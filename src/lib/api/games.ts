import { supabase } from "./client";
import { writeAuditEntry, AuditAction, GLOBAL_AUDIT_SERVER_ID } from "./audit";

// ── Games ───────────────────────────────────────────────────

export async function fetchGames(): Promise<any[]> {
  const { data, error } = await supabase.from("games").select("*").order("created_at");
  if (error) throw error;
  return data || [];
}

export async function fetchVisibleGames(): Promise<any[]> {
  const { data, error } = await supabase.from("games").select("*").eq("is_visible", true).order("created_at");
  if (error) throw error;
  return data || [];
}

export async function createGame(name: string, slug: string, supportedSpawnTypes: string[], iconUrl?: string): Promise<any> {
  const { data, error } = await supabase.from("games").insert({ name, slug, supported_spawn_types: supportedSpawnTypes, icon_url: iconUrl || null, is_visible: true }).select().single();
  if (error) throw error;
  return data;
}

export async function updateGame(id: string, updates: { name?: string; slug?: string; supported_spawn_types?: string[]; icon_url?: string | null; is_visible?: boolean }): Promise<void> {
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

export async function fetchApprovedCommunityItems(
  gameSlug: string,
  limit: number,
  offset: number,
  search?: string,
): Promise<{ items: any[]; total: number }> {
  let query = supabase
    .from("items")
    .select("*")
    .eq("game", gameSlug)
    .eq("status", "approved")
    .not("server_id", "is", null);  // community-created, not admin-created
  let countQuery = supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .eq("game", gameSlug)
    .eq("status", "approved")
    .not("server_id", "is", null);

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

/** Read an item's identity for the audit trail before moderating it. */
async function itemAuditContext(itemId: string): Promise<{ serverId?: string; name?: string }> {
  try {
    const { data } = await supabase.from("items").select("name, server_id").eq("id", itemId).single();
    return { serverId: (data as any)?.server_id ?? undefined, name: (data as any)?.name };
  } catch { return {}; }
}

export async function approveItem(itemId: string): Promise<void> {
  const ctx = await itemAuditContext(itemId);
  const { error } = await supabase.rpc("approve_item", { p_item_id: itemId });
  if (error) throw error;
  // Approving publishes a submission into the game-wide catalog every server
  // reads; ITEM_APPROVE existed in the catalog but was never written, so the
  // Activity Log filter for it could only ever return an empty list.
  if (ctx.serverId) {
    writeAuditEntry({ action: AuditAction.ITEM_APPROVE, server_id: ctx.serverId, target_id: itemId, details: { item_name: ctx.name ?? itemId } });
  }
}

export async function rejectItem(itemId: string): Promise<void> {
  const ctx = await itemAuditContext(itemId);
  const { error } = await supabase.rpc("reject_item", { p_item_id: itemId });
  if (error) throw error;
  if (ctx.serverId) {
    writeAuditEntry({ action: AuditAction.ITEM_REJECT, server_id: ctx.serverId, target_id: itemId, details: { item_name: ctx.name ?? itemId } });
  }
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

export async function deleteItemCatalogItem(itemId: string, serverId?: string): Promise<void> {
  // Capture identity first: createItemCatalogItem is audited at its caller, so
  // without this the shared catalog could be edited and emptied with only the
  // creations on record.
  let name: string | undefined, sid = serverId;
  try {
    const { data } = await supabase.from("items").select("name, server_id").eq("id", itemId).single();
    name = (data as any)?.name; sid = sid ?? (data as any)?.server_id ?? undefined;
  } catch { /* non-critical */ }
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) throw error;
  if (sid) writeAuditEntry({ action: AuditAction.ITEM_DELETE, server_id: sid, target_id: itemId, details: { item_name: name ?? itemId, scope: "game catalog" } });
}

export async function updateItemCatalogItem(itemId: string, updates: {
  name?: string;
  rarity?: string;
  description?: string;
  image_url?: string;
  category_id?: string | null;
}): Promise<void> {
  // Read identity first so a rename is auditable as old → new.
  const ctx = await itemAuditContext(itemId);

  const { error } = await supabase
    .from("items")
    .update(updates)
    .eq("id", itemId);
  if (error) throw error;

  // Only community items carry a server_id; purely global catalog rows have
  // none and the audit log is server-scoped, so those stay unaudited by design.
  if (ctx.serverId) {
    writeAuditEntry({
      action: AuditAction.ITEM_UPDATE,
      server_id: ctx.serverId,
      target_id: itemId,
      details: { item_name: updates.name ?? ctx.name ?? itemId, old_name: ctx.name, scope: "game catalog" },
    });
  }
}

export async function uploadItemCatalogImage(gameSlug: string, itemName: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `items/${gameSlug}/${itemName.replace(/[^a-zA-Z0-9]/g, "_")}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("game-icons").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from("game-icons").getPublicUrl(path);
  return publicUrl;
}

// ── Game taxonomy auditing ──────────────────────────────────
// item_categories, item_rarities and gear_slots are game-wide structure that
// only super-admins can change, and all three carry the same (name, game)
// shape. Deletes and updates arrive with nothing but an id, so read the row
// first — an audit entry naming a UUID is no better than no entry at all.

type TaxonomyKind = "category" | "rarity" | "gear slot" | "gear slot category";

async function taxonomyRow(table: string, id: string): Promise<{ name?: string; game?: string }> {
  try {
    const { data } = await supabase.from(table).select("name, game").eq("id", id).single();
    return { name: (data as any)?.name, game: (data as any)?.game };
  } catch { return {}; }
}

function auditTaxonomy(
  action: string,
  kind: TaxonomyKind,
  id: string,
  ctx: { name?: string; game?: string },
  extra?: Record<string, any>
) {
  writeAuditEntry({
    action,
    server_id: GLOBAL_AUDIT_SERVER_ID,
    target_type: kind,
    target_id: id,
    details: { kind, name: ctx.name ?? id, game: ctx.game, ...extra },
  }).catch(() => { /* auditing must never fail the admin's edit */ });
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
  auditTaxonomy(AuditAction.GAME_TAXONOMY_CREATE, "category", (data as any).id, { name: cat.name.trim(), game: cat.game }, { parent_id: cat.parent_id || null });
  return data;
}

export async function deleteItemCategory(catId: string): Promise<void> {
  const ctx = await taxonomyRow("item_categories", catId);
  const { error } = await supabase.from("item_categories").delete().eq("id", catId);
  if (error) throw error;
  auditTaxonomy(AuditAction.GAME_TAXONOMY_DELETE, "category", catId, ctx);
}

export async function updateItemCategory(catId: string, updates: { name?: string; parent_id?: string | null }): Promise<void> {
  const ctx = await taxonomyRow("item_categories", catId);
  const { error } = await supabase
    .from("item_categories")
    .update(updates)
    .eq("id", catId);
  if (error) throw error;
  auditTaxonomy(AuditAction.GAME_TAXONOMY_UPDATE, "category", catId, { name: updates.name ?? ctx.name, game: ctx.game }, { old_name: ctx.name });
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
  auditTaxonomy(AuditAction.GAME_TAXONOMY_CREATE, "rarity", (data as any).id, { name: rarity.name.trim(), game: rarity.game }, { color: rarity.color });
  return data;
}

export async function deleteItemRarity(rarityId: string): Promise<void> {
  const ctx = await taxonomyRow("item_rarities", rarityId);
  const { error } = await supabase.from("item_rarities").delete().eq("id", rarityId);
  if (error) throw error;
  auditTaxonomy(AuditAction.GAME_TAXONOMY_DELETE, "rarity", rarityId, ctx);
}

export async function updateItemRarity(rarityId: string, updates: {
  name?: string;
  color?: string;
  sort_order?: number;
}): Promise<void> {
  const ctx = await taxonomyRow("item_rarities", rarityId);
  const { error } = await supabase
    .from("item_rarities")
    .update(updates)
    .eq("id", rarityId);
  if (error) throw error;
  auditTaxonomy(AuditAction.GAME_TAXONOMY_UPDATE, "rarity", rarityId, { name: updates.name ?? ctx.name, game: ctx.game }, { old_name: ctx.name, color: updates.color });
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
  auditTaxonomy(AuditAction.GAME_TAXONOMY_CREATE, "gear slot", (data as any).id, { name: slot.name.trim(), game: slot.game });
  return data;
}

export async function deleteGearSlot(slotId: string): Promise<void> {
  const ctx = await taxonomyRow("gear_slots", slotId);
  const { error } = await supabase.from("gear_slots").delete().eq("id", slotId);
  if (error) throw error;
  auditTaxonomy(AuditAction.GAME_TAXONOMY_DELETE, "gear slot", slotId, ctx);
}

export async function updateGearSlot(slotId: string, updates: { name?: string; sort_order?: number }): Promise<void> {
  const ctx = await taxonomyRow("gear_slots", slotId);
  const { error } = await supabase
    .from("gear_slots")
    .update(updates)
    .eq("id", slotId);
  if (error) throw error;
  auditTaxonomy(AuditAction.GAME_TAXONOMY_UPDATE, "gear slot", slotId, { name: updates.name ?? ctx.name, game: ctx.game }, { old_name: ctx.name });
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
  // Which categories feed a slot decides what every server can equip there, so
  // the entry names both sides rather than the junction row's own id.
  const [slot, category] = await Promise.all([
    taxonomyRow("gear_slots", slotId),
    taxonomyRow("item_categories", categoryId),
  ]);
  auditTaxonomy(
    AuditAction.GAME_TAXONOMY_CREATE, "gear slot category", (data as any).id,
    { name: `${slot.name ?? slotId} ← ${category.name ?? categoryId}`, game: slot.game ?? category.game }
  );
  return data;
}

export async function removeGearSlotCategory(assignmentId: string): Promise<void> {
  // The junction row is gone after the delete, so resolve both names first.
  let label = assignmentId, game: string | undefined;
  try {
    const { data } = await supabase
      .from("gear_slot_categories")
      .select("slot:slot_id(name, game), category:category_id(name)")
      .eq("id", assignmentId)
      .single();
    const slot = (data as any)?.slot, category = (data as any)?.category;
    if (slot?.name) { label = `${slot.name} ← ${category?.name ?? "?"}`; game = slot.game; }
  } catch { /* non-critical */ }

  const { error } = await supabase.from("gear_slot_categories").delete().eq("id", assignmentId);
  if (error) throw error;
  auditTaxonomy(AuditAction.GAME_TAXONOMY_DELETE, "gear slot category", assignmentId, { name: label, game });
}
