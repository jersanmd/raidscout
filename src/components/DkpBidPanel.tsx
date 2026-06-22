import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerId } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { markItemForBid, unmarkItemFromBid, placeBid, getItemBids, resolveAuction, cancelBid, getMemberDkp, getDkpConfig, type ItemBid } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { Gavel, Loader2, X, Check, AlertTriangle, Coins } from "lucide-react";

interface DkpBidPanelProps {
  item: {
    id: string;
    name: string;
    is_up_for_bid?: boolean;
    dkp_cost?: number | null;
    dkp_min_bid?: number | null;
    bid_end_time?: string | null;
  };
  isOwnerOrMod: boolean;
}

export function DkpBidPanel({ item, isOwnerOrMod }: DkpBidPanelProps) {
  const serverId = useServerId();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showMarkModal, setShowMarkModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [dkpCost, setDkpCost] = useState(10);
  const [bidEndDate, setBidEndDate] = useState("");
  const [bidAmount, setBidAmount] = useState(0);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: dkpConfig } = useQuery({
    queryKey: ["dkp_config", serverId],
    queryFn: () => getDkpConfig(serverId!),
    enabled: !!serverId,
  });

  const isBidding = item.is_up_for_bid;
  const bidEnded = item.bid_end_time ? new Date(item.bid_end_time) < new Date() : false;

  const { data: bids = [], refetch: refetchBids } = useQuery({
    queryKey: ["item_bids", item.id],
    queryFn: () => getItemBids(item.id),
    enabled: isBidding && isOwnerOrMod,
  });

  const activeBids = bids.filter(b => b.status === "active");
  const hasBids = activeBids.length > 0;

  const handleMarkForBid = async () => {
    if (!serverId) return;
    setActing(true);
    setError(null);
    try {
      await markItemForBid(item.id, dkpCost, bidEndDate ? new Date(bidEndDate).toISOString() : null);
      queryClient.invalidateQueries({ queryKey: ["items"] });
      setShowMarkModal(false);
    } catch (err: any) {
      setError(err?.message || "Failed to mark item");
    } finally {
      setActing(false);
    }
  };

  const handleUnmark = async () => {
    if (!serverId) return;
    setActing(true);
    try {
      await unmarkItemFromBid(item.id);
      queryClient.invalidateQueries({ queryKey: ["items"] });
    } catch (err: any) {
      setError(err?.message || "Failed to unmark");
    } finally {
      setActing(false);
    }
  };

  const handlePlaceBid = async () => {
    if (!bidAmount || bidAmount < (item.dkp_min_bid ?? 1)) return;
    setActing(true);
    setError(null);
    try {
      await placeBid(item.id, bidAmount);
      queryClient.invalidateQueries({ queryKey: ["dkp_balance"] });
      setShowBidModal(false);
    } catch (err: any) {
      setError(err?.message || "Failed to place bid");
    } finally {
      setActing(false);
    }
  };

  const handleResolve = async (winnerBidId: string | null) => {
    if (!serverId) return;
    setActing(true);
    try {
      await resolveAuction(item.id, winnerBidId);
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["item_bids", item.id] });
      setShowResolveModal(false);
    } catch (err: any) {
      setError(err?.message || "Failed to resolve");
    } finally {
      setActing(false);
    }
  };

  if (!dkpConfig?.enabled) return null;

  const timeLeft = item.bid_end_time
    ? Math.max(0, Math.ceil((new Date(item.bid_end_time).getTime() - Date.now()) / 60000))
    : 0;

  return (
    <div className="space-y-1.5">
      {/* Bid status bar */}
      {isBidding && (
        <div className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] ${bidEnded ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
          <Gavel className="w-3 h-3" />
          <span>Bidding · {item.dkp_cost} DKP</span>
          {timeLeft > 0 && !bidEnded && <span>· {timeLeft}min left</span>}
          {bidEnded && <span>· Ended</span>}
          {hasBids && isOwnerOrMod && <span>· {activeBids.length} bid{activeBids.length !== 1 ? "s" : ""}</span>}
        </div>
      )}

      {/* Officer actions */}
      {isOwnerOrMod && (
        <div className="flex gap-1">
          {!isBidding ? (
            <button onClick={() => { setShowMarkModal(true); setDkpCost(10); setBidEndDate(""); setError(null); }}
              className="text-[10px] px-2 py-0.5 rounded bg-[#27272a] text-[#a1a1aa] hover:text-amber-400 transition">
              <Gavel className="w-3 h-3 inline mr-1" />Mark for Bid
            </button>
          ) : (
            <>
              <button onClick={() => setShowResolveModal(true)}
                className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition">
                Resolve ({activeBids.length})
              </button>
              <button onClick={handleUnmark} disabled={acting}
                className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-40">
                Unmark
              </button>
            </>
          )}
        </div>
      )}

      {/* Member bid button */}
      {!isOwnerOrMod && isBidding && !bidEnded && (
        <button onClick={() => { setShowBidModal(true); setBidAmount(item.dkp_min_bid ?? 1); setError(null); }}
          className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition w-full">
          <Coins className="w-3 h-3 inline mr-1" />Place Bid
        </button>
      )}

      {/* Mark for Bid Modal */}
      {showMarkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowMarkModal(false)}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#fafafa] mb-3">Mark "{item.name}" for Bid</h3>
            {error && <p className="text-xs text-red-400 mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[#71717a]">DKP Cost</label>
                <input type="number" value={dkpCost} onChange={e => setDkpCost(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#0d0d11] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#fafafa] outline-none mt-1" min={1} />
              </div>
              <div>
                <label className="text-[10px] text-[#71717a]">Bid End Date & Time</label>
                <input type="datetime-local" value={bidEndDate}
                  onChange={e => setBidEndDate(e.target.value)}
                  className="w-full bg-[#0d0d11] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#fafafa] outline-none mt-1 [color-scheme:dark]" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowMarkModal(false)} className="flex-1 py-2 rounded text-sm bg-[#27272a] text-[#d4d4d8]">Cancel</button>
                <button onClick={handleMarkForBid} disabled={acting || dkpCost < 1}
                  className="flex-1 py-2 rounded text-sm bg-amber-500/20 text-amber-400 font-medium disabled:opacity-40">
                  {acting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Mark for Bid"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Bids Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowResolveModal(false)}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-96 max-h-[70vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#fafafa] mb-1">Resolve "{item.name}"</h3>
            <p className="text-[10px] text-[#71717a] mb-3">{activeBids.length} active bid{activeBids.length !== 1 ? "s" : ""}</p>
            {error && <p className="text-xs text-red-400 mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}
            {activeBids.length === 0 ? (
              <p className="text-xs text-[#52525b] text-center py-4">No active bids.</p>
            ) : (
              <div className="space-y-1 mb-3">
                {activeBids.map(bid => (
                  <div key={bid.id} className="flex items-center justify-between p-2 rounded bg-[#0d0d11] border border-[#1e1e2a]">
                    <div>
                      <p className="text-xs text-[#fafafa]">{bid.member_name}</p>
                      <p className="text-[10px] text-[#52525b]">{new Date(bid.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-amber-400">{bid.bid_amount}</span>
                      <button onClick={() => handleResolve(bid.id)} disabled={acting}
                        className="px-2 py-1 rounded text-[10px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-40">
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => handleResolve(null)} disabled={acting}
                className="flex-1 py-2 rounded text-sm bg-red-500/10 text-red-400 disabled:opacity-40">
                Cancel Auction
              </button>
              <button onClick={() => setShowResolveModal(false)} className="flex-1 py-2 rounded text-sm bg-[#27272a] text-[#d4d4d8]">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Place Bid Modal */}
      {showBidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowBidModal(false)}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#fafafa] mb-1">Bid on "{item.name}"</h3>
            <p className="text-[10px] text-[#71717a] mb-3">Min bid: {item.dkp_min_bid ?? 1} DKP · {timeLeft}min remaining</p>
            {error && <p className="text-xs text-red-400 mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}
            <div className="space-y-3">
              <input type="number" value={bidAmount} onChange={e => setBidAmount(parseInt(e.target.value) || 0)}
                className="w-full bg-[#0d0d11] border border-[#27272a] rounded px-2 py-2 text-lg font-bold text-[#fafafa] outline-none text-center"
                min={item.dkp_min_bid ?? 1} autoFocus />
              <div className="flex gap-2">
                <button onClick={() => setShowBidModal(false)} className="flex-1 py-2 rounded text-sm bg-[#27272a] text-[#d4d4d8]">Cancel</button>
                <button onClick={handlePlaceBid} disabled={acting || bidAmount < (item.dkp_min_bid ?? 1)}
                  className="flex-1 py-2 rounded text-sm bg-amber-500/20 text-amber-400 font-medium disabled:opacity-40">
                  {acting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Place Bid"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
