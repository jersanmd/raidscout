import { useState, useEffect } from "react";
import { fetchApprovedCommunityItems, deleteItemCatalogItem } from "@/lib/supabase";
import { Loader2, Package, Trash2, Search } from "lucide-react";

type CatalogItem = {
  id: string;
  game: string;
  name: string;
  rarity: string;
  description?: string | null;
  image_url?: string | null;
  category_id?: string | null;
  created_by_username?: string | null;
  created_at?: string;
};

export function ApprovedItemsTab({ gameSlug, onCountChange }: { gameSlug: string; onCountChange?: (count: number) => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const ITEMS_PER_PAGE = 50;

  const loadPage = async (offset: number, s?: string) => {
    if (!gameSlug) return;
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const { items: newItems, total: t } = await fetchApprovedCommunityItems(gameSlug, ITEMS_PER_PAGE, offset, s);
      setItems(prev => offset === 0 ? newItems : [...prev, ...newItems]);
      setTotal(t);
      if (offset === 0) onCountChange?.(t);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Load on mount
  useEffect(() => { loadPage(0); }, [gameSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (val: string) => {
    setSearch(val);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => loadPage(0, val || undefined), 300);
    setTimer(t);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item from the catalog?")) return;
    await deleteItemCatalogItem(id);
    const remaining = items.filter(i => i.id !== id);
    setItems(remaining);
    const newTotal = total - 1;
    setTotal(newTotal);
    onCountChange?.(newTotal);
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#a1a1aa]" /></div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <Package className="w-8 h-8 text-[#27272a] mx-auto mb-2" />
        <p className="text-xs text-[#52525b]">No approved items in the catalog yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-xs font-semibold text-[#d4d4d8]">Approved Items ({total})</h4>
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#52525b]" />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search approved…"
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-[#18181b] border border-[#27272a] rounded text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
          />
        </div>
      </div>
      <div className="space-y-1">
        {items.map(item => {
          const rarityColor = (() => {
            const colors: Record<string, string> = { common: "#71717a", uncommon: "#22c55e", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ef4444" };
            return colors[item.rarity?.toLowerCase()] || "#71717a";
          })();
          return (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2 bg-[#18181b]/30 rounded text-sm">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${rarityColor}18` }}>
                {item.image_url ? (
                  <img src={item.image_url} alt="" className="w-6 h-6 rounded object-cover" />
                ) : (
                  <Package className="w-4 h-4" style={{ color: rarityColor }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#fafafa] truncate text-[13px]">{item.name}</p>
                <div className="flex items-center gap-2 text-[11px]">
                  <span style={{ color: rarityColor }} className="uppercase font-semibold">{item.rarity}</span>
                  {item.created_by_username && <span className="text-[#52525b]">by {item.created_by_username}</span>}
                  {item.created_at && <span className="text-[#3f3f46]">{new Date(item.created_at).toLocaleDateString()}</span>}
                </div>
              </div>
              <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded text-[#52525b] hover:text-[#f87171] hover:bg-red-400/10 transition" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      {items.length < total && (
        <button onClick={() => loadPage(items.length, search || undefined)} disabled={loadingMore} className="w-full py-2 text-xs text-[#71717a] hover:text-[#d4d4d8] bg-[#18181b]/30 hover:bg-[#18181b]/60 rounded transition disabled:opacity-50">
          {loadingMore ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : `Load More (${items.length} of ${total})`}
        </button>
      )}
    </div>
  );
}
