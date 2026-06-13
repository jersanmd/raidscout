import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useServerId, useHasPermission } from "@/contexts/ServerContext";
import { useMembers } from "@/hooks/useMembers";
import { fetchGuilds } from "@/lib/supabase";
import type { Member, Guild } from "@/types";
import {
  Package, Plus, Pencil, Trash2, X, Check, Loader2, Search,
  ChevronDown, Shield, Tag, Star, TrendingUp, ChevronUp,
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

type GearSlot = { category: string; slots: string[] };
type CatalogItem = { id: string; guild_id: string; name: string; category: string; rarity: string; image_url?: string; description?: string };
type MemberGear = { id: string; member_id: string; slot_id: string; catalog_item_id: string | null; enhancement_level: number; catalog_item?: CatalogItem };
type GearSummary = { member_id: string; gear_score: number; slots_filled: number; total_slots: number; completion_pct: number };

export function GearTrackingTab() {
  const serverId = useServerId();
  const configured = isSupabaseConfigured();
  const canManage = useHasPermission("can_manage_members");
  const queryClient = useQueryClient();
  const { data: members = [] } = useMembers();

  // ── State ──
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [searchCatalog, setSearchCatalog] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category: "", rarity: "legendary", description: "" });
  const [editingGear, setEditingGear] = useState<Record<string, { itemId: string; enh: number }>>({});
  const [savingGear, setSavingGear] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

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
      const { data } = await supabase.from("gear_templates").select("slots").eq("server_id", serverId).order("created_at").limit(1).single();
      if (!data) {
        // Auto-create default T&L template
        if (canManage) {
          await supabase.from("gear_templates").insert({ server_id: serverId, name: "Throne & Liberty", slots: DEFAULT_TL_TEMPLATE });
          return { slots: DEFAULT_TL_TEMPLATE };
        }
        return null;
      }
      return data;
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
    setNewItem({ name: "", category: "", rarity: "legendary", description: "" });
    setShowAddItem(false);
    queryClient.invalidateQueries({ queryKey: ["gearCatalog", serverId] });
  };

  const deleteCatalogItem = async (id: string) => {
    await supabase.from("gear_catalog").delete().eq("id", id);
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
        } else {
          await supabase.from("member_gear").insert(body);
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

  const renderGearRow = (m: Member) => {
    const gear = gearForMember(m.id);
    const summary = gearSummaries[m.id];
    return (
      <tr key={m.id} className="border-b border-[#27272a]/30 hover:bg-[#09090b]/30 transition">
        <td className="py-2 px-3 sticky left-0 bg-[#18181b] z-10 font-medium text-[#fafafa]">{m.name}</td>
        {allSlotIds.map(slotId => {
          const g = gear[slotId];
          const item = g?.catalog_item;
          const rarityColor = item ? RARITY_COLORS[item.rarity] || "#a1a1aa" : undefined;
          return (
            <td key={slotId} className="py-1.5 px-2 text-center">
              {item ? (
                <div className="flex flex-col items-center">
                  <span className="text-[11px] font-medium" style={{ color: rarityColor }}>{item.name}</span>
                  {(g?.enhancement_level ?? 0) > 0 && (
                    <span className="text-[10px] text-[#a1a1aa]">+{g.enhancement_level}</span>
                  )}
                </div>
              ) : (
                <span className="text-[10px] text-[#3f3f46]">—</span>
              )}
            </td>
          );
        })}
        <td className="py-2 px-2 text-center font-mono text-xs">
          <span className={summary ? "text-[#a1a1aa]" : "text-[#3f3f46]"}>
            {summary?.gear_score ?? "—"}
          </span>
        </td>
        <td className="py-2 px-2 text-center">
          {summary ? (
            <div className="flex items-center gap-1 justify-center">
              <div className="w-12 h-1.5 bg-[#27272a] rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${summary.completion_pct}%` }} />
              </div>
              <span className="text-[10px] text-[#a1a1aa]">{summary.completion_pct}%</span>
            </div>
          ) : (
            <span className="text-[10px] text-[#3f3f46]">—</span>
          )}
        </td>
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

      {/* ── Gear Catalog Management ── */}
      {canManage && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
              <Package className="w-4 h-4 text-[#a1a1aa]" />
              Gear Catalog
            </h3>
            <button
              onClick={() => setShowAddItem(!showAddItem)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#27272a] text-[#a1a1aa] text-xs hover:bg-[#3f3f46] hover:text-[#fafafa] transition"
            >
              <Plus className="w-3 h-3" />
              Add Item
            </button>
          </div>

          {showAddItem && (
            <div className="flex flex-wrap gap-2 mb-3 p-3 bg-[#09090b] rounded-lg">
              <input value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} placeholder="Item name" className="flex-1 min-w-[140px] px-2 py-1.5 bg-[#18181b] border border-[#27272a] rounded text-xs text-[#fafafa] placeholder-[#52525b]" />
              <select value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))} className="px-2 py-1.5 bg-[#18181b] border border-[#27272a] rounded text-xs text-[#a1a1aa]">
                <option value="">Category</option>
                {allSlotIds.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={newItem.rarity} onChange={e => setNewItem(p => ({ ...p, rarity: e.target.value }))} className="px-2 py-1.5 bg-[#18181b] border border-[#27272a] rounded text-xs text-[#a1a1aa]">
                <option value="legendary">Legendary (10pts)</option>
                <option value="epic">Epic (5pts)</option>
                <option value="rare">Rare (3pts)</option>
                <option value="uncommon">Uncommon (2pts)</option>
                <option value="common">Common (1pt)</option>
              </select>
              <button onClick={addCatalogItem} disabled={!newItem.name.trim() || !newItem.category.trim()} className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-500 disabled:opacity-40 transition">Add</button>
            </div>
          )}

          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#71717a]" />
            <input value={searchCatalog} onChange={e => setSearchCatalog(e.target.value)} placeholder="Search catalog..." className="w-full pl-8 pr-3 py-1.5 bg-[#09090b] border border-[#27272a] rounded text-xs text-[#fafafa] placeholder-[#52525b]" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
            {filteredCatalog.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-[#09090b] rounded-lg px-2.5 py-1.5 group">
                <div className="min-w-0">
                  <span className="text-xs font-medium truncate block" style={{ color: RARITY_COLORS[item.rarity] || "#a1a1aa" }}>{item.name}</span>
                  <span className="text-[9px] text-[#52525b]">{item.category}</span>
                </div>
                <button onClick={() => deleteCatalogItem(item.id)} className="opacity-0 group-hover:opacity-100 text-[#52525b] hover:text-red-400 transition shrink-0 ml-1">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Member Gear Editor ── */}
      {canManage && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-[#a1a1aa]" />
            Edit Member Gear
          </h3>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#71717a]" />
            <input
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="Search member..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#09090b] border border-[#27272a] rounded text-xs text-[#fafafa] placeholder-[#52525b]"
            />
            {memberSearch.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#18181b] border border-[#27272a] rounded-lg max-h-48 overflow-y-auto z-10 shadow-xl">
                {members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase())).slice(0, 15).map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedMember(m.id); setMemberSearch(""); }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition ${selectedMember === m.id ? "bg-[#fafafa] text-[#09090b]" : "text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa]"}`}
                  >
                    {m.name}
                  </button>
                ))}
                {members.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase())).length === 0 && (
                  <p className="px-3 py-1.5 text-xs text-[#52525b]">No members found</p>
                )}
              </div>
            )}
            {!memberSearch.trim() && selectedMember && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-[#a1a1aa]">{members.find(m => m.id === selectedMember)?.name}</span>
                <button onClick={() => setSelectedMember(null)} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-3 h-3" /></button>
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

            return (
              <div className="space-y-3">
                {slots.map(cat => (
                  <div key={cat.category}>
                    <h4 className="text-[10px] text-[#71717a] uppercase tracking-wider mb-1.5">{cat.category}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                      {cat.slots.map(slotId => {
                        const existing = gear[slotId];
                        const edit = edits[slotId];
                        const currentItemId = edit?.itemId ?? existing?.catalog_item_id ?? "";
                        const currentEnh = edit?.enh ?? existing?.enhancement_level ?? 0;
                        const currentItem = catalog.find(c => c.id === currentItemId);
                        const categoryItems = catalogByCategory[slotId] || [];

                        return (
                          <div key={slotId} className="bg-[#09090b] rounded-lg p-2.5" onClick={() => initEditFromExisting(slotId)}>
                            <p className="text-[10px] text-[#71717a] mb-1">{slotId}</p>
                            <select
                              value={currentItemId}
                              onChange={e => setSlotEdit(slotId, e.target.value, currentEnh)}
                              className="w-full px-2 py-1 bg-[#18181b] border border-[#27272a] rounded text-xs text-[#fafafa] mb-1"
                            >
                              <option value="">— Empty —</option>
                              {categoryItems.map(item => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                              ))}
                            </select>
                            {currentItemId && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-[#52525b]">+</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={20}
                                  value={currentEnh}
                                  onChange={e => setSlotEdit(slotId, currentItemId, parseInt(e.target.value) || 0)}
                                  className="w-14 px-1.5 py-0.5 bg-[#18181b] border border-[#27272a] rounded text-xs text-[#fafafa] text-center"
                                />
                              </div>
                            )}
                            {currentItem && (
                              <span className="text-[9px] mt-1 block" style={{ color: RARITY_COLORS[currentItem.rarity] }}>
                                {currentItem.rarity} ({RARITY_SCORE[currentItem.rarity] + currentEnh}pts)
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-[#27272a]">
                  <div className="text-xs text-[#a1a1aa]">
                    {summary && <>Score: <span className="font-bold text-[#fafafa]">{summary.gear_score}</span> · {summary.slots_filled}/{summary.total_slots} slots · <span className="text-green-400">{summary.completion_pct}%</span></>}
                  </div>
                  <button
                    onClick={() => saveMemberGear(selectedMember)}
                    disabled={savingGear || !edits[selectedMember]}
                    className="px-4 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-500 disabled:opacity-40 transition flex items-center gap-1"
                  >
                    {savingGear ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Save Gear
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Gear Matrix — per-guild tables ── */}
      {orderedGuilds.map((g, gi) => {
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
                    <th className="text-left py-2 px-3 sticky left-0 bg-[#18181b] z-10">Player</th>
                    {allSlotIds.map(slot => (
                      <th key={slot} className="text-center py-2 px-2 min-w-[80px]">{slot}</th>
                    ))}
                    <th className="text-center py-2 px-2">Score</th>
                    <th className="text-center py-2 px-2">%</th>
                  </tr>
                </thead>
                <tbody>
                  {gMembers.map(m => renderGearRow(m))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {/* No-guild members */}
      {(guildMembers.get(null) || []).length > 0 && (
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
                  <th className="text-left py-2 px-3 sticky left-0 bg-[#18181b] z-10">Player</th>
                  {allSlotIds.map(slot => (
                    <th key={slot} className="text-center py-2 px-2 min-w-[80px]">{slot}</th>
                  ))}
                  <th className="text-center py-2 px-2">Score</th>
                  <th className="text-center py-2 px-2">%</th>
                </tr>
              </thead>
              <tbody>
                {guildMembers.get(null)!.map(m => renderGearRow(m))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
