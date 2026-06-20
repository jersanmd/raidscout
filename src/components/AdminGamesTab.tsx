import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchGames, createGame, updateGame, deleteGame,
  fetchBossTemplates, fetchActivityTemplates,
  deleteBossTemplate,
  deleteActivityTemplate,
  uploadGameIcon,
  fetchItemCatalog, fetchItemCatalogPaginated, fetchPendingItems, approveItem, rejectItem, createItemCatalogItem, deleteItemCatalogItem, updateItemCatalogItem, uploadItemCatalogImage,
  fetchItemCategories, createItemCategory, deleteItemCategory, updateItemCategory,
  fetchItemRarities, createItemRarity, deleteItemRarity, updateItemRarity,
  fetchGearSlots, createGearSlot, deleteGearSlot, updateGearSlot,
  fetchGearSlotCategories, assignGearSlotCategory, removeGearSlotCategory,
  writeAuditEntry, AuditAction,
} from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AddBossForm } from "@/components/AddBossForm";
import { AddActivityForm } from "@/components/AddActivityForm";
import { EditBossForm } from "@/components/EditBossForm";
import { EditActivityForm } from "@/components/EditActivityForm";
import { BossImage } from "@/components/BossImage";
import { ItemReviewTab } from "@/components/ItemReviewTab";
import { ApprovedItemsTab } from "@/components/ApprovedItemsTab";
import {
  Loader2, Plus, Trash2, Pencil, ChevronDown, ChevronUp,
  Gamepad2, Skull, Calendar, Package, Save, X, Image, Search,
  Tags, Palette, Upload, Shield, ClipboardCheck, Check,
} from "lucide-react";

type Game = { id: string; name: string; slug: string; icon_url?: string | null; supported_spawn_types: string[]; created_at: string; is_visible?: boolean };
type BossTemplate = { id: string; game_id: string; name: string; spawn_type: string; respawn_hours?: number | null; schedule?: any; is_recurring: boolean; category?: string | null; tags?: string[]; points: number; image_url?: string | null };
type ActivityTemplate = { id: string; game_id: string; name: string; schedule_type: string; schedule?: any; duration_minutes?: number | null; points_per_participant: number; party_size?: number | null; category?: string | null; tags?: string[]; image_url?: string | null };
type ItemCatalogItem = { id: string; game: string; name: string; rarity: string; description?: string | null; image_url?: string | null; category_id?: string | null; created_by_username?: string | null };
type ItemCategory = { id: string; game: string; name: string; parent_id: string | null };
type ItemRarity = { id: string; game: string; name: string; color: string; sort_order: number };

const TABS = [
  { key: "bosses", icon: Skull, label: "Bosses" },
  { key: "activities", icon: Calendar, label: "Activities" },
  { key: "gear", icon: Shield, label: "Gear Template" },
  { key: "categories", icon: Tags, label: "Categories" },
  { key: "rarities", icon: Palette, label: "Rarities" },
  { key: "items", icon: Package, label: "Items" },
  { key: "review", icon: ClipboardCheck, label: "Item Review" },
  { key: "approved", icon: Check, label: "Approved Items" },
] as const;

export function AdminGamesTab() {
  const queryClient = useQueryClient();
  const { userRole } = useAuth();
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<string>("bosses");
  const [editingGame, setEditingGame] = useState<Partial<Game> | null>(null);
  const [showAddGame, setShowAddGame] = useState(false);
  const [newGame, setNewGame] = useState({ name: "", slug: "", supported_spawn_types: ["fixed_hours", "fixed_schedule"] as string[] });
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "game" | "boss" | "activity" | "item" | "category" | "rarity"; id: string; name: string; gameName?: string } | null>(null);
  const [visibilityConfirm, setVisibilityConfirm] = useState<{ id: string; name: string; next: boolean } | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [editingBoss, setEditingBoss] = useState<Partial<BossTemplate> | null>(null);
  const [showAddBoss, setShowAddBoss] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Partial<ActivityTemplate> | null>(null);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [bossSearch, setBossSearch] = useState("");

  const [itemCatalog, setItemCatalog] = useState<Record<string, ItemCatalogItem[]>>({});
  const [itemTotal, setItemTotal] = useState<Record<string, number>>({});
  const [itemLoadedGames, setItemLoadedGames] = useState<Set<string>>(new Set());
  const [loadingMoreItems, setLoadingMoreItems] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [approvedCounts, setApprovedCounts] = useState<Record<string, number>>({});
  const ITEMS_PER_PAGE = 50;
  const [itemSearch, setItemSearch] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", rarity: "", description: "", category_id: "" as string | undefined, categoryLabel: "" as string | null });
  const [newItemParent, setNewItemParent] = useState(""); // tracks top-level category for two-step selector
  const [itemImage, setItemImage] = useState<File | null>(null);
  const [itemImagePreview, setItemImagePreview] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<ItemCatalogItem> | null>(null);
  const [submittingItem, setSubmittingItem] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);

  const [categories, setCategories] = useState<Record<string, ItemCategory[]>>({});
  const [rarities, setRarities] = useState<Record<string, ItemRarity[]>>({});
  const [newCategory, setNewCategory] = useState({ name: "", parent_id: "" });
  const [addSubFor, setAddSubFor] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<Partial<ItemCategory> | null>(null);
  const [newRarity, setNewRarity] = useState({ name: "", color: "#71717a" });
  const [showAddRar, setShowAddRar] = useState(false);
  const [editingRar, setEditingRar] = useState<Partial<ItemRarity> | null>(null);

  // ── Gear Template ──
  const [gearSlots, setGearSlots] = useState<Record<string, any[]>>({});
  const [gearSlotCats, setGearSlotCats] = useState<Record<string, any[]>>({});
  const [newSlot, setNewSlot] = useState({ name: "" });
  const [editingSlot, setEditingSlot] = useState<any | null>(null);
  const [assignCatForSlot, setAssignCatForSlot] = useState<string | null>(null);
  const [assignCatId, setAssignCatId] = useState("");
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [dragSlotId, setDragSlotId] = useState<string | null>(null);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);

  const { data: games = [], isLoading } = useQuery({ queryKey: ["admin", "games"], queryFn: fetchGames, staleTime: 10_000, enabled: userRole === "admin" });
  const [bossTemplates, setBossTemplates] = useState<Record<string, BossTemplate[]>>({});
  const [activityTemplates, setActivityTemplates] = useState<Record<string, ActivityTemplate[]>>({});

  useEffect(() => {
    if (expandedGame) {
      setLoadingTemplates(true);
      const game = games.find(g => g.id === expandedGame);
      const gameSlug = game?.slug || "";
      Promise.all([
        fetchBossTemplates(expandedGame).catch(() => []),
        fetchActivityTemplates(expandedGame).catch(() => []),
        gameSlug ? fetchItemCategories(gameSlug).catch(() => []) : Promise.resolve([]),
        gameSlug ? fetchItemRarities(gameSlug).catch(() => []) : Promise.resolve([]),
        gameSlug ? fetchGearSlots(gameSlug).catch(() => []) : Promise.resolve([]),
      ]).then(([bosses, activities, cats, rars, slots]) => {
        setBossTemplates(p => ({ ...p, [expandedGame]: bosses }));
        setActivityTemplates(p => ({ ...p, [expandedGame]: activities }));
        setCategories(p => ({ ...p, [expandedGame]: cats }));
        setRarities(p => ({ ...p, [expandedGame]: rars }));
        setGearSlots(p => ({ ...p, [expandedGame]: slots }));
        // Reset item catalog for this game (will be lazy-loaded when items tab opens)
        setItemCatalog(p => ({ ...p, [expandedGame]: [] }));
        setItemTotal(p => ({ ...p, [expandedGame]: 0 }));
        setItemLoadedGames(prev => { const n = new Set(prev); n.delete(expandedGame); return n; });
        // Fetch assigned categories for each slot
        Promise.all(slots.map((s: any) => fetchGearSlotCategories(s.id).catch(() => [])))
          .then(cats => {
            const catMap: Record<string, any[]> = {};
            slots.forEach((s: any, i: number) => { catMap[s.id] = cats[i] || []; });
            setGearSlotCats(catMap);
          });
        setLoadingTemplates(false);
      });
      // Fetch pending item count for the review tab
      if (gameSlug) {
        fetchPendingItems(gameSlug)
          .then(items => setPendingCounts(p => ({ ...p, [expandedGame]: items.length })))
          .catch(() => {});
      }
    } else {
      // Clear item loaded state when no game is expanded
      setItemLoadedGames(new Set());
    }
  }, [expandedGame, games]);

  const toggleGame = (id: string) => setExpandedGame(p => p === id ? null : id);
  const slug = () => { const g = games.find(g => g.id === expandedGame); return g?.slug || ""; };

  const refreshTemplates = () => {
    if (!expandedGame) return;
    const s = slug();
    Promise.all([
      fetchBossTemplates(expandedGame).catch(() => []),
      fetchActivityTemplates(expandedGame).catch(() => []),
      s ? fetchItemCategories(s).catch(() => []) : Promise.resolve([]),
      s ? fetchItemRarities(s).catch(() => []) : Promise.resolve([]),
      s ? fetchGearSlots(s).catch(() => []) : Promise.resolve([]),
    ]).then(([bosses, activities, cats, rars, slots]) => {
      setBossTemplates(p => ({ ...p, [expandedGame]: bosses }));
      setActivityTemplates(p => ({ ...p, [expandedGame]: activities }));
      setCategories(p => ({ ...p, [expandedGame]: cats }));
      setRarities(p => ({ ...p, [expandedGame]: rars }));
      setGearSlots(p => ({ ...p, [expandedGame]: slots }));
      // Reset item catalog so it reloads with fresh data
      setItemCatalog(p => ({ ...p, [expandedGame]: [] }));
      setItemTotal(p => ({ ...p, [expandedGame]: 0 }));
      setItemLoadedGames(prev => { const n = new Set(prev); n.delete(expandedGame); return n; });
      // Re-fetch categories for each slot
      Promise.all(slots.map((sl: any) => fetchGearSlotCategories(sl.id).catch(() => [])))
        .then(catsArr => {
          const catMap: Record<string, any[]> = {};
          slots.forEach((sl: any, i: number) => { catMap[sl.id] = catsArr[i] || []; });
          setGearSlotCats(catMap);
        });
    });
  };

  // Auto-load items when switching to the Items tab
  useEffect(() => {
    if (expandedTab === "items" && expandedGame && !itemLoadedGames.has(expandedGame)) {
      const s = games.find(g => g.id === expandedGame)?.slug;
      if (s) loadMoreItems(expandedGame);
    }
  }, [expandedTab, expandedGame]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMoreItems = async (gameId: string, search?: string) => {
    const s = games.find(g => g.id === gameId)?.slug;
    if (!s) return;
    const isSearch = !!(search && search.trim());
    setLoadingMoreItems(true);
    try {
      const currentItems = isSearch ? [] : (itemCatalog[gameId] || []);
      const { items, total } = await fetchItemCatalogPaginated(s, ITEMS_PER_PAGE, currentItems.length, search);
      setItemCatalog(p => ({ ...p, [gameId]: isSearch ? items : [...currentItems, ...items] }));
      setItemTotal(p => ({ ...p, [gameId]: total }));
      if (!isSearch) setItemLoadedGames(prev => new Set(prev).add(gameId));
    } catch (err) {
      console.error("Failed to load items:", err);
    } finally {
      setLoadingMoreItems(false);
    }
  };

  // Debounced server-side search for items
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSearchRef = useRef(itemSearch);
  useEffect(() => {
    if (!expandedGame) return;
    if (itemSearch === prevSearchRef.current) return;
    prevSearchRef.current = itemSearch;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      const gameId = expandedGame;
      const s = games.find(g => g.id === gameId)?.slug;
      if (!s || expandedTab !== "items") return;
      loadMoreItems(gameId, itemSearch.trim() || undefined);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [itemSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newGame.name.trim() || !newGame.slug.trim()) return;
    const s = newGame.slug.trim().toLowerCase();
    let iconUrl: string | undefined;
    if (iconFile) { try { iconUrl = await uploadGameIcon(s, iconFile); } catch {} }
    await createGame(newGame.name.trim(), s, newGame.supported_spawn_types, iconUrl);
    writeAuditEntry({ action: AuditAction.GAME_CREATE, server_id: "00000000-0000-0000-0000-000000000000", details: { game_name: newGame.name.trim(), game_slug: s } });
    setShowAddGame(false); setNewGame({ name: "", slug: "", supported_spawn_types: ["fixed_hours", "fixed_schedule"] }); setIconFile(null); setIconPreview(null);
    queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
  };
  const handleUpdateGame = async () => {
    if (!editingGame?.id || !editingGame.name?.trim()) return;
    const types = Array.isArray(editingGame.supported_spawn_types) ? editingGame.supported_spawn_types : [];
    await updateGame(editingGame.id, { name: editingGame.name.trim(), slug: editingGame.slug?.trim().toLowerCase(), supported_spawn_types: types, icon_url: editingGame.icon_url?.trim() || null, is_visible: editingGame.is_visible });
    writeAuditEntry({ action: AuditAction.GAME_UPDATE, server_id: "00000000-0000-0000-0000-000000000000", target_id: editingGame.id, details: { game_name: editingGame.name.trim() } });
    setEditingGame(null); queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
  };
  const handleToggleVisibility = async (game: Game) => {
    const next = game.is_visible === false ? true : false;
    setVisibilityConfirm({ id: game.id, name: game.name, next });
  };
  const confirmToggleVisibility = async () => {
    if (!visibilityConfirm) return;
    await updateGame(visibilityConfirm.id, { is_visible: visibilityConfirm.next });
    queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
    setVisibilityConfirm(null);
  };
  const handleDeleteGame = async () => { if (!deleteConfirm || deleteConfirm.type !== "game") return; await deleteGame(deleteConfirm.id); writeAuditEntry({ action: AuditAction.GAME_DELETE, server_id: "00000000-0000-0000-0000-000000000000", target_id: deleteConfirm.id, details: { game_name: deleteConfirm.name } }); setDeleteConfirm(null); setExpandedGame(null); queryClient.invalidateQueries({ queryKey: ["admin", "games"] }); };
  const handleDeleteBoss = async () => { if (!deleteConfirm || deleteConfirm.type !== "boss") return; await deleteBossTemplate(deleteConfirm.id); setDeleteConfirm(null); refreshTemplates(); };
  const handleDeleteActivity = async () => { if (!deleteConfirm || deleteConfirm.type !== "activity") return; await deleteActivityTemplate(deleteConfirm.id); setDeleteConfirm(null); refreshTemplates(); };
  const handleDeleteItem = async () => { if (!deleteConfirm || deleteConfirm.type !== "item") return; await deleteItemCatalogItem(deleteConfirm.id); setDeleteConfirm(null); refreshTemplates(); };
  const handleDeleteCategory = async () => { if (!deleteConfirm || deleteConfirm.type !== "category") return; await deleteItemCategory(deleteConfirm.id); setDeleteConfirm(null); refreshTemplates(); };
  const handleDeleteRarity = async () => { if (!deleteConfirm || deleteConfirm.type !== "rarity") return; await deleteItemRarity(deleteConfirm.id); setDeleteConfirm(null); refreshTemplates(); };

  const handleCreateItem = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault(); if (!newItem.name.trim() || !expandedGame) return;
    setSubmittingItem(true);
    try {
      let imageUrl: string | undefined;
      if (itemImage) imageUrl = await uploadItemCatalogImage(slug(), newItem.name.trim(), itemImage);
      await createItemCatalogItem({ game: slug(), name: newItem.name.trim(), rarity: newItem.rarity, description: newItem.description, image_url: imageUrl, category_id: newItem.category_id || undefined });
      writeAuditEntry({ action: AuditAction.ITEM_CREATE, server_id: "00000000-0000-0000-0000-000000000000", details: { item_name: newItem.name.trim(), rarity: newItem.rarity, category: newItem.categoryLabel, game: slug(), description: newItem.description.trim() || null, has_image: !!imageUrl } });
      setShowAddItem(false); setNewItem({ name: "", rarity: "", description: "", category_id: "", categoryLabel: "" }); setNewItemParent(""); setItemImage(null); setItemImagePreview(null);
      refreshTemplates();
    } catch (err: any) { console.error("Failed to create catalog item:", err); alert(err?.message || "Failed to create item"); } finally { setSubmittingItem(false); }
  };
  const handleUpdateItem = async () => {
    if (!editingItem?.id || !editingItem.name?.trim()) return;
    await updateItemCatalogItem(editingItem.id, { name: editingItem.name.trim(), rarity: editingItem.rarity, description: editingItem.description ?? undefined, image_url: editingItem.image_url ?? undefined, category_id: editingItem.category_id ?? undefined });
    setEditingItem(null); refreshTemplates();
  };
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newCategory.name.trim() || !expandedGame) return;
    await createItemCategory({ game: slug(), name: newCategory.name.trim(), parent_id: newCategory.parent_id || null });
    setAddSubFor(null); setNewCategory({ name: "", parent_id: "" }); refreshTemplates();
  };
  const handleUpdateCategory = async () => {
    if (!editingCat?.id || !editingCat.name?.trim()) return;
    await updateItemCategory(editingCat.id, { name: editingCat.name.trim(), parent_id: editingCat.parent_id || null });
    setEditingCat(null); refreshTemplates();
  };
  const handleCreateRarity = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newRarity.name.trim() || !expandedGame) return;
    const maxOrder = (rarities[expandedGame] || []).reduce((max, r) => Math.max(max, r.sort_order), 0);
    await createItemRarity({ game: slug(), name: newRarity.name.trim(), color: newRarity.color, sort_order: maxOrder + 1 });
    setShowAddRar(false); setNewRarity({ name: "", color: "#71717a" }); refreshTemplates();
  };
  const handleUpdateRarity = async () => {
    if (!editingRar?.id || !editingRar.name?.trim()) return;
    await updateItemRarity(editingRar.id, { name: editingRar.name.trim(), color: editingRar.color, sort_order: editingRar.sort_order });
    setEditingRar(null); refreshTemplates();
  };

  // ── Gear Slot Handlers ──
  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newSlot.name.trim() || !expandedGame) return;
    const maxOrder = (gearSlots[expandedGame] || []).reduce((max, s) => Math.max(max, s.sort_order), 0);
    await createGearSlot({ game: slug(), name: newSlot.name.trim(), sort_order: maxOrder + 1 });
    setNewSlot({ name: "" }); refreshTemplates();
  };
  const handleUpdateSlot = async () => {
    if (!editingSlot?.id || !editingSlot.name?.trim()) return;
    await updateGearSlot(editingSlot.id, { name: editingSlot.name.trim(), sort_order: editingSlot.sort_order });
    setEditingSlot(null); refreshTemplates();
  };
  const handleCreateSubclass = async (slotId: string) => {
    if (!assignCatId) return;
    try {
      await assignGearSlotCategory(slotId, assignCatId);
      setAssignCatForSlot(null); setAssignCatId(""); refreshTemplates();
    } catch (err: any) {
      if (err?.message?.includes("duplicate") || err?.code === "23505") {
        alert("This category is already assigned to this slot.");
      }
    }
  };
  const moveSlot = async (fromId: string, toId: string) => {
    const slots = [...(gearSlots[expandedGame!] || [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
    const fromIdx = slots.findIndex((s: any) => s.id === fromId);
    const toIdx = slots.findIndex((s: any) => s.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    // Remove from old position, insert at new position
    const [moved] = slots.splice(fromIdx, 1);
    slots.splice(toIdx, 0, moved);

    // Reassign sort_order sequentially
    const updates = slots.map((s: any, i: number) => updateGearSlot(s.id, { sort_order: i + 1 }));
    await Promise.all(updates);
    refreshTemplates();
  };

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#a1a1aa]" /></div>;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <div><h3 className="text-base font-semibold text-[#fafafa]">Games ({games.length})</h3><p className="text-sm text-[#71717a]">Manage supported games and their templates</p></div>
        <button onClick={() => setShowAddGame(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition"><Plus className="w-4 h-4" /> Add Game</button>
      </div>

      {showAddGame && (
        <form onSubmit={handleCreateGame} className="bg-[#0d0d11] border border-[#1e1e2a] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-[#fafafa]">New Game</span><button type="button" onClick={() => setShowAddGame(false)} className="text-[#71717a] hover:text-[#fafafa]"><X className="w-4 h-4" /></button></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-[#a1a1aa] mb-1">Name</label><input value={newGame.name} onChange={e => setNewGame(p => ({ ...p, name: e.target.value }))} required placeholder="LordNine: Infinite Class" className="w-full px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:ring-1 focus:ring-[#52525b]" /></div>
            <div><label className="block text-xs text-[#a1a1aa] mb-1">Slug</label><input value={newGame.slug} onChange={e => setNewGame(p => ({ ...p, slug: e.target.value }))} required placeholder="lordnine" className="w-full px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:ring-1 focus:ring-[#52525b]" /></div>
            <div className="col-span-2"><label className="block text-xs text-[#a1a1aa] mb-1">Game Icon</label><div className="flex items-center gap-3"><label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1e1e2a] hover:bg-[#2a2a35] text-[#d4d4d8] cursor-pointer transition"><Image className="w-3.5 h-3.5" /> Choose Image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0] || null; setIconFile(f); setIconPreview(f ? URL.createObjectURL(f) : null); }} className="hidden" /></label>{iconPreview && <div className="relative"><img src={iconPreview} alt="Preview" className="w-8 h-8 rounded object-cover border border-[#3f3f46]" /><button onClick={() => { setIconFile(null); setIconPreview(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#2a2a35] text-[#fafafa] flex items-center justify-center hover:bg-[#52525b] transition"><X className="w-2.5 h-2.5" /></button></div>}</div></div>
            <div className="col-span-2"><label className="block text-xs text-[#a1a1aa] mb-1.5">Spawn Types</label><div className="flex gap-3">{["fixed_hours", "fixed_schedule"].map(t => (<label key={t} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={newGame.supported_spawn_types.includes(t)} onChange={e => setNewGame(p => ({ ...p, supported_spawn_types: e.target.checked ? [...p.supported_spawn_types, t] : p.supported_spawn_types.filter(x => x !== t) }))} className="w-3.5 h-3.5 rounded border-[#3f3f46] bg-[#0d0d11] text-[#a1a1aa] focus:ring-[#52525b] focus:ring-offset-0" /><span className="text-xs text-[#d4d4d8]">{t === "fixed_hours" ? "Fixed Hours" : "Fixed Schedule"}</span></label>))}</div></div>
          </div>
          <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition"><Save className="w-3.5 h-3.5" /> Create Game</button>
        </form>
      )}

      <div className="space-y-2">
        {games.map((game: Game) => (
          <div key={game.id} className="bg-[#0d0d11] border border-[#1e1e2a] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => toggleGame(game.id)} className="flex items-center gap-3 flex-1 text-left">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#0d0d11] overflow-hidden">{game.icon_url ? <img src={game.icon_url} alt={game.name} className="w-full h-full object-cover" /> : <Gamepad2 className="w-4 h-4 text-[#a1a1aa]" />}</div>
                <div><div className="flex items-center gap-2"><span className="text-sm font-medium text-[#fafafa]">{game.name}</span><span className="text-xs px-1.5 py-0.5 rounded bg-[#1e1e2a] text-[#a1a1aa] font-mono">{game.slug}</span></div><div className="flex items-center gap-2 mt-0.5">{(Array.isArray(game.supported_spawn_types) ? game.supported_spawn_types : []).map((t: string) => (<span key={t} className="text-xs px-1.5 py-0.5 rounded bg-[#1e1e2a] text-[#a1a1aa]">{t}</span>))}</div></div>
              </button>
              <div className="flex items-center gap-1">
                <button onClick={(e) => { e.stopPropagation(); handleToggleVisibility(game); }} title={game.is_visible !== false ? "Hide from Create Server" : "Show in Create Server"} className="p-1.5 rounded transition">
                  <div className={`relative w-8 h-4.5 rounded-full transition-colors ${game.is_visible !== false ? "bg-emerald-500/50" : "bg-[#2a2a35]"}`}>
                    <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-[#fafafa] shadow transition-transform ${game.is_visible !== false ? "left-4" : "left-0.5"}`} />
                  </div>
                </button>
                <button onClick={() => setEditingGame({ id: game.id, name: game.name, slug: game.slug, icon_url: game.icon_url, supported_spawn_types: Array.isArray(game.supported_spawn_types) ? game.supported_spawn_types : [], is_visible: game.is_visible })} className="p-1.5 text-[#71717a] hover:text-[#d4d4d8] transition"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => setDeleteConfirm({ type: "game", id: game.id, name: game.name })} className="p-1.5 text-[#71717a] hover:text-[#f87171] transition"><Trash2 className="w-3.5 h-3.5" /></button>
                {expandedGame === game.id ? <ChevronUp className="w-4 h-4 text-[#71717a]" /> : <ChevronDown className="w-4 h-4 text-[#71717a]" />}
              </div>
            </div>

            {editingGame?.id === game.id && (
              <div className="px-4 pb-3 border-t border-[#1e1e2a] pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-[#a1a1aa] mb-1">Name</label><input value={editingGame.name || ""} onChange={e => setEditingGame(p => ({ ...p, name: e.target.value }))} className="w-full px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" /></div>
                  <div><label className="block text-xs text-[#a1a1aa] mb-1">Slug</label><input value={editingGame.slug || ""} onChange={e => setEditingGame(p => ({ ...p, slug: e.target.value }))} className="w-full px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" /></div>
                  <div className="col-span-2"><label className="block text-xs text-[#a1a1aa] mb-1">Game Icon</label><div className="flex items-center gap-3"><label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1e1e2a] hover:bg-[#2a2a35] text-[#d4d4d8] cursor-pointer transition"><Image className="w-3.5 h-3.5" /> {editingGame.icon_url ? "Replace" : "Choose Image"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0] || null; if (f) { uploadGameIcon(editingGame.slug || "", f).then(url => setEditingGame(p => ({ ...p, icon_url: url }))).catch(() => {}); } }} className="hidden" /></label>{editingGame.icon_url && <div className="relative"><img src={editingGame.icon_url} alt="Icon" className="w-8 h-8 rounded object-cover border border-[#3f3f46]" /><button onClick={() => setEditingGame(p => ({ ...p, icon_url: null }))} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#2a2a35] text-[#fafafa] flex items-center justify-center hover:bg-[#52525b] transition"><X className="w-2.5 h-2.5" /></button></div>}</div></div>
                  <div className="col-span-2"><label className="block text-xs text-[#a1a1aa] mb-1.5">Spawn Types</label><div className="flex gap-3">{["fixed_hours", "fixed_schedule"].map(t => { const current = Array.isArray(editingGame.supported_spawn_types) ? editingGame.supported_spawn_types : []; return (<label key={t} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={current.includes(t)} onChange={e => setEditingGame(p => ({ ...p, supported_spawn_types: e.target.checked ? [...current, t] : current.filter(x => x !== t) }))} className="w-3.5 h-3.5 rounded border-[#3f3f46] bg-[#0d0d11] text-[#a1a1aa] focus:ring-[#52525b] focus:ring-offset-0" /><span className="text-xs text-[#d4d4d8]">{t === "fixed_hours" ? "Fixed Hours" : "Fixed Schedule"}</span></label>); })}</div></div>
                  <div className="col-span-2"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={editingGame.is_visible !== false} onChange={e => setEditingGame(p => ({ ...p, is_visible: e.target.checked }))} className="w-3.5 h-3.5 rounded border-[#3f3f46] bg-[#0d0d11] text-emerald-400 focus:ring-[#52525b] focus:ring-offset-0" /><span className="text-xs text-[#d4d4d8]">Visible in Create Server page</span></label></div>
                </div>
                <div className="flex items-center gap-2"><button onClick={handleUpdateGame} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition"><Save className="w-3 h-3" /> Save</button><button onClick={() => setEditingGame(null)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-[#1e1e2a] hover:bg-[#2a2a35] text-[#d4d4d8] transition"><X className="w-3 h-3" /> Cancel</button></div>
              </div>
            )}

            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${expandedGame === game.id ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}`}>
            {expandedGame === game.id && (
              <div className="border-t border-[#1e1e2a]">
                {loadingTemplates ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2"><Loader2 className="w-6 h-6 animate-spin text-[#a1a1aa]" /><span className="text-xs text-[#71717a]">Loading...</span></div>
                ) : (
                  <>
                    <div className="flex items-center gap-0.5 px-4 pt-3 pb-0 border-b border-[#1e1e2a] flex-wrap">
                      {TABS.map(t => {
                        const isActive = expandedTab === t.key;
                        const Icon = t.icon;
                          const counts: Record<string, number> = {
                          bosses: bossTemplates[game.id]?.length || 0,
                          activities: activityTemplates[game.id]?.length || 0,
                          categories: categories[game.id]?.length || 0,
                          rarities: rarities[game.id]?.length || 0,
                          items: itemTotal[game.id] || 0,
                          gear: gearSlots[game.id]?.length || 0,
                          review: pendingCounts[game.id] || 0,
                          approved: approvedCounts[game.id] || 0,
                        };
                        return (
                          <button key={t.key} onClick={() => setExpandedTab(t.key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition border-b-2 -mb-[1px] ${isActive ? "bg-[#0d0d11] border-[#fafafa] text-[#fafafa]" : "border-transparent text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#0d0d11]/50"}`}>
                            <Icon className="w-3.5 h-3.5" />{t.label}<span className={`text-[10px] ml-0.5 ${isActive ? "text-[#a1a1aa]" : "text-[#52525b]"}`}>({counts[t.key]})</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="px-4 py-3">

                      {/* === BOSSES TAB === */}
                      {expandedTab === "bosses" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-semibold text-[#d4d4d8]">Boss Templates ({(bossTemplates[game.id] || []).filter(bt => !bossSearch || bt.name.toLowerCase().includes(bossSearch.toLowerCase())).length})</h4>
                            <div className="flex items-center gap-2"><div className="relative w-48"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#52525b]" /><input placeholder="Search bosses…" value={bossSearch} onChange={e => setBossSearch(e.target.value)} className="w-full pl-7 pr-2 py-1.5 text-xs bg-[#0d0d11] border border-[#1e1e2a] rounded text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]" /></div><button onClick={() => setShowAddBoss(true)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-[#1e1e2a] hover:bg-[#2a2a35] text-[#d4d4d8] transition shrink-0"><Plus className="w-3 h-3" /> Add Boss</button></div>
                          </div>
                          {showAddBoss && <AddBossForm gameId={game.id} gameSlug={game.slug} onCreated={() => { setShowAddBoss(false); refreshTemplates(); }} onCancel={() => setShowAddBoss(false)} />}
                          <div className="space-y-1">
                            {(bossTemplates[game.id] || []).filter(bt => !bossSearch || bt.name.toLowerCase().includes(bossSearch.toLowerCase())).map((bt: BossTemplate) => {
                              const isEditing = editingBoss?.id === bt.id;
                              return (<div key={bt.id} className="bg-[#0d0d11]/30 rounded overflow-hidden"><div className="flex items-center justify-between px-3 py-2 text-sm"><div className="flex items-center gap-2">{bt.image_url ? <img src={bt.image_url} alt={bt.name} className="w-5 h-5 rounded object-cover border border-[#1e1e2a]" /> : <BossImage bossName={bt.name} size="sm" />}<span className="text-[#fafafa]">{bt.name}</span><span className={`text-xs px-1.5 py-0.5 rounded font-medium ${bt.spawn_type==='fixed_schedule'?'bg-violet-600 text-white':bt.spawn_type==='fixed_hours'?'bg-sky-600 text-white':'bg-[#1e1e2a] text-[#a1a1aa]'}`}>{bt.spawn_type==='fixed_schedule'?'schedule':bt.spawn_type==='fixed_hours'?'hours':bt.spawn_type}</span>{bt.spawn_type==="fixed_hours"&&bt.respawn_hours!=null&&<span className="text-xs text-[#71717a]">{bt.respawn_hours}h</span>}<span className="text-xs text-[#71717a]">{bt.points}pt{bt.points!==1?"s":""}</span></div><div className="flex items-center gap-1"><button onClick={()=>setEditingBoss(isEditing?null:{id:bt.id,name:bt.name,spawn_type:bt.spawn_type,respawn_hours:bt.respawn_hours,schedule:bt.schedule,is_recurring:bt.is_recurring,points:bt.points,category:bt.category,tags:bt.tags,image_url:bt.image_url})} className="p-1 text-[#52525b] hover:text-[#d4d4d8]"><Pencil className="w-3 h-3"/></button><button onClick={()=>setDeleteConfirm({type:"boss",id:bt.id,name:bt.name,gameName:game.name})} className="p-1 text-[#52525b] hover:text-[#f87171]"><Trash2 className="w-3 h-3"/></button></div></div><div className={`transition-all duration-300 ease-in-out ${isEditing?"max-h-[600px] opacity-100":"max-h-0 opacity-0"}`}>{isEditing&&editingBoss&&<EditBossForm boss={editingBoss as any} gameSlug={game.slug} onSaved={()=>{setEditingBoss(null);refreshTemplates()}} onCancel={()=>setEditingBoss(null)}/>}</div></div>);
                            })}
                            {(!bossTemplates[game.id] || bossTemplates[game.id].length===0) && <p className="text-xs text-[#52525b] py-2">No boss templates yet.</p>}
                          </div>
                        </div>
                      )}

                      {/* === ACTIVITIES TAB === */}
                      {expandedTab === "activities" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold text-[#d4d4d8]">Activity Templates ({activityTemplates[game.id]?.length||0})</h4><button onClick={()=>setShowAddActivity(true)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-[#1e1e2a] hover:bg-[#2a2a35] text-[#d4d4d8] transition"><Plus className="w-3 h-3"/> Add Activity</button></div>
                          {showAddActivity && <AddActivityForm gameId={game.id} gameSlug={game.slug} onCreated={()=>{setShowAddActivity(false);refreshTemplates()}} onCancel={()=>setShowAddActivity(false)}/>}
                          <div className="space-y-1">
                            {(activityTemplates[game.id]||[]).map((at:ActivityTemplate)=>{const isEditing=editingActivity?.id===at.id;return(<div key={at.id} className="bg-[#0d0d11]/30 rounded overflow-hidden"><div className="flex items-center justify-between px-3 py-2 text-sm"><div className="flex items-center gap-2">{at.image_url?<img src={at.image_url} alt={at.name} className="w-5 h-5 rounded object-cover border border-[#1e1e2a]"/>:<Calendar className="w-4 h-4 text-[#52525b]"/>}<span className="text-[#fafafa]">{at.name}</span><span className="text-xs px-1.5 py-0.5 rounded bg-[#1e1e2a] text-[#a1a1aa]">{at.schedule_type==="fixed_schedule"?"Fixed Schedule":at.schedule_type==="fixed_hours"?"Fixed Hours":"One Time"}</span><span className="text-xs text-[#71717a]">{at.points_per_participant}pt/p</span>{at.party_size!=null&&<span className="text-xs text-[#71717a]">{at.party_size}p</span>}</div><div className="flex items-center gap-1"><button onClick={()=>setEditingActivity(isEditing?null:{id:at.id,name:at.name,schedule_type:at.schedule_type,schedule:at.schedule,duration_minutes:at.duration_minutes,points_per_participant:at.points_per_participant,party_size:at.party_size,category:at.category,tags:at.tags,image_url:at.image_url})} className="p-1 text-[#52525b] hover:text-[#d4d4d8]"><Pencil className="w-3 h-3"/></button><button onClick={()=>setDeleteConfirm({type:"activity",id:at.id,name:at.name,gameName:game.name})} className="p-1 text-[#52525b] hover:text-[#f87171]"><Trash2 className="w-3 h-3"/></button></div></div><div className={`transition-all duration-300 ease-in-out ${isEditing?"max-h-[600px] opacity-100":"max-h-0 opacity-0"}`}>{isEditing&&editingActivity&&<EditActivityForm activity={editingActivity as any} gameSlug={game.slug} onSaved={()=>{setEditingActivity(null);refreshTemplates()}} onCancel={()=>setEditingActivity(null)}/>}</div></div>)})}
                            {(!activityTemplates[game.id]||activityTemplates[game.id].length===0)&&<p className="text-xs text-[#52525b] py-2">No activity templates yet.</p>}
                          </div>
                        </div>
                      )}

                      {/* === CATEGORIES TAB === */}
                      {expandedTab === "categories" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold text-[#d4d4d8]">Categories ({(categories[game.id]||[]).length})</h4><button onClick={()=>{setAddSubFor("__top__");setNewCategory({name:"",parent_id:""})}} className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-[#1e1e2a] hover:bg-[#2a2a35] text-[#d4d4d8] transition shrink-0"><Plus className="w-3 h-3"/> Add Category</button></div>
                          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${addSubFor==="__top__"?"max-h-[200px] opacity-100 mb-2":"max-h-0 opacity-0"}`}>
                            <form onSubmit={handleCreateCategory} className="bg-[#0d0d11]/50 border border-[#1e1e2a] rounded-lg p-3 space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[#fafafa]">New Category</span><button type="button" onClick={()=>setAddSubFor(null)} className="text-[#71717a] hover:text-[#fafafa]"><X className="w-3.5 h-3.5"/></button></div><div className="flex gap-2"><input value={newCategory.name} onChange={e=>setNewCategory(p=>({...p,name:e.target.value}))} required placeholder="Category name" className="flex-1 px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"/><select value={newCategory.parent_id} onChange={e=>setNewCategory(p=>({...p,parent_id:e.target.value}))} className="w-40 px-2 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] focus:outline-none focus:border-[#52525b]"><option value="">Top-level</option>{(categories[game.id]||[]).filter(c=>!c.parent_id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><button type="submit" disabled={!newCategory.name.trim()} className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50"><Save className="w-3 h-3"/> Create</button></form>
                          </div>
                          <div className="space-y-1">
                            {(categories[game.id]||[]).filter(c=>!c.parent_id).map(cat=>{const subs=(categories[game.id]||[]).filter(c=>c.parent_id===cat.id);const isEditing=editingCat?.id===cat.id;return(<div key={cat.id} className="bg-[#0d0d11]/30 rounded overflow-hidden"><div className="flex items-center justify-between px-3 py-2 text-sm"><span className="text-[#fafafa]">{cat.name}</span><div className="flex items-center gap-0.5"><button onClick={()=>{setAddSubFor(cat.id);setNewCategory({name:"",parent_id:cat.id})}} className="p-1 text-[#52525b] hover:text-emerald-400 transition" title="Add subcategory"><Plus className="w-3 h-3"/></button><button onClick={()=>setEditingCat(isEditing?null:{id:cat.id,name:cat.name,parent_id:cat.parent_id})} className="p-1 text-[#52525b] hover:text-[#d4d4d8]"><Pencil className="w-3 h-3"/></button><button onClick={()=>setDeleteConfirm({type:"category",id:cat.id,name:cat.name,gameName:game.name})} className="p-1 text-[#52525b] hover:text-[#f87171]"><Trash2 className="w-3 h-3"/></button></div></div>{isEditing&&editingCat&&(<div className="bg-[#0d0d11] border-t border-[#1e1e2a] p-3 space-y-2"><div className="flex gap-2"><input value={editingCat.name||""} onChange={e=>setEditingCat(p=>({...p,name:e.target.value}))} className="flex-1 px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] focus:outline-none focus:border-[#52525b]"/><select value={editingCat.parent_id||""} onChange={e=>setEditingCat(p=>({...p,parent_id:e.target.value||null}))} className="w-40 px-2 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] focus:outline-none focus:border-[#52525b]"><option value="">Top-level</option>{(categories[game.id]||[]).filter(c=>!c.parent_id&&c.id!==cat.id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="flex items-center gap-2"><button onClick={handleUpdateCategory} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition"><Save className="w-3 h-3"/> Save</button><button onClick={()=>setEditingCat(null)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-[#1e1e2a] hover:bg-[#2a2a35] text-[#d4d4d8] transition"><X className="w-3 h-3"/> Cancel</button></div></div>)}<div className={`transition-all duration-300 ease-in-out overflow-hidden ${addSubFor===cat.id?"max-h-[150px] opacity-100":"max-h-0 opacity-0"}`}><form onSubmit={handleCreateCategory} className="bg-[#0d0d11]/50 border-t border-[#1e1e2a] p-3 space-y-2"><div className="flex items-center justify-between"><span className="text-[10px] text-[#71717a]">New subcategory under <span className="text-[#fafafa]">{cat.name}</span></span><button type="button" onClick={()=>setAddSubFor(null)} className="text-[#71717a] hover:text-[#fafafa]"><X className="w-3 h-3"/></button></div><div className="flex gap-2"><input value={newCategory.name} onChange={e=>setNewCategory(p=>({...p,name:e.target.value}))} required placeholder="Subcategory name" className="flex-1 px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]" autoFocus/></div><button type="submit" disabled={!newCategory.name.trim()} className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50"><Save className="w-3 h-3"/> Create Subcategory</button></form></div>{subs.length>0&&(<div className="ml-4 border-l border-[#1e1e2a] space-y-1 pb-1">{subs.map(sub=>(<div key={sub.id} className="flex items-center justify-between px-3 py-1.5 text-sm ml-1"><span className="text-[#a1a1aa] text-xs">{sub.name}</span><div className="flex items-center gap-1"><button onClick={()=>setEditingCat(editingCat?.id===sub.id?null:{id:sub.id,name:sub.name,parent_id:sub.parent_id})} className="p-0.5 text-[#52525b] hover:text-[#d4d4d8]"><Pencil className="w-2.5 h-2.5"/></button><button onClick={()=>setDeleteConfirm({type:"category",id:sub.id,name:sub.name,gameName:game.name})} className="p-0.5 text-[#52525b] hover:text-[#f87171]"><Trash2 className="w-2.5 h-2.5"/></button></div></div>))}</div>)}</div>)})}
                            {(!categories[game.id]||categories[game.id].length===0)&&<p className="text-xs text-[#52525b] py-2">No categories yet.</p>}
                          </div>
                        </div>
                      )}

                      {/* === RARITIES TAB === */}
                      {expandedTab === "rarities" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold text-[#d4d4d8]">Rarities ({(rarities[game.id]||[]).length})</h4><button onClick={()=>{setShowAddRar(true);setNewRarity({name:"",color:"#71717a"})}} className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-[#1e1e2a] hover:bg-[#2a2a35] text-[#d4d4d8] transition shrink-0"><Plus className="w-3 h-3"/> Add Rarity</button></div>
                          {showAddRar&&(<form onSubmit={handleCreateRarity} className="bg-[#0d0d11]/50 border border-[#1e1e2a] rounded-lg p-3 space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium text-[#fafafa]">New Rarity</span><button type="button" onClick={()=>setShowAddRar(false)} className="text-[#71717a] hover:text-[#fafafa]"><X className="w-3.5 h-3.5"/></button></div><div className="flex gap-2"><input value={newRarity.name} onChange={e=>setNewRarity(p=>({...p,name:e.target.value}))} required placeholder="Rarity name" className="flex-1 px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"/><input type="color" value={newRarity.color} onChange={e=>setNewRarity(p=>({...p,color:e.target.value}))} className="w-10 h-8 rounded bg-[#0d0d11] border border-[#1e1e2a] cursor-pointer"/></div><button type="submit" disabled={!newRarity.name.trim()} className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50"><Save className="w-3 h-3"/> Create</button></form>)}
                          <div className="flex flex-wrap gap-1.5">{(rarities[game.id]||[]).map(rar=>{const isEditing=editingRar?.id===rar.id;return(<div key={rar.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-[#0d0d11]/30 border border-[#1e1e2a]">{isEditing?(<div className="flex items-center gap-1"><input value={editingRar?.name||""} onChange={e=>setEditingRar(p=>({...p,name:e.target.value}))} className="w-20 px-1.5 py-0.5 bg-[#0d0d11] border border-[#3f3f46] rounded text-xs text-[#fafafa] focus:outline-none"/><input type="color" value={editingRar?.color||"#71717a"} onChange={e=>setEditingRar(p=>({...p,color:e.target.value}))} className="w-5 h-5 rounded border border-[#3f3f46] cursor-pointer"/><button onClick={handleUpdateRarity} className="p-0.5 text-emerald-400 hover:text-emerald-300"><Save className="w-2.5 h-2.5"/></button><button onClick={()=>setEditingRar(null)} className="p-0.5 text-[#71717a] hover:text-[#fafafa]"><X className="w-2.5 h-2.5"/></button></div>):(<><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor:rar.color}}/><span style={{color:rar.color}}>{rar.name}</span><button onClick={()=>setEditingRar({id:rar.id,name:rar.name,color:rar.color,sort_order:rar.sort_order})} className="p-0.5 text-[#52525b] hover:text-[#d4d4d8]"><Pencil className="w-2.5 h-2.5"/></button><button onClick={()=>setDeleteConfirm({type:"rarity",id:rar.id,name:rar.name,gameName:game.name})} className="p-0.5 text-[#52525b] hover:text-[#f87171]"><Trash2 className="w-2.5 h-2.5"/></button></>)}</div>)})}
                            {(!rarities[game.id]||rarities[game.id].length===0)&&<p className="text-xs text-[#52525b] py-2">No rarities defined.</p>}
                          </div>
                        </div>
                      )}

                      {/* === ITEMS TAB === */}
                      {expandedTab === "items" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-semibold text-[#d4d4d8]">Item Catalog ({itemTotal[game.id] ?? (itemCatalog[game.id]||[]).length})</h4><div className="flex items-center gap-2"><div className="relative w-48"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#52525b]"/><input placeholder="Search items…" value={itemSearch} onChange={e=>setItemSearch(e.target.value)} className="w-full pl-7 pr-2 py-1.5 text-xs bg-[#0d0d11] border border-[#1e1e2a] rounded text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"/></div><button onClick={()=>{const gameRarities=rarities[game.id]||[];setShowAddItem(true);setNewItem({name:"",rarity:gameRarities[0]?.name||"",description:"",category_id:"",categoryLabel:""});setNewItemParent("");setItemImage(null);setItemImagePreview(null)}} className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-[#1e1e2a] hover:bg-[#2a2a35] text-[#d4d4d8] transition shrink-0"><Plus className="w-3 h-3"/> Add Item</button></div></div>
                                                    {showAddItem && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowAddItem(false); setItemImage(null); setItemImagePreview(null); setNewItemParent(""); }}>
                              <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()} onPaste={async () => { try { const items = await navigator.clipboard.read(); for (const item of items) { const imageType = item.types.find(t => t.startsWith('image/')); if (imageType) { const blob = await item.getType(imageType); const file = new File([blob], 'pasted-image.png', { type: blob.type }); setItemImage(file); setItemImagePreview(URL.createObjectURL(file)); break; } } } catch {} }}>
                                <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-semibold text-[#fafafa]">Add Item</h3><button onClick={() => { setShowAddItem(false); setItemImage(null); setItemImagePreview(null); setNewItemParent(""); }} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-4 h-4" /></button></div>
                                <div className="space-y-3">
                                  <div><label className="text-[10px] text-[#71717a] uppercase tracking-wider">Name</label><input value={newItem.name} onChange={e => setNewItem(p => ({...p, name: e.target.value}))} placeholder="e.g. Dragon Heart" className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#1e1e2a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]" autoFocus /></div>
                                  <div><label className="text-[10px] text-[#71717a] uppercase tracking-wider">Description (optional)</label><input value={newItem.description} onChange={e => setNewItem(p => ({...p, description: e.target.value}))} placeholder="Brief description" className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#1e1e2a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]" /></div>
                                  <div><label className="text-[10px] text-[#71717a] uppercase tracking-wider">Category</label><select value={newItemParent} onChange={e => { const pid = e.target.value; const parentCat = (categories[game.id]||[]).find(c=>c.id===pid); setNewItemParent(pid); const hasSubs = (categories[game.id]||[]).some(c=>c.parent_id===pid); setNewItem(p=>({...p, category_id: pid&&!hasSubs?pid:undefined, categoryLabel: pid&&!hasSubs?parentCat?.name||null:null})); }} className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#1e1e2a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b]"><option value="">None</option>{(categories[game.id]||[]).filter(c=>!c.parent_id).map(cat=>(<option key={cat.id} value={cat.id}>{cat.name}</option>))}</select></div>
                                  {newItemParent&&(categories[game.id]||[]).some(c=>c.parent_id===newItemParent)&&(<div><label className="text-[10px] text-[#71717a] uppercase tracking-wider">Subcategory</label><select value={newItem.category_id||''} onChange={e => { const sid = e.target.value; const subCat = (categories[game.id]||[]).find(c=>c.id===sid); const parentCat = (categories[game.id]||[]).find(c=>c.id===newItemParent); setNewItem(p => ({...p, category_id: sid || undefined, categoryLabel: subCat ? (parentCat?`${parentCat.name} → ${subCat.name}`:subCat.name) : null})); }} className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#1e1e2a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b]"><option value="">-- Select --</option>{(categories[game.id]||[]).filter(c=>c.parent_id===newItemParent).map(sub=><option key={sub.id} value={sub.id}>{sub.name}</option>)}</select></div>)}
                                  <div><label className="text-[10px] text-[#71717a] uppercase tracking-wider">Image (optional)</label>{itemImagePreview ? (<div className="mt-1 relative rounded-lg overflow-hidden bg-[#09090b] border border-[#1e1e2a]"><img src={itemImagePreview} alt="Preview" className="w-full h-32 object-contain" /><button onClick={() => { setItemImage(null); setItemImagePreview(null); }} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-[#fafafa] hover:bg-black/80 transition"><X className="w-3.5 h-3.5" /></button></div>) : (<div className={`mt-1 border-2 border-dashed rounded-lg p-4 text-center transition cursor-pointer ${imageDragOver ? 'border-[#52525b] bg-[#1e1e2a]/50' : 'border-[#1e1e2a] hover:border-[#3f3f46]'}`} onDragOver={e => { e.preventDefault(); setImageDragOver(true); }} onDragLeave={() => setImageDragOver(false)} onDrop={e => { e.preventDefault(); setImageDragOver(false); const f = e.dataTransfer.files[0]; if (f) { setItemImage(f); setItemImagePreview(URL.createObjectURL(f)); } }} onClick={() => document.getElementById('admin-item-image')?.click()}><Upload className="w-5 h-5 text-[#52525b] mx-auto mb-1" /><p className="text-[10px] text-[#52525b]"><span className="text-[#71717a] font-medium">Click to upload</span> or drag &amp; drop</p><p className="text-[9px] text-[#52525b]/50 mt-0.5">or <kbd className="px-1 py-0.5 rounded bg-[#1e1e2a] text-[#71717a] text-[9px]">Ctrl+V</kbd> paste from clipboard</p></div>)}<input id="admin-item-image" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setItemImage(f); setItemImagePreview(URL.createObjectURL(f)); } e.target.value = ''; }} /></div>
                                  <div><label className="text-[10px] text-[#71717a] uppercase tracking-wider">Rarity</label><div className="flex gap-1.5 mt-1">{(rarities[game.id]||[]).map(r => (<button key={r.id} onClick={() => setNewItem(p => ({...p, rarity: r.name}))} className="flex-1 py-1.5 rounded-md text-[10px] font-medium capitalize transition border" style={{ borderColor: newItem.rarity===r.name ? r.color : '#27272a', color: newItem.rarity===r.name ? r.color : '#52525b', backgroundColor: newItem.rarity===r.name ? r.color+'15' : 'transparent' }}>{r.name}</button>))}{(rarities[game.id]||[]).length===0 && <span className="text-[10px] text-[#52525b] py-1">No rarities defined</span>}</div></div>
                                  <button onClick={handleCreateItem} disabled={submittingItem || !newItem.name.trim()} className="w-full py-2 bg-[#fafafa] text-[#09090b] rounded-lg text-sm font-medium hover:bg-[#e4e4e7] transition disabled:opacity-50">{submittingItem ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Add Item'}</button>
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="space-y-1">{(itemCatalog[game.id]||[]).map((it:ItemCatalogItem)=>{const isEditing=editingItem?.id===it.id;const rarityObj=(rarities[game.id]||[]).find(r=>r.name===it.rarity);const rarityColor=rarityObj?.color||"#71717a";const cat=(categories[game.id]||[]).find(c=>c.id===it.category_id);const catParent=cat?.parent_id?(categories[game.id]||[]).find(c=>c.id===cat.parent_id):null;const catLabel=cat?(catParent?`${catParent.name} → ${cat.name}`:cat.name):null;return(<div key={it.id} className="bg-[#0d0d11]/30 rounded overflow-hidden"><div className="flex items-center justify-between px-3 py-2 text-sm"><div className="flex items-center gap-2 min-w-0">{it.image_url?<img src={it.image_url} alt={it.name} className="w-5 h-5 rounded object-cover border border-[#1e1e2a]" style={{backgroundColor:rarityColor+"20"}}/>:<Package className="w-4 h-4 text-[#52525b]"/>}<span className="text-[#fafafa] truncate">{it.name}</span><span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0" style={{backgroundColor:rarityColor+"20",color:rarityColor,border:`1px solid ${rarityColor}40`}}>{it.rarity}</span>{catLabel&&<span className="text-[10px] text-[#52525b] truncate hidden sm:inline">{catLabel}</span>}</div><div className="flex items-center gap-1 shrink-0"><button onClick={()=>setEditingItem(isEditing?null:{id:it.id,name:it.name,rarity:it.rarity,description:it.description,image_url:it.image_url,category_id:it.category_id})} className="p-1 text-[#52525b] hover:text-[#d4d4d8]"><Pencil className="w-3 h-3"/></button><button onClick={()=>setDeleteConfirm({type:"item",id:it.id,name:it.name,gameName:game.name})} className="p-1 text-[#52525b] hover:text-[#f87171]"><Trash2 className="w-3 h-3"/></button></div></div><div className={`transition-all duration-300 ease-in-out ${isEditing?"max-h-[500px] opacity-100":"max-h-0 opacity-0"}`}>{isEditing&&editingItem&&(<div className="bg-[#0d0d11] border-t border-[#1e1e2a] p-3 space-y-2"><div className="grid grid-cols-2 gap-2"><div className="col-span-2"><label className="block text-[10px] text-[#a1a1aa] mb-1">Name</label><input value={editingItem.name||""} onChange={e=>setEditingItem(p=>({...p,name:e.target.value}))} className="w-full px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] focus:outline-none focus:border-[#52525b]"/></div><div><label className="block text-[10px] text-[#a1a1aa] mb-1">Category</label><select value={editingItem.category_id||""} onChange={e=>setEditingItem(p=>({...p,category_id:e.target.value||undefined}))} className="w-full px-2 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] focus:outline-none focus:border-[#52525b]"><option value="">None</option>{(categories[game.id]||[]).filter(c=>!c.parent_id).map(cat=>(<option key={cat.id} value={cat.id}>{cat.name}</option>))}</select>{(categories[game.id]||[]).filter(c=>c.parent_id&&c.parent_id===editingItem.category_id).length>0&&<select value={editingItem.category_id||""} onChange={e=>setEditingItem(p=>({...p,category_id:e.target.value||undefined}))} className="w-full mt-1 px-2 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] focus:outline-none focus:border-[#52525b]"><option value={editingItem.category_id||""}>-- Select --</option>{(categories[game.id]||[]).filter(c=>c.parent_id===editingItem.category_id).map(sub=><option key={sub.id} value={sub.id}>{sub.name}</option>)}</select>}</div><div><label className="block text-[10px] text-[#a1a1aa] mb-1">Rarity</label><select value={editingItem.rarity||"common"} onChange={e=>setEditingItem(p=>({...p,rarity:e.target.value}))} className="w-full px-2 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] focus:outline-none focus:border-[#52525b]">{(rarities[game.id]||[]).map(r=><option key={r.id} value={r.name}>{r.name}</option>)}{(rarities[game.id]||[]).length===0&&<option value="common">Common</option>}</select></div><div><label className="block text-[10px] text-[#a1a1aa] mb-1">Image URL</label><input value={editingItem.image_url||""} onChange={e=>setEditingItem(p=>({...p,image_url:e.target.value}))} placeholder="https://…" className="w-full px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"/></div><div className="col-span-2"><label className="block text-[10px] text-[#a1a1aa] mb-1">Description</label><input value={editingItem.description||""} onChange={e=>setEditingItem(p=>({...p,description:e.target.value}))} className="w-full px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] focus:outline-none focus:border-[#52525b]"/></div></div><div className="flex items-center gap-2"><button onClick={handleUpdateItem} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition"><Save className="w-3 h-3"/> Save</button><button onClick={()=>setEditingItem(null)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-[#1e1e2a] hover:bg-[#2a2a35] text-[#d4d4d8] transition"><X className="w-3 h-3"/> Cancel</button></div></div>)}</div></div>)})}
                            {!itemLoadedGames.has(game.id) && !itemSearch.trim() && (!itemCatalog[game.id] || itemCatalog[game.id].length === 0) && (
                              <button onClick={() => loadMoreItems(game.id)} className="w-full py-2 text-xs text-[#71717a] hover:text-[#d4d4d8] bg-[#0d0d11]/30 hover:bg-[#0d0d11]/60 rounded transition">
                                Load Items...
                              </button>
                            )}
                            {!itemSearch.trim() && itemLoadedGames.has(game.id) && (itemCatalog[game.id]||[]).length > 0 && (itemCatalog[game.id]||[]).length < (itemTotal[game.id] || 0) && (
                              <button onClick={() => loadMoreItems(game.id)} disabled={loadingMoreItems} className="w-full py-2 text-xs text-[#71717a] hover:text-[#d4d4d8] bg-[#0d0d11]/30 hover:bg-[#0d0d11]/60 rounded transition disabled:opacity-50">
                                {loadingMoreItems ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : `Load More (${(itemCatalog[game.id]||[]).length} of ${itemTotal[game.id]})`}
                              </button>
                            )}
                            {!!itemSearch.trim() && (itemCatalog[game.id]||[]).length > 0 && (itemCatalog[game.id]||[]).length < (itemTotal[game.id] || 0) && (
                              <button onClick={() => loadMoreItems(game.id, itemSearch)} disabled={loadingMoreItems} className="w-full py-2 text-xs text-[#71717a] hover:text-[#d4d4d8] bg-[#0d0d11]/30 hover:bg-[#0d0d11]/60 rounded transition disabled:opacity-50">
                                {loadingMoreItems ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : `Load More (${(itemCatalog[game.id]||[]).length} of ${itemTotal[game.id]})`}
                              </button>
                            )}
                            {itemLoadedGames.has(game.id) && (!itemCatalog[game.id] || itemCatalog[game.id].length === 0) && <p className="text-xs text-[#52525b] py-2">{itemSearch.trim() ? 'No items match your search.' : 'No items in catalog yet.'}</p>}
                          </div>
                        </div>
                      )}

                      {/* === GEAR TEMPLATE TAB === */}
                      {expandedTab === "gear" && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-semibold text-[#d4d4d8]">Gear Slots ({(gearSlots[game.id]||[]).length})</h4>
                            <button onClick={() => { setShowAddSlot(true); setNewSlot({ name: "" }); }} className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-[#1e1e2a] hover:bg-[#2a2a35] text-[#d4d4d8] transition shrink-0"><Plus className="w-3 h-3"/> Add Slot</button>
                          </div>
                          {/* Add Slot Form */}
                          {showAddSlot && (
                            <form onSubmit={e => { e.preventDefault(); handleCreateSlot(e); setShowAddSlot(false); }} className="bg-[#0d0d11]/50 border border-[#1e1e2a] rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between"><span className="text-xs font-medium text-[#fafafa]">New Slot</span><button type="button" onClick={() => setShowAddSlot(false)} className="text-[#71717a] hover:text-[#fafafa]"><X className="w-3.5 h-3.5"/></button></div>
                              <div className="flex gap-2">
                                <input value={newSlot.name} onChange={e => setNewSlot({ name: e.target.value })} required placeholder="Slot name (e.g. Helm)" className="flex-1 px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]" autoFocus />
                                <button type="submit" disabled={!newSlot.name.trim()} className="px-3 py-1.5 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50"><Save className="w-3 h-3"/></button>
                              </div>
                            </form>
                          )}
                          <div className="space-y-1">
                            {(gearSlots[game.id]||[]).sort((a:any,b:any)=>a.sort_order-b.sort_order).map((slot: any) => {
                              const cats = (gearSlotCats[slot.id] || []).map((gc: any) => gc.category);
                              const isEditing = editingSlot?.id === slot.id;
                              const isDragOver = dragOverSlotId === slot.id;
                              const slotIdx = (gearSlots[game.id]||[]).sort((a:any,b:any)=>a.sort_order-b.sort_order).findIndex((s:any)=>s.id===slot.id);
                              const totalSlots = (gearSlots[game.id]||[]).length;
                              return (
                                <div
                                  key={slot.id}
                                  draggable
                                  onDragStart={() => setDragSlotId(slot.id)}
                                  onDragOver={e => { e.preventDefault(); setDragOverSlotId(slot.id); }}
                                  onDragLeave={() => setDragOverSlotId(p => p === slot.id ? null : p)}
                                  onDrop={() => { if (dragSlotId && dragSlotId !== slot.id) moveSlot(dragSlotId, slot.id); setDragSlotId(null); setDragOverSlotId(null); }}
                                  onDragEnd={() => { setDragSlotId(null); setDragOverSlotId(null); }}
                                  className={`bg-[#0d0d11]/30 rounded overflow-hidden transition cursor-grab active:cursor-grabbing ${isDragOver ? 'ring-1 ring-[#fafafa]/30' : ''} ${dragSlotId === slot.id ? 'opacity-40' : ''}`}
                                >
                                  <div className="flex items-center justify-between px-3 py-2 text-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-[#52525b] w-4 text-right tabular-nums">{slot.sort_order}</span>
                                      <Shield className="w-3.5 h-3.5 text-[#52525b]" />
                                      <span className="text-[#fafafa]">{slot.name}</span>
                                      <span className="text-[10px] text-[#52525b]">({cats.length} categories)</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <div className="flex flex-col -space-y-px mr-1">
                                        {slotIdx > 0 && <button onClick={() => { const prev = (gearSlots[game.id]||[]).sort((a:any,b:any)=>a.sort_order-b.sort_order)[slotIdx-1]; if (prev) moveSlot(slot.id, prev.id); }} className="p-0.5 text-[#52525b] hover:text-[#d4d4d8] leading-none" title="Move up"><ChevronUp className="w-3 h-3"/></button>}
                                        {slotIdx < totalSlots - 1 && <button onClick={() => { const next = (gearSlots[game.id]||[]).sort((a:any,b:any)=>a.sort_order-b.sort_order)[slotIdx+1]; if (next) moveSlot(slot.id, next.id); }} className="p-0.5 text-[#52525b] hover:text-[#d4d4d8] leading-none" title="Move down"><ChevronDown className="w-3 h-3"/></button>}
                                      </div>
                                      <button onClick={() => { setAssignCatForSlot(assignCatForSlot === slot.id ? null : slot.id); setAssignCatId(""); }} className="p-1 text-[#52525b] hover:text-emerald-400 transition" title="Assign category"><Plus className="w-3 h-3"/></button>
                                      <button onClick={() => setEditingSlot(isEditing ? null : { id: slot.id, name: slot.name, sort_order: slot.sort_order })} className="p-1 text-[#52525b] hover:text-[#d4d4d8]"><Pencil className="w-3 h-3"/></button>
                                      <button onClick={async () => { if (confirm(`Delete "${slot.name}" and all its assignments?`)) { await deleteGearSlot(slot.id); refreshTemplates(); } }} className="p-1 text-[#52525b] hover:text-[#f87171]"><Trash2 className="w-3 h-3"/></button>
                                    </div>
                                  </div>
                                  {/* Edit Slot */}
                                  {isEditing && editingSlot && (
                                    <div className="bg-[#0d0d11] border-t border-[#1e1e2a] p-3 space-y-2">
                                      <div className="flex gap-2">
                                        <input value={editingSlot.name || ""} onChange={e => setEditingSlot((p: any) => ({ ...p, name: e.target.value }))} className="flex-1 px-2.5 py-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] focus:outline-none focus:border-[#52525b]"/>
                                        <button onClick={handleUpdateSlot} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition"><Save className="w-3 h-3"/> Save</button>
                                      </div>
                                    </div>
                                  )}
                                  {/* Assigned Categories */}
                                  {cats.length > 0 && (
                                    <div className="border-t border-[#1e1e2a] px-3 py-1.5 flex items-center gap-1.5 flex-wrap">
                                      {cats.map((cat: any) => (
                                        <span key={cat.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1e1e2a] text-[10px] text-[#d4d4d8]">
                                          {cat.parent_id ? <><span className="text-[#52525b]">{cat.parent?.name} →</span> </> : null}
                                          {cat.name}
                                          <button onClick={async () => {
                                            const gc = (gearSlotCats[slot.id] || []).find((g: any) => g.category_id === cat.id);
                                            if (gc) { await removeGearSlotCategory(gc.id); refreshTemplates(); }
                                          }} className="text-[#52525b] hover:text-[#f87171]"><X className="w-2.5 h-2.5"/></button>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {/* Assign Category Form */}
                                  {assignCatForSlot === slot.id && (
                                    <div className="bg-[#0d0d11] border-t border-[#1e1e2a] p-2 flex gap-2">
                                      <select value={assignCatId} onChange={e => setAssignCatId(e.target.value)} className="flex-1 px-2 py-1 bg-[#0d0d11] border border-[#1e1e2a] rounded text-xs text-[#fafafa] focus:outline-none focus:border-[#52525b]">
                                        <option value="">-- Select category --</option>
                                        {(categories[game.id]||[]).filter(c => !c.parent_id).map(cat => {
                                          const subs = (categories[game.id]||[]).filter(c => c.parent_id === cat.id && !cats.some((ac:any) => ac.id === c.id));
                                          if (subs.length === 0) return null;
                                          return (
                                          <optgroup key={cat.id} label={cat.name}>
                                            {subs.map(sub => (
                                              <option key={sub.id} value={sub.id}>{sub.name}</option>
                                            ))}
                                          </optgroup>
                                        )})}
                                      </select>
                                      <button onClick={() => handleCreateSubclass(slot.id)} disabled={!assignCatId} className="px-2 py-1 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50"><Plus className="w-3 h-3"/></button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {(!gearSlots[game.id] || gearSlots[game.id].length === 0) && (
                              <p className="text-xs text-[#52525b] py-2">No gear slots defined. Add a slot like "Helm" or "Weapon" to get started.</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* === ITEM REVIEW TAB === */}
                      {expandedTab === "review" && (
                        <ItemReviewTab gameSlug={game.slug || ""} onCountChange={(count) => setPendingCounts(p => ({ ...p, [game.id]: count }))} />
                      )}

                      {/* === APPROVED ITEMS TAB === */}
                      {expandedTab === "approved" && (
                        <ApprovedItemsTab gameSlug={game.slug || ""} onCountChange={(count) => setApprovedCounts(p => ({ ...p, [game.id]: count }))} />
                      )}

                    </div>
                  </>
                )}
              </div>
            )}
            </div>
          </div>
        ))}
        {games.length === 0 && <p className="text-center text-sm text-[#71717a] py-8">No games configured yet. Add your first game above.</p>}
      </div>

      {deleteConfirm && (
        <ConfirmDialog
          open={true}
          title={`Delete ${deleteConfirm.type === "game" ? "Game" : deleteConfirm.type === "boss" ? "Boss Template" : deleteConfirm.type === "item" ? "Item" : deleteConfirm.type === "category" ? "Category" : deleteConfirm.type === "rarity" ? "Rarity" : "Activity Template"}`}
          message={deleteConfirm.type === "game" ? `Are you sure you want to delete "${deleteConfirm.name}"? This will also remove all associated templates and servers.` : `Delete "${deleteConfirm.name}"${deleteConfirm.gameName ? ` from ${deleteConfirm.gameName}` : ""}?`}
          confirmLabel="Delete"
          onConfirm={deleteConfirm.type === "game" ? handleDeleteGame : deleteConfirm.type === "boss" ? handleDeleteBoss : deleteConfirm.type === "item" ? handleDeleteItem : deleteConfirm.type === "category" ? handleDeleteCategory : deleteConfirm.type === "rarity" ? handleDeleteRarity : handleDeleteActivity}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {visibilityConfirm && (
        <ConfirmDialog
          open={true}
          title={visibilityConfirm.next ? "Show Game" : "Hide Game"}
          message={visibilityConfirm.next ? `Show "${visibilityConfirm.name}" in the Create Server page? Users will be able to create servers for this game.` : `Hide "${visibilityConfirm.name}" from the Create Server page? It will no longer appear as an option when creating new servers.`}
          confirmLabel={visibilityConfirm.next ? "Show" : "Hide"}
          onConfirm={confirmToggleVisibility}
          onCancel={() => setVisibilityConfirm(null)}
        />
      )}
    </div>
  );
}
