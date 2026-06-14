import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import { Package, Star, Shield } from "lucide-react";

const RARITY_COLORS: Record<string, string> = {
  legendary: "#f59e0b",
  epic: "#a855f7",
  rare: "#3b82f6",
  uncommon: "#22c55e",
  common: "#a1a1aa",
  mythic: "#ef4444",
};

const RARITY_SCORE: Record<string, number> = {
  legendary: 10, epic: 5, rare: 3, uncommon: 2, common: 1, mythic: 12,
};

type GearSlotDef = { id: string; name: string; sort_order: number };
type MemberGearRow = {
  id: string; member_id: string; slot_id: string;
  catalog_item_id: string | null; enhancement_level: number;
};

interface Props {
  memberId: string;
}

export function GearPlanner({ memberId }: Props) {
  const serverId = useServerId();
  const configured = isSupabaseConfigured();

  // Fetch game slug
  const { data: gameSlug } = useQuery({
    queryKey: ["serverGame", serverId],
    queryFn: async () => {
      const { data } = await supabase.from("servers").select("game").eq("id", serverId).single();
      return data?.game || null;
    },
    enabled: !!serverId && configured,
  });

  // Fetch gear slots for the game
  const { data: slotDefs = [] } = useQuery<GearSlotDef[]>({
    queryKey: ["gearSlots", gameSlug],
    queryFn: async () => {
      const { data } = await supabase.from("gear_slots").select("id, name, sort_order").eq("game", gameSlug).order("sort_order");
      return (data || []) as GearSlotDef[];
    },
    enabled: !!gameSlug && configured,
  });

  // Fetch member's gear
  const { data: memberGear = [] } = useQuery<MemberGearRow[]>({
    queryKey: ["memberGearProfile", memberId],
    queryFn: async () => {
      const { data } = await supabase.from("member_gear").select("id, member_id, slot_id, catalog_item_id, enhancement_level").eq("member_id", memberId);
      return (data || []) as MemberGearRow[];
    },
    enabled: !!memberId && configured,
  });

  // Fetch all items for the game (for lookup)
  const { data: items = [] } = useQuery<any[]>({
    queryKey: ["gameItems", gameSlug],
    queryFn: async () => {
      if (!gameSlug) return [];
      const { data } = await supabase.from("items").select("*").eq("game", gameSlug).order("name");
      return data || [];
    },
    enabled: !!gameSlug && configured,
  });

  if (!gameSlug || slotDefs.length === 0) {
    return (
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-[#a1a1aa]" />
          <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">Gear Planner</h2>
        </div>
        <p className="text-sm text-[#52525b] py-4 text-center">No gear template configured for this game.</p>
      </div>
    );
  }

  // Build gear map: slot_id → gear row
  const gearMap: Record<string, MemberGearRow> = {};
  memberGear.forEach(g => { gearMap[g.slot_id] = g; });

  // Build item map for lookup
  const itemMap: Record<string, any> = {};
  items.forEach(i => { itemMap[i.id] = i; });

  // Compute stats
  const equippedSlots = slotDefs.filter(s => gearMap[s.name]?.catalog_item_id);
  const totalSlots = slotDefs.length;
  const avgEnh = equippedSlots.length > 0
    ? Math.round(equippedSlots.reduce((sum, s) => sum + (gearMap[s.name]?.enhancement_level || 0), 0) / equippedSlots.length)
    : 0;
  const totalScore = equippedSlots.reduce((sum, s) => {
    const gear = gearMap[s.name];
    const item = gear?.catalog_item_id ? itemMap[gear.catalog_item_id] : null;
    return sum + (gear?.enhancement_level || 0) + (item ? (RARITY_SCORE[item.rarity?.toLowerCase()] || 0) : 0);
  }, 0);

  // Split slots into columns for the MMO layout
  const leftCol = slotDefs.filter(s => ["Weapon", "Helm", "Chest", "Lower Pants", "Gloves", "Boots"].includes(s.name));
  const rightCol = slotDefs.filter(s => ["Necklace", "Ring", "Earring", "Bracelet", "Belt", "Cloak", "Gadget"].includes(s.name));

  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Package className="w-4 h-4 text-amber-400" />
        <h2 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">Gear Planner</h2>
        <span className="text-[10px] text-[#52525b] ml-auto">{equippedSlots.length}/{totalSlots} equipped</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left: Equipment layout */}
        <div className="flex-1">
          <div className="flex gap-4 justify-center">
            {/* Left column */}
            <div className="flex flex-col gap-2">
              {leftCol.map(slot => {
                const gear = gearMap[slot.name];
                const item = gear?.catalog_item_id ? itemMap[gear.catalog_item_id] : null;
                const rarity = item?.rarity?.toLowerCase() || "";
                const rc = RARITY_COLORS[rarity] || "#3f3f46";
                const enh = gear?.enhancement_level || 0;
                return (
                  <GearSlotCard
                    key={slot.name}
                    label={slot.name}
                    item={item}
                    enhancement={enh}
                    rarityColor={rc}
                    isEmpty={!item}
                  />
                );
              })}
            </div>
            {/* Right column */}
            <div className="flex flex-col gap-2">
              {rightCol.map(slot => {
                const gear = gearMap[slot.name];
                const item = gear?.catalog_item_id ? itemMap[gear.catalog_item_id] : null;
                const rarity = item?.rarity?.toLowerCase() || "";
                const rc = RARITY_COLORS[rarity] || "#3f3f46";
                const enh = gear?.enhancement_level || 0;
                return (
                  <GearSlotCard
                    key={slot.name}
                    label={slot.name}
                    item={item}
                    enhancement={enh}
                    rarityColor={rc}
                    isEmpty={!item}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Stats panel */}
        <div className="lg:w-56 shrink-0">
          <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
            <h3 className="text-[10px] text-[#71717a] uppercase tracking-wider font-medium">Gear Stats</h3>

            <div className="space-y-2">
              <StatRow label="Equipped" value={`${equippedSlots.length}/${totalSlots}`} />
              <StatRow label="Avg Enhance" value={`+${avgEnh}`} highlight />
              <StatRow label="Total Score" value={totalScore.toLocaleString()} highlight />
            </div>

            {/* Rarity breakdown */}
            <div className="pt-2 border-t border-[#27272a]">
              <p className="text-[9px] text-[#52525b] uppercase tracking-wider mb-1.5">Rarity Breakdown</p>
              <div className="space-y-1">
                {["legendary", "epic", "rare", "uncommon", "common"].map(rarity => {
                  const count = equippedSlots.filter(s => {
                    const gear = gearMap[s.name];
                    const item = gear?.catalog_item_id ? itemMap[gear.catalog_item_id] : null;
                    return item?.rarity?.toLowerCase() === rarity;
                  }).length;
                  if (count === 0) return null;
                  return (
                    <div key={rarity} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: RARITY_COLORS[rarity] }} />
                      <span className="text-[10px] text-[#a1a1aa] capitalize flex-1">{rarity}</span>
                      <span className="text-[10px] text-[#71717a] font-mono">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[#71717a]">{label}</span>
      <span className={`text-[11px] font-mono font-semibold ${highlight ? "text-[#fafafa]" : "text-[#a1a1aa]"}`}>{value}</span>
    </div>
  );
}

function GearSlotCard({
  label, item, enhancement, rarityColor, isEmpty,
}: {
  label: string; item: any; enhancement: number; rarityColor: string; isEmpty: boolean;
}) {
  return (
    <div
      className="group relative"
      title={item ? `${item.name}${enhancement > 0 ? ` +${enhancement}` : ""}` : `${label} — Not Equipped`}
    >
      <div
        className={`w-[72px] h-[72px] rounded-xl flex flex-col items-center justify-center transition-all duration-200 ${
          isEmpty
            ? "bg-[#09090b] border border-dashed border-[#27272a] hover:border-[#3f3f46]"
            : "bg-[#09090b] border hover:scale-[1.03] hover:shadow-[0_0_12px_rgba(var(--glow-color),0.15)]"
        }`}
        style={{
          borderColor: isEmpty ? undefined : `${rarityColor}40`,
          ["--glow-color" as any]: rarityColor,
        }}
      >
        <p className="text-[8px] text-[#52525b] uppercase tracking-wider mb-0.5">{label}</p>
        {!isEmpty ? (
          <>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center relative" style={{ backgroundColor: `${rarityColor}18` }}>
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-7 h-7 rounded object-cover" />
              ) : (
                <Star className="w-4 h-4" style={{ color: rarityColor }} />
              )}
              {enhancement > 0 && (
                <span className="absolute -right-1 -bottom-1 text-[7px] font-black text-white bg-black/50 rounded-full px-1 leading-none py-px">+{enhancement}</span>
              )}
            </div>
            <p className="text-[8px] font-medium mt-0.5 text-center truncate w-full px-1" style={{ color: rarityColor }}>
              {item.name.length > 12 ? item.name.slice(0, 11) + "…" : item.name}
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#18181b]">
              <Shield className="w-4 h-4 text-[#3f3f46]" />
            </div>
            <p className="text-[7px] text-[#3f3f46] mt-0.5">Empty</p>
          </div>
        )}
      </div>
    </div>
  );
}
