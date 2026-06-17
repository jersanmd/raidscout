import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchItemsPaginated, fetchItems, createItem, deleteItem, updateItem, searchItemsByGame,
  fetchDistributions, createDistribution, deleteDistribution,
  fetchItemDistributionStats, fetchTopRecipients,
  fetchMembers, isSupabaseConfigured,
  supabase as supabaseClient,
  fetchItemCategories, fetchItemRarities, fetchGuilds,
  fetchCollections, createCollection, deleteCollection,
  fetchCollectionItems, addItemToCollection, removeItemFromCollection, reorderCollectionItem,
  fetchServerDistributions,
  fetchManualOwnership, setManualOwnership, removeManualOwnership,
} from "@/lib/supabase";
import { useServerId, useServer } from "@/contexts/ServerContext";
import { ExpiredGate } from "@/components/ExpiredGate";
import { useToast } from "@/contexts/ToastContext";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { guildColor } from "@/lib/constants";
import type { Item, Distribution, ItemRarity } from "@/types";
import {
  Package, Plus, Trash2, Loader2, Search, Gift, History, BarChart3,
  X, ChevronRight, ChevronUp, ChevronDown, ArrowLeft, Image, Star, Upload, Minus, Pencil, Box, Users, Check,
  Sword, Shield, Wand, Skull, Flame, Sparkles, Zap, Heart, Eye, Anchor, Footprints, Swords, Crosshair, Bone,
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

const CLASS_ICONS = [
  { name: "Sword", icon: Sword, label: "Combat / DPS" },
  { name: "Shield", icon: Shield, label: "Defense / Tank" },
  { name: "Wand", icon: Wand, label: "Magic / Caster" },
  { name: "Skull", icon: Skull, label: "Dark / Necromancer" },
  { name: "Flame", icon: Flame, label: "Fire / Pyro" },
  { name: "Sparkles", icon: Sparkles, label: "Light / Healer" },
  { name: "Zap", icon: Zap, label: "Lightning / Storm" },
  { name: "Heart", icon: Heart, label: "Support / Healer" },
  { name: "Eye", icon: Eye, label: "Mystic / Seer" },
  { name: "Anchor", icon: Anchor, label: "Defense / Anchor" },
  { name: "Footprints", icon: Footprints, label: "Scout / Rogue" },
  { name: "Swords", icon: Swords, label: "Dual Wield / Blades" },
  { name: "Crosshair", icon: Crosshair, label: "Ranged / Archer" },
  { name: "Bone", icon: Bone, label: "Necromancer / Dark" },
];

const getClassIcon = (iconName: string) => {
  const entry = CLASS_ICONS.find(c => c.name === iconName);
  return entry ? entry.icon : null;
};

export function InventoryView() {
  const serverId = useServerId();
  const { currentServer } = useServer();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  if (currentServer?.isExpired) return <ExpiredGate page="Inventory" />;

  const [tab, setTab] = useState<"catalog" | "collections" | "history" | "analytics" | "recipients">("catalog");

  // ── Collections state ──
  const [collectionMode, setCollectionMode] = useState<"list" | "view" | "matrix">("list");
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionItemSearch, setCollectionItemSearch] = useState("");
  const [collCatFilter, setCollCatFilter] = useState("");
  const [collRarityFilter, setCollRarityFilter] = useState("");

  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ["collections", serverId],
    queryFn: () => fetchCollections(serverId!),
    enabled: configured && !!serverId && tab === "collections",
  });

  const { data: collItems = [], isLoading: collItemsLoading } = useQuery({
    queryKey: ["collectionItems", selectedCollection],
    queryFn: () => fetchCollectionItems(selectedCollection!),
    enabled: !!selectedCollection,
  });

  // All distributions for ownership checking
  const { data: allDists = [] } = useQuery({
    queryKey: ["allDists", serverId],
    queryFn: () => fetchServerDistributions(serverId!),
    enabled: configured && !!serverId && tab === "collections" && collectionMode === "matrix",
  });

  // Manual ownership overrides
  const { data: manualOwned = [] } = useQuery({
    queryKey: ["manualOwnership", selectedCollection],
    queryFn: () => fetchManualOwnership(selectedCollection!),
    enabled: !!selectedCollection && collectionMode === "matrix",
  });

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

  const { data: guilds = [] } = useQuery({
    queryKey: ["guilds", serverId],
    queryFn: () => fetchGuilds(serverId),
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

  // Class icons & colors for history tab
  const [classIcons, setClassIcons] = useState<Record<string, string>>({});
  const [classColors, setClassColors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!serverId) return;
    supabaseClient.from("server_classes")
      .select("name, icon, color")
      .eq("server_id", serverId)
      .order("name")
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

  // â”€â”€ Create Item Modal â”€â”€
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
    enabled: showCreateItem || tab === "analytics",
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

  // â”€â”€ Edit Item Modal â”€â”€
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

  // â”€â”€ Distribute Modal â”€â”€
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
      const member = members.find(m => m.id === distMemberId);
      toast("success", `${distItem?.name ?? "Item"} sent to ${member?.name ?? "member"}!`);
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

  const [histSearch, setHistSearch] = useState("");
  const [histRarityFilter, setHistRarityFilter] = useState<string | null>(null);

  // Analytics: selected recipient for detail modal
  const [selectedRecipient, setSelectedRecipient] = useState<{ member_id: string; player_name: string } | null>(null);

  // Analytics: selected item for recipients modal
  const [selectedDistItem, setSelectedDistItem] = useState<{ item_id: string; item_name: string } | null>(null);

  // Analytics: search filters
  const [analyticsItemSearch, setAnalyticsItemSearch] = useState("");
  const [analyticsRecipientSearch, setAnalyticsRecipientSearch] = useState("");

  // Recipients tab search & sort
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientGuildFilter, setRecipientGuildFilter] = useState<string>(() => {
    try { return localStorage.getItem("raidscout-recipient-guild") || ""; } catch { return ""; }
  });
  const [recipientSort, setRecipientSort] = useState<string>("chrono");

  // Rarity sort order (highest first)
  const RARITY_SORT_ORDER: Record<string, number> = { mythic: 0, legendary: 1, epic: 2, rare: 3, uncommon: 4, common: 5 };

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ distId: string; itemName: string } | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

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
  const groupedDistributions = distributions
    .filter(d => {
      if (histSearch || histRarityFilter) {
        const item = items.find(i => i.id === d.item_id);
        if (histSearch) {
          const q = histSearch.toLowerCase();
          if (!item?.name.toLowerCase().includes(q) && !d.player_name.toLowerCase().includes(q)) return false;
        }
        if (histRarityFilter && item?.rarity?.toLowerCase() !== histRarityFilter) return false;
      }
      return true;
    })
    .reduce<Record<string, Distribution[]>>((acc, d) => {
    const date = new Date(d.distributed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (!acc[date]) acc[date] = [];
    acc[date].push(d);
    return acc;
  }, {});

  return (
    <div className="w-full max-w-[100%] 2xl:max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
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
        {(["catalog", "collections", "history", "recipients", "analytics"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition ${
              tab === t ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#e4e4e7]"
            }`}
          >
            {t === "catalog" && <Package className="w-3.5 h-3.5" />}
            {t === "collections" && <Star className="w-3.5 h-3.5" />}
            {t === "history" && <History className="w-3.5 h-3.5" />}
            {t === "analytics" && <BarChart3 className="w-3.5 h-3.5" />}
            {t === "recipients" && <Users className="w-3.5 h-3.5" />}
            <span className="capitalize">{t}</span>
          </button>
        ))}
      </div>

      {/* â”€â”€ Catalog Tab â”€â”€ */}
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
                  className="w-full pl-9 pr-9 py-2.5 bg-[#18181b] border border-[#27272a] rounded-xl text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
                />
                {itemSearch && (
                  <button onClick={() => setItemSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[#52525b] hover:text-[#a1a1aa]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowCreateItem(true)}
                className="flex items-center gap-2 px-3 py-2.5 bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] rounded-xl text-xs font-medium transition shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add Item</span>
              </button>
            </div>
            {availableRarities.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
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
                    <p className="text-[13px] font-medium truncate leading-tight" style={{ color: rarityColor }}>{item.name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: rarityColor }}
                      >
                        {item.rarity}
                        {isCatalog && <span className="ml-1 text-[#8b5cf6]/70 font-normal normal-case tracking-normal">{"\u00B7"} catalog</span>}
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

      {/* ── Collections Tab ── */}
      {tab === "collections" && (() => {
        const currentCollection = collections.find(c => c.id === selectedCollection);
        const collItemIds = new Set(collItems.map(ci => ci.item_id));

        // Ownership map: player_name → { distributed, manual }
        const ownedMap = new Map<string, { distributed: Set<string>; manual: Set<string> }>();
        allDists.forEach(d => {
          if (!ownedMap.has(d.player_name)) ownedMap.set(d.player_name, { distributed: new Set(), manual: new Set() });
          ownedMap.get(d.player_name)!.distributed.add(d.item_id);
        });
        manualOwned.forEach(m => {
          if (!ownedMap.has(m.player_name)) ownedMap.set(m.player_name, { distributed: new Set(), manual: new Set() });
          if (m.owned) {
            ownedMap.get(m.player_name)!.manual.add(m.item_id);
          } else {
            ownedMap.get(m.player_name)!.distributed.delete(m.item_id);
          }
        });

        const collItemsWithData = collItems.map(ci => {
          const item = items.find(i => i.id === ci.item_id);
          return { ...ci, item };
        });

        const playersWithOwnership = Array.from(ownedMap.entries())
          .map(([name, sets]) => ({ name, distributed: sets.distributed, manual: sets.manual }))
          .sort((a, b) => a.name.localeCompare(b.name));

        // Collection LIST mode
        if (collectionMode === "list") return (
          <div className="space-y-6">
            {showCreateCollection && (
              <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-semibold text-[#fafafa]">New Collection</h4>
                <div className="flex items-center gap-2">
                  <input
                    value={newCollectionName}
                    onChange={e => setNewCollectionName(e.target.value)}
                    placeholder="Collection name (e.g., Mounts)"
                    className="flex-1 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#3f3f46]"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter" && newCollectionName.trim()) {
                        createCollection(serverId!, newCollectionName.trim(), currentServer?.owner_id)
                          .then(() => { queryClient.invalidateQueries({ queryKey: ["collections", serverId] }); setShowCreateCollection(false); setNewCollectionName(""); toast("success", "Collection created!"); })
                          .catch(() => toast("error", "Failed to create collection"));
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!newCollectionName.trim()) return;
                      createCollection(serverId!, newCollectionName.trim(), currentServer?.owner_id)
                        .then(() => { queryClient.invalidateQueries({ queryKey: ["collections", serverId] }); setShowCreateCollection(false); setNewCollectionName(""); toast("success", "Collection created!"); })
                        .catch(() => toast("error", "Failed to create collection"));
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition"
                  >Create</button>
                  <button onClick={() => { setShowCreateCollection(false); setNewCollectionName(""); }} className="px-3 py-2 rounded-lg text-xs font-medium bg-[#27272a] text-[#d4d4d8] hover:bg-[#3f3f46] transition">Cancel</button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
                <Star className="w-4 h-4 text-[#f59e0b]" />Item Collections
              </h3>
              <button
                onClick={() => setShowCreateCollection(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition"
              >
                <Plus className="w-3 h-3" />New Collection
              </button>
            </div>

            {collectionsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-[#71717a] animate-spin" /></div>
            ) : collections.length === 0 ? (
              <p className="text-sm text-[#71717a] text-center py-8">No collections yet. Create one to get started.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {collections.map(c => (
                  <div key={c.id} className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 hover:border-[#3f3f46] transition group">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-[#fafafa]">{c.name}</h4>
                        <p className="text-[10px] text-[#52525b] mt-0.5">Created {new Date(c.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setSelectedCollection(c.id); setCollectionMode("view"); }}
                          className="p-1.5 text-[#52525b] hover:text-[#d4d4d8] transition"
                          title="View Items"
                        ><Eye className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={() => { setSelectedCollection(c.id); setCollectionMode("matrix"); }}
                          className="p-1.5 text-[#52525b] hover:text-[#a1a1aa] transition"
                          title="View Matrix"
                        ><BarChart3 className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete collection "${c.name}"?`)) {
                              deleteCollection(c.id).then(() => queryClient.invalidateQueries({ queryKey: ["collections", serverId] }));
                            }
                          }}
                          className="p-1.5 text-[#52525b] hover:text-[#f87171] transition"
                          title="Delete"
                        ><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

        // Collection VIEW mode (manage items)
        if (collectionMode === "view" && selectedCollection) {
          // Show all items, mark already-added ones
          const allItems = items;

          // Build category tree from gameCategories
          const topCategories = (gameCategories as any[]).filter((c: any) => !c.parent_id);
          const subCategories = (gameCategories as any[]).filter((c: any) => c.parent_id);

          // Collect available rarities from unfiltered items
          const collRarities = [...new Set(allItems.map(i => i.rarity?.toLowerCase()).filter(Boolean))] as string[];

          // Apply filters
          let filtered = allItems;
          if (collectionItemSearch)
            filtered = filtered.filter(i => i.name.toLowerCase().includes(collectionItemSearch.toLowerCase()));
          if (collCatFilter) {
            filtered = filtered.filter(i => {
              const catId = (i as any).category_id;
              if (!catId) return false;
              const cat = (gameCategories as any[]).find((c: any) => c.id === catId);
              return cat?.parent_id === collCatFilter || cat?.id === collCatFilter;
            });
          }
          if (collRarityFilter)
            filtered = filtered.filter(i => i.rarity?.toLowerCase() === collRarityFilter);
          const filteredAvailable = filtered;

          return (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <button onClick={() => { setCollectionMode("list"); setSelectedCollection(null); setCollectionItemSearch(""); setCollCatFilter(""); setCollRarityFilter(""); }} className="p-1 text-[#a1a1aa] hover:text-[#fafafa] transition"><ArrowLeft className="w-4 h-4" /></button>
                <div>
                  <h3 className="text-sm font-semibold text-[#fafafa]">{currentCollection?.name}</h3>
                  <p className="text-[10px] text-[#52525b]">{collItems.length} item{collItems.length !== 1 ? "s" : ""} in collection</p>
                </div>
                <div className="flex-1" />
                <button
                  onClick={() => setCollectionMode("matrix")}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#27272a] text-[#d4d4d8] hover:bg-[#3f3f46] transition"
                ><BarChart3 className="w-3 h-3" />View Matrix</button>
              </div>

              {/* Items already in collection */}
              <div>
                <h4 className="text-xs font-semibold text-[#d4d4d8] mb-2">Collection Items ({collItemsWithData.length})</h4>
                {collItemsWithData.length === 0 ? (
                  <p className="text-xs text-[#52525b] py-4">No items in this collection yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {collItemsWithData
                      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                      .map((ci, idx, arr) => {
                      const rc = ci.item?.rarity ? RARITY_COLORS[ci.item.rarity.toLowerCase() as ItemRarity] : "#a1a1aa";
                      const isFirst = idx === 0;
                      const isLast = idx === arr.length - 1;
                      return (
                        <span key={ci.id} className="inline-flex items-center gap-1 text-[11px] font-medium rounded-lg border border-[#27272a] bg-[#18181b] overflow-hidden" style={{ color: rc, borderColor: rc + "30" }}>
                          {/* Reorder buttons */}
                          <span className="flex flex-col border-r border-[#27272a]">
                            <button
                              onClick={async () => {
                                const prev = arr[idx - 1];
                                if (!prev) return;
                                const ciOrder = ci.sort_order ?? idx;
                                const prevOrder = prev.sort_order ?? idx - 1;
                                // Use a temp high value to avoid unique constraint issues
                                const TEMP = 999999;
                                await reorderCollectionItem(selectedCollection!, ci.item_id, TEMP);
                                await reorderCollectionItem(selectedCollection!, prev.item_id, ciOrder);
                                await reorderCollectionItem(selectedCollection!, ci.item_id, prevOrder);
                                queryClient.invalidateQueries({ queryKey: ["collectionItems", selectedCollection] });
                              }}
                              disabled={isFirst}
                              className="px-1 py-1 text-[#52525b] hover:text-[#d4d4d8] disabled:opacity-30 disabled:cursor-default transition"
                              title="Move up"
                            ><ChevronUp className="w-3 h-3" /></button>
                            <button
                              onClick={async () => {
                                const next = arr[idx + 1];
                                if (!next) return;
                                const ciOrder = ci.sort_order ?? idx;
                                const nextOrder = next.sort_order ?? idx + 1;
                                const TEMP = 999999;
                                await reorderCollectionItem(selectedCollection!, ci.item_id, TEMP);
                                await reorderCollectionItem(selectedCollection!, next.item_id, ciOrder);
                                await reorderCollectionItem(selectedCollection!, ci.item_id, nextOrder);
                                queryClient.invalidateQueries({ queryKey: ["collectionItems", selectedCollection] });
                              }}
                              disabled={isLast}
                              className="px-1 py-1 text-[#52525b] hover:text-[#d4d4d8] disabled:opacity-30 disabled:cursor-default transition border-t border-[#27272a]"
                              title="Move down"
                            ><ChevronDown className="w-3 h-3" /></button>
                          </span>
                          <span className="flex items-center gap-2 px-2.5 py-1.5">
                            {ci.item?.image_url && <img src={ci.item.image_url} alt="" className="w-5 h-5 rounded object-cover" />}
                            {ci.item?.name ?? "Unknown"}
                          </span>
                          <button
                            onClick={() => {
                              removeItemFromCollection(selectedCollection!, ci.item_id)
                                .then(() => queryClient.invalidateQueries({ queryKey: ["collectionItems", selectedCollection] }));
                            }}
                            className="pr-2 text-[#71717a] hover:text-[#f87171]"
                          ><X className="w-3 h-3" /></button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Available items to add */}
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <h4 className="text-xs font-semibold text-[#d4d4d8]">Catalog Items</h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Category filter */}
                    <select
                      value={collCatFilter}
                      onChange={e => setCollCatFilter(e.target.value)}
                      className="text-[10px] bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] px-2.5 py-1.5 focus:outline-none focus:border-[#3f3f46]"
                    >
                      <option value="">All Categories</option>
                      {topCategories.map((tc: any) => (
                        <optgroup key={tc.id} label={tc.name}>
                          <option value={tc.id}>{tc.name} (all)</option>
                          {subCategories.filter((sc: any) => sc.parent_id === tc.id).map((sc: any) => (
                            <option key={sc.id} value={sc.id}>  {sc.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {/* Rarity filter */}
                    <select
                      value={collRarityFilter}
                      onChange={e => setCollRarityFilter(e.target.value)}
                      className="text-[10px] bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] px-2.5 py-1.5 focus:outline-none focus:border-[#3f3f46]"
                    >
                      <option value="">All Rarities</option>
                      {RARITY_ORDER.filter(r => collRarities.includes(r)).map(r => (
                        <option key={r} value={r} className="capitalize">{r}</option>
                      ))}
                    </select>
                    <div className="relative">
                      <Search className="w-3 h-3 text-[#52525b] absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        value={collectionItemSearch}
                        onChange={e => setCollectionItemSearch(e.target.value)}
                        placeholder="Search name..."
                        className="w-36 pl-6 pr-2 py-1 text-[11px] bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#3f3f46]"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {filteredAvailable.slice(0, 50).map(item => {
                    const rc = item.rarity ? RARITY_COLORS[item.rarity.toLowerCase() as ItemRarity] : "#a1a1aa";
                    const isAlreadyAdded = collItemIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (isAlreadyAdded) return;
                          addItemToCollection(selectedCollection!, item.id)
                            .then(() => { queryClient.invalidateQueries({ queryKey: ["collectionItems", selectedCollection] }); toast("success", `Added ${item.name}`); })
                            .catch(() => toast("error", "Failed to add item"));
                        }}
                        disabled={isAlreadyAdded}
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition text-left ${isAlreadyAdded ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400/50 cursor-default" : "border-[#27272a] bg-[#18181b] hover:border-[#3f3f46] cursor-pointer"}`}
                        style={{ color: isAlreadyAdded ? undefined : rc }}
                        title={isAlreadyAdded ? `${item.name} — already in collection` : item.name}
                      >
                        {isAlreadyAdded ? <Check className="w-3 h-3 shrink-0" /> : <Plus className="w-3 h-3 shrink-0" />}
                        <span className="truncate max-w-[150px]">{item.name}</span>
                      </button>
                    );
                  })}
                  {filteredAvailable.length === 0 && <p className="text-xs text-[#52525b] py-2 w-full">No matching items.</p>}
                </div>
              </div>
            </div>
          );
        }

        // Collection MATRIX mode
        if (collectionMode === "matrix" && selectedCollection) {
          const matrixItems = collItemsWithData.filter(ci => ci.item);
          return (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <button onClick={() => { setCollectionMode("view"); }} className="p-1 text-[#a1a1aa] hover:text-[#fafafa] transition"><ArrowLeft className="w-4 h-4" /></button>
                <div>
                  <h3 className="text-sm font-semibold text-[#fafafa]">{currentCollection?.name} — Ownership</h3>
                  <p className="text-[10px] text-[#52525b]">{playersWithOwnership.length} players · {matrixItems.length} items</p>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-emerald-500/20 bg-emerald-500/10" /> Distributed</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-amber-500/20 bg-amber-500/10" /> Manual</span>
                  <span className="text-[#52525b] ml-1">Click cells to toggle</span>
                </div>
              </div>

              {matrixItems.length === 0 ? (
                <p className="text-sm text-[#52525b] text-center py-8">Add items to this collection first.</p>
              ) : (
                <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#27272a] bg-[#18181b]">
                          <th className="sticky left-0 bg-[#18181b] text-left px-4 py-2.5 text-[10px] text-[#71717a] uppercase tracking-wider font-medium min-w-[140px]">Player</th>
                          {matrixItems.map(ci => (
                            <th key={ci.item_id} className="px-3 py-2.5 text-center text-[10px] text-[#71717a] uppercase tracking-wider font-medium min-w-[80px]">
                              <div className="flex flex-col items-center gap-1">
                                {ci.item?.image_url && <img src={ci.item.image_url} alt="" className="w-5 h-5 rounded object-cover" />}
                                <span className="truncate max-w-[70px]" style={{ color: ci.item?.rarity ? RARITY_COLORS[ci.item.rarity.toLowerCase() as ItemRarity] : "#a1a1aa" }}>{ci.item?.name ?? "?"}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {playersWithOwnership.length === 0 ? (
                          <tr><td colSpan={matrixItems.length + 1} className="text-center py-8 text-[#52525b]">No distribution data yet.</td></tr>
                        ) : (
                          playersWithOwnership.map(p => (
                            <tr key={p.name} className="border-b border-[#27272a]/50 hover:bg-[#09090b]/30 transition">
                              <td className="sticky left-0 bg-[#18181b] px-4 py-2.5 text-[#fafafa] font-medium text-xs">{p.name}</td>
                              {matrixItems.map(ci => {
                                const isDistributed = p.distributed.has(ci.item_id);
                                const isManual = p.manual.has(ci.item_id);
                                const isOwned = isDistributed || isManual;
                                return (
                                <td key={ci.item_id} className="px-3 py-2.5 text-center">
                                  <button
                                    onClick={async () => {
                                      if (isManual) {
                                        // Remove manual override → revert to distributed status
                                        await removeManualOwnership(selectedCollection!, ci.item_id, p.name);
                                      } else if (isDistributed) {
                                        // Mark as NOT owned (override)
                                        await setManualOwnership(selectedCollection!, ci.item_id, p.name, false);
                                      } else {
                                        // Mark as manually owned
                                        await setManualOwnership(selectedCollection!, ci.item_id, p.name, true);
                                      }
                                      queryClient.invalidateQueries({ queryKey: ["manualOwnership", selectedCollection] });
                                    }}
                                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border transition cursor-pointer ${isManual ? "text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20" : isDistributed ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20" : "text-[#3f3f46] hover:text-[#a1a1aa] border-transparent hover:border-[#3f3f46]"}`}
                                    title={isManual ? "Manual ✓ — click to remove" : isDistributed ? "Distributed ✓ — click to mark not owned" : "Not owned — click to mark owned"}
                                  >
                                    {isManual ? "✎ Owned" : isDistributed ? "✓ Owned" : "—"}
                                  </button>
                                </td>
                                );
                              })}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        }

        return null;
      })()}

      {/* ── History Tab ── */}
      {tab === "history" && (
        <div className="space-y-6">
          {/* Search + Rarity Filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52525b]" />
              <input
                value={histSearch}
                onChange={(e) => setHistSearch(e.target.value)}
                placeholder="Search by item or player name..."
                className="w-full pl-9 pr-9 py-2.5 bg-[#18181b] border border-[#27272a] rounded-xl text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
              />
              {histSearch && (
                <button onClick={() => setHistSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[#52525b] hover:text-[#a1a1aa]">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {availableRarities.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setHistRarityFilter(null)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition ${
                    !histRarityFilter ? "bg-[#fafafa] text-[#09090b]" : "bg-[#27272a] text-[#a1a1aa] hover:text-[#e4e4e7]"
                  }`}
                >
                  All
                </button>
                {availableRarities.map(r => {
                  const color = RARITY_COLORS[r as ItemRarity] || "#71717a";
                  return (
                    <button
                      key={r}
                      onClick={() => setHistRarityFilter(histRarityFilter === r ? null : r)}
                      className="px-2.5 py-1 rounded-md text-[10px] font-medium capitalize transition"
                      style={{
                        backgroundColor: histRarityFilter === r ? `${color}20` : "#27272a",
                        color: histRarityFilter === r ? color : "#a1a1aa",
                        border: `1px solid ${histRarityFilter === r ? `${color}40` : "transparent"}`,
                      }}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-4">
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
                    const rc = item ? RARITY_COLORS[item.rarity?.toLowerCase() as ItemRarity] || "#a1a1aa" : "#71717a";
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
                            <span className="text-[11px] text-[#52525b] font-mono shrink-0">x{d.quantity}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-[#71717a]">→</span>
                            {(() => {
                              const m = members.find(m => m.name === d.player_name);
                              const cc = (m?.class && classColors[m.class]) || "#a1a1aa";
                              const ci = m?.class && classIcons[m.class];
                              return (
                                <span className="text-[11px] font-medium flex items-center gap-1 text-[#fafafa]">
                                  {ci && getClassIcon(ci) && (() => { const CIcon = getClassIcon(ci)!; return <CIcon className="w-3 h-3" style={{ color: cc }} />; })()}
                                  {d.player_name}
                                </span>
                              );
                            })()}
                            {d.reason && (
                              <span className="text-[10px] text-[#52525b] truncate">{"\u00B7"} {d.reason}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => { setDeleteConfirm({ distId: d.id, itemName: item?.name ?? "Unknown" }); setDeleteConfirmName(""); }}
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
        </div>
      )}

      {/* ── Recipients Tab ── */}
      {tab === "recipients" && (() => {
        // Group distributions by player
        const playerMap = new Map<string, { player_name: string; member_id: string; dists: Distribution[] }>();
        distributions.forEach(d => {
          let entry = playerMap.get(d.player_name);
          if (!entry) { entry = { player_name: d.player_name, member_id: d.member_id, dists: [] }; playerMap.set(d.player_name, entry); }
          entry.dists.push(d);
        });
        const players = Array.from(playerMap.values()).sort((a, b) => b.dists.length - a.dists.length);
        // Sort each player's items based on selected sort
        const sortDists = (dists: Distribution[], sort: string) => {
          const sorted = [...dists];
          if (sort === "chrono") {
            sorted.sort((a, b) => new Date(a.distributed_at).getTime() - new Date(b.distributed_at).getTime());
          } else if (sort === "name-asc") {
            sorted.sort((a, b) => {
              const ia = items.find(i => i.id === a.item_id)?.name ?? "";
              const ib = items.find(i => i.id === b.item_id)?.name ?? "";
              return ia.localeCompare(ib);
            });
          } else if (sort === "name-desc") {
            sorted.sort((a, b) => {
              const ia = items.find(i => i.id === a.item_id)?.name ?? "";
              const ib = items.find(i => i.id === b.item_id)?.name ?? "";
              return ib.localeCompare(ia);
            });
          } else if (sort === "rarity") {
            sorted.sort((a, b) => {
              const ra = items.find(i => i.id === a.item_id)?.rarity?.toLowerCase() ?? "";
              const rb = items.find(i => i.id === b.item_id)?.rarity?.toLowerCase() ?? "";
              return (RARITY_SORT_ORDER[ra] ?? 99) - (RARITY_SORT_ORDER[rb] ?? 99);
            });
          } else if (sort === "rarity-desc") {
            sorted.sort((a, b) => {
              const ra = items.find(i => i.id === a.item_id)?.rarity?.toLowerCase() ?? "";
              const rb = items.find(i => i.id === b.item_id)?.rarity?.toLowerCase() ?? "";
              return (RARITY_SORT_ORDER[rb] ?? 99) - (RARITY_SORT_ORDER[ra] ?? 99);
            });
          }
          return sorted;
        };
        players.forEach(p => { p.dists = sortDists(p.dists, recipientSort); });
        const filteredPlayers = (() => {
          let list = players;
          if (recipientSearch) list = list.filter(p => p.player_name.toLowerCase().includes(recipientSearch.toLowerCase()));
          if (recipientGuildFilter) {
            list = list.filter(p => {
              const m = members.find(m => m.id === p.member_id || m.name === p.player_name);
              const g = m?.guild_id ? guilds.find(g => g.id === m.guild_id) : null;
              return g?.name === recipientGuildFilter;
            });
          }
          return list;
        })();
        // Build unique guild list for filter dropdown
        const guildNames = [...new Set(players.map(p => {
          const m = members.find(m => m.id === p.member_id || m.name === p.player_name);
          const g = m?.guild_id ? guilds.find(g => g.id === m.guild_id) : null;
          return g?.name ?? "";
        }).filter(Boolean))].sort();
        return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#a1a1aa]" />
              All Recipients
            </h3>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-3 h-3 text-[#52525b] absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Search player..."
                  className="w-40 pl-6 pr-6 py-1 text-[11px] bg-[#09090b] border border-[#27272a] rounded-lg text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#3f3f46]"
                />
                {recipientSearch && (
                  <button onClick={() => setRecipientSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#52525b] hover:text-[#a1a1aa]">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <select
                value={recipientGuildFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  setRecipientGuildFilter(val);
                  try { localStorage.setItem("raidscout-recipient-guild", val); } catch {}
                }}
                className="text-[11px] bg-[#09090b] border border-[#27272a] rounded-lg text-[#fafafa] px-2.5 py-1.5 focus:outline-none focus:border-[#3f3f46]"
              >
                <option value="">All Guilds</option>
                {guildNames.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <select
                value={recipientSort}
                onChange={(e) => setRecipientSort(e.target.value)}
                className="text-[11px] bg-[#09090b] border border-[#27272a] rounded-lg text-[#fafafa] px-2.5 py-1.5 focus:outline-none focus:border-[#3f3f46]"
              >
                <option value="chrono">Chronological</option>
                <option value="name-asc">Name A→Z</option>
                <option value="name-desc">Name Z→A</option>
                <option value="rarity">Rarity ↑</option>
                <option value="rarity-desc">Rarity ↓</option>
              </select>
              <span className="text-xs text-[#52525b] font-mono">{filteredPlayers.length} / {players.length} players</span>
            </div>
          </div>
          {filteredPlayers.length === 0 ? (
            <p className="text-sm text-[#52525b] text-center py-12">{recipientSearch || recipientGuildFilter ? "No players match." : "No distribution data yet."}</p>
          ) : (
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#27272a]">
                      <th className="text-left px-4 py-2.5 text-[10px] text-[#71717a] uppercase tracking-wider font-medium w-36">Name</th>
                      <th className="text-left px-4 py-2.5 text-[10px] text-[#71717a] uppercase tracking-wider font-medium">Items Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.map(p => {
                      const m = members.find(m => m.id === p.member_id || m.name === p.player_name);
                      const cc = (m?.class && classColors[m.class]) || "#a1a1aa";
                      const ci = m?.class && classIcons[m.class];
                      const CIcon = ci ? getClassIcon(ci) : null;
                      const g = m?.guild_id ? guilds.find(g => g.id === m.guild_id) : null;
                      const gc = g ? guildColor(g.name) : null;
                      return (
                        <tr key={p.player_name} className="border-b border-[#27272a] last:border-b-0 hover:bg-[#09090b]/50 transition">
                          <td className="px-4 py-2.5 align-top">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold" style={{ backgroundColor: cc + "20", color: cc }}>
                                {CIcon ? <CIcon className="w-3 h-3" /> : p.player_name[0]}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate text-[#fafafa]">{p.player_name}</p>
                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                  {gc && g && (
                                    <span className={`flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded border ${gc.bg} ${gc.text} ${gc.border}`}>
                                      <Shield className="w-2 h-2" />
                                      {g.name}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {p.dists.map(d => {
                                const item = items.find(i => i.id === d.item_id);
                                const rc = item?.rarity ? RARITY_COLORS[item.rarity.toLowerCase() as ItemRarity] : "#a1a1aa";
                                return (
                                  <span key={d.id} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border border-[#27272a]" style={{ color: rc }}>
                                    {item?.image_url && <img src={item.image_url} alt="" className="w-3.5 h-3.5 rounded object-cover" style={{ backgroundColor: rc + "20" }} />}
                                    <span className="capitalize truncate max-w-[120px]">{item?.name ?? "Unknown"}</span>
                                    {d.quantity > 1 && <span className="font-mono opacity-70">x{d.quantity}</span>}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* â”€â”€ Analytics Tab â”€â”€ */}
      {tab === "analytics" && (
        <div className="space-y-4">
          {/* Category Distribution Chart */}
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-[#fafafa] mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#a1a1aa]" />
              Items by Category
            </h3>
            {(() => {
              // Group by category, tracking rarity breakdown
              const catMap = new Map<string, { name: string; rarities: Record<string, number>; total: number }>();
              distributions.forEach(d => {
                const item = items.find(i => i.id === d.item_id);
                const rarity = (item?.rarity?.toLowerCase() || "common") as ItemRarity;
                const catId = item?.category_id;
                let label: string;
                if (catId) {
                  const cat = (gameCategories as any[]).find((c: any) => c.id === catId);
                  label = cat ? (cat.parent_id ? `${(gameCategories as any[]).find((p: any) => p.id === cat.parent_id)?.name ?? ""} / ${cat.name}` : cat.name) : "Unknown";
                } else {
                  label = "Uncategorized";
                }
                let entry = catMap.get(label);
                if (!entry) { entry = { name: label, rarities: {}, total: 0 }; catMap.set(label, entry); }
                entry.rarities[rarity] = (entry.rarities[rarity] || 0) + d.quantity;
                entry.total += d.quantity;
              });
              const catBars = Array.from(catMap.values()).sort((a, b) => b.total - a.total);
              const globalMax = catBars[0]?.total || 1;
              return catBars.length === 0 ? (
                <p className="text-sm text-[#52525b] text-center py-8">No data yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {catBars.map(cat => {
                    const pct = Math.max(4, (cat.total / globalMax) * 100);
                    // Build sorted rarity segments (highest rarity first for visual)
                    const segments = RARITY_ORDER
                      .filter(r => cat.rarities[r])
                      .map(r => ({ rarity: r, count: cat.rarities[r], color: RARITY_COLORS[r] }));
                    return (
                      <div key={cat.name} className="flex items-center gap-3">
                        <p className="text-xs text-[#fafafa] w-32 shrink-0 truncate">{cat.name}</p>
                        <div className="flex-1 min-w-0">
                          <div className="h-6 bg-[#09090b] rounded-full overflow-hidden flex">
                            {segments.map((seg, j) => {
                              const segPct = (seg.count / cat.total) * pct;
                              const showLabel = segPct > 8;
                              return (
                                <div key={seg.rarity} className="h-full transition-all flex items-center justify-center" style={{ width: `${segPct}%`, backgroundColor: seg.color + "30" }}>
                                  {showLabel && (
                                    <span className="text-[10px] font-medium capitalize truncate px-1" style={{ color: seg.color }}>
                                      {seg.rarity} ({seg.count})
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono font-semibold text-[#a1a1aa] w-8 text-right shrink-0">{cat.total}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Items */}
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#a1a1aa]" />
                  Most Distributed Items
                </h3>
                <div className="relative">
                  <Search className="w-3 h-3 text-[#52525b] absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    value={analyticsItemSearch}
                    onChange={(e) => setAnalyticsItemSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-28 pl-6 pr-6 py-1 text-[11px] bg-[#09090b] border border-[#27272a] rounded-lg text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#3f3f46]"
                  />
                  {analyticsItemSearch && (
                    <button onClick={() => setAnalyticsItemSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#52525b] hover:text-[#a1a1aa]">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              {(() => {
                const list = analyticsItemSearch
                  ? itemStats.filter(s => s.item_name.toLowerCase().includes(analyticsItemSearch.toLowerCase()))
                  : itemStats;
                if (list.length === 0) {
                  return <p className="text-sm text-[#52525b] text-center py-8">{analyticsItemSearch ? "No items match." : "No data yet."}</p>;
                }
                const maxQty = list[0]?.total_quantity || 1;
                return (
                <div className="space-y-1">
                  {list.map((stat, i) => {
                    const item = items.find(x => x.id === stat.item_id);
                    const rc = item ? RARITY_COLORS[item.rarity?.toLowerCase() as ItemRarity] || "#a1a1aa" : "#71717a";
                    const pct = Math.max(4, (stat.total_quantity / maxQty) * 100);
                    return (
                      <button key={stat.item_id} onClick={() => setSelectedDistItem({ item_id: stat.item_id, item_name: stat.item_name })} className="w-full flex items-center gap-3 py-1.5 group hover:bg-[#27272a]/30 rounded px-1 -mx-1 transition text-left">
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
                            <p className="text-xs truncate" style={{ color: rc }}>{stat.item_name}</p>
                            <span className="text-xs font-mono font-semibold text-[#a1a1aa] shrink-0 ml-2">x{stat.total_quantity}</span>
                          </div>
                          <div className="h-1 bg-[#27272a] rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: rc }} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                );
              })()}
            </div>

            {/* Top Recipients */}
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
                  <Gift className="w-4 h-4 text-[#a1a1aa]" />
                  Top Recipients
                </h3>
                <div className="relative">
                  <Search className="w-3 h-3 text-[#52525b] absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    value={analyticsRecipientSearch}
                    onChange={(e) => setAnalyticsRecipientSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-28 pl-6 pr-6 py-1 text-[11px] bg-[#09090b] border border-[#27272a] rounded-lg text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#3f3f46]"
                  />
                  {analyticsRecipientSearch && (
                    <button onClick={() => setAnalyticsRecipientSearch("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#52525b] hover:text-[#a1a1aa]">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              {(() => {
                const list = analyticsRecipientSearch
                  ? topRecipients.filter(r => r.player_name.toLowerCase().includes(analyticsRecipientSearch.toLowerCase()))
                  : topRecipients;
                if (list.length === 0) {
                  return <p className="text-sm text-[#52525b] text-center py-8">{analyticsRecipientSearch ? "No matches." : "No data yet."}</p>;
                }
                const maxItems = list[0]?.total_items || 1;
                return (
                <div className="space-y-1">
                  {list.map((r, i) => {
                    const pct = Math.max(4, (r.total_items / maxItems) * 100);
                    const m = members.find(m => m.id === r.member_id || m.name === r.player_name);
                    const cc = (m?.class && classColors[m.class]) || "#a1a1aa";
                    const ci = m?.class && classIcons[m.class];
                    const g = m?.guild_id ? guilds.find(g => g.id === m.guild_id) : null;
                    const gc = g ? guildColor(g.name) : null;
                    return (
                      <button key={r.member_id} onClick={() => setSelectedRecipient(r)} className="w-full flex items-center gap-3 py-1.5 group hover:bg-[#27272a]/30 rounded px-1 -mx-1 transition">
                        <span className="text-[10px] font-mono text-[#3f3f46] w-4 shrink-0 text-right">{i + 1}</span>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                          i === 0 ? 'bg-amber-500/20 text-amber-400' :
                          i === 1 ? 'bg-slate-400/20 text-slate-300' :
                          i === 2 ? 'bg-orange-600/20 text-orange-400' :
                          'bg-[#27272a] text-[#71717a]'
                        }`}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-xs truncate flex items-center gap-1 text-[#fafafa]">
                                {ci && getClassIcon(ci) && (() => { const CIcon = getClassIcon(ci)!; return <CIcon className="w-3 h-3 shrink-0" style={{ color: cc }} />; })()}
                                {r.player_name}
                              </p>
                              {gc && g && (
                                <span className={`flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded border shrink-0 ${gc.bg} ${gc.text} ${gc.border}`}>
                                  <Shield className="w-2 h-2" />
                                  {g.name}
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-mono font-semibold text-[#a1a1aa] shrink-0 ml-2">{r.total_items}</span>
                          </div>
                          <div className="h-1 bg-[#27272a] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${
                              i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-orange-600' : 'bg-[#52525b]'
                            }`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ Create Item Modal â”€â”€ */}
      {showCreateItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowCreateItem(false); resetCreateForm(); }}>
          <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-5 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}
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
                <input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="e.g. Dragon Heart" className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]" autoFocus />
              </div>
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Description (optional)</label>
                <input value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} placeholder="Brief description" className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]" />
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
                  className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b]"
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
                    className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b]"
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
                  <div className="mt-1 relative rounded-lg overflow-hidden bg-[#18181b] border border-[#27272a]">
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
                <div className="flex gap-2 mt-1">
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

      {/* â”€â”€ Edit Item Modal â”€â”€ */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditingItem(null)}>
          <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-5 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#fafafa]">Edit Item</h3>
              <button onClick={() => setEditingItem(null)} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b]" autoFocus />
              </div>
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Description</label>
                <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] focus:outline-none focus:border-[#52525b]" />
              </div>
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Rarity</label>
                <div className="flex gap-2 mt-1">
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
                  <div className="mt-1 relative rounded-lg overflow-hidden bg-[#18181b] border border-[#27272a]">
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

      {/* â”€â”€ Distribute Modal â”€â”€ */}
      {showDistribute && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDistribute(false)}>
          <div className="bg-[#09090b] border border-[#27272a] rounded-t-xl sm:rounded-xl p-5 w-full max-w-md mx-0 sm:mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[#fafafa]">Distribute Item</h3>
                {distItem && (
                  <p className="text-[11px] text-[#a1a1aa] mt-0.5 flex items-center gap-2">
                    <span className="capitalize font-medium" style={{ color: RARITY_COLORS[distItem.rarity?.toLowerCase() as ItemRarity] }}>{distItem.rarity}</span>
                    <span>{"\u00B7"}</span>
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
                    className="w-full pl-8 pr-8 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
                  />
                  {distMemberSearch && (
                    <button onClick={() => setDistMemberSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-[#52525b] hover:text-[#a1a1aa]">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-1.5 max-h-32 overflow-y-auto space-y-0.5">
                  {filteredDistMembers.slice(0, 20).map(m => {
                    const distCount = memberDistCounts[m.id] || 0;
                    return (
                      <button key={m.id}
                        onClick={() => { setDistMemberId(m.id); setDistMemberSearch(m.name); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition text-left ${distMemberId === m.id ? "bg-[#fafafa]/10 text-[#fafafa] border border-[#fafafa]/20" : "text-[#d4d4d8] hover:bg-[#18181b] hover:text-[#fafafa]"}`}>
                        <span className="flex-1 truncate">{m.name}</span>
                        <span className="text-[11px] text-[#52525b] font-mono">{distCount} items</span>
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
                      className="p-2 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input type="number" min={1} value={distQuantity}
                      onChange={(e) => setDistQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="flex-1 px-2 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] text-center focus:outline-none focus:border-[#52525b]" />
                    <button onClick={() => setDistQuantity(q => q + 1)}
                      className="p-2 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Reason</label>
                  <input value={distReason} onChange={(e) => setDistReason(e.target.value)}
                    placeholder="e.g. Guild Boss"
                    className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]" />
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

      {/* ── Recipient Detail Modal (Analytics) ── */}
      {selectedRecipient && (() => {
        const memberItems = distributions.filter(d => d.member_id === selectedRecipient.member_id || d.player_name === selectedRecipient.player_name);
        const m = members.find(m => m.id === selectedRecipient.member_id || m.name === selectedRecipient.player_name);
        const cc = (m?.class && classColors[m.class]) || "#a1a1aa";
        const ci = m?.class && classIcons[m.class];
        const CIcon = ci ? getClassIcon(ci) : null;
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedRecipient(null)}>
            <div className="bg-[#09090b] border border-[#27272a] rounded-t-xl sm:rounded-xl p-5 w-full max-w-sm mx-0 sm:mx-4 max-h-[70vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {CIcon && <CIcon className="w-5 h-5" style={{ color: cc }} />}
                  <h3 className="text-sm font-semibold" style={{ color: cc }}>{selectedRecipient.player_name}</h3>
                  {m?.class && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize" style={{ backgroundColor: cc + "20", color: cc }}>{m.class}</span>}
                </div>
                <button onClick={() => setSelectedRecipient(null)} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
              </div>
              {memberItems.length === 0 ? (
                <p className="text-xs text-[#71717a] text-center py-6">No items found for this member.</p>
              ) : (
                <div className="space-y-2">
                  {memberItems.map(d => {
                    const item = items.find(i => i.id === d.item_id);
                    const rc = item?.rarity ? RARITY_COLORS[item.rarity.toLowerCase() as ItemRarity] : "#a1a1aa";
                    return (
                      <div key={d.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#18181b] border border-[#27272a]">
                        <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: rc + "25" }}>
                          {item?.image_url ? (
                            <img src={item.image_url} alt="" className="w-8 h-8 object-contain" />
                          ) : (
                            <Box className="w-4 h-4 text-[#3f3f46]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate capitalize font-medium" style={{ color: rc }}>{item?.name ?? "Unknown"}</p>
                          <p className="text-[10px]">
                            {item?.rarity && <span className="capitalize" style={{ color: rc }}>{item.rarity}</span>}
                            {item?.rarity && d.reason ? " · " : ""}
                            <span className="text-[#71717a]">{d.reason || ""}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono font-semibold text-[#fafafa]">x{d.quantity}</p>
                          <p className="text-[10px] text-[#52525b]">{new Date(d.distributed_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Item Recipients Modal (Analytics) ── */}
      {selectedDistItem && (() => {
        const itemDists = distributions.filter(d => d.item_id === selectedDistItem.item_id);
        // Aggregate by member
        const byMember = new Map<string, { player_name: string; quantity: number }>();
        itemDists.forEach(d => {
          const existing = byMember.get(d.member_id);
          if (existing) existing.quantity += d.quantity;
          else byMember.set(d.member_id, { player_name: d.player_name, quantity: d.quantity });
        });
        const recipients = Array.from(byMember.entries()).map(([member_id, v]) => ({ member_id, ...v }));
        const item = items.find(i => i.id === selectedDistItem.item_id);
        const rc = item?.rarity ? RARITY_COLORS[item.rarity.toLowerCase() as ItemRarity] : "#a1a1aa";
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedDistItem(null)}>
            <div className="bg-[#09090b] border border-[#27272a] rounded-t-xl sm:rounded-xl p-5 w-full max-w-sm mx-0 sm:mx-4 max-h-[70vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold" style={{ color: rc }}>{selectedDistItem.item_name}</h3>
                </div>
                <button onClick={() => setSelectedDistItem(null)} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
              </div>
              {recipients.length === 0 ? (
                <p className="text-xs text-[#71717a] text-center py-6">No recipients found.</p>
              ) : (
                <div className="space-y-1.5">
                  {recipients.map(r => {
                    const m = members.find(m => m.id === r.member_id || m.name === r.player_name);
                    const cc = (m?.class && classColors[m.class]) || "#a1a1aa";
                    const ci = m?.class && classIcons[m.class];
                    const CIcon = ci ? getClassIcon(ci) : null;
                    const g = m?.guild_id ? guilds.find(g => g.id === m.guild_id) : null;
                    const gc = g ? guildColor(g.name) : null;
                    return (
                      <div key={r.member_id} className="flex items-center gap-3 p-2 rounded-lg bg-[#18181b] border border-[#27272a]">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold" style={{ backgroundColor: cc + "20" }}>
                          {CIcon ? <CIcon className="w-3.5 h-3.5" style={{ color: cc }} /> : <span style={{ color: cc }}>{r.player_name[0]}</span>}
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <p className="text-xs truncate" style={{ color: cc }}>{r.player_name}</p>
                          {m?.class && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize shrink-0" style={{ backgroundColor: cc + "18", color: cc }}>{m.class}</span>}
                          {gc && g && (
                            <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${gc.bg} ${gc.text} ${gc.border}`}>
                              <Shield className="w-3 h-3" />
                              {g.name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono font-semibold text-[#fafafa] shrink-0">x{r.quantity}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-5 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Delete Distribution
              </h3>
              <button onClick={() => setDeleteConfirm(null)} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-[#a1a1aa] mb-3">
              This will permanently remove the distribution record for <span className="text-[#fafafa] font-medium">{deleteConfirm.itemName}</span>.
            </p>
            <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-3 mb-4">
              <p className="text-[11px] text-red-300/80 leading-relaxed">
                Make sure this item has been properly distributed to the recipient before deleting. This action cannot be undone.
              </p>
            </div>
            <div className="mb-4">
              <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Type the item name to confirm</label>
              <input
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={deleteConfirm.itemName}
                className="w-full mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-red-400/50"
                autoFocus
              />
            </div>
            <button
              onClick={() => {
                if (deleteConfirmName.toLowerCase() === deleteConfirm.itemName.toLowerCase()) {
                  deleteDistMutation.mutate(deleteConfirm.distId);
                  setDeleteConfirm(null);
                }
              }}
              disabled={deleteConfirmName.toLowerCase() !== deleteConfirm.itemName.toLowerCase() || deleteDistMutation.isPending}
              className="w-full py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {deleteDistMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deleteDistMutation.isPending ? "Deleting..." : "Delete Distribution"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
