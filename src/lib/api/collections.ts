import { supabase } from "./client";

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
  return data;
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from("item_collections").delete().eq("id", id);
  if (error) throw error;
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

export async function addItemToCollection(collectionId: string, itemId: string): Promise<void> {
  // Get next sort_order
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
}

export async function reorderCollectionItem(collectionId: string, itemId: string, newOrder: number): Promise<void> {
  const { error } = await supabase
    .from("item_collection_items")
    .update({ sort_order: newOrder })
    .eq("collection_id", collectionId)
    .eq("item_id", itemId);
  if (error) throw error;
}

export async function removeItemFromCollection(collectionId: string, itemId: string): Promise<void> {
  const { error } = await supabase
    .from("item_collection_items")
    .delete()
    .eq("collection_id", collectionId)
    .eq("item_id", itemId);
  if (error) throw error;
}

// Get all distributions for a server (to check who owns what)
export async function fetchServerDistributions(serverId: string): Promise<{ member_id: string; player_name: string; item_id: string; quantity: number }[]> {
  const { data, error } = await supabase
    .from("distributions")
    .select("member_id, player_name, item_id, quantity")
    .eq("server_id", serverId);
  if (error) throw error;
  return data || [];
}

// ── Manual Ownership ──────────────────────────────────────

export type ManualOwnership = {
  id: string;
  collection_id: string;
  item_id: string;
  player_name: string;
  owned: boolean;
  set_by?: string;
  set_at: string;
};

export async function fetchManualOwnership(collectionId: string): Promise<ManualOwnership[]> {
  const { data, error } = await supabase
    .from("item_collection_manual_ownership")
    .select("*")
    .eq("collection_id", collectionId);
  if (error) throw error;
  return data || [];
}

export async function setManualOwnership(collectionId: string, itemId: string, playerName: string, owned: boolean): Promise<void> {
  const { error } = await supabase
    .from("item_collection_manual_ownership")
    .upsert({ collection_id: collectionId, item_id: itemId, player_name: playerName, owned }, { onConflict: "collection_id,item_id,player_name" });
  if (error) throw error;
}

export async function removeManualOwnership(collectionId: string, itemId: string, playerName: string): Promise<void> {
  const { error } = await supabase
    .from("item_collection_manual_ownership")
    .delete()
    .eq("collection_id", collectionId)
    .eq("item_id", itemId)
    .eq("player_name", playerName);
  if (error) throw error;
}
