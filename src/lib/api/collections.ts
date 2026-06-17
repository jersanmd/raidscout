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
    .order("added_at");
  if (error) throw error;
  return data || [];
}

export async function addItemToCollection(collectionId: string, itemId: string): Promise<void> {
  const { error } = await supabase
    .from("item_collection_items")
    .insert({ collection_id: collectionId, item_id: itemId });
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
