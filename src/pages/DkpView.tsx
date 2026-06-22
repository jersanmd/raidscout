import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { useServerId } from "@/contexts/ServerContext";
import { useToast } from "@/contexts/ToastContext";
import {
  getMemberDkp, getServerDkpRankings, getMemberDkpHistory, getActiveAuctions,
  getDkpConfig, markItemForBid, placeBid, getItemBids, resolveAuction,
  supabase,
  type DkpBalance, type DkpRanking, type DkpTransaction, type ItemBid, type ActiveAuction,
} from "@/lib/supabase";
import { Coins, TrendingUp, TrendingDown, History, Gavel, Loader2, Shield, Clock, Check, X, AlertTriangle, Image, Plus, Eye } from "lucide-react";

export function DkpView() {
  const { user, isViewer } = useAuth();
  const { currentServer } = useServer();
  const serverId = useServerId();
  if (isViewer) return <Empty icon={Shield} text="DKP is not available in viewer mode." />;
  if (!currentServer || !serverId) return <Empty icon={Shield} text="Select a server to view DKP." />;
  return <DkpContent serverId={serverId} />;
}

function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return <div className="max-w-4xl mx-auto px-4 py-20 text-center"><Icon className="w-10 h-10 text-[#3f3f46] mx-auto mb-2" /><p className="text-sm text-[#71717a]">{text}</p></div>;
}

function DkpContent({ serverId }: { serverId: string }) {
  const { user } = useAuth();
  const { currentServer } = useServer();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const tz = currentServer?.timezone || "UTC";
  const isStaff = currentServer?.role === "owner" || currentServer?.role === "moderator";
  const [memberId, setMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("members").select("id").eq("server_id", serverId).eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setMemberId(data.id); });
  }, [user, serverId]);

  const { data: dkpConfig } = useQuery({ queryKey: ["dkp_config", serverId], queryFn: () => getDkpConfig(serverId), enabled: !!serverId });
  if (!dkpConfig?.enabled) return <Empty icon={Coins} text="DKP is not enabled on this server." />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2"><Coins className="w-5 h-5 text-amber-400" /><h2 className="text-lg font-bold text-[#fafafa]">DKP</h2></div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          {memberId ? <Ledger memberId={memberId} serverId={serverId} /> : <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-6 text-center"><Shield className="w-6 h-6 text-[#52525b] mx-auto mb-1" /><p className="text-xs text-[#71717a]">Claim your profile to view DKP</p></div>}
          <Leaderboard serverId={serverId} />
        </div>
        <div className="lg:col-span-2 space-y-4">
          <LiveAuction serverId={serverId} isStaff={isStaff} memberId={memberId} tz={tz} toast={toast} queryClient={queryClient} />
          {memberId && <HistorySection memberId={memberId} serverId={serverId} />}
        </div>
      </div>
    </div>
  );
}

function Ledger({ memberId, serverId }: { memberId: string; serverId: string }) {
  const { data: balance, isLoading } = useQuery({ queryKey: ["dkp_balance", memberId, serverId], queryFn: () => getMemberDkp(memberId, serverId), refetchInterval: 10_000 });
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>;
  return (
    <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 space-y-3">
      <h3 className="text-xs font-semibold text-[#71717a] uppercase tracking-wider">DKP Ledger</h3>
      <div className="text-center"><p className="text-4xl font-extrabold text-amber-400">{balance?.balance ?? 0}</p><p className="text-[10px] text-[#71717a] mt-1">Available DKP</p></div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-[#18181b] rounded-lg p-2"><TrendingUp className="w-3 h-3 text-emerald-400 mx-auto mb-0.5" /><p className="text-sm font-bold text-emerald-400">+{balance?.earned_this_week ?? 0}</p><p className="text-[9px] text-[#52525b]">Earned (7d)</p></div>
        <div className="bg-[#18181b] rounded-lg p-2"><TrendingDown className="w-3 h-3 text-red-400 mx-auto mb-0.5" /><p className="text-sm font-bold text-red-400">-{balance?.spent_this_week ?? 0}</p><p className="text-[9px] text-[#52525b]">Spent (7d)</p></div>
      </div>
    </div>
  );
}

function Leaderboard({ serverId }: { serverId: string }) {
  const { data: rankings = [], isLoading } = useQuery({ queryKey: ["dkp_rankings", serverId], queryFn: () => getServerDkpRankings(serverId), refetchInterval: 30_000 });
  return (
    <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e2a]"><span className="text-xs font-semibold text-[#71717a] uppercase tracking-wider">Leaderboard</span></div>
      {isLoading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[#52525b] animate-spin" /></div>
      : rankings.length === 0 ? <div className="px-4 py-6 text-center"><p className="text-xs text-[#71717a]">No DKP earned yet.</p></div>
      : <div className="divide-y divide-[#1e1e2a]/50">{rankings.slice(0, 15).map(r => (
          <div key={r.member_id} className="flex items-center gap-3 px-4 py-2"><span className="text-[10px] font-bold text-[#52525b] w-5 text-right">{r.rank}</span><span className="text-xs text-[#d4d4d8] flex-1 truncate">{r.member_name}</span><span className="text-xs font-bold text-amber-400 tabular-nums">{r.balance}</span></div>
        ))}</div>}
    </div>
  );
}

function LiveAuction({ serverId, isStaff, memberId, tz, toast, queryClient }: any) {
  const [showMark, setShowMark] = useState(false);
  const [showBid, setShowBid] = useState<string | null>(null);
  const [showResolve, setShowResolve] = useState<string | null>(null);
  const [showBids, setShowBids] = useState<string | null>(null);
  const [markName, setMarkName] = useState("");
  const [markCost, setMarkCost] = useState(10);
  const [markEnd, setMarkEnd] = useState("");
  const [bidAmt, setBidAmt] = useState(0);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: auctions = [], isLoading } = useQuery({ queryKey: ["dkp_active_auctions", serverId], queryFn: () => getActiveAuctions(serverId), refetchInterval: 10_000 });

  const doMark = async () => {
    if (!markName.trim()) return; setActing(true); setError(null);
    try {
      const { data: sv } = await supabase.from("servers").select("game").eq("id", serverId).single();
      const gameSlug = sv?.game ?? undefined;
      const { data: items } = await supabase.from("items").select("id")
        .or(gameSlug ? `game.eq.${gameSlug},server_id.eq.${serverId}` : `server_id.eq.${serverId}`)
        .neq("status", "rejected").ilike("name", `%${markName.trim()}%`).limit(1);
      if (!items?.length) { setError("Item not found"); setActing(false); return; }
      await markItemForBid(items[0].id, markCost, markEnd ? new Date(markEnd + ":00").toISOString() : null);
      queryClient.invalidateQueries({ queryKey: ["dkp_active_auctions"] });
      toast("success", `"${markName.trim()}" marked for bid.`);
      setShowMark(false); setMarkName(""); setMarkEnd("");
    } catch (err: any) { setError(err?.message || "Failed"); } finally { setActing(false); }
  };

  const doBid = async (itemId: string) => {
    setActing(true); setError(null);
    try { await placeBid(itemId, bidAmt); queryClient.invalidateQueries({ queryKey: ["dkp_balance"] }); queryClient.invalidateQueries({ queryKey: ["dkp_active_auctions"] }); toast("success", `Bid placed.`); setShowBid(null); }
    catch (err: any) { setError(err?.message || "Failed"); } finally { setActing(false); }
  };

  const doResolve = async (itemId: string, winnerId: string | null) => {
    setActing(true);
    try { await resolveAuction(itemId, winnerId); queryClient.invalidateQueries({ queryKey: ["dkp_active_auctions"] }); queryClient.invalidateQueries({ queryKey: ["dkp_balance"] }); toast("success", winnerId ? "Auction resolved." : "Auction cancelled."); setShowResolve(null); }
    catch (err: any) { setError(err?.message || "Failed"); } finally { setActing(false); }
  };

  return (
    <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e2a] flex items-center justify-between">
        <div className="flex items-center gap-2"><Gavel className="w-4 h-4 text-amber-400" /><span className="text-xs font-semibold text-[#71717a] uppercase tracking-wider">Live Auction</span></div>
        {isStaff && <button onClick={() => { setShowMark(true); setMarkName(""); setMarkCost(10); setError(null); const now = new Date(); const local = new Date(now.toLocaleString("en-US", { timeZone: tz })); local.setHours(23, 59, 0, 0); const pad = (n: number) => String(n).padStart(2, "0"); setMarkEnd(`${local.getFullYear()}-${pad(local.getMonth()+1)}-${pad(local.getDate())}T23:59`); }} className="text-[10px] px-2 py-0.5 rounded bg-[#27272a] text-[#a1a1aa] hover:text-amber-400 transition"><Plus className="w-3 h-3 inline mr-1" />Mark for Bid</button>}
      </div>
      {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>
      : auctions.length === 0 ? <div className="px-4 py-8 text-center"><Gavel className="w-8 h-8 text-[#3f3f46] mx-auto mb-2" /><p className="text-xs text-[#71717a]">No active auctions</p></div>
      : <div className="divide-y divide-[#1e1e2a]/50">{auctions.map((it: ActiveAuction) => <AuctionRow key={it.item_id} item={it} isStaff={isStaff} memberId={memberId} tz={tz} onBid={() => { setShowBid(it.item_id); setBidAmt(1); setError(null); }} onResolve={() => setShowResolve(it.item_id)} onViewBids={() => setShowBids(it.item_id)} />)}</div>}

      {showMark && <MarkModal name={markName} setName={setMarkName} cost={markCost} setCost={setMarkCost} end={markEnd} setEnd={setMarkEnd} acting={acting} error={error} onClose={() => setShowMark(false)} onMark={doMark} serverId={serverId} />}
      {showBid && <BidModalUI itemId={showBid} bidAmt={bidAmt} setBidAmt={setBidAmt} acting={acting} error={error} onClose={() => setShowBid(null)} onBid={() => doBid(showBid)} />}
      {showResolve && <ResolveModalUI itemId={showResolve} onClose={() => setShowResolve(null)} onResolve={(w: string | null) => doResolve(showResolve, w)} />}
      {showBids && <BidsModal itemId={showBids} onClose={() => setShowBids(null)} />}
    </div>
  );
}

const RARITY_COLORS: Record<string, string> = { common: "#71717a", uncommon: "#22c55e", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ef4444" };
function rc(rarity?: string) { return RARITY_COLORS[rarity?.toLowerCase() ?? ""] || "#71717a"; }

function useCountdown(endTime: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endTime) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endTime]);
  if (!endTime) return { ended: false, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  const totalMs = new Date(endTime).getTime() - now;
  if (totalMs <= 0) return { ended: true, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  const totalSec = Math.floor(totalMs / 1000);
  return { ended: false, days: Math.floor(totalSec / 86400), hours: Math.floor((totalSec % 86400) / 3600), minutes: Math.floor((totalSec % 3600) / 60), seconds: totalSec % 60, totalMs };
}

function AuctionRow({ item, isStaff, memberId, tz, onBid, onResolve, onViewBids }: { item: ActiveAuction; isStaff: boolean; memberId: string | null; tz: string; onBid: () => void; onResolve: () => void; onViewBids: () => void }) {
  const cd = useCountdown(item.bid_end_time);
  const ended = cd.ended;
  const rarityColor = rc(item.rarity ?? undefined);
  const endLocal = item.bid_end_time ? new Date(item.bid_end_time).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const fmt = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[#18181b]/50 transition">
      {item.image_url ? <img src={item.image_url} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-[#1e1e2a]" style={{ backgroundColor: rarityColor + "20" }} /> : <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: rarityColor + "18" }}><Image className="w-4 h-4" style={{ color: rarityColor }} /></div>}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: rarityColor }}>{item.item_name}</p>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-amber-400 font-bold">{item.highest_bid || item.dkp_cost} DKP</span>
          <button onClick={onViewBids} className="text-[#52525b] hover:text-[#d4d4d8] transition">{item.bid_count} bid{item.bid_count !== 1 ? "s" : ""}</button>
          {!ended ? <span className="text-[#a1a1aa] flex items-center gap-0.5 tabular-nums"><Clock className="w-3 h-3" />{cd.days > 0 ? `${cd.days}d ` : ""}{fmt(cd.hours)}:{fmt(cd.minutes)}:{fmt(cd.seconds)}</span> : <span className="text-red-400">Ended</span>}
          <span className="text-[#52525b]">· {endLocal}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {memberId && !ended && <button onClick={onBid} className="px-2 py-1 rounded text-[10px] bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition"><Coins className="w-3 h-3 inline mr-0.5" />Bid</button>}
        {isStaff && <button onClick={onResolve} className="px-2 py-1 rounded text-[10px] bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">Resolve</button>}
      </div>
    </div>
  );
}

function MarkModal({ name, setName, cost, setCost, end, setEnd, acting, error, onClose, onMark, serverId }: any) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const { data: sv } = await supabase.from("servers").select("game").eq("id", serverId).single();
      const gameSlug = sv?.game ?? undefined;
      const { data } = await supabase.from("items").select("id, name, image_url, rarity")
        .or(gameSlug ? `game.eq.${gameSlug},server_id.eq.${serverId}` : `server_id.eq.${serverId}`)
        .neq("status", "rejected").ilike("name", `%${q.trim()}%`).order("name").limit(8);
      setResults(data || []);
    } catch { setResults([]); } finally { setSearching(false); }
  };

  const selectItem = (item: any) => {
    setSelectedItem(item);
    setName(item.name);
    setSearch("");
    setResults([]);
  };

  const selColor = rc(selectedItem?.rarity);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-[#fafafa] mb-3">Mark Item for Bid</h3>
        {error && <p className="text-xs text-red-400 mb-2"><AlertTriangle className="w-3 h-3 inline mr-1" />{error}</p>}
        <div className="space-y-3">
          <div className="relative">
            <label className="text-[10px] text-[#71717a]">Item</label>
            {selectedItem ? (
              <div className="flex items-center gap-2 mt-1 p-2 rounded bg-[#0d0d11] border border-[#27272a]">
                {selectedItem.image_url ? <img src={selectedItem.image_url} className="w-8 h-8 rounded object-cover border border-[#1e1e2a]" style={{ backgroundColor: selColor + "20" }} /> : <div className="w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: selColor + "18" }}><Image className="w-4 h-4" style={{ color: selColor }} /></div>}
                <span className="text-sm flex-1 truncate" style={{ color: selColor }}>{selectedItem.name}</span>
                <button onClick={() => { setSelectedItem(null); setName(""); }} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
                className="w-full bg-[#0d0d11] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#fafafa] outline-none mt-1 placeholder:text-[#52525b]" placeholder="Search catalog item..." />
            )}
            {searching && <Loader2 className="w-3.5 h-3.5 text-[#52525b] animate-spin absolute right-2 top-7" />}
            {results.length > 0 && !selectedItem && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-[#0d0d11] border border-[#27272a] rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                {results.map(item => <ItemResult key={item.id} item={item} onSelect={selectItem} />)}
              </div>
            )}
            {search && !searching && results.length === 0 && !selectedItem && (
              <p className="text-[10px] text-[#52525b] mt-1">No items found. Add it to the catalog first.</p>
            )}
          </div>
          <div><label className="text-[10px] text-[#71717a]">DKP Cost</label><input type="number" value={cost} onChange={e => setCost(parseInt(e.target.value) || 0)} className="w-full bg-[#0d0d11] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#fafafa] outline-none mt-1" min={1} /></div>
          <div><label className="text-[10px] text-[#71717a]">End Date & Time</label><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="w-full bg-[#0d0d11] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#fafafa] outline-none mt-1 [color-scheme:dark]" /></div>
          <div className="flex gap-2"><button onClick={onClose} className="flex-1 py-2 rounded text-sm bg-[#27272a] text-[#d4d4d8]">Cancel</button><button onClick={onMark} disabled={acting || !name.trim()} className="flex-1 py-2 rounded text-sm bg-amber-500/20 text-amber-400 font-medium disabled:opacity-40">{acting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Mark for Bid"}</button></div>
        </div>
      </div>
    </div>
  );
}

function ItemResult({ item, onSelect }: { item: any; onSelect: (item: any) => void }) {
  const sc = rc(item.rarity);
  return (
    <button onClick={() => onSelect(item)} className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-[#18181b] transition text-left">
      {item.image_url ? <img src={item.image_url} className="w-7 h-7 rounded object-cover shrink-0 border border-[#1e1e2a]" style={{ backgroundColor: sc + "20" }} /> : <div className="w-7 h-7 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: sc + "18" }}><Image className="w-3.5 h-3.5" style={{ color: sc }} /></div>}
      <span className="text-xs truncate" style={{ color: sc }}>{item.name}</span>
    </button>
  );
}

function BidModalUI({ itemId, bidAmt, setBidAmt, acting, error, onClose, onBid }: any) {
  const { data: item } = useQuery({ queryKey: ["item", itemId], queryFn: async () => { const { data } = await supabase.from("items").select("name, image_url, dkp_min_bid, bid_end_time, rarity").eq("id", itemId).single(); return data; }, enabled: !!itemId });
  const end = item?.bid_end_time ? new Date(item.bid_end_time) : null;
  const left = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 60000)) : 0;
  const rarityColor = rc(item?.rarity);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
        {item?.image_url ? <img src={item.image_url} className="w-full h-32 object-cover rounded-lg mb-3 border border-[#1e1e2a]" style={{ backgroundColor: rarityColor + "20" }} /> : <div className="w-full h-32 rounded-lg mb-3 flex items-center justify-center" style={{ backgroundColor: rarityColor + "18" }}><Image className="w-8 h-8" style={{ color: rarityColor }} /></div>}
        <h3 className="text-sm font-semibold" style={{ color: rarityColor }}>{item?.name || "Item"}</h3>
        <p className="text-[10px] text-[#71717a] mt-0.5">Min bid: {item?.dkp_min_bid ?? 1} DKP · {left > 0 ? `${left}min left` : "Ended"}</p>
        {error && <p className="text-xs text-red-400 mt-2"><AlertTriangle className="w-3 h-3 inline mr-1" />{error}</p>}
        <div className="mt-3 space-y-3">
          <input type="number" value={bidAmt} onChange={e => setBidAmt(parseInt(e.target.value) || 0)} className="w-full bg-[#0d0d11] border border-[#27272a] rounded px-2 py-2 text-lg font-bold text-[#fafafa] outline-none text-center" min={item?.dkp_min_bid ?? 1} autoFocus />
          <div className="flex gap-2"><button onClick={onClose} className="flex-1 py-2 rounded text-sm bg-[#27272a] text-[#d4d4d8]">Cancel</button><button onClick={onBid} disabled={acting || bidAmt < (item?.dkp_min_bid ?? 1)} className="flex-1 py-2 rounded text-sm bg-amber-500/20 text-amber-400 font-medium disabled:opacity-40">{acting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Place Bid"}</button></div>
        </div>
      </div>
    </div>
  );
}

function ResolveModalUI({ itemId, onClose, onResolve }: { itemId: string; onClose: () => void; onResolve: (w: string | null) => void }) {
  const { data: bids = [] } = useQuery({ queryKey: ["item_bids", itemId], queryFn: () => getItemBids(itemId), enabled: !!itemId });
  const active = bids.filter((b: ItemBid) => b.status === "active");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-96 max-h-[70vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-[#fafafa] mb-1">Resolve Auction</h3><p className="text-[10px] text-[#71717a] mb-3">{active.length} active bid{active.length !== 1 ? "s" : ""}</p>
        {active.length === 0 ? <p className="text-xs text-[#52525b] text-center py-4">No active bids.</p>
        : <div className="space-y-1 mb-3">{active.map(bid => (
            <div key={bid.id} className="flex items-center justify-between p-2 rounded bg-[#0d0d11] border border-[#1e1e2a]"><div><p className="text-xs text-[#fafafa]">{bid.member_name}</p><p className="text-[10px] text-[#52525b]">{new Date(bid.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div><div className="flex items-center gap-2"><span className="text-sm font-bold text-amber-400">{bid.bid_amount}</span><button onClick={() => onResolve(bid.id)} className="px-2 py-1 rounded text-[10px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"><Check className="w-3 h-3" /></button></div></div>))}</div>}
        <div className="flex gap-2"><button onClick={() => onResolve(null)} className="flex-1 py-2 rounded text-sm bg-red-500/10 text-red-400">Cancel Auction</button><button onClick={onClose} className="flex-1 py-2 rounded text-sm bg-[#27272a] text-[#d4d4d8]">Close</button></div>
      </div>
    </div>
  );
}

function BidsModal({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { data: bids = [], isLoading } = useQuery({ queryKey: ["item_bids", itemId], queryFn: () => getItemBids(itemId), enabled: !!itemId });
  const all = [...bids].sort((a: ItemBid, b: ItemBid) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-96 max-h-[70vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-[#fafafa] mb-1">All Bids</h3>
        <p className="text-[10px] text-[#71717a] mb-3">{all.length} bid{all.length !== 1 ? "s" : ""} total</p>
        {isLoading ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-[#52525b] animate-spin" /></div>
        : all.length === 0 ? <p className="text-xs text-[#52525b] text-center py-4">No bids yet.</p>
        : <div className="space-y-1 mb-3">
          {all.map((bid: ItemBid) => (
            <div key={bid.id} className="flex items-center justify-between p-2 rounded bg-[#0d0d11] border border-[#1e1e2a]">
              <div><p className="text-xs text-[#fafafa]">{bid.member_name}</p><p className="text-[10px] text-[#52525b]">{new Date(bid.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold tabular-nums ${bid.status === "active" ? "text-amber-400" : bid.status === "won" ? "text-emerald-400" : "text-[#52525b]"}`}>{bid.bid_amount} DKP</span>
                {bid.status === "active" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">Active</span>}
                {bid.status === "won" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Won</span>}
                {bid.status === "cancelled" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#27272a] text-[#52525b]">Refunded</span>}
              </div>
            </div>
          ))}
        </div>}
        <button onClick={onClose} className="w-full py-2 rounded text-sm bg-[#27272a] text-[#d4d4d8]">Close</button>
      </div>
    </div>
  );
}

function HistorySection({ memberId, serverId }: { memberId: string; serverId: string }) {
  const [cursor, setCursor] = useState<string | undefined>();
  const [all, setAll] = useState<DkpTransaction[]>([]);
  const { data: txns = [], isLoading } = useQuery({ queryKey: ["dkp_history", memberId, serverId, cursor], queryFn: async () => { const r = await getMemberDkpHistory(memberId, serverId, 20, cursor); if (cursor) setAll(p => [...p, ...r]); else setAll(r); return r; }, staleTime: 0 });
  const display = cursor ? all : txns;
  return (
    <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e2a] flex items-center gap-2"><History className="w-4 h-4 text-[#52525b]" /><span className="text-xs font-semibold text-[#71717a] uppercase tracking-wider">Auction History</span></div>
      {isLoading && display.length === 0 ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[#52525b] animate-spin" /></div>
      : display.length === 0 ? <div className="px-4 py-6 text-center"><p className="text-xs text-[#71717a]">No transactions yet.</p></div>
      : <div className="divide-y divide-[#1e1e2a]/50">{display.map(txn => (
          <div key={txn.id} className="flex items-center justify-between px-4 py-2.5"><div className="min-w-0"><p className="text-xs text-[#d4d4d8] truncate">{txn.reason || txn.type}</p><p className="text-[10px] text-[#52525b]">{new Date(txn.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div><span className={`text-sm font-bold tabular-nums shrink-0 ${txn.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>{txn.amount > 0 ? "+" : ""}{txn.amount}</span></div>))}
        {txns.length === 20 && <button onClick={() => setCursor(display[display.length - 1]?.created_at)} className="w-full px-4 py-2 text-xs text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] transition">Load more...</button>}</div>}
    </div>
  );
}
