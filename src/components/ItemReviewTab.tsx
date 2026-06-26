import { useState, useEffect } from "react";
import { fetchPendingItems, approveItem, rejectItem } from "@/lib/supabase";
import { Loader2, Check, X, Package } from "lucide-react";

type PendingItem = {
  id: string;
  name: string;
  game: string;
  image_url: string | null;
  description: string | null;
  rarity: string;
  server_id: string | null;
  created_by_username: string | null;
  created_at: string;
};

export function ItemReviewTab({ gameSlug, onCountChange }: { gameSlug: string; onCountChange?: (count: number) => void }) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const loadItems = () => {
    if (!gameSlug) return;
    setLoading(true);
    fetchPendingItems(gameSlug)
      .then(data => {
        setItems(data);
        onCountChange?.(data.length);
      })
      .catch(() => { setItems([]); onCountChange?.(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadItems();
  }, [gameSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async (id: string) => {
    setProcessing(prev => new Set(prev).add(id));
    try {
      await approveItem(id);
      const remaining = items.filter(i => i.id !== id);
      setItems(remaining);
      onCountChange?.(remaining.length);
    } catch (err) {
      console.error("Failed to approve item:", err);
    } finally {
      setProcessing(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(prev => new Set(prev).add(id));
    try {
      await rejectItem(id);
      const remaining = items.filter(i => i.id !== id);
      setItems(remaining);
      onCountChange?.(remaining.length);
    } catch (err) {
      console.error("Failed to reject item:", err);
    } finally {
      setProcessing(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const handleApproveAll = async () => {
    for (const item of items) {
      setProcessing(prev => new Set(prev).add(item.id));
      try { await approveItem(item.id); } catch {}
    }
    setItems([]);
    onCountChange?.(0);
    setProcessing(new Set());
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#a1a1aa]" /></div>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <Package className="w-8 h-8 text-[#27272a] mx-auto mb-2" />
        <p className="text-xs text-[#52525b]">No pending items to review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-xs font-semibold text-[#d4d4d8]">Pending Items ({items.length})</h4>
        <button
          onClick={handleApproveAll}
          disabled={processing.size > 0}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 text-[#fafafa] transition disabled:opacity-50"
        >
          <Check className="w-3 h-3" /> Approve All
        </button>
      </div>
      <div className="space-y-1">
        {items.map(item => {
          const rarityColor = (() => {
            const colors: Record<string, string> = { common: "#71717a", uncommon: "#22c55e", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ef4444" };
            return colors[item.rarity?.toLowerCase()] || "#71717a";
          })();
          const busy = processing.has(item.id);
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
                  <span className="text-[#3f3f46]">{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleApprove(item.id)}
                  disabled={busy}
                  className="p-1.5 rounded text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 transition disabled:opacity-50"
                  title="Approve"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleReject(item.id)}
                  disabled={busy}
                  className="p-1.5 rounded text-[#71717a] hover:text-[#f87171] hover:bg-red-400/10 transition disabled:opacity-50"
                  title="Reject"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
