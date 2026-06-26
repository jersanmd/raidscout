// ── Rarity color lookup from DB rarities with fallback ──

const FALLBACK_COLORS: Record<string, string> = {
  common: "#71717a", uncommon: "#22c55e", rare: "#3b82f6",
  epic: "#a855f7", legendary: "#f59e0b", mythic: "#ef4444",
};

const FALLBACK_GLOW: Record<string, string> = {
  common: "rgba(113,113,122,0.3)", uncommon: "rgba(34,197,94,0.3)",
  rare: "rgba(59,130,246,0.3)", epic: "rgba(168,85,247,0.3)",
  legendary: "rgba(245,158,11,0.3)", mythic: "rgba(239,68,68,0.3)",
};

export interface RarityRow {
  id: string;
  game: string;
  name: string;
  color: string;
  sort_order: number;
}

/** Look up a rarity's color from a DB rarities array, falling back to hardcoded defaults. */
import { fetchItemRarities } from "@/lib/api/games";
export { fetchItemRarities };
export function rarityColor(
  rarityName: string | null | undefined,
  rarities: RarityRow[],
): string {
  if (!rarityName) return "#71717a";
  const key = rarityName.toLowerCase();
  const match = rarities.find((r) => r.name.toLowerCase() === key);
  if (match) return match.color;
  return FALLBACK_COLORS[key] || "#71717a";
}

/** Build a Record<lowercaseName, color> map from a DB rarities array for fast lookups. */
export function rarityColorMap(rarities: RarityRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of rarities) map[r.name.toLowerCase()] = r.color;
  // Merge fallbacks for any rarity the DB doesn't define
  for (const [k, v] of Object.entries(FALLBACK_COLORS)) {
    if (!(k in map)) map[k] = v;
  }
  return map;
}

/** Get a glow color (low-opacity) for a rarity. */
export function rarityGlow(
  rarityName: string | null | undefined,
  rarities: RarityRow[],
): string {
  if (!rarityName) return "rgba(113,113,122,0.3)";
  const key = rarityName.toLowerCase();
  const color = rarityColor(rarityName, rarities);
  if (color && key in FALLBACK_GLOW) return color.replace("1)", "0.3)");
  return FALLBACK_GLOW[key] || "rgba(113,113,122,0.3)";
}

/** Map a rarity name to a sortable numeric score for ordering. */
export function rarityScore(
  rarityName: string | null | undefined,
  rarities: RarityRow[],
): number {
  if (!rarityName) return 0;
  const key = rarityName.toLowerCase();
  const idx = rarities.findIndex((r) => r.name.toLowerCase() === key);
  if (idx !== -1) return rarities.length - idx;
  const fallbackScores: Record<string, number> = {
    mythic: 20, legendary: 10, epic: 5, rare: 3, uncommon: 2, common: 1,
  };
  return fallbackScores[key] || 0;
}
