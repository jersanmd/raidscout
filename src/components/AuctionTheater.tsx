import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Crown, Timer, Users } from "lucide-react";
import { getActiveAuctions, getActiveBids, type ActiveAuction, type DkpBid } from "@/lib/api/dkp";
import { supabase } from "@/lib/supabase";
import { rarityColor, rarityGlow, fetchItemRarities } from "@/lib/rarity";

export default function AuctionTheater({
  auctionId,
  serverId,
  onClose,
}: {
  auctionId: string;
  serverId: string;
  onClose: () => void;
}) {
  const [, setTick] = useState(0);
  const bidScrollRef = useRef<HTMLDivElement>(null);

  // Force re-render every second for smooth countdown
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Fetch auction + bids every 1s for live updates — never cache
  const { data: auction } = useQuery({
    queryKey: ["dkp_theater_auction", serverId, auctionId],
    queryFn: async () => {
      const auctions = await getActiveAuctions(serverId);
      return auctions.find(a => a.auction_id === auctionId) ?? null;
    },
    refetchInterval: 1000,
    staleTime: 0,
    gcTime: 0,
  });

  const { data: bids = [] } = useQuery({
    queryKey: ["dkp_theater_bids", serverId],
    queryFn: () => getActiveBids(serverId),
    refetchInterval: 1000,
    staleTime: 0,
    gcTime: 0,
  });

  const relevantBids = useMemo(() =>
    bids
      .filter((b: DkpBid) => b.auction_id === auctionId)
      .sort((a: DkpBid, b: DkpBid) => b.bid_amount - a.bid_amount),
    [bids, auctionId]
  );

  // Fetch game rarities for color lookups
  const { data: rarities = [] } = useQuery({
    queryKey: ["auction_rarities", serverId],
    queryFn: async () => {
      const { data: srv } = await supabase.from("servers").select("game").eq("id", serverId).single();
      if (!srv?.game) return [];
      return fetchItemRarities(srv.game);
    },
    staleTime: 60_000,
  });

  // Track new bids for slide-up animation via persistent version counter
  const recentBidIds = useRef<Set<string>>(new Set());
  const animVersion = useRef(0);
  const bidAnimMap = useRef<Map<string, number>>(new Map());

  const currentIds = new Set(relevantBids.map(b => b.id));
  for (const id of currentIds) {
    if (!recentBidIds.current.has(id) && !bidAnimMap.current.has(id)) {
      animVersion.current++;
      bidAnimMap.current.set(id, animVersion.current);
    }
  }
  recentBidIds.current = currentIds;
  for (const id of bidAnimMap.current.keys()) {
    if (!currentIds.has(id)) bidAnimMap.current.delete(id);
  }

  const isNew = (bidId: string) => bidAnimMap.current.has(bidId) && bidAnimMap.current.get(bidId)! === animVersion.current;

  const topTwo = relevantBids.slice(0, 2);
  const bidHistory = relevantBids.slice(2);

  // Auto-scroll bid history to top (newest/highest bids first)
  useEffect(() => {
    if (bidScrollRef.current) {
      bidScrollRef.current.scrollTop = 0;
    }
  }, [bids.length]);

  // Compute time remaining
  const now = Date.now();
  const endTime = auction ? new Date(auction.bid_end_time).getTime() : now;
  const remainingMs = Math.max(0, endTime - now);
  const ended = remainingMs <= 0;
  const totalMs = auction ? endTime - new Date(auction.created_at).getTime() : 3600_000;
  const pctRemaining = totalMs > 0 ? Math.min(100, Math.max(0, (remainingMs / totalMs) * 100)) : 0;
  const mins = Math.floor(remainingMs / 60_000);
  const secs = Math.floor((remainingMs % 60_000) / 1000);
  const timeStr = ended ? "Ended" : `${mins}:${secs.toString().padStart(2, "0")}`;

  const rarity = auction?.rarity ?? "common";
  const rarityColStr = rarityColor(rarity, rarities as any[]);
  const rarityGlStr = rarityGlow(rarity, rarities as any[]);
  const rarityLabel = rarity;

  const barColor = remainingMs < 60_000 ? "#71717a"
    : remainingMs < 300_000 ? "#ef4444"
    : remainingMs < 900_000 ? "#f59e0b"
    : "#22c55e";

  if (!auction) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
        <div className="text-[#71717a] text-sm">Auction not found or already resolved.</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl mx-4 rounded-2xl border overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(180deg, #0c0a09 0%, #09090b 100%)",
          borderColor: rarityColStr + "40",
          boxShadow: `0 0 80px ${rarityGlStr}, 0 0 200px ${rarityGlStr}`,
          maxHeight: "90vh",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-1.5 rounded-lg bg-black/40 text-[#71717a] hover:text-[#fafafa] transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center justify-center gap-2 px-6 pt-6 pb-2">
          <Crown className="w-5 h-5 text-amber-400" />
          <h2 className="text-sm font-bold text-amber-400 uppercase tracking-widest">Auction Theater</h2>
        </div>

        {/* Item showcase */}
        <div className="flex flex-col items-center px-6 py-4">
          {auction.image_url && (
            <div
              className="w-24 h-24 rounded-2xl overflow-hidden mb-3"
              style={{ boxShadow: `0 0 40px ${rarityGlStr}`, backgroundColor: rarityColStr + "18" }}
            >
              <img src={auction.image_url} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <h1
            className="text-2xl font-extrabold text-center"
            style={{ color: rarityColStr, textShadow: `0 0 20px ${rarityGlStr}` }}
          >
            {auction.item_name}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: rarityColStr + "20", color: rarityColStr }}
            >
              {rarityLabel}
            </span>
            {auction.guild_name && (
              <span className="text-[11px] text-[#71717a]">· {auction.guild_name} only</span>
            )}
            {auction.quantity > 1 && (
              <span className="text-[11px] text-[#71717a]">· x{auction.quantity}</span>
            )}
          </div>
        </div>

        {/* Countdown */}
        <div className="px-6 pb-1">
          <div className="flex items-center justify-between text-[11px] text-[#71717a] mb-1">
            <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{ended ? "Ended" : "Remaining"}</span>
            <span className={`font-mono font-bold ${ended ? "text-red-400 animate-pulse" : ""}`} style={{ color: ended ? undefined : barColor }}>{timeStr}</span>
          </div>
          <div className="h-2 rounded-full bg-[#27272a] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${pctRemaining}%`, background: barColor }}
            />
          </div>
        </div>

        {/* Top 2 bidders */}
        <div className={`grid gap-3 px-6 py-4 ${topTwo.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {topTwo.length > 0 ? (
            topTwo.map((b: DkpBid, i: number) => (
              <div
                key={b.member_id}
                className={`relative rounded-xl p-4 text-center overflow-hidden ${isNew(b.id) ? "animate-slide-up" : ""} ${topTwo.length === 1 ? "max-w-[240px] mx-auto w-full" : ""}`}
                style={{
                  background: i === 0 ? rarityColStr + "10" : "#18181b",
                  border: `1px solid ${i === 0 ? rarityColStr + "40" : "#27272a"}`,
                }}
              >
                {i === 0 && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2">
                    <Crown className="w-4 h-4" style={{ color: rarityColStr }} />
                  </div>
                )}
                <p className="text-[13px] font-bold text-[#fafafa] mt-2 truncate">{b.member_name}</p>
                <p
                  className="text-2xl font-extrabold mt-1 tabular-nums"
                  style={{ color: i === 0 ? rarityColStr : "#a1a1aa" }}
                >
                  {b.bid_amount}
                </p>
                <p className="text-[11px] text-[#52525b]">DKP</p>
              </div>
            ))
          ) : (
            <div className="col-span-2 text-center py-6 text-[#52525b] text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No bids yet — be the first!
            </div>
          )}
        </div>

        {/* Bid history */}
        {bidHistory.length > 0 && (
          <div ref={bidScrollRef} className="flex-1 overflow-y-auto px-6 pb-2 max-h-32">
            <p className="text-[11px] text-[#52525b] uppercase tracking-wider mb-2">Bid History</p>
            <div className="space-y-1">
              {bidHistory.map((b: DkpBid) => (
                <div key={b.id} className={`flex items-center justify-between text-[11px] ${isNew(b.id) ? "animate-slide-up" : ""}`}>
                  <span className="text-[#a1a1aa] truncate flex-1">{b.member_name}</span>
                  <span className="font-bold tabular-nums text-[#71717a] ml-2">{b.bid_amount}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

