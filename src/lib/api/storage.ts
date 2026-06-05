import { supabase, supabaseUrl, supabaseKey, getCurrentServerId } from "./client";

// ── Rally Image Storage ─────────────────────────────────────

export async function uploadRallyImage(file: File): Promise<string | null> {
  try {
    const serverId = getCurrentServerId();
    if (!serverId) return null;
    const ext = file.name.split(".").pop() || "png";
    const fileName = `${serverId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

    const formData = new FormData();
    formData.append("file", file);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? supabaseKey;

    const res = await fetch(
      `${supabaseUrl}/storage/v1/object/rally-images/${fileName}`,
      {
        method: "POST",
        headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
        body: formData,
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Rally image upload failed:", res.status, err);
      return null;
    }

    const { data: urlData } = supabase.storage.from("rally-images").getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch (err) {
    console.error("Rally image upload error:", err);
    return null;
  }
}

/** Helper: parse rally_image_url JSON array or single URL string. */
function parseRallyImageArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [raw];
  } catch {
    return [raw];
  }
}

/** Add a rally image URL to a death record (stores as JSON array). */
export async function addRallyImageToDeath(deathRecordId: string, newUrl: string): Promise<void> {
  const { data } = await supabase
    .from("death_records")
    .select("rally_image_url")
    .eq("id", deathRecordId)
    .single();
  const existing: string[] = parseRallyImageArray((data as any)?.rally_image_url);
  existing.push(newUrl);
  const { error } = await supabase
    .from("death_records")
    .update({ rally_image_url: JSON.stringify(existing) })
    .eq("id", deathRecordId);
  if (error) console.error("Failed to add rally image:", error);
}

/** Remove a rally image URL from a death record. */
export async function removeRallyImageFromDeath(deathRecordId: string, urlToRemove: string): Promise<void> {
  const { data } = await supabase
    .from("death_records")
    .select("rally_image_url")
    .eq("id", deathRecordId)
    .single();
  const existing: string[] = parseRallyImageArray((data as any)?.rally_image_url);
  const filtered = existing.filter(u => u !== urlToRemove);
  const { error } = await supabase
    .from("death_records")
    .update({ rally_image_url: filtered.length > 0 ? JSON.stringify(filtered) : null })
    .eq("id", deathRecordId);
  if (error) console.error("Failed to remove rally image:", error);

  // Also delete from storage
  try {
    const urlObj = new URL(urlToRemove);
    const path = urlObj.pathname.split("/rally-images/")[1];
    if (path) await supabase.storage.from("rally-images").remove([decodeURIComponent(path)]);
  } catch {}
}

/** Fetch rally image URLs for a death record. Returns array of URLs. */
export async function fetchDeathRallyImages(deathRecordId: string): Promise<string[]> {
  const { data } = await supabase
    .from("death_records")
    .select("rally_image_url")
    .eq("id", deathRecordId)
    .single();
  return parseRallyImageArray((data as any)?.rally_image_url);
}
