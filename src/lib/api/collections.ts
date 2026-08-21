import { supabase } from "./client";
import { writeAuditEntry, AuditAction } from "./audit";

export type ItemCollection = {
  id: string;
  server_id: string;
  name: string;
  created_by?: string;
  created_at: string;
};

export type ItemCollectionItem = {
  id: string;
  collection_id: string;
  item_id: string;
  sort_order: number;
  added_at: string;
};

export async function fetchCollections(serverId: string): Promise<ItemCollection[]> {
  const { data, error } = await supabase
    .from("item_collections")
    .select("*")
    .eq("server_id", serverId)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

export async function createCollection(serverId: string, name: string, createdBy?: string): Promise<ItemCollection> {
  const { data, error } = await supabase
    .from("item_collections")
    .insert({ server_id: serverId, name, created_by: createdBy })
    .select()
    .single();
  if (error) throw error;
  writeAuditEntry({ action: AuditAction.COLLECTION_CREATE, server_id: serverId, target_id: data.id, details: { collection_name: name } });
  return data;
}

export async function deleteCollection(id: string, serverId?: string, name?: string): Promise<void> {
  const { error } = await supabase.from("item_collections").delete().eq("id", id);
  if (error) throw error;
  if (serverId) writeAuditEntry({ action: AuditAction.COLLECTION_DELETE, server_id: serverId, target_id: id, details: { collection_name: name || id } });
}

export async function fetchCollectionItems(collectionId: string): Promise<ItemCollectionItem[]> {
  const { data, error } = await supabase
    .from("item_collection_items")
    .select("*")
    .eq("collection_id", collectionId)
    .order("sort_order");
  if (error) throw error;
  return data || [];
}

export async function addItemToCollection(collectionId: string, itemId: string, serverId?: string, itemName?: string, collectionName?: string): Promise<void> {
  const { data: existing } = await supabase
    .from("item_collection_items")
    .select("sort_order")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
  const { error } = await supabase
    .from("item_collection_items")
    .insert({ collection_id: collectionId, item_id: itemId, sort_order: nextOrder });
  if (error) throw error;
  if (serverId && itemName) writeAuditEntry({ action: AuditAction.COLLECTION_ITEM_ADD, server_id: serverId, target_id: collectionId, details: { item_name: itemName, collection_name: collectionName || collectionId } });
}

export async function reorderCollectionItem(collectionId: string, itemId: string, newOrder: number): Promise<void> {
  const { error } = await supabase
    .from("item_collection_items")
    .update({ sort_order: newOrder })
    .eq("collection_id", collectionId)
    .eq("item_id", itemId);
  if (error) throw error;
}

// Fetch all collection items for a server (for card previews)
export async function fetchAllCollectionItemsForServer(serverId: string): Promise<ItemCollectionItem[]> {
  // First get collection IDs for this server
  const { data: cols } = await supabase
    .from("item_collections")
    .select("id")
    .eq("server_id", serverId);
  const colIds = (cols || []).map((c: any) => c.id);
  if (colIds.length === 0) return [];
  // Then get items for those collections
  const { data, error } = await supabase
    .from("item_collection_items")
    .select("*")
    .in("collection_id", colIds);
  if (error) throw error;
  return data || [];
}

export async function removeItemFromCollection(collectionId: string, itemId: string, serverId?: string, itemName?: string, collectionName?: string): Promise<void> {
  const { error } = await supabase
    .from("item_collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("item_id", itemId);
  if (error) throw error;
  if (serverId && itemName) writeAuditEntry({ action: AuditAction.COLLECTION_ITEM_REMOVE, server_id: serverId, target_id: collectionId, details: { item_name: itemName, collection_name: collectionName || collectionId } });
}

// Get all distributions for a server (to check who owns what).
// Paginated: PostgREST caps a response at 1000 rows, and a truncated fetch shows
// owned items as missing in the ownership matrix.
const PAGE_SIZE = 1000;

export async function fetchServerDistributions(serverId: string): Promise<{ member_id: string; player_name: string; item_id: string; quantity: number }[]> {
  const all: { member_id: string; player_name: string; item_id: string; quantity: number }[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("distributions")
      .select("member_id, player_name, item_id, quantity")
      .eq("server_id", serverId)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

// ── Manual Ownership ──────────────────────────────────────

export type ManualOwnership = {
  id: string;
  collection_id: string;
  item_id: string;
  player_name: string;
  /** The member the override belongs to. Null for players who are no longer members
   *  of the server — those rows stay keyed by name, as the matrix displays them. */
  member_id?: string | null;
  owned: boolean;
  set_by?: string;
  set_at: string;
};

/** Who an override is for. The member id is what survives a rename; the name is the
 *  fallback for players who no longer have a member row. */
export type OwnershipTarget = { memberId?: string | null; playerName: string };

type OwnershipAudit = { serverId?: string; itemName?: string; collectionName?: string };

export async function fetchManualOwnership(collectionId: string): Promise<ManualOwnership[]> {
  const { data, error } = await supabase
    .from("item_collection_manual_ownership")
    .select("*")
    .eq("collection_id", collectionId);
  if (error) throw error;
  return data || [];
}

export async function setManualOwnership(collectionId: string, itemId: string, target: OwnershipTarget, owned: boolean, audit?: OwnershipAudit): Promise<void> {
  const { memberId, playerName } = target;
  const { error } = await supabase
    .from("item_collection_manual_ownership")
    .upsert(
      { collection_id: collectionId, item_id: itemId, player_name: playerName, member_id: memberId ?? null, owned },
      // Keyed on the member where there is one, so an override written under the
      // player's previous name is updated rather than duplicated.
      { onConflict: memberId ? "collection_id,item_id,member_id" : "collection_id,item_id,player_name" },
    );
  if (error) throw error;
  if (audit?.serverId && audit.itemName) writeAuditEntry({ action: AuditAction.COLLECTION_OWNERSHIP_SET, server_id: audit.serverId, target_id: collectionId, details: { item_name: audit.itemName, player_name: playerName, owned, collection_name: audit.collectionName || collectionId } });
}

export async function removeManualOwnership(collectionId: string, itemId: string, target: OwnershipTarget, audit?: OwnershipAudit): Promise<void> {
  const { memberId, playerName } = target;
  let query = supabase
    .from("item_collection_manual_ownership")
    .delete()
    .eq("collection_id", collectionId)
    .eq("item_id", itemId);
  // Deleting by member also clears a row left behind under an old name, which a
  // name-keyed delete silently missed.
  query = memberId ? query.eq("member_id", memberId) : query.eq("player_name", playerName);
  const { error } = await query;
  if (error) throw error;
  if (audit?.serverId && audit.itemName) writeAuditEntry({ action: AuditAction.COLLECTION_OWNERSHIP_REMOVE, server_id: audit.serverId, target_id: collectionId, details: { item_name: audit.itemName, player_name: playerName, collection_name: audit.collectionName || collectionId } });
}
