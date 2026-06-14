import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchItemsPaginated, fetchItems, createItem, deleteItem, updateItem, searchItemsByGame,
  fetchDistributions, createDistribution, deleteDistribution,
  fetchItemDistributionStats, fetchTopRecipients,
  fetchMembers, isSupabaseConfigured,
  supabase as supabaseClient,
  fetchItemCategories, fetchItemRarities,
} from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import type { Item, Distribution, ItemRarity } from "@/types";
import {
  Package, Plus, Trash2, Loader2, Search, Gift, History, BarChart3,
  X, ChevronRight, ArrowLeft, Image, Star, Upload, Minus, Pencil,
} from "lucide-react";

const RARITY_COLORS: Record<ItemRarity, string> = {
  common: "#71717a",
  uncommon: "#22c55e",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#f59e0b",
  mythic: "#ef4444",
};

const RARITY_ORDER: ItemRarity[] = ["mythic", "legendary", "epic", "rare", "uncommon", "common"];

export function InventoryView() {
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();
  const [tab, setTab] = useState<"catalog" | "history" | "analytics">("catalog");

  // Track whether we need the full items list (history/analytics tabs or distribute modal)
  const [needFullItems, setNeedFullItems] = useState(false);
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["items", serverId],
    queryFn: () => fetchItems(serverId),
    enabled: configured && (tab !== "catalog" || needFullItems),
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members", serverId],
    queryFn: () => fetchMembers(serverId),
    enabled: configured,
  });

  const { data: distributions = [], isLoading: distLoading } = useQuery({
    queryKey: ["distributions", serverId],
    queryFn: () => fetchDistributions(serverId),
    enabled: configured,
  });

  const { data: itemStats = [] } = useQuery({
    queryKey: ["itemDistributionStats", serverId],
    queryFn: () => fetchItemDistributionStats(serverId),
    enabled: configured && tab === "analytics",
  });

  const { data: topRecipients = [] } = useQuery({
    queryKey: ["topRecipients", serverId],
    queryFn: () => fetchTopRecipients(serverId),
    enabled: configured && tab === "analytics",
  });

  // ── Create Item Modal ──
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemRarity, setNewItemRarity] = useState<ItemRarity>("common");
  const [newItemImage, setNewItemImage] = useState<File | null>(null);
  const [newItemImagePreview, setNewItemImagePreview] = useState<string | null>(null);
  const [imageDragOver, setImageDragOver] = useState(false);
  const [newItemCategory, setNewItemCategory] = useState("");
  const [newItemParent, setNewItemParent] = useState("");
  useEscapeKey(() => { setShowCreateItem(false); resetCreateForm(); }, showCreateItem);

  // Fetch categories & rarities for the create modal
  const { data: gameCategories = [] } = useQuery({
    queryKey: ["itemCategories", serverId],
    queryFn: async () => {
      if (!serverId) return [];
      const { data: srv } = await supabaseClient.from("servers").select("game").eq("id", serverId).single();
      if (!srv?.game) return [];
      return fetchItemCategories(srv.game).catch(() => []);
    },
    enabled: showCreateItem,
  });
  const { data: gameRarities = [] } = useQuery({
    queryKey: ["itemRarities", serverId],
    queryFn: async () => {
      if (!serverId) return [];
      const { data: srv } = await supabaseClient.from("servers").select("game").eq("id", serverId).single();
      if (!srv?.game) return [];
      return fetchItemRarities(srv.game).catch(() => []);
    },
    enabled: showCreateItem,
  });

  // ── Edit Item Modal ──
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editRarity, setEditRarity] = useState<ItemRarity>("common");
  const [editImage, setEditImage] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editDragOver, setEditDragOver] = useState(false);
  useEscapeKey(() => setEditingItem(null), !!editingItem);

  const startEdit = (item: Item) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditDesc(item.description || "");
    setEditRarity(item.rarity);
    setEditImage(null);
    setEditImagePreview(item.image_url || null);
  };

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingItem) return;
      let imageUrl = editingItem.image_url;
      if (editImage && serverId) {
        const { uploadItemImage: uploadItemImg } = await import("@/lib/supabase");
        imageUrl = await uploadItemImg(serverId, editName || editingItem.name, editImage);
      }
      return updateItem(editingItem.id, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        rarity: editRarity,
        ...(imageUrl !== editingItem.image_url ? { image_url: imageUrl || undefined } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", serverId] });
      refreshCatalog();
      setEditingItem(null);
    },
  });

  const resetCreateForm = () => {
    setNewItemName("");
    setNewItemDesc("");
    setNewItemRarity("common");
    setNewItemImage(null);
    setNewItemImagePreview(null);
    setNewItemCategory("");
    setNewItemParent("");
  };

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setNewItemImage(file);
    const reader = new FileReader();
    reader.onload = () => setNewItemImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleImageFileForEdit = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setEditImage(file);
    const reader = new FileReader();
    reader.onload = () => setEditImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const createItemMutation = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined;
      if (newItemImage && serverId) {
        const { uploadItemImage: uploadItemImg } = await import("@/lib/supabase");
        imageUrl = await uploadItemImg(serverId, newItemName || "item", newItemImage);
      }
      return createItem({
        server_id: serverId!,
        name: newItemName,
        description: newItemDesc || undefined,
        rarity: newItemRarity,
        image_url: imageUrl,
        category_id: newItemCategory || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", serverId] });
      refreshCatalog();
      setShowCreateItem(false);
      resetCreateForm();
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      if (msg.includes("duplicate") || msg.includes("idx_items_game_name")) {
        alert(`"${newItemName}" already exists in the game catalog. It may have been added by another server.`);
      } else {
        alert(`Failed to create item: ${msg}`);
      }
    },
  });

  // ── Distribute Modal ──
  const [showDistribute, setShowDistribute] = useState(false);
  const [distItemId, setDistItemId] = useState("");
  const [distMemberId, setDistMemberId] = useState("");
  const [distQuantity, setDistQuantity] = useState(1);
  const [distReason, setDistReason] = useState("");
  const [distMemberSearch, setDistMemberSearch] = useState("");
  useEscapeKey(() => setShowDistribute(false), showDistribute);

  // Trigger full items load when distribution modal opens
  useEffect(() => {
    if (showDistribute) setNeedFullItems(true);
  }, [showDistribute]);

  // Distribution counts (computed before filteredDistItems which depends on them)
  const memberDistCounts: Record<string, number> = {};
  const itemDistCounts: Record<string, number> = {};
  distributions.forEach(d => {
    memberDistCounts[d.member_id] = (memberDistCounts[d.member_id] || 0) + d.quantity;
    itemDistCounts[d.item_id] = (itemDistCounts[d.item_id] || 0) + d.quantity;
  });

  const distItem = items.find(i => i.id === distItemId);
  const filteredDistMembers = members.filter(m =>
    !distMemberSearch || m.name.toLowerCase().includes(distMemberSearch.toLowerCase())
  );

  const distributeMutation = useMutation({
    mutationFn: () => {
      const item = items.find(i => i.id === distItemId);
      const member = members.find(m => m.id === distMemberId);
      return createDistribution({
        server_id: serverId!,
        item_id: distItemId,
        member_id: distMemberId,
        player_name: member?.name ?? "",
        quantity: distQuantity,
        reason: distReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["distributions", serverId] });
      queryClient.invalidateQueries({ queryKey: ["itemDistributionStats", serverId] });
      queryClient.invalidateQueries({ queryKey: ["topRecipients", serverId] });
      setShowDistribute(false);
      setDistItemId("");
      setDistMemberId("");
      setDistQuantity(1);
      setDistReason("");
    },
  });

  const deleteDistMutation = useMutation({
    mutationFn: (id: string) => deleteDistribution(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["distributions", serverId] });
      queryClient.invalidateQueries({ queryKey: ["itemDistributionStats", serverId] });
      queryClient.invalidateQueries({ queryKey: ["topRecipients", serverId] });
    },
  });

  const [itemSearch, setItemSearch] = useState("");
  const prevSearchRef = useRef(itemSearch);
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);

  // Lazy-loading state for catalog
  const [catalogItems, setCatalogItems] = useState<Item[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const ITEMS_PER_PAGE = 50;
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCatalogPage = async (offset: number, search?: string) => {
    if (!serverId) return;
    const isSearch = !!(search && search.trim());
    setLoadingMore(true);
    try {
      const { items: newItems, total } = await fetchItemsPaginated(serverId, ITEMS_PER_PAGE, offset, search);
      setCatalogItems(prev => offset === 0 ? newItems : [...prev, ...newItems]);
      setCatalogTotal(total);
      if (!isSearch) setCatalogLoaded(true);
    } catch (err) {
      console.error("Failed to load catalog items:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Load first page on mount / server change
  useEffect(() => {
    if (!configured || !serverId) return;
    setCatalogItems([]);
    setCatalogTotal(0);
    setCatalogLoaded(false);
    loadCatalogPage(0);
  }, [serverId, configured]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced server-side search
  useEffect(() => {
    if (!catalogLoaded) return;
    if (itemSearch === prevSearchRef.current) return;
    prevSearchRef.current = itemSearch;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadCatalogPage(0, itemSearch.trim() || undefined);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [itemSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh catalog after mutations
  const refreshCatalog = () => {
    setCatalogItems([]);
    setCatalogTotal(0);
    setCatalogLoaded(false);
    loadCatalogPage(0, itemSearch.trim() || undefined);
  };

  // Use lazy-loaded catalog items for display (server-side search handled in loadCatalogPage)
  const displayItems = catalogItems.filter(i => {
    if (rarityFilter && i.rarity?.toLowerCase() !== rarityFilter) return false;
    return true;
  });

  // Get unique rarities from all items (from useQuery) for filter chips
  const availableRarities = [...new Set(items.map(i => i.rarity?.toLowerCase()).filter(Boolean))] as string[];

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  // Group distributions by date for history view
  const groupedDistributions = distributions.reduce<Record<string, Distribution[]>>((acc, d) => {
    const date = new Date(d.distributed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (!acc[date]) acc[date] = [];
    acc[date].push(d);
    return acc;
  }, {});

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#18181b] border border-[#27272a]">
          <Package className="w-5 h-5 text-[#fafafa]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#fafafa]">Inventory</h2>
          <p className="text-sm text-[#a1a1aa]">Item catalog & distribution tracking</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#18181b] rounded-lg p-0.5 gap-0.5">
        {(["catalog", "history", "analytics"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition ${
              tab === t ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
            }`}
          >
            {t === "catalog" && <Package className="w-3.5 h-3.5" />}
            {t === "history" && <History className="w-3.5 h-3.5" />}
            {t === "analytics" && <BarChart3 className="w-3.5 h-3.5" />}
            <span className="capitalize">{t}</span>
          </button>
        ))}
      </div>

      {/* ── Catalog Tab ── */}
      {tab === "catalog" && (
        <div className="space-y-4">
          {/* Search + Rarity Filters */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52525b]" />
                <input
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Search items..."
                  className="w-full pl-9 pr-3 py-2.5 bg-[#18181b] border border-[#27272a] rounded-xl text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
                />
              </div>
              <button
                onClick={() => setShowCreateItem(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] rounded-xl text-xs font-medium transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add Item</span>
              </button>
            </div>
            {availableRarities.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setRarityFilter(null)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition ${
                    !rarityFilter ? "bg-[#fafafa] text-[#09090b]" : "bg-[#27272a] text-[#a1a1aa] hover:text-[#e4e4e7]"
                  }`}
                >
                  All
                </button>
                {availableRarities.map(r => {
                  const color = RARITY_COLORS[r as ItemRarity] || "#71717a";
                  return (
                    <button
                      key={r}
                      onClick={() => setRarityFilter(rarityFilter === r ? null : r)}
                      className="px-2.5 py-1 rounded-md text-[10px] font-medium capitalize transition"
                      style={{
                        backgroundColor: rarityFilter === r ? `${color}20` : "#27272a",
                        color: rarityFilter === r ? color : "#a1a1aa",
                        border: `1px solid ${rarityFilter === r ? `${color}40` : "transparent"}`,
                      }}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!catalogLoaded ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : displayItems.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-10 h-10 text-[#27272a] mx-auto mb-3" />
              <p className="text-sm text-[#52525b]">
                {itemSearch || rarityFilter ? "No items match your filters." : "No items in catalog yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {displayItems.map(item => {
                const rarityColor = RARITY_COLORS[item.rarity?.toLowerCase() as ItemRarity] || "#71717a";
                const isCatalog = !item.server_id;
                return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2.5 hover:border-[#3f3f46] transition-all duration-200 group"
                >
                  {/* Image */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${rarityColor}15` }}
                  >
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="w-7 h-7 rounded object-cover" />
                    ) : (
                      <Star className="w-4 h-4" style={{ color: rarityColor }} />
                    )}
                  </div>

                  {/* Name + Rarity */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[#fafafa] truncate leading-tight">{item.name}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: rarityColor }}
                      >
                        {item.rarity}
                        {isCatalog && <span className="ml-1 text-[#8b5cf6]/70 font-normal normal-case tracking-normal">· catalog</span>}
                      </span>
                      {!isCatalog && item.created_by_username && (
                        <span className="text-[9px] text-[#52525b] truncate">by {item.created_by_username}</span>
                      )}
                      {item.status === "pending" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Gift button */}
                  <button
                    onClick={() => { setDistItemId(item.id); setShowDistribute(true); }}
                    className="p-2 rounded-lg hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition shrink-0"
                    title="Distribute"
                  >
                    <Gift className="w-4 h-4" />
                  </button>
                </div>
              );})}
              </div>
              {!itemSearch.trim() && catalogLoaded && displayItems.length > 0 && displayItems.length < catalogTotal && (
                <button onClick={() => loadCatalogPage(catalogItems.length)} disabled={loadingMore} className="w-full py-2.5 text-xs text-[#71717a] hover:text-[#d4d4d8] bg-[#18181b] hover:bg-[#222] border border-[#27272a] rounded-xl transition disabled:opacity-50">
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Load More (${catalogItems.length} of ${catalogTotal})`}
                </button>
              )}
              {!!itemSearch.trim() && displayItems.length > 0 && displayItems.length < catalogTotal && (
                <button onClick={() => loadCatalogPage(catalogItems.length, itemSearch)} disabled={loadingMore} className="w-full py-2.5 text-xs text-[#71717a] hover:text-[#d4d4d8] bg-[#18181b] hover:bg-[#222] border border-[#27272a] rounded-xl transition disabled:opacity-50">
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Load More (${catalogItems.length} of ${catalogTotal})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === "history" && (
        <div className="space-y-6">
          {distLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : Object.keys(groupedDistributions).length === 0 ? (
            <div className="text-center py-16">
              <History className="w-12 h-12 text-[#27272a] mx-auto mb-3" />
              <p className="text-sm text-[#52525b]">No distributions yet.</p>
              <p className="text-xs text-[#3f3f46] mt-1">Items given to players will appear here.</p>
            </div>
          ) : (
            Object.entries(groupedDistributions).map(([date, dists]) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-[#27272a]" />
                  <span className="text-[11px] text-[#52525b] font-medium uppercase tracking-wider shrink-0">{date}</span>
                  <span className="text-[10px] text-[#3f3f46]">{dists.length} distribution{dists.length !== 1 ? "s" : ""}</span>
                  <div className="h-px flex-1 bg-[#27272a]" />
                </div>
                <div className="space-y-1.5">
                  {dists.map(d => {
                    const item = items.find(i => i.id === d.item_id);
                    const rc = item ? RARITY_COLORS[item.rarity] || "#a1a1aa" : "#71717a";
                    return (
                      <div key={d.id} className="bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2.5 flex items-center gap-3 group hover:border-[#3f3f46] transition-all">
                        {/* Item thumbnail */}
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${rc}18` }}>
                          {item?.image_url ? (
                            <img src={item.image_url} alt="" className="w-7 h-7 rounded object-cover" />
                          ) : (
                            <Gift className="w-4 h-4" style={{ color: rc }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate" style={{ color: rc }}>{item?.name ?? "Unknown Item"}</p>
                            {item && (
                              <span className="text-[9px] px-1.5 py-px rounded font-medium uppercase shrink-0" style={{ color: rc, backgroundColor: `${rc}18` }}>{item.rarity}</span>
                            )}
                            <span className="text-[11px] text-[#52525b] font-mono shrink-0">×{d.quantity}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-[#71717a]">→</span>
                            <span className="text-[11px] text-[#a1a1aa] font-medium">{d.player_name}</span>
                            {d.reason && (
                              <span className="text-[10px] text-[#52525b] truncate">· {d.reason}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteDistMutation.mutate(d.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#52525b] hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0"
                          title="Delete distribution"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Analytics Tab ── */}
      {tab === "analytics" && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-3.5">
              <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Total Gifts</p>
              <p className="text-xl font-bold text-[#fafafa] mt-1 font-mono tabular-nums">{distributions.length}</p>
            </div>
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-3.5">
              <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Unique Items</p>
              <p className="text-xl font-bold text-[#fafafa] mt-1 font-mono tabular-nums">{itemStats.length}</p>
            </div>
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-3.5">
              <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Recipients</p>
              <p className="text-xl font-bold text-[#fafafa] mt-1 font-mono tabular-nums">{topRecipients.length}</p>
            </div>
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-3.5">
              <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Total Quantity</p>
              <p className="text-xl font-bold text-[#fafafa] mt-1 font-mono tabular-nums">{itemStats.reduce((s, x) => s + (x.total_quantity || 0), 0)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Items */}
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-[#fafafa] mb-4 flex items-center gap-2">
                <Package className="w-4 h-4 text-[#a1a1aa]" />
                Most Distributed Items
              </h3>
              {itemStats.length === 0 ? (
                <p className="text-sm text-[#52525b] text-center py-8">No data yet.</p>
              ) : (
                <div className="space-y-1">
                  {itemStats.map((stat, i) => {
                    const item = items.find(x => x.id === stat.item_id);
                    const rc = item ? RARITY_COLORS[item.rarity] || "#a1a1aa" : "#71717a";
                    const maxQty = itemStats[0]?.total_quantity || 1;
                    const pct = Math.max(4, (stat.total_quantity / maxQty) * 100);
                    return (
                      <div key={stat.item_id} className="flex items-center gap-3 py-1.5 group">
                        <span className="text-[10px] font-mono text-[#3f3f46] w-4 shrink-0 text-right">{i + 1}</span>
                        <div className="w-7 h-7 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${rc}18` }}>
                          {item?.image_url ? (
                            <img src={item.image_url} alt="" className="w-5 h-5 rounded object-cover" />
                          ) : (
                            <Package className="w-3.5 h-3.5" style={{ color: rc }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <p className="text-xs text-[#fafafa] truncate">{stat.item_name}</p>
                            <span className="text-xs font-mono font-semibold text-[#a1a1aa] shrink-0 ml-2">×{stat.total_quantity}</span>
                          </div>
                          <div className="h-1 bg-[#27272a] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: rc }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top Recipients */}
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-[#fafafa] mb-4 flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#a1a1aa]" />
                Top Recipients
              </h3>
              {topRecipients.length === 0 ? (
                <p className="text-sm text-[#52525b] text-center py-8">No data yet.</p>
              ) : (
                <div className="space-y-1">
                  {topRecipients.map((r, i) => {
                    const maxItems = topRecipients[0]?.total_items || 1;
                    const pct = Math.max(4, (r.total_items / maxItems) * 100);
                    return (
                      <div key={r.member_id} className="flex items-center gap-3 py-1.5 group">
                        <span className="text-[10px] font-mono text-[#3f3f46] w-4 shrink-0 text-right">{i + 1}</span>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                          i === 0 ? 'bg-amber-500/20 text-amber-400' :
                          i === 1 ? 'bg-slate-400/20 text-slate-300' :
                          i === 2 ? 'bg-orange-600/20 text-orange-400' :
                          'bg-[#27272a] text-[#71717a]'
                        }`}>
                          {i < 3 ? ["🥇","🥈","🥉"][i] : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <p className="text-xs text-[#fafafa] truncate">{r.player_name}</p>
                            <span className="text-xs font-mono font-semibold text-[#a1a1aa] shrink-0 ml-2">{r.total_items}</span>
                          </div>
                          <div className="h-1 bg-[#27272a] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${
                              i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-orange-600' : 'bg-[#52525b]'
                            }`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create Item Modal ── */}
      {showCreateItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowCreateItem(false); resetCreateForm(); }}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}
            onPaste={async () => {
              try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                  const imageType = item.types.find(t => t.startsWith("image/"));
                  if (imageType) {
                    const blob = await item.getType(imageType);
                    const file = new File([blob], "pasted-image.png", { type: blob.type });
                    handleImageFile(file);
                    break;
                  }
                }
              } catch {}
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#fafafa]">Add Item</h3>
              <button onClick={() => { setShowCreateItem(false); resetCreateForm(); }} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Name</label>
                <input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="e.g. Dragon Heart" className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]" autoFocus />
              </div>
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Description (optional)</label>
                <input value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} placeholder="Brief description" className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]" />
              </div>

              {/* Category */}
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Category</label>
                <select
                  value={newItemParent}
                  onChange={e => {
                    const pid = e.target.value;
                    setNewItemParent(pid);
                    const hasSubs = (gameCategories as any[]).some((c: any) => c.parent_id === pid);
                    setNewItemCategory(pid && !hasSubs ? pid : "");
                  }}
                  className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b]"
                >
                  <option value="">None</option>
                  {(gameCategories as any[]).filter((c: any) => !c.parent_id).map((cat: any) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              {newItemParent && (gameCategories as any[]).some((c: any) => c.parent_id === newItemParent) && (
                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Subcategory</label>
                  <select
                    value={newItemCategory}
                    onChange={e => setNewItemCategory(e.target.value || "")}
                    className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b]"
                  >
                    <option value="">-- Select --</option>
                    {(gameCategories as any[]).filter((c: any) => c.parent_id === newItemParent).map((sub: any) => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Image Upload */}
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Image (optional)</label>
                {newItemImagePreview ? (
                  <div className="mt-1 relative rounded-lg overflow-hidden bg-[#09090b] border border-[#27272a]">
                    <img src={newItemImagePreview} alt="Preview" className="w-full h-32 object-contain" />
                    <button onClick={() => { setNewItemImage(null); setNewItemImagePreview(null); }} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-[#fafafa] hover:bg-black/80 transition">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`mt-1 border-2 border-dashed rounded-lg p-4 text-center transition cursor-pointer ${imageDragOver ? "border-[#52525b] bg-[#27272a]/50" : "border-[#27272a] hover:border-[#3f3f46]"}`}
                    onDragOver={e => { e.preventDefault(); setImageDragOver(true); }}
                    onDragLeave={() => setImageDragOver(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setImageDragOver(false);
                      const f = e.dataTransfer.files[0];
                      if (f) handleImageFile(f);
                    }}
                    onClick={() => document.getElementById("item-image-upload")?.click()}
                  >
                    <Upload className="w-5 h-5 text-[#52525b] mx-auto mb-1" />
                    <p className="text-[10px] text-[#52525b]"><span className="text-[#71717a] font-medium">Click to upload</span> or drag &amp; drop</p>
                    <p className="text-[9px] text-[#52525b]/50 mt-0.5">or <kbd className="px-1 py-0.5 rounded bg-[#27272a] text-[#71717a] text-[9px]">Ctrl+V</kbd> paste from clipboard</p>
                  </div>
                )}
                <input id="item-image-upload" type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleImageFile(f);
                  e.target.value = "";
                }} />
              </div>

              {/* Rarity */}
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Rarity</label>
                <div className="flex gap-1.5 mt-1">
                  {(gameRarities as any[]).length > 0 ? (
                    (gameRarities as any[]).sort((a: any, b: any) => a.sort_order - b.sort_order).map((r: any) => (
                      <button
                        key={r.id}
                        onClick={() => setNewItemRarity(r.name as ItemRarity)}
                        className="flex-1 py-1.5 rounded-md text-[10px] font-medium capitalize transition border"
                        style={{
                          borderColor: newItemRarity === r.name ? r.color : "#27272a",
                          color: newItemRarity === r.name ? r.color : "#52525b",
                          backgroundColor: newItemRarity === r.name ? r.color + "15" : "transparent",
                        }}
                      >
                        {r.name}
                      </button>
                    ))
                  ) : (
                    RARITY_ORDER.map(r => (
                      <button
                        key={r}
                        onClick={() => setNewItemRarity(r)}
                        className="flex-1 py-1.5 rounded-md text-[10px] font-medium capitalize transition border"
                        style={{
                          borderColor: newItemRarity === r ? RARITY_COLORS[r] : "#27272a",
                          color: newItemRarity === r ? RARITY_COLORS[r] : "#52525b",
                          backgroundColor: newItemRarity === r ? `${RARITY_COLORS[r]}15` : "transparent",
                        }}
                      >
                        {r}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <button
                onClick={() => createItemMutation.mutate()}
                disabled={!newItemName.trim() || createItemMutation.isPending}
                className="w-full py-2 bg-[#fafafa] text-[#09090b] rounded-lg text-sm font-medium hover:bg-[#e4e4e7] transition disabled:opacity-50"
              >
                {createItemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Item Modal ── */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditingItem(null)}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#fafafa]">Edit Item</h3>
              <button onClick={() => setEditingItem(null)} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b]" autoFocus />
              </div>
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Description</label>
                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b]" />
              </div>
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Rarity</label>
                <div className="flex gap-1.5 mt-1">
                  {RARITY_ORDER.map(r => (
                    <button key={r} onClick={() => setEditRarity(r)}
                      className="flex-1 py-1.5 rounded-md text-[10px] font-medium capitalize transition border"
                      style={{
                        borderColor: editRarity === r ? RARITY_COLORS[r] : "#27272a",
                        color: editRarity === r ? RARITY_COLORS[r] : "#52525b",
                        backgroundColor: editRarity === r ? `${RARITY_COLORS[r]}15` : "transparent",
                      }}>{r}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Image</label>
                {editImagePreview ? (
                  <div className="mt-1 relative rounded-lg overflow-hidden bg-[#09090b] border border-[#27272a]">
                    <img src={editImagePreview} alt="Preview" className="w-full h-32 object-contain" />
                    <button onClick={() => { setEditImage(null); setEditImagePreview(null); }}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-[#fafafa] hover:bg-black/80 transition"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <div className={`mt-1 border-2 border-dashed rounded-lg p-4 text-center transition cursor-pointer ${editDragOver ? "border-[#52525b] bg-[#27272a]/50" : "border-[#27272a] hover:border-[#3f3f46]"}`}
                    onDragOver={(e) => { e.preventDefault(); setEditDragOver(true); }}
                    onDragLeave={() => setEditDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setEditDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleImageFileForEdit(f); }}
                    onClick={() => document.getElementById("edit-image-upload")?.click()}>
                    <Upload className="w-5 h-5 text-[#52525b] mx-auto mb-1" />
                    <p className="text-[10px] text-[#52525b]"><span className="text-[#71717a] font-medium">Click to upload</span> or drag & drop</p>
                  </div>
                )}
                <input id="edit-image-upload" type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFileForEdit(f); e.target.value = ""; }} />
              </div>
              <button onClick={() => editMutation.mutate()} disabled={!editName.trim() || editMutation.isPending}
                className="w-full py-2 bg-[#fafafa] text-[#09090b] rounded-lg text-sm font-medium hover:bg-[#e4e4e7] transition disabled:opacity-50">
                {editMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Distribute Modal ── */}
      {showDistribute && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDistribute(false)}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-t-xl sm:rounded-xl p-5 w-full max-w-md mx-0 sm:mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[#fafafa]">Distribute Item</h3>
                {distItem && (
                  <p className="text-[11px] text-[#a1a1aa] mt-0.5 flex items-center gap-1.5">
                    <span className="capitalize font-medium" style={{ color: RARITY_COLORS[distItem.rarity] }}>{distItem.rarity}</span>
                    <span>·</span>
                    <span>{distItem.name}</span>
                  </p>
                )}
              </div>
              <button onClick={() => setShowDistribute(false)} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              {/* Member search + select */}
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Recipient</label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
                  <input
                    value={distMemberSearch}
                    onChange={(e) => setDistMemberSearch(e.target.value)}
                    placeholder="Search member..."
                    className="w-full pl-8 pr-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
                  />
                </div>
                <div className="mt-1.5 max-h-32 overflow-y-auto space-y-0.5">
                  {filteredDistMembers.slice(0, 20).map(m => {
                    const distCount = memberDistCounts[m.id] || 0;
                    return (
                      <button key={m.id}
                        onClick={() => { setDistMemberId(m.id); setDistMemberSearch(m.name); }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition text-left ${distMemberId === m.id ? "bg-[#fafafa]/10 text-[#fafafa] border border-[#fafafa]/20" : "text-[#a1a1aa] hover:bg-[#09090b] hover:text-[#d4d4d8]"}`}>
                        <span className="flex-1 truncate">{m.name}</span>
                        <span className="text-[10px] text-[#52525b] font-mono">{distCount} items</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Quantity</label>
                  <div className="flex items-center gap-1 mt-1">
                    <button onClick={() => setDistQuantity(q => Math.max(1, q - 1))}
                      className="p-2 rounded-lg bg-[#09090b] border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input type="number" min={1} value={distQuantity}
                      onChange={(e) => setDistQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="flex-1 px-2 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] text-center focus:outline-none focus:border-[#52525b]" />
                    <button onClick={() => setDistQuantity(q => q + 1)}
                      className="p-2 rounded-lg bg-[#09090b] border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Reason</label>
                  <input value={distReason} onChange={(e) => setDistReason(e.target.value)}
                    placeholder="e.g. Guild Boss"
                    className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]" />
                </div>
              </div>

              <button onClick={() => distributeMutation.mutate()}
                disabled={!distItemId || !distMemberId || distributeMutation.isPending}
                className="w-full py-2.5 bg-[#fafafa] text-[#09090b] rounded-lg text-sm font-semibold hover:bg-[#e4e4e7] transition disabled:opacity-40 flex items-center justify-center gap-2">
                {distributeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                {distributeMutation.isPending ? "Distributing..." : "Distribute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
