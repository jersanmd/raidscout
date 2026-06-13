import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchItems, createItem, deleteItem, updateItem, searchItemsByGame,
  fetchDistributions, createDistribution, deleteDistribution,
  fetchItemDistributionStats, fetchTopRecipients,
  fetchMembers, isSupabaseConfigured,
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

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["items", serverId],
    queryFn: () => fetchItems(serverId),
    enabled: configured,
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
  useEscapeKey(() => { setShowCreateItem(false); resetCreateForm(); }, showCreateItem);

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
      setEditingItem(null);
    },
  });

  const resetCreateForm = () => {
    setNewItemName("");
    setNewItemDesc("");
    setNewItemRarity("common");
    setNewItemImage(null);
    setNewItemImagePreview(null);
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

  const handlePaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            const file = new File([blob], `pasted-image.${type.split("/")[1] || "png"}`, { type });
            handleImageFile(file);
            return;
          }
        }
      }
    } catch {
      // Clipboard API not supported — user can use upload button instead
    }
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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items", serverId] });
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
  const [distItemSearch, setDistItemSearch] = useState("");
  useEscapeKey(() => setShowDistribute(false), showDistribute);

  // Distribution counts (computed before filteredDistItems which depends on them)
  const memberDistCounts: Record<string, number> = {};
  const itemDistCounts: Record<string, number> = {};
  distributions.forEach(d => {
    memberDistCounts[d.member_id] = (memberDistCounts[d.member_id] || 0) + d.quantity;
    itemDistCounts[d.item_id] = (itemDistCounts[d.item_id] || 0) + d.quantity;
  });

  const distItem = items.find(i => i.id === distItemId);
  const filteredDistItems = items.filter(i =>
    !distItemSearch || i.name.toLowerCase().includes(distItemSearch.toLowerCase())
  ).sort((a, b) => (itemDistCounts[b.id] || 0) - (itemDistCounts[a.id] || 0));
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

  const filteredItems = items.filter(i =>
    !itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

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
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52525b]" />
              <input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search items..."
                className="w-full pl-9 pr-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
              />
            </div>
            <button
              onClick={() => setShowCreateItem(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#fafafa] text-[#09090b] rounded-lg text-sm font-medium hover:bg-[#e4e4e7] transition shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Item
            </button>
          </div>

          {itemsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : filteredItems.length === 0 ? (
            <p className="text-sm text-[#52525b] text-center py-12">
              {itemSearch ? "No items match your search." : "No items in catalog yet. Create your first item!"}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredItems.map(item => (
                <div key={item.id} className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 flex items-center gap-3 group">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${RARITY_COLORS[item.rarity]}15` }}
                  >
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <Star className="w-5 h-5" style={{ color: RARITY_COLORS[item.rarity] }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#fafafa] truncate">{item.name}</p>
                    {item.description && (
                      <p className="text-[11px] text-[#71717a] truncate">{item.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] capitalize font-medium" style={{ color: RARITY_COLORS[item.rarity] }}>
                        {item.rarity}
                      </span>
                      {item.server_id !== serverId && (
                        <span className="text-[9px] text-[#3b82f6]/70 bg-[#3b82f6]/10 px-1 rounded" title="Item shared from another server">🌐 Shared</span>
                      )}
                      {item.created_by_username && (
                        <span className="text-[9px] text-[#52525b]" title={`Added by ${item.created_by_username}`}>
                          by {item.created_by_username}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => { setDistItemId(item.id); setShowDistribute(true); }}
                      className="p-1.5 rounded-md hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition"
                      title="Distribute"
                    >
                      <Gift className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      className="p-1.5 rounded-md hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteItem(item.id).then(() => queryClient.invalidateQueries({ queryKey: ["items", serverId] })); }}
                      className="p-1.5 rounded-md hover:bg-[#27272a] text-[#a1a1aa] hover:text-red-400 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === "history" && (
        <div className="space-y-4">
          {distLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
          ) : Object.keys(groupedDistributions).length === 0 ? (
            <p className="text-sm text-[#52525b] text-center py-12">No distributions yet.</p>
          ) : (
            Object.entries(groupedDistributions).map(([date, dists]) => (
              <div key={date}>
                <p className="text-[10px] text-[#52525b] uppercase tracking-wider mb-2">{date}</p>
                <div className="space-y-1.5">
                  {dists.map(d => {
                    const item = items.find(i => i.id === d.item_id);
                    return (
                      <div key={d.id} className="bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 flex items-center gap-3 group">
                        <Gift className="w-4 h-4 text-[#71717a] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-[#fafafa]">
                            <span className="font-medium">{item?.name ?? "Unknown Item"}</span>
                            <span className="text-[#71717a]"> ×{d.quantity}</span>
                            <span className="text-[#71717a]"> → </span>
                            <span>{d.player_name}</span>
                          </p>
                          {d.reason && <p className="text-[10px] text-[#52525b]">{d.reason}</p>}
                        </div>
                        <button
                          onClick={() => deleteDistMutation.mutate(d.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#52525b] hover:text-red-400 transition"
                        >
                          <Trash2 className="w-3 h-3" />
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
        <div className="space-y-6">
          {/* Top Items */}
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-[#fafafa] mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-[#a1a1aa]" />
              Most Distributed Items
            </h3>
            {itemStats.length === 0 ? (
              <p className="text-sm text-[#52525b] text-center py-6">No distribution data yet.</p>
            ) : (
              <div className="space-y-2">
                {itemStats.map(stat => (
                  <div key={stat.item_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#27272a]/50 transition">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#fafafa] truncate">{stat.item_name}</p>
                      <p className="text-[10px] text-[#52525b]">{stat.recipient_count} recipient{stat.recipient_count !== 1 ? "s" : ""}</p>
                    </div>
                    <span className="text-sm font-mono font-bold text-[#fafafa]">×{stat.total_quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top Recipients */}
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-[#fafafa] mb-3 flex items-center gap-2">
              <Gift className="w-4 h-4 text-[#a1a1aa]" />
              Top Recipients
            </h3>
            {topRecipients.length === 0 ? (
              <p className="text-sm text-[#52525b] text-center py-6">No distribution data yet.</p>
            ) : (
              <div className="space-y-2">
                {topRecipients.map((r, i) => (
                  <div key={r.member_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#27272a]/50 transition">
                    <span className="text-xs font-mono text-[#52525b] w-5">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#fafafa]">{r.player_name}</p>
                      <p className="text-[10px] text-[#52525b]">{r.unique_items} unique items</p>
                    </div>
                    <span className="text-sm font-mono font-bold text-[#fafafa]">{r.total_items}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create Item Modal ── */}
      {showCreateItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setShowCreateItem(false); resetCreateForm(); }}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}
            onPaste={handlePaste}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#fafafa]">Create Item</h3>
              <button onClick={() => { setShowCreateItem(false); resetCreateForm(); }} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Name</label>
                <input
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g. Dragon Heart"
                  className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Description (optional)</label>
                <input
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  placeholder="Brief description"
                  className="w-full mt-1 px-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
                />
              </div>

              {/* Image Upload */}
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Image (optional)</label>
                {newItemImagePreview ? (
                  <div className="mt-1 relative rounded-lg overflow-hidden bg-[#09090b] border border-[#27272a]">
                    <img src={newItemImagePreview} alt="Preview" className="w-full h-32 object-contain" />
                    <button
                      onClick={() => { setNewItemImage(null); setNewItemImagePreview(null); }}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-[#fafafa] hover:bg-black/80 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`mt-1 border-2 border-dashed rounded-lg p-4 text-center transition cursor-pointer ${
                      imageDragOver ? "border-[#52525b] bg-[#27272a]/50" : "border-[#27272a] hover:border-[#3f3f46]"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setImageDragOver(true); }}
                    onDragLeave={() => setImageDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setImageDragOver(false);
                      const file = e.dataTransfer.files[0];
                      if (file) handleImageFile(file);
                    }}
                    onClick={() => document.getElementById("item-image-upload")?.click()}
                  >
                    <Upload className="w-5 h-5 text-[#52525b] mx-auto mb-1" />
                    <p className="text-[10px] text-[#52525b]">
                      <span className="text-[#71717a] font-medium">Click to upload</span> or drag & drop
                    </p>
                    <p className="text-[9px] text-[#52525b]/50 mt-0.5">or <kbd className="px-1 py-0.5 rounded bg-[#27272a] text-[#71717a] text-[9px]">Ctrl+V</kbd> paste from clipboard</p>
                  </div>
                )}
                <input
                  id="item-image-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageFile(file);
                    e.target.value = "";
                  }}
                />
              </div>

              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Rarity</label>
                <div className="flex gap-1.5 mt-1">
                  {RARITY_ORDER.map(r => (
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
                  ))}
                </div>
              </div>
              <button
                onClick={() => createItemMutation.mutate()}
                disabled={!newItemName.trim() || createItemMutation.isPending}
                className="w-full py-2 bg-[#fafafa] text-[#09090b] rounded-lg text-sm font-medium hover:bg-[#e4e4e7] transition disabled:opacity-50"
              >
                {createItemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Create Item"}
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
              {/* Item search + select */}
              <div>
                <label className="text-[10px] text-[#71717a] uppercase tracking-wider">Item</label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
                  <input
                    value={distItemSearch}
                    onChange={(e) => setDistItemSearch(e.target.value)}
                    placeholder="Search item..."
                    className="w-full pl-8 pr-3 py-2 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
                  />
                </div>
                <div className="mt-1.5 max-h-28 overflow-y-auto space-y-0.5">
                  {filteredDistItems.slice(0, 20).map(i => {
                    const distCount = itemDistCounts[i.id] || 0;
                    return (
                    <button key={i.id}
                      onClick={() => { setDistItemId(i.id); setDistItemSearch(i.name); }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition text-left ${distItemId === i.id ? "bg-[#fafafa]/10 text-[#fafafa] border border-[#fafafa]/20" : "text-[#a1a1aa] hover:bg-[#09090b] hover:text-[#d4d4d8]"}`}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: RARITY_COLORS[i.rarity] }} />
                      <span className="flex-1 truncate">{i.name}</span>
                      {distCount > 0 && <span className="text-[10px] text-[#52525b] font-mono">{distCount}</span>}
                      <span className="text-[10px] capitalize text-[#52525b]">{i.rarity}</span>
                    </button>
                    );
                  })}
                  {filteredDistItems.length === 0 && (
                    <p className="text-[10px] text-[#52525b] text-center py-2">No items match</p>
                  )}
                </div>
              </div>

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
