import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, writeAuditEntry, AuditAction } from "@/lib/supabase";
import { useServerId, useHasPermission } from "@/contexts/ServerContext";
import { useMembers } from "@/hooks/useMembers";
import { fetchGuilds } from "@/lib/supabase";
import type { Member, Guild } from "@/types";
import {
  Package, Plus, Pencil, Trash2, X, Check, Loader2, Search,
  ChevronDown, Shield, Tag, Star, TrendingUp, ChevronUp,
  Sword, Swords, HandMetal, ShieldHalf, ShieldCheck, Gavel, Axe,
  Crosshair, Target, Wand, Heart, Zap, Flame, Snowflake, Skull,
  Crown, Anchor, Footprints,
} from "lucide-react";
import { guildColor } from "@/lib/constants";
// ── Default T&L Template ──
const DEFAULT_TL_TEMPLATE = [
  { category: "Armor", slots: ["Helmet", "Armor", "Gloves", "Pants", "Shoes"] },
  { category: "Accessories", slots: ["Earrings", "Necklace", "Bracelet", "Ring", "Belt"] },
  { category: "Special", slots: ["Cloak", "Weapon", "Passive"] },
];

const RARITY_COLORS: Record<string, string> = {
  legendary: "#f59e0b",
  epic: "#a855f7",
  rare: "#3b82f6",
  uncommon: "#22c55e",
  common: "#a1a1aa",
};

const RARITY_SCORE: Record<string, number> = {
  legendary: 10,
  epic: 5,
  rare: 3,
  uncommon: 2,
  common: 1,
};

const CLASS_ICONS: { name: string; icon: React.ElementType }[] = [
  { name: "Sword", icon: Sword },
  { name: "Swords", icon: Swords },
  { name: "HandMetal", icon: HandMetal },
  { name: "ShieldIcon", icon: Shield },
  { name: "ShieldHalf", icon: ShieldHalf },
  { name: "ShieldCheck", icon: ShieldCheck },
  { name: "Gavel", icon: Gavel },
  { name: "Axe", icon: Axe },
  { name: "Crosshair", icon: Crosshair },
  { name: "Target", icon: Target },
  { name: "Wand", icon: Wand },
  { name: "Heart", icon: Heart },
  { name: "Zap", icon: Zap },
  { name: "Flame", icon: Flame },
  { name: "Snowflake", icon: Snowflake },
  { name: "SkullIcon", icon: Skull },
  { name: "Star", icon: Star },
  { name: "Crown", icon: Crown },
  { name: "Anchor", icon: Anchor },
  { name: "Footprints", icon: Footprints },
];

const getClassIcon = (iconName: string): React.ElementType => {
  const entry = CLASS_ICONS.find(c => c.name === iconName);
  return entry ? entry.icon : Tag;
};

type GearSlot = { category: string; slots: string[] };
type CatalogItem = { id: string; guild_id: string; name: string; category: string; rarity: string; image_url?: string; description?: string };
type MemberGear = { id: string; member_id: string; slot_id: string; catalog_item_id: string | null; enhancement_level: number; catalog_item?: CatalogItem };
type GearSummary = { member_id: string; gear_score: number; slots_filled: number; total_slots: number; completion_pct: number };

export function GearTrackingTab() {
  const serverId = useServerId();
  const configured = isSupabaseConfigured();
  const canManage = useHasPermission("can_manage_members");
  const queryClient = useQueryClient();
  const gearEditorRef = useRef<HTMLDivElement>(null);
  const { data: members = [] } = useMembers();

  // ── State ──
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [searchCatalog, setSearchCatalog] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category: "", rarity: "legendary", description: "" });
  const [editingGear, setEditingGear] = useState<Record<string, Record<string, { itemId: string; enh: number }>>>({});
  const [savingGear, setSavingGear] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [openSlotPicker, setOpenSlotPicker] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const guildFilterKey = `gear-guild-filter-${serverId ?? "global"}`;
  const [guildFilter, setGuildFilter] = useState<string>(() => {
    try { return localStorage.getItem(guildFilterKey) || "all"; } catch { return "all"; }
  });
  const [guildFilterOpen, setGuildFilterOpen] = useState(false);
  const [classIcons, setClassIcons] = useState<Record<string, string>>({});
  const [classColors, setClassColors] = useState<Record<string, string>>({});
  const gearSortKey = `gear-sort-${serverId}`;
  const [sortCol, setSortCol] = useState<string | null>(() => {
    if (!serverId) return null;
    try { const s = JSON.parse(localStorage.getItem(gearSortKey) || "null"); return s?.col || null; } catch { return null; }
  });
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => {
    if (!serverId) return "asc";
    try { const s = JSON.parse(localStorage.getItem(gearSortKey) || "null"); return s?.dir || "asc"; } catch { return "asc"; }
  });

  const toggleSort = (col: string) => {
    const newDir = sortCol === col ? (sortDir === "asc" ? "desc" : "asc") : "asc";
    setSortCol(col);
    setSortDir(newDir);
    try { localStorage.setItem(gearSortKey, JSON.stringify({ col, dir: newDir })); } catch {}
  };

  // Sort members by current column
  const sortMembers = (membersArr: Member[]): Member[] => {
    if (!sortCol) return membersArr;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...membersArr].sort((a, b) => {
      if (sortCol === "name") {
        return dir * a.name.localeCompare(b.name);
      }
      if (sortCol === "cp") {
        const acp = a.combat_power ?? 0;
        const bcp = b.combat_power ?? 0;
        return dir * (acp - bcp);
      }
      // Gear slot sort: filled first, then by rarity (Legendary > Epic > Rare > Uncommon > Common)
      const ga = gearForMember(a.id)[sortCol];
      const gb = gearForMember(b.id)[sortCol];
      const ia = ga?.catalog_item_id ? 1 : 0;
      const ib = gb?.catalog_item_id ? 1 : 0;
      if (ia !== ib) return dir * (ib - ia); // filled first
      if (!ia && !ib) return 0;
      const resolveRarity = (g: any) => {
        const item = g?.catalog_item || itemCatalogItems.find((c: any) => c.id === g?.catalog_item_id) || catalog.find(c => c.id === g?.catalog_item_id);
        return (item?.rarity || "common").toLowerCase();
      };
      const scoreA = RARITY_SCORE[resolveRarity(ga)] || 0;
      const scoreB = RARITY_SCORE[resolveRarity(gb)] || 0;
      if (scoreA !== scoreB) return dir * (scoreB - scoreA);
      // Tiebreaker: higher CP first
      const cpA = a.combat_power ?? 0;
      const cpB = b.combat_power ?? 0;
      return dir * (cpB - cpA);
    });
  };

  // Fetch class data for icons & colors
  useEffect(() => {
    if (!serverId) return;
    supabase.from("server_classes")
      .select("name, icon, color")
      .eq("server_id", serverId)
      .then(({ data }) => {
        if (data) {
          const icons: Record<string, string> = {};
          const colors: Record<string, string> = {};
          data.forEach((r: any) => { icons[r.name] = r.icon; colors[r.name] = r.color; });
          setClassIcons(icons);
          setClassColors(colors);
        }
      });
  }, [serverId]);

  // ── Queries ──
  const { data: guilds = [] } = useQuery<Guild[]>({
    queryKey: ["guilds", serverId],
    queryFn: () => fetchGuilds(serverId),
    enabled: !!serverId && configured,
  });

  // ── Guild order (persisted in localStorage) ──
  const guildOrderKey = `gear-guild-order-${serverId ?? "global"}`;
  const [guildOrder, setGuildOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(guildOrderKey) || "[]"); } catch { return []; }
  });

  const orderedGuilds = useMemo(() => {
    const guildIds = new Set(guilds.map(g => g.id));
    const ordered = guildOrder.filter(id => guildIds.has(id));
    guilds.forEach(g => { if (!ordered.includes(g.id)) ordered.push(g.id); });
    return ordered.map(id => guilds.find(g => g.id === id)!).filter(Boolean);
  }, [guilds, guildOrder]);

  // Default guild filter to first guild on first visit
  useEffect(() => {
    if (guildFilter === "all" && orderedGuilds.length > 0 && !localStorage.getItem(guildFilterKey)) {
      setGuildFilter(orderedGuilds[0].id);
    }
  }, [orderedGuilds, guildFilter, guildFilterKey]);

  const handleGuildFilterChange = (value: string) => {
    setGuildFilter(value);
    setGuildFilterOpen(false);
    try { localStorage.setItem(guildFilterKey, value); } catch {}
  };

  const moveGuild = (guildId: string, dir: -1 | 1) => {
    setGuildOrder(prev => {
      let current = prev.length > 0 ? [...prev] : guilds.map(g => g.id);
      const idx = current.indexOf(guildId);
      if (idx === -1) {
        current.push(guildId);
        localStorage.setItem(guildOrderKey, JSON.stringify(current));
        return current;
      }
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= current.length) return current;
      [current[idx], current[newIdx]] = [current[newIdx], current[idx]];
      localStorage.setItem(guildOrderKey, JSON.stringify(current));
      return current;
    });
  };

  const { data: template } = useQuery<{ slots: GearSlot[] } | null>({
    queryKey: ["gearTemplate", serverId],
    queryFn: async () => {
      // Get server's game slug
      const { data: server } = await supabase.from("servers").select("game, game_id").eq("id", serverId).single();
      const gameSlug = server?.game;

      if (gameSlug) {
        // Fetch game-level gear slots from admin config
        const { data: gearSlots } = await supabase
          .from("gear_slots")
          .select("*")
          .eq("game", gameSlug)
          .order("sort_order");

        if (gearSlots && gearSlots.length > 0) {
          // Convert flat slots to categorized GearSlot[] format
          return {
            slots: [{ category: "Equipment", slots: gearSlots.map((s: any) => s.name) }],
          };
        }
      }

      // Fallback: default T&L template
      return { slots: DEFAULT_TL_TEMPLATE };
    },
    enabled: !!serverId && configured,
  });

  const slots: GearSlot[] = template?.slots ?? [];
  const allSlotIds = useMemo(() => slots.flatMap(c => c.slots), [slots]);

  const { data: catalog = [] } = useQuery<CatalogItem[]>({
    queryKey: ["gearCatalog", serverId],
    queryFn: async () => {
      const { data } = await supabase.from("gear_catalog").select("*").eq("server_id", serverId).order("category").order("name");
      return (data || []) as CatalogItem[];
    },
    enabled: !!serverId && configured,
  });

  const { data: memberGear = [] } = useQuery<MemberGear[]>({
    queryKey: ["memberGear", serverId],
    queryFn: async () => {
      const { data } = await supabase.from("member_gear").select("*, catalog_item:catalog_item_id(*)").in("member_id", members.map(m => m.id));
      return (data || []) as MemberGear[];
    },
    enabled: members.length > 0 && !!serverId && configured,
  });

  const { data: gearSummaries = {} } = useQuery<Record<string, GearSummary>>({
    queryKey: ["gearSummary", serverId],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_gear_summary", { p_server_id: serverId });
      const map: Record<string, GearSummary> = {};
      (data || []).forEach((r: GearSummary) => { map[r.member_id] = r; });
      return map;
    },
    enabled: !!serverId && configured,
  });

  // ── Helpers ──
  const gearForMember = (memberId: string) => {
    const map: Record<string, MemberGear> = {};
    memberGear.filter(g => g.member_id === memberId).forEach(g => { map[g.slot_id] = g; });
    return map;
  };

  const catalogByCategory = useMemo(() => {
    const map: Record<string, CatalogItem[]> = {};
    catalog.forEach(item => {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    });
    return map;
  }, [catalog]);

  // ── Item Catalog items for gear slots (game-level) ──
  const { data: itemCatalogItems = [] } = useQuery<any[]>({
    queryKey: ["itemCatalogForGear", serverId],
    queryFn: async () => {
      const { data: server } = await supabase.from("servers").select("game, game_id").eq("id", serverId).single();
      const gameSlug = server?.game;
      if (!gameSlug) return [];
      const { data } = await supabase.from("items").select("*").eq("game", gameSlug).order("name");
      return data || [];
    },
    enabled: !!serverId && configured,
  });

  const { data: slotCategoryMap = {} } = useQuery<Record<string, string[]>>({
    queryKey: ["gearSlotCategories", serverId],
    queryFn: async () => {
      const { data: server } = await supabase.from("servers").select("game, game_id").eq("id", serverId).single();
      const gameSlug = server?.game;
      if (!gameSlug) return {};
      // Get all gear slots for this game
      const { data: slots } = await supabase.from("gear_slots").select("id, name").eq("game", gameSlug);
      if (!slots?.length) return {};
      // Get all category assignments
      const { data: assignments } = await supabase
        .from("gear_slot_categories")
        .select("slot_id, category_id")
        .in("slot_id", slots.map((s: any) => s.id));
      // Build map: slot_name → category_id[]
      const map: Record<string, string[]> = {};
      const slotNameById: Record<string, string> = {};
      slots.forEach((s: any) => { slotNameById[s.id] = s.name; });
      (assignments || []).forEach((a: any) => {
        const name = slotNameById[a.slot_id];
        if (name) {
          if (!map[name]) map[name] = [];
          map[name].push(a.category_id);
        }
      });
      return map;
    },
    enabled: !!serverId && configured,
  });

  // Items available per slot based on assigned categories
  const itemsBySlot = useMemo(() => {
    const map: Record<string, any[]> = {};
    allSlotIds.forEach(slotName => {
      const catIds = slotCategoryMap[slotName];
      if (catIds?.length) {
        map[slotName] = itemCatalogItems.filter((item: any) => catIds.includes(item.category_id));
      } else {
        map[slotName] = [];
      }
    });
    return map;
  }, [allSlotIds, slotCategoryMap, itemCatalogItems]);

  const filteredCatalog = useMemo(() => {
    if (!searchCatalog.trim()) return catalog;
    const q = searchCatalog.toLowerCase();
    return catalog.filter(i => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
  }, [catalog, searchCatalog]);

  // ── Actions ──
  const addCatalogItem = async () => {
    if (!newItem.name.trim() || !newItem.category.trim()) return;
    const guildId = guilds[0]?.id;
    if (!guildId) return;
    const { error } = await supabase.from("gear_catalog").insert({
      guild_id: guildId,
      server_id: serverId,
      name: newItem.name.trim(),
      category: newItem.category.trim(),
      rarity: newItem.rarity,
      description: newItem.description.trim() || null,
    });
    if (error) { setToast({ type: "error", message: error.message }); return; }
    writeAuditEntry({ action: AuditAction.ITEM_CREATE, server_id: serverId!, details: { item_name: newItem.name.trim(), category: newItem.category.trim(), type: "gear_catalog" } });
    setNewItem({ name: "", category: "", rarity: "legendary", description: "" });
    setShowAddItem(false);
    queryClient.invalidateQueries({ queryKey: ["gearCatalog", serverId] });
  };

  const deleteCatalogItem = async (id: string) => {
    await supabase.from("gear_catalog").delete().eq("id", id);
    writeAuditEntry({ action: AuditAction.ITEM_DELETE, server_id: serverId!, target_id: id, details: { type: "gear_catalog" } });
    queryClient.invalidateQueries({ queryKey: ["gearCatalog", serverId] });
    queryClient.invalidateQueries({ queryKey: ["memberGear", serverId] });
  };

  const saveMemberGear = async (memberId: string) => {
    setSavingGear(true);
    try {
      const changes = editingGear[memberId];
      if (!changes) return;
      const current = gearForMember(memberId);
      for (const [slotId, { itemId, enh }] of Object.entries(changes)) {
        const existing = current[slotId];
        const body: any = {
          member_id: memberId,
          slot_id: slotId,
          catalog_item_id: itemId || null,
          enhancement_level: enh || 0,
          updated_at: new Date().toISOString(),
        };
        if (existing) {
          // Track history
          if (existing.catalog_item_id !== itemId || existing.enhancement_level !== enh) {
            await supabase.from("gear_upgrade_history").insert({
              member_id: memberId,
              slot_id: slotId,
              old_item_id: existing.catalog_item_id,
              new_item_id: itemId || null,
              old_enhancement: existing.enhancement_level,
              new_enhancement: enh || 0,
            });
          }
          await supabase.from("member_gear").update(body).eq("id", existing.id);
          const itemName = itemId ? catalog.find(c => c.id === itemId)?.name : undefined;
          const memberName2 = members.find(m => m.id === memberId)?.name;
          writeAuditEntry({ action: itemId ? AuditAction.GEAR_EQUIP : AuditAction.GEAR_UNEQUIP, server_id: serverId!, target_id: memberId, details: { member_name: memberName2 || memberId, item_name: itemName || itemId || "—", enhancement: enh } });
        } else {
          await supabase.from("member_gear").insert(body);
          if (itemId) {
            const itemName = catalog.find(c => c.id === itemId)?.name;
            const memberName3 = members.find(m => m.id === memberId)?.name;
            writeAuditEntry({ action: AuditAction.GEAR_EQUIP, server_id: serverId!, target_id: memberId, details: { member_name: memberName3 || memberId, item_name: itemName || itemId, enhancement: enh } });
          }
        }
      }
      setEditingGear(prev => { const next = { ...prev }; delete next[memberId]; return next; });
      queryClient.invalidateQueries({ queryKey: ["memberGear", serverId] });
      queryClient.invalidateQueries({ queryKey: ["gearSummary", serverId] });
      setToast({ type: "success", message: "Gear saved!" });
    } catch (e: any) {
      setToast({ type: "error", message: e.message });
    }
    setSavingGear(false);
  };

  // ── Guild grouping ──
  const guildMembers = useMemo(() => {
    const map = new Map<string | null, Member[]>();
    map.set(null, []); // no-guild members
    guilds.forEach(g => map.set(g.id, []));
    members.forEach(m => {
      const key = m.guild_id || null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return map;
  }, [members, guilds]);

  const guildById = useMemo(() => {
    const map = new Map<string, Guild>();
    guilds.forEach(g => map.set(g.id, g));
    return map;
  }, [guilds]);

  const renderGearRow = (m: Member, idx?: number) => {
    const gear = gearForMember(m.id);
    const summary = gearSummaries[m.id];
    return (
      <tr key={m.id} className="group border-b border-[#27272a]/30 hover:bg-[#09090b]/30 transition">
        <td className="py-2 px-3 sticky left-0 bg-[#18181b] group-hover:bg-[#131316] z-10 transition-colors">
          <div className="flex items-center gap-1.5">
            {idx != null && <span className="text-[10px] text-[#52525b] font-mono w-4 shrink-0 text-right">{idx + 1}</span>}
            {m.class && classIcons[m.class] ? (() => {
              const CIcon = getClassIcon(classIcons[m.class]);
              const cc = classColors[m.class] || "#a1a1aa";
              return <CIcon className="w-3.5 h-3.5 shrink-0" style={{ color: cc }} />;
            })() : null}
            <span className="font-medium text-[#fafafa]">{m.name}</span>
          </div>
          {m.class && (
            <span className="block text-[10px] ml-[22px] -mt-0.5" style={{ color: classColors[m.class] || "#71717a" }}>{m.class}</span>
          )}
        </td>
        <td className="py-1.5 px-2 text-center text-xs text-[#a1a1aa] font-mono tabular-nums">
          {m.combat_power ? m.combat_power.toLocaleString() : <span className="text-[#3f3f46]">—</span>}
        </td>
        {allSlotIds.map(slotId => {
          const g = gear[slotId];
          // Prefer FK-embedded catalog_item, fallback to itemCatalogItems lookup
          let item = g?.catalog_item;
          if (!item && g?.catalog_item_id) {
            item = itemCatalogItems.find((c: any) => c.id === g.catalog_item_id) || catalog.find(c => c.id === g.catalog_item_id);
          }
          const rarityColor = item ? RARITY_COLORS[item.rarity?.toLowerCase()] || "#a1a1aa" : undefined;
          const enh = g?.enhancement_level ?? 0;

          const handleSlotClick = () => {
            if (!canManage) return;
            setSelectedMember(m.id);
            // Initialize edit state from existing gear
            if (g?.catalog_item_id) {
              setEditingGear(prev => ({
                ...prev,
                [m.id]: { ...(prev[m.id] || {}), [slotId]: { itemId: g.catalog_item_id!, enh: g.enhancement_level || 0 } },
              }));
            }
            setOpenSlotPicker(slotId);
            setPickerSearch("");
            // Scroll to editor after a short delay to let the UI update
            setTimeout(() => {
              gearEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
          };

          return (
            <td key={slotId} className={`py-1.5 px-2 text-center ${canManage ? "cursor-pointer hover:bg-[#09090b]/50 transition" : ""}`} onClick={handleSlotClick} title={canManage ? "Click to change item" : undefined}>
              {item ? (
                <div className="flex items-center justify-center">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 relative" style={{ backgroundColor: `${rarityColor}18` }}>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <Star className="w-5 h-5" style={{ color: rarityColor }} />
                    )}
                    {enh > 0 && (
                      <span className="absolute right-0 bottom-1.5 text-[9px] font-black text-amber-400 bg-gradient-to-t from-black/20 to-transparent rounded-bl-lg rounded-tr-lg pl-1.5 pr-1 pt-1 pb-0.5 leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">+{enh}</span>
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-[10px] text-[#3f3f46]">—</span>
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  // ── Render ──
  if (!slots.length) {
    return (
      <div className="text-center py-12">
        <Package className="w-10 h-10 text-[#3f3f46] mx-auto mb-2" />
        <p className="text-[#71717a] text-sm">No gear template configured for this server.</p>
        {canManage && (
          <p className="text-[#52525b] text-xs mt-1">A default Throne &amp; Liberty template will be created automatically.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`px-3 py-2 rounded-lg text-xs ${toast.type === "success" ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 hover:text-[#fafafa]"><X className="w-3 h-3 inline" /></button>
        </div>
      )}

      {/* ── Member Gear Editor ── */}
      {canManage && (
        <div ref={gearEditorRef} className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-[#a1a1aa]" />
            Edit Member Gear
          </h3>
          <div className="mb-4">
            {/* Selected member pill or search input */}
            {selectedMember ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2">
                  {(() => {
                    const m = members.find(x => x.id === selectedMember);
                    if (!m) return null;
                    const iconName = m.class && classIcons[m.class] ? classIcons[m.class] : null;
                    const CIcon = iconName ? getClassIcon(iconName) : null;
                    const cc = (m.class && classColors[m.class]) || "#a1a1aa";
                    return (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {CIcon && <CIcon className="w-4 h-4 shrink-0" style={{ color: cc }} />}
                        <span className="text-sm font-semibold text-[#fafafa] truncate">{m.name}</span>
                        {m.class && <span className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ color: cc, backgroundColor: `${cc}18` }}>{m.class}</span>}
                        {m.combat_power ? <span className="text-[11px] text-[#71717a] font-mono tabular-nums ml-auto">{m.combat_power.toLocaleString()} CP</span> : null}
                      </div>
                    );
                  })()}
                  <button onClick={() => { setSelectedMember(null); setEditingGear(prev => { const next = { ...prev }; delete next[selectedMember]; return next; }); }} className="text-[#52525b] hover:text-[#fafafa] transition shrink-0"><X className="w-4 h-4" /></button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
                <input
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Search for a member to edit their gear..."
                  className="w-full pl-9 pr-4 py-2.5 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#3f3f46] transition"
                  autoFocus
                />
                {memberSearch.trim() && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#18181b] border border-[#27272a] rounded-lg max-h-64 overflow-y-auto z-10 shadow-xl">
                    {members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase())).slice(0, 15).map(m => {
                      const iconName = m.class && classIcons[m.class] ? classIcons[m.class] : null;
                      const CIcon = iconName ? getClassIcon(iconName) : null;
                      const cc = (m.class && classColors[m.class]) || "#a1a1aa";
                      return (
                        <button
                          key={m.id}
                          onClick={() => { setSelectedMember(m.id); setMemberSearch(""); }}
                          className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition ${selectedMember === m.id ? "bg-[#fafafa] text-[#09090b]" : "text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa]"}`}
                        >
                          {CIcon && <CIcon className="w-3.5 h-3.5 shrink-0" style={{ color: cc }} />}
                          <span className="font-medium flex-1">{m.name}</span>
                          {m.class && <span className="text-[10px] opacity-60">{m.class}</span>}
                          {m.combat_power ? <span className="text-[10px] font-mono tabular-nums opacity-60">{m.combat_power.toLocaleString()}</span> : null}
                        </button>
                      );
                    })}
                    {members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 && (
                      <p className="px-3 py-2 text-xs text-[#52525b]">No members found</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedMember && (() => {
            const member = members.find(m => m.id === selectedMember)!;
            const gear = gearForMember(selectedMember);
            const edits = editingGear[selectedMember] || {};
            const summary = gearSummaries[selectedMember];

            const setSlotEdit = (slotId: string, itemId: string, enh: number) => {
              setEditingGear(prev => ({
                ...prev,
                [selectedMember]: { ...(prev[selectedMember] || {}), [slotId]: { itemId, enh } },
              }));
            };

            const initEditFromExisting = (slotId: string) => {
              const existing = gear[slotId];
              if (existing && !edits[slotId]) {
                setSlotEdit(slotId, existing.catalog_item_id || "", existing.enhancement_level || 0);
              }
            };

            const flatSlots = allSlotIds;

            return (
              <div className="flex gap-4">
                {/* Left: Equipment slots */}
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {flatSlots.map(slotId => {
                    const existing = gear[slotId];
                    const edit = edits[slotId];
                    const currentItemId = edit?.itemId ?? existing?.catalog_item_id ?? "";
                    const currentEnh = edit?.enh ?? existing?.enhancement_level ?? 0;
                    const currentItem = itemCatalogItems.find((c: any) => c.id === currentItemId) || catalog.find(c => c.id === currentItemId);
                    const rc = currentItem ? (RARITY_COLORS[currentItem.rarity?.toLowerCase()] || "#a1a1aa") : undefined;
                    const isActive = openSlotPicker === slotId;

                    return (
                      <button
                        key={slotId}
                        onClick={() => { initEditFromExisting(slotId); setOpenSlotPicker(isActive ? null : slotId); setPickerSearch(""); }}
                        className={`text-left rounded-xl p-3 border transition-all duration-200 ${
                          currentItem
                            ? 'bg-[#18181b] border-[#27272a] hover:border-[#3f3f46]'
                            : 'bg-[#18181b]/40 border-dashed border-[#27272a] hover:border-[#3f3f46] hover:bg-[#18181b]/60'
                        } ${isActive ? 'ring-1 ring-[#fafafa]/30 border-[#52525b]' : ''}`}
                      >
                        <p className="text-[10px] text-[#71717a] uppercase tracking-wider mb-2">{slotId}</p>
                        {currentItem ? (
                          <div className="flex items-center gap-2.5">
                            <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 relative" style={{ backgroundColor: `${rc}18` }}>
                              {currentItem.image_url ? (
                                <img src={currentItem.image_url} alt="" className="w-9 h-9 rounded object-cover" />
                              ) : (
                                <Star className="w-6 h-6" style={{ color: rc }} />
                              )}
                              <span className="absolute right-0 bottom-2 text-[10px] font-black text-amber-400 bg-gradient-to-t from-black/20 to-transparent rounded-bl-lg rounded-tr-lg pl-1.5 pr-1 pt-1 pb-0.5 leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">+{currentEnh}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate" style={{ color: rc }}>{currentItem.name}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-14 text-[#3f3f46] text-[10px]">
                            Empty
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Right: Item picker panel */}
                {openSlotPicker && (() => {
                  const slotId = openSlotPicker;
                  const existing = gear[slotId];
                  const edit = edits[slotId];
                  const currentItemId = edit?.itemId ?? existing?.catalog_item_id ?? "";
                  const currentEnh = edit?.enh ?? existing?.enhancement_level ?? 0;
                  const currentItem = itemCatalogItems.find((c: any) => c.id === currentItemId) || catalog.find(c => c.id === currentItemId);
                  const categoryItems = itemsBySlot[slotId] || [];
                  const filtered = categoryItems.filter((item: any) => !pickerSearch || item.name.toLowerCase().includes(pickerSearch.toLowerCase()));

                  return (
                    <div className="w-64 shrink-0 bg-[#18181b] border border-[#27272a] rounded-xl p-3 flex flex-col max-h-[400px]">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-[#fafafa]">{slotId}</h4>
                        <button onClick={() => { setOpenSlotPicker(null); setPickerSearch(""); }} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-3.5 h-3.5" /></button>
                      </div>
                      <input
                        value={pickerSearch}
                        onChange={e => setPickerSearch(e.target.value)}
                        placeholder="Search items..."
                        className="w-full px-2 py-1.5 bg-[#09090b] border border-[#27272a] rounded text-[10px] text-[#fafafa] placeholder-[#52525b] focus:outline-none mb-2 shrink-0"
                        autoFocus
                      />
                      <div className="overflow-y-auto flex-1 space-y-0.5">
                        <button
                          onClick={() => { setSlotEdit(slotId, "", currentEnh); }}
                          className={`w-full px-2 py-1.5 rounded text-left text-xs transition ${!currentItemId ? 'bg-[#27272a] text-[#fafafa]' : 'text-[#52525b] hover:bg-[#27272a]'}`}
                        >
                          — Empty —
                        </button>
                        {filtered.map((item: any) => {
                          const rc = RARITY_COLORS[item.rarity?.toLowerCase()] || "#a1a1aa";
                          const isSelected = item.id === currentItemId;
                          return (
                            <button
                              key={item.id}
                              onClick={() => { setSlotEdit(slotId, item.id, currentEnh); }}
                              className={`w-full px-2 py-1.5 rounded text-left text-xs flex items-center gap-2 transition ${isSelected ? 'bg-[#27272a]' : 'hover:bg-[#27272a]'}`}
                            >
                              <div className="w-7 h-7 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${rc}18` }}>
                                {item.image_url ? (
                                  <img src={item.image_url} alt="" className="w-5 h-5 rounded object-cover" />
                                ) : (
                                  <Star className="w-4 h-4" style={{ color: rc }} />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate" style={{ color: rc }}>{item.name}</p>
                                <p className="text-[9px] text-[#52525b] capitalize">{item.rarity}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {currentItemId && (
                        <div className="mt-2 pt-2 border-t border-[#27272a] flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-[#71717a]">Enhance:</span>
                          <input
                            type="text" inputMode="numeric" value={currentEnh || ""}
                            onChange={e => {
                              const raw = e.target.value.replace(/\D/g, "");
                              setSlotEdit(slotId, currentItemId, raw === "" ? 0 : parseInt(raw));
                            }}
                            className="w-16 px-2 py-1 bg-[#09090b] border border-[#27272a] rounded text-xs text-[#fafafa] text-center"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}
          {selectedMember && (
            <div className="flex items-center justify-between pt-3 border-t border-[#27272a]">
              <div className="text-xs text-[#a1a1aa]">
                {gearSummaries[selectedMember] && <>{gearSummaries[selectedMember].slots_filled}/{gearSummaries[selectedMember].total_slots} slots</>}
              </div>
              <button
                onClick={() => saveMemberGear(selectedMember)}
                disabled={savingGear || !editingGear[selectedMember]}
                className="px-4 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-500 disabled:opacity-40 transition flex items-center gap-1"
              >
                {savingGear ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save Gear
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Gear Matrix — per-guild tables ── */}
      {/* Guild filter */}
      {orderedGuilds.length > 1 && (
        <div className="flex items-center gap-2 justify-end">
          <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Filter by Guild:</label>
          <div className="relative">
            <button
              onClick={() => setGuildFilterOpen(!guildFilterOpen)}
              className="flex items-center gap-1.5 bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-xs text-[#a1a1aa] hover:border-[#52525b] transition min-w-[110px]"
            >
              {guildFilter === "all" ? (
                <span>All Guilds</span>
              ) : guildFilter === "__noguild__" ? (
                <span>No Guild</span>
              ) : (() => {
                const g = guilds.find(x => x.id === guildFilter);
                if (!g) return <span>All Guilds</span>;
                const c = guildColor(g.name);
                return (
                  <span className="flex items-center gap-1.5">
                    <Shield className={`w-3 h-3 ${c.text}`} />
                    <span className={c.text}>{g.name}</span>
                  </span>
                );
              })()}
              <ChevronDown className="w-3 h-3 ml-auto" />
            </button>
            {guildFilterOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setGuildFilterOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl py-1 min-w-[140px]">
                  <button
                    onClick={() => handleGuildFilterChange("all")}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition ${guildFilter === "all" ? "bg-[#09090b] text-[#fafafa]" : "text-[#a1a1aa] hover:bg-[#09090b]"}`}
                  >
                    <span className="w-3 h-3 rounded-full border border-[#3f3f46]" />
                    All Guilds
                  </button>
                  {orderedGuilds.map(g => {
                    const c = guildColor(g.name);
                    return (
                      <button
                        key={g.id}
                        onClick={() => handleGuildFilterChange(g.id)}
                        className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition ${guildFilter === g.id ? "bg-[#09090b] text-[#fafafa]" : "text-[#a1a1aa] hover:bg-[#09090b]"}`}
                      >
                        <Shield className={`w-3 h-3 ${c.text}`} />
                        {g.name}
                      </button>
                    );
                  })}
                  {(guildMembers.get(null) || []).length > 0 && (
                    <button
                      onClick={() => handleGuildFilterChange("__noguild__")}
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition ${guildFilter === "__noguild__" ? "bg-[#09090b] text-[#fafafa]" : "text-[#a1a1aa] hover:bg-[#09090b]"}`}
                    >
                      <div className="w-3 h-3 rounded-full bg-[#3f3f46]" />
                      No Guild
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {orderedGuilds.map((g, gi) => {
        if (guildFilter !== "all" && guildFilter !== g.id) return null;
        const gMembers = guildMembers.get(g.id) || [];
        if (!gMembers.length) return null;
        const color = guildColor(g.name);
        return (
          <div key={g.id} className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-[#27272a] flex items-center gap-2">
              <Shield className={`w-3.5 h-3.5 shrink-0 ${color.text}`} />
              <span className={`text-xs font-semibold ${color.text}`}>{g.name}</span>
              <span className="text-[10px] text-[#52525b]">{gMembers.length} member{gMembers.length !== 1 ? "s" : ""}</span>
              <div className="flex items-center gap-0.5 ml-auto">
                <button onClick={() => moveGuild(g.id, -1)} disabled={gi === 0} className="p-0.5 text-[#52525b] hover:text-[#fafafa] disabled:opacity-30 transition">
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button onClick={() => moveGuild(g.id, 1)} disabled={gi === orderedGuilds.length - 1} className="p-0.5 text-[#52525b] hover:text-[#fafafa] disabled:opacity-30 transition">
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-[#71717a] uppercase tracking-wider border-b border-[#27272a]">
                    <th onClick={() => toggleSort("name")} className="text-left py-2 px-3 sticky left-0 bg-[#18181b] z-10 cursor-pointer hover:bg-[#27272a]/30 transition select-none group">
                      <span className={sortCol === "name" ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>Player</span>
                      <span className="ml-1 inline-block w-3 text-center">{sortCol === "name" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                    </th>
                    <th onClick={() => toggleSort("cp")} className="text-center py-2 px-2 min-w-[60px] cursor-pointer hover:bg-[#27272a]/30 transition select-none group">
                      <span className={sortCol === "cp" ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>CP</span>
                      <span className="ml-1 inline-block w-3 text-center">{sortCol === "cp" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                    </th>
                    {allSlotIds.map(slot => (
                      <th key={slot} onClick={() => toggleSort(slot)} className="text-center py-2 px-2 min-w-[80px] cursor-pointer hover:bg-[#27272a]/30 transition select-none group">
                        <span className={sortCol === slot ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>{slot}</span>
                        <span className="ml-1 inline-block w-3 text-center">{sortCol === slot ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                      </th>
                    ))}
                  </tr>
                </thead>

              <tbody>
                  {sortMembers(gMembers).map((m, i) => renderGearRow(m, i))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {/* No-guild members */}
      {(guildFilter === "all" || guildFilter === "__noguild__") && (guildMembers.get(null) || []).length > 0 && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-[#27272a] flex items-center gap-2">
            <div className="w-2 h-2 rounded-full shrink-0 bg-[#3f3f46]" />
            <span className="text-xs font-semibold text-[#a1a1aa]">No Guild</span>
            <span className="text-[10px] text-[#52525b]">{guildMembers.get(null)!.length} member{guildMembers.get(null)!.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-[#71717a] uppercase tracking-wider border-b border-[#27272a]">
                  <th onClick={() => toggleSort("name")} className="text-left py-2 px-3 sticky left-0 bg-[#18181b] z-10 cursor-pointer hover:bg-[#27272a]/30 transition select-none group">
                    <span className={sortCol === "name" ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>Player</span>
                    <span className="ml-1 inline-block w-3 text-center">{sortCol === "name" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                  </th>
                  <th onClick={() => toggleSort("cp")} className="text-center py-2 px-2 min-w-[60px] cursor-pointer hover:bg-[#27272a]/30 transition select-none group">
                    <span className={sortCol === "cp" ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>CP</span>
                    <span className="ml-1 inline-block w-3 text-center">{sortCol === "cp" ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                  </th>
                  {allSlotIds.map(slot => (
                    <th key={slot} onClick={() => toggleSort(slot)} className="text-center py-2 px-2 min-w-[80px] cursor-pointer hover:bg-[#27272a]/30 transition select-none group">
                      <span className={sortCol === slot ? "text-[#fafafa]" : "group-hover:text-[#a1a1aa]"}>{slot}</span>
                      <span className="ml-1 inline-block w-3 text-center">{sortCol === slot ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortMembers(guildMembers.get(null)!).map((m, i) => renderGearRow(m, i))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
