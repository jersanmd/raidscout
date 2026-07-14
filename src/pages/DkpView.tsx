import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { useServerId } from "@/contexts/ServerContext";
import { useToast } from "@/contexts/ToastContext";
import {
  getMemberDkp, getServerDkpRankings, getMemberDkpHistory, getActiveAuctions, getPastAuctions, deletePastAuction, adjustMemberDkp, resetAllDkp, toggleItemDistributed,
  getDkpConfig, markItemForBid, placeBid, getItemBids, resolveAuction, createDistribution,
  supabase,
  type DkpBalance, type DkpRanking, type DkpTransaction, type ItemBid, type ActiveAuction, type PastAuction,
} from "@/lib/supabase";
import { AuditAction, writeAuditEntry } from "@/lib/api/audit";
import { useMembers } from "@/hooks/useMembers";
import { Coins, TrendingUp, TrendingDown, History, Gavel, Loader2, Shield, Clock, Check, X, AlertTriangle, Image, Plus, Eye, Hourglass, Trash2, Pencil, CheckCircle, Package, Settings, Search, Gift, Minus, Copy } from "lucide-react";
import { guildColor } from "@/lib/constants";
import AuctionTheater from "@/components/AuctionTheater";
import { ExpiredGate } from "@/components/ExpiredGate";
import { useUserTimezone } from "@/hooks/useUserTimezone";

export function DkpView() {
  const { user, isViewer } = useAuth();
  const { currentServer } = useServer();
  const serverId = useServerId();
  if (isViewer) return <Empty icon={Shield} text="DKP is not available in viewer mode." />;
  if (!currentServer || !serverId) return <Empty icon={Shield} text="Select a server to view DKP." />;
  if (currentServer?.isExpired) return <ExpiredGate page="DKP" />;
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
  const tz = useUserTimezone(currentServer?.timezone).timezone;
  const isStaff = currentServer?.role === "owner" || currentServer?.role === "moderator";
  const [searchParams] = useSearchParams();
  const highlightItemId = searchParams.get("highlight") || undefined;

  // ── Realtime: push updates for DKP tables instead of polling ──
  const [rtStatus, setRtStatus] = useState<string>("connecting");
  useEffect(() => {
    const channel = supabase.channel("dkp-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "dkp_auctions" }, (payload) => {
        console.log("[DKP Realtime] auctions change:", payload.eventType);
        queryClient.invalidateQueries({ queryKey: ["dkp_active_auctions"] });
        queryClient.invalidateQueries({ queryKey: ["dkp_past_auctions"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dkp_bids" }, (payload) => {
        console.log("[DKP Realtime] bids change:", payload.eventType);
        queryClient.invalidateQueries({ queryKey: ["dkp_active_auctions"] });
        queryClient.invalidateQueries({ queryKey: ["dkp_theater_bids"] });
        queryClient.invalidateQueries({ queryKey: ["dkp_balance"] });
        queryClient.invalidateQueries({ queryKey: ["dkp_rankings"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dkp_transactions" }, (payload) => {
        console.log("[DKP Realtime] txns change:", payload.eventType);
        queryClient.invalidateQueries({ queryKey: ["dkp_balance"] });
        queryClient.invalidateQueries({ queryKey: ["dkp_rankings"] });
        queryClient.invalidateQueries({ queryKey: ["dkp_history"] });
      })
      .subscribe((status) => {
        console.log("[DKP Realtime] status:", status);
        setRtStatus(status === "SUBSCRIBED" ? "connected" : status === "CHANNEL_ERROR" ? "error" : status === "TIMED_OUT" ? "timeout" : "connecting");
      });

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Wrap in React Query so it can be invalidated after claim acceptance
  const { data: memberId, isLoading: memberLoading } = useQuery({
    queryKey: ["my_member_id", serverId, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("members").select("id")
        .eq("server_id", serverId).eq("user_id", user.id).maybeSingle();
      return data?.id ?? null;
    },
    enabled: !!serverId && !!user,
    staleTime: 30_000,
  });

  const { data: dkpConfig } = useQuery({ queryKey: ["dkp_config", serverId], queryFn: () => getDkpConfig(serverId), enabled: !!serverId });
  if (!dkpConfig?.enabled) return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center">
      <Coins className="w-10 h-10 text-[#3f3f46] mx-auto mb-3" />
      <p className="text-sm text-[#fafafa] font-medium mb-1">DKP is not enabled</p>
      {isStaff ? (
        <>
          <p className="text-xs text-[#71717a] mb-3">Enable it in Server Settings to start running auctions.</p>
          <Link to="/server-settings?tab=dkp" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[#18181b] border border-[#27272a] text-[#d4d4d8] hover:bg-[#27272a] hover:text-[#fafafa] transition">
            <Settings className="w-3.5 h-3.5" />
            Go to DKP Settings
          </Link>
        </>
      ) : (
        <p className="text-xs text-[#71717a]">Contact your server owner or moderator to enable it.</p>
      )}
    </div>
  );

  const hideLeaderboard = dkpConfig.hide_from_players && !isStaff;

  return (
    <div className="max-w-[100%] 2xl:max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#18181b] border border-[#27272a]">
          <Coins className="w-5 h-5 text-[#fafafa]" />
        </div>
        <h2 className="text-xl font-bold text-[#fafafa]">DKP</h2>
        {/* Realtime status indicator — remove after verifying */}
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
          rtStatus === "connected" ? "bg-emerald-500/10 text-emerald-400" :
          rtStatus === "error" || rtStatus === "timeout" ? "bg-red-500/10 text-red-400" :
          "bg-amber-500/10 text-amber-400"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            rtStatus === "connected" ? "bg-emerald-400 animate-pulse" :
            rtStatus === "error" || rtStatus === "timeout" ? "bg-red-400" :
            "bg-amber-400 animate-pulse"
          }`} />
          {rtStatus}
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-1 space-y-4 sm:space-y-6">
          {memberLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>
          : memberId ? <Ledger memberId={memberId} serverId={serverId} /> : <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 text-center space-y-3"><Shield className="w-6 h-6 text-[#52525b] mx-auto" /><p className="text-xs text-[#71717a]">Claim your profile to view DKP</p><p className="text-[11px] text-[#52525b] leading-relaxed">Don't have access yet? Go to <a href="/join" className="text-blue-400 hover:text-blue-300 underline">Join a Server</a> to claim your in-game character.</p></div>}
          {!hideLeaderboard ? <Leaderboard serverId={serverId} isStaff={isStaff} toast={toast} queryClient={queryClient} /> : <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 text-center space-y-3"><Shield className="w-6 h-6 text-[#52525b] mx-auto" /><p className="text-xs text-[#71717a]">Leaderboard hidden</p><p className="text-[11px] text-[#52525b] leading-relaxed">The guild officers have disabled the public leaderboard. Your points are still tracked normally.</p></div>}
        </div>
        {/* Right column */}
        <div className="lg:col-span-2 space-y-4">
          <LiveAuction serverId={serverId} isStaff={isStaff} memberId={memberId} tz={tz} toast={toast} queryClient={queryClient} highlightItemId={highlightItemId} />
          <AuctionHistory serverId={serverId} memberId={memberId} isStaff={isStaff} queryClient={queryClient} toast={toast} userId={user?.id} />
          {memberId && <HistorySection memberId={memberId} serverId={serverId} />}
        </div>
      </div>
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    if (value === prevRef.current) return;
    const start = prevRef.current;
    const diff = value - start;
    const duration = Math.min(800, Math.abs(diff) * 10);
    const startTime = performance.now();
    let raf: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    prevRef.current = value;
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display}</>;
}

function Ledger({ memberId, serverId }: { memberId: string; serverId: string }) {
  const { data: balance, isLoading } = useQuery({ queryKey: ["dkp_balance", memberId, serverId], queryFn: () => getMemberDkp(memberId, serverId), staleTime: 5_000 });
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>;
  return (
    <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 space-y-3">
      <h3 className="text-xs font-semibold text-[#71717a] uppercase tracking-wider">DKP Ledger</h3>
      <div className="text-center"><p className="text-4xl font-extrabold text-amber-400 tabular-nums"><AnimatedNumber value={balance?.balance ?? 0} /></p><p className="text-[11px] text-[#71717a] mt-1">Available DKP</p></div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-[#18181b] rounded-lg p-2"><TrendingUp className="w-3 h-3 text-emerald-400 mx-auto mb-0.5" /><p className="text-sm font-bold text-emerald-400">+<AnimatedNumber value={balance?.earned_total ?? 0} /></p><p className="text-[11px] text-[#52525b]">Earned (All Time)</p></div>
        <div className="bg-[#18181b] rounded-lg p-2"><TrendingDown className="w-3 h-3 text-red-400 mx-auto mb-0.5" /><p className="text-sm font-bold text-red-400">-<AnimatedNumber value={balance?.spent_total ?? 0} /></p><p className="text-[11px] text-[#52525b]">Spent (All Time)</p></div>
      </div>
    </div>
  );
}

function Leaderboard({ serverId, isStaff, toast, queryClient }: { serverId: string; isStaff: boolean; toast: any; queryClient: any }) {
  const { data: rankings = [], isLoading } = useQuery({ queryKey: ["dkp_rankings", serverId], queryFn: () => getServerDkpRankings(serverId), staleTime: 10_000 });
  const [showCount, setShowCount] = useState(15);
  const [search, setSearch] = useState("");
  const [guildFilter, setGuildFilter] = useState<string>(() => {
    try { return localStorage.getItem(`dkp_guild_filter_${serverId}`) || ""; } catch { return ""; }
  });
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [adjAmount, setAdjAmount] = useState(0);
  const [adjReason, setAdjReason] = useState("");
  const [adjActing, setAdjActing] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string; balance: number } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetActing, setResetActing] = useState(false);
  const [resetGuilds, setResetGuilds] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const helpBtnRef = useRef<HTMLButtonElement>(null);

  // Close help popover on outside click
  useEffect(() => {
    if (!showHelp) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (helpBtnRef.current && !helpBtnRef.current.contains(t) && !t.closest("[data-help-popover]")) {
        setShowHelp(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showHelp]);

  const guilds = [...new Set(rankings.map(r => r.guild_name).filter(Boolean))].sort() as string[];

  const handleGuildChange = (g: string) => {
    setGuildFilter(g);
    setShowCount(15);
    try { localStorage.setItem(`dkp_guild_filter_${serverId}`, g); } catch {}
  };

  useEffect(() => { if (!adjustId) return; const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setAdjustId(null); setAdjAmount(0); setAdjReason(""); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [adjustId]);
  
  let filtered = search ? rankings.filter(r => r.member_name.toLowerCase().includes(search.toLowerCase())) : rankings;
  if (guildFilter) filtered = filtered.filter(r => r.guild_name === guildFilter);
  const visible = filtered.slice(0, showCount);
  const hasMore = showCount < filtered.length;

  const handleAdjust = async (memberId: string, memberName: string) => {
    if (!adjAmount || adjAmount === 0) return;
    setAdjActing(true);
    try {
      await adjustMemberDkp(memberId, serverId, adjAmount, adjReason || undefined);
      writeAuditEntry({
        action: AuditAction.DKP_ADJUST,
        server_id: serverId,
        target_type: "member",
        target_id: memberId,
        details: { member_name: memberName, amount: adjAmount, reason: adjReason },
      }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["dkp_rankings", serverId] });
      queryClient.invalidateQueries({ queryKey: ["dkp_balance"] });
      queryClient.invalidateQueries({ queryKey: ["dkp_history"] });
      toast("success", `${adjAmount > 0 ? "+" : ""}${adjAmount} DKP ${adjAmount > 0 ? "added to" : "deducted from"} ${memberName}`);
      setAdjustId(null); setAdjAmount(0); setAdjReason("");
    } catch (err: any) { toast("error", err?.message || "Failed to adjust DKP"); }
    finally { setAdjActing(false); }
  };

  const handleResetDkp = async () => {
    setResetActing(true);
    try {
      const guildsToReset = resetGuilds.length > 0 ? resetGuilds : [...guilds];
      const perGuild = guildsToReset.map(g => {
        const members = rankings.filter(r => r.guild_name === g);
        return { guild: g, members: members.length, totalDkp: members.reduce((s, r) => s + r.balance, 0) };
      });
      const totalMembers = perGuild.reduce((s, g) => s + g.members, 0);
      const totalDkp = perGuild.reduce((s, g) => s + g.totalDkp, 0);

      await resetAllDkp(serverId, resetGuilds.length > 0 ? resetGuilds : undefined);
      queryClient.invalidateQueries({ queryKey: ["dkp_rankings", serverId] });
      queryClient.invalidateQueries({ queryKey: ["dkp_balance"] });
      queryClient.invalidateQueries({ queryKey: ["dkp_history"] });
      queryClient.invalidateQueries({ queryKey: ["dkp_auctions"] });

      writeAuditEntry({
        action: guildsToReset.length === guilds.length ? AuditAction.LEADERBOARD_RESET : AuditAction.LEADERBOARD_RESET_GUILD,
        server_id: serverId,
        target_type: "dkp",
        details: {
          guilds: perGuild,
          total_members: totalMembers,
          total_dkp_wiped: totalDkp,
        },
      }).catch(() => {});

      const msg = resetGuilds.length > 0 ? `DKP reset for ${resetGuilds.join(", ")}` : "All DKP has been reset to 0";
      toast("success", msg);
      setShowResetModal(false);
      setResetConfirm("");
      setResetGuilds([]);
    } catch (err: any) {
      toast("error", err?.message || "Failed to reset DKP");
    } finally {
      setResetActing(false);
    }
  };

  return (
    <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e2a] space-y-2">
        <span className="text-xs font-semibold text-[#71717a] uppercase tracking-wider">Leaderboard</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {searchOpen ? (
              <input
                ref={searchRef}
                type="text"
                placeholder="Search members..."
                value={search}
                onChange={e => { setSearch(e.target.value); setShowCount(15); }}
                onBlur={() => { if (!search) setSearchOpen(false); }}
                onKeyDown={e => { if (e.key === "Escape") { setSearch(""); setSearchOpen(false); } }}
                className="bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-[11px] text-[#d4d4d8] outline-none flex-1 min-w-0 max-w-48 focus:border-[#3f3f46] animate-slide-up"
                autoFocus
              />
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="p-1 rounded text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition shrink-0"
                title="Search"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <select
              value={guildFilter}
              onChange={e => handleGuildChange(e.target.value)}
              className="bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-[11px] text-[#d4d4d8] outline-none focus:border-[#3f3f46] shrink-0"
            >
              <option value="">All Guilds</option>
              {guilds.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {isStaff && (
              <button
                onClick={() => { setShowResetModal(true); setResetGuilds([...guilds]); }}
                className="text-[11px] px-2 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 transition shrink-0"
                title="Reset DKP"
              >Reset</button>
            )}
            <div className="relative shrink-0">
              <button
                ref={helpBtnRef}
                onClick={() => setShowHelp(!showHelp)}
                className="w-5 h-5 rounded-full border border-[#27272a] text-[11px] font-bold text-[#71717a] hover:text-[#fafafa] hover:border-[#52525b] transition flex items-center justify-center"
                title="How DKP works"
              >?</button>
            {showHelp && helpBtnRef.current && createPortal(
              <div className="fixed z-[9999] w-72 bg-[#18181b] border border-[#27272a] rounded-xl p-4 shadow-2xl" data-help-popover
                style={{ top: helpBtnRef.current.getBoundingClientRect().bottom + 8, right: window.innerWidth - helpBtnRef.current.getBoundingClientRect().right }}>
                <p className="text-xs text-[#d4d4d8] leading-relaxed">
                  DKP points are earned from <span className="text-emerald-400 font-medium">boss kills</span> based on configured point rules.
                  {' '}<span className="text-amber-400 font-medium">Adjustments</span> can be made by staff.
                  {' '}<span className="text-red-400 font-medium">Bid spends</span> are deducted from your balance at auction resolution.
                </p>
                <button onClick={() => setShowHelp(false)} className="mt-2 text-[11px] text-[#71717a] hover:text-[#fafafa] underline">Got it</button>
              </div>,
              document.body
            )}
          </div>
          </div>
        </div>
      </div>
      {isLoading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[#52525b] animate-spin" /></div>
      : filtered.length === 0 ? <div className="px-4 py-6 text-center"><p className="text-xs text-[#71717a]">{search ? "No members match" : "No DKP earned yet."}</p></div>
      : <div className="divide-y divide-[#1e1e2a]/50">{visible.map((r, i) => {
          const gc = r.guild_name ? guildColor(r.guild_name) : null;
          const displayRank = guildFilter || search ? i + 1 : r.rank;
          return (
          <div key={r.member_id}>
            <div onClick={() => setSelectedMember({ id: r.member_id, name: r.member_name, balance: r.balance })} className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-[#18181b] transition card-lift"><span className={`text-[11px] font-bold w-5 text-right ${displayRank === 1 ? "text-amber-400" : displayRank === 2 ? "text-[#94a3b8]" : displayRank === 3 ? "text-amber-700" : "text-[#52525b]"}`}>{displayRank === 1 ? "🥇" : displayRank === 2 ? "🥈" : displayRank === 3 ? "🥉" : displayRank}</span><span className="text-xs text-[#d4d4d8] flex-1 truncate">{r.member_name}</span>{gc && <span className={`flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${gc.bg} ${gc.text} ${gc.border}`}><Shield className="w-2.5 h-2.5" />{r.guild_name}</span>}<span className="text-xs font-bold text-amber-400 tabular-nums">{r.balance}</span>{isStaff && <button onClick={(e) => { e.stopPropagation(); setAdjustId(r.member_id); setAdjAmount(0); setAdjReason(""); }} className="text-[11px] px-1.5 py-0.5 rounded border border-[#27272a] text-[#71717a] hover:text-[#fafafa] hover:border-[#52525b] transition shrink-0" title="Adjust DKP">±</button>}</div>
      {isStaff && adjustId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setAdjustId(null); setAdjAmount(0); setAdjReason(""); }}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#fafafa] mb-1">{rankings.find(r => r.member_id === adjustId)?.member_name}</h3>
            <p className="text-[11px] text-[#71717a] mb-4">Balance: <span className="text-amber-400 font-bold">{rankings.find(r => r.member_id === adjustId)?.balance ?? 0} DKP</span></p>
            <div className="space-y-3">
              <input type="text" inputMode="numeric" placeholder="Amount (use - to deduct)" value={adjAmount || ""} onChange={e => { const v = parseInt(e.target.value); setAdjAmount(isNaN(v) ? 0 : v); }} onKeyDown={e => { if (e.key === "Enter") handleAdjust(adjustId, rankings.find(r => r.member_id === adjustId)?.member_name ?? ""); }} className="w-full bg-[#0d0d11] border border-[#27272a] rounded px-2 py-2 text-lg font-bold text-[#fafafa] outline-none text-center" autoFocus />
              <input type="text" placeholder="Reason (optional)" value={adjReason} onChange={e => setAdjReason(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleAdjust(adjustId, rankings.find(r => r.member_id === adjustId)?.member_name ?? ""); }} className="w-full bg-[#0d0d11] border border-[#27272a] rounded px-2 py-1.5 text-xs text-[#d4d4d8] outline-none" />
              <div className="flex gap-2">
                <button onClick={() => { setAdjustId(null); setAdjAmount(0); setAdjReason(""); }} className="flex-1 py-2 rounded text-sm bg-[#27272a] text-[#d4d4d8]">Cancel</button>
                <button onClick={() => handleAdjust(adjustId, rankings.find(r => r.member_id === adjustId)?.member_name ?? "")} disabled={adjActing || adjAmount === 0} className="flex-1 py-2 rounded text-sm bg-amber-500/20 text-amber-400 font-medium disabled:opacity-40">{adjActing ? "..." : adjAmount > 0 ? `Add ${adjAmount} DKP` : adjAmount < 0 ? `Deduct ${Math.abs(adjAmount)} DKP` : "Enter amount"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
          </div>
        )})}
        {hasMore && <button onClick={() => setShowCount(c => c + 15)} className="w-full px-4 py-2 text-xs text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] transition">Show more...</button>}
      </div>}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setShowResetModal(false); setResetConfirm(""); setResetGuilds([]); }}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-96 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-red-400 mb-1">Reset DKP</h3>
            <p className="text-xs text-[#a1a1aa] mb-3">This will permanently delete DKP transactions, cancel active auctions, and clear bid history for the selected guilds. <span className="font-bold text-[#fafafa]">This cannot be undone.</span></p>
            {guilds.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] text-[#71717a] mb-2">Select guilds to reset:</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {guilds.map(g => {
                    const checked = resetGuilds.includes(g);
                    return (
                      <label key={g} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#27272a]/50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setResetGuilds(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])}
                          className="rounded border-[#3f3f46] bg-[#0d0d11] accent-red-500"
                        />
                        <span className="text-xs text-[#d4d4d8]">{g}</span>
                        <span className="text-[11px] text-[#52525b] ml-auto">{rankings.filter(r => r.guild_name === g).length} members</span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setResetGuilds([...guilds])} className="text-[11px] text-[#a1a1aa] hover:text-[#fafafa] underline">Select all</button>
                  <button onClick={() => setResetGuilds([])} className="text-[11px] text-[#a1a1aa] hover:text-[#fafafa] underline">Clear all</button>
                </div>
              </div>
            )}
            {resetGuilds.length === 0 && guilds.length > 0 && <p className="text-[11px] text-amber-400 mb-3">No guilds selected — no DKP will be reset.</p>}
            <p className="text-[11px] text-[#71717a] mb-2">Type <span className="font-bold text-[#fafafa]">confirm</span> to reset:</p>
            <input type="text" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && resetConfirm.toLowerCase() === "confirm" && resetGuilds.length > 0) handleResetDkp(); }} className="w-full bg-[#0d0d11] border border-[#27272a] rounded px-3 py-2 text-xs text-[#fafafa] outline-none mb-4" placeholder="confirm" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => { setShowResetModal(false); setResetConfirm(""); setResetGuilds([]); }} className="flex-1 py-2 rounded text-sm bg-[#27272a] text-[#d4d4d8]">Cancel</button>
              <button onClick={handleResetDkp} disabled={resetConfirm.toLowerCase() !== "confirm" || resetGuilds.length === 0 || resetActing} className="flex-1 py-2 rounded text-sm bg-red-500/20 text-red-400 font-medium disabled:opacity-40">{resetActing ? "Resetting..." : resetGuilds.length === guilds.length ? "Reset All DKP" : `Reset ${resetGuilds.length} Guild${resetGuilds.length > 1 ? "s" : ""}`}</button>
            </div>
          </div>
        </div>
      )}
      {selectedMember && <MemberHistoryModal memberId={selectedMember.id} memberName={selectedMember.name} balance={selectedMember.balance} serverId={serverId} onClose={() => setSelectedMember(null)} />}
    </div>
  );
}

function MemberHistoryModal({ memberId, memberName, balance, serverId, onClose }: { memberId: string; memberName: string; balance: number; serverId: string; onClose: () => void }) {
  const [cursor, setCursor] = useState<string | undefined>();
  const [all, setAll] = useState<DkpTransaction[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ["dkp_history", memberId, serverId, cursor],
    queryFn: async () => {
      const r = await getMemberDkpHistory(memberId, serverId, 30, cursor);
      if (cursor) setAll(p => [...p, ...r]); else setAll(r);
      setLoadingMore(false);
      return r;
    },
    staleTime: 0,
    enabled: !!memberId,
  });

  const display = cursor ? all : txns;
  const hasMore = txns.length === 30;

  const loadMore = () => {
    if (display.length > 0) {
      setCursor(display[display.length - 1]?.created_at);
      setLoadingMore(true);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-5 w-96 max-h-[70vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#fafafa]">{memberName}</h3>
            <p className="text-[11px] text-[#71717a]">Balance: <span className="text-amber-400 font-bold">{balance} DKP</span></p>
          </div>
          <button onClick={onClose} className="text-[#52525b] hover:text-[#a1a1aa] transition p-1 -mr-1" title="Close"><X className="w-4 h-4" /></button>
        </div>
        {isLoading && display.length === 0 ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[#52525b] animate-spin" /></div>
        : display.length === 0 ? <p className="text-xs text-[#52525b] text-center py-4">No transactions yet.</p>
        : <>
          <div className="divide-y divide-[#1e1e2a]/50">
            {display.map(txn => (
              <div key={txn.id} className="flex items-center justify-between py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#d4d4d8] truncate">{txn.reason || txn.type}{txn.bidder_name && <> by <span className="text-[#a1a1aa]">{txn.bidder_name}</span></>}{txn.item_name && <> — <span style={{ color: rc(txn.item_rarity ?? undefined) }}>{txn.item_name}</span></>}{txn.boss_name && <> — {txn.boss_name}</>}</p>
                  <p className="text-[11px] text-[#52525b]">{new Date(txn.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <span className={`text-sm font-bold tabular-nums shrink-0 ml-2 ${txn.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>{txn.amount > 0 ? "+" : ""}{txn.amount}</span>
              </div>
            ))}
          </div>
          {hasMore && (
            <button onClick={loadMore} disabled={loadingMore} className="w-full mt-2 py-2 text-xs text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] rounded transition">
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Load more..."}
            </button>
          )}
        </>}
      </div>
    </div>
  );
}

function LiveAuction({ serverId, isStaff, memberId, tz, toast, queryClient, highlightItemId }: { serverId: string; isStaff: boolean; memberId: string | null; tz: string; toast: any; queryClient: any; highlightItemId?: string }) {
  const [showMark, setShowMark] = useState(false);
  const [showBid, setShowBid] = useState<string | null>(null);
  const [showResolve, setShowResolve] = useState<string | null>(null);
  const [showBids, setShowBids] = useState<{ itemId: string; auctionId: string } | null>(null);
  const [showTheater, setShowTheater] = useState<string | null>(null);
  const [markName, setMarkName] = useState("");
  const [markCost, setMarkCost] = useState(10);
  const [markEnd, setMarkEnd] = useState("");
  const [markGuild, setMarkGuild] = useState<string | null>(null);
  const [markQty, setMarkQty] = useState(1);
  const [bidAmt, setBidAmt] = useState(0);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: auctions = [], isLoading } = useQuery({ queryKey: ["dkp_active_auctions", serverId], queryFn: () => getActiveAuctions(serverId), staleTime: 3_000 });

  // Fetch member's guild for guild-restriction filtering
  const [myGuildId, setMyGuildId] = useState<string | null>(null);
  useEffect(() => {
    if (!memberId) return;
    supabase.from("members").select("guild_id").eq("id", memberId).single()
      .then(({ data }) => { if (data) setMyGuildId(data.guild_id); });
  }, [memberId]);

  // Scroll to highlighted item on mount, auto-clear highlight after 4s
  const [activeHighlight, setActiveHighlight] = useState<string | undefined>(highlightItemId);
  useEffect(() => {
    if (!highlightItemId) return;
    setActiveHighlight(highlightItemId);
    const timer = setTimeout(() => {
      document.getElementById(`auction-${highlightItemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    const clear = setTimeout(() => setActiveHighlight(undefined), 4000);
    return () => { clearTimeout(timer); clearTimeout(clear); };
  }, [highlightItemId]);

  // Filter: non-staff only see unrestricted items or items for their guild
  // Sort by bid_end_time ASC so shortest remaining time is always at the top
  const visibleAuctions = (isStaff ? auctions : auctions.filter((a: ActiveAuction) => !a.guild_id || a.guild_id === myGuildId))
    .sort((a: ActiveAuction, b: ActiveAuction) => new Date(a.bid_end_time).getTime() - new Date(b.bid_end_time).getTime());

  // When bot resolves an item (it disappears from active), immediately refresh past auctions
  const prevIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentIds = new Set(auctions.map((a: ActiveAuction) => a.item_id));
    const removed = [...prevIdsRef.current].filter(id => !currentIds.has(id));
    if (removed.length > 0) {
      queryClient.invalidateQueries({ queryKey: ["dkp_past_auctions", serverId] });
    }
    prevIdsRef.current = currentIds;
  }, [auctions, serverId, queryClient]);

  const doMark = async () => {
    if (!markName.trim()) return; setActing(true); setError(null);
    try {
      const { data: sv } = await supabase.from("servers").select("game").eq("id", serverId).single();
      const gameSlug = sv?.game ?? undefined;
      const { data: items } = await supabase.from("items").select("id")
        .or(gameSlug ? `game.eq.${gameSlug},server_id.eq.${serverId}` : `server_id.eq.${serverId}`)
        .neq("status", "rejected").ilike("name", `%${markName.trim()}%`).limit(1);
      if (!items?.length) { setError("Item not found"); setActing(false); return; }
      await markItemForBid(items[0].id, markCost, serverId, markName.trim(), markEnd ? serverLocalToUTC(markEnd, tz) : undefined, undefined, markGuild || null, markQty);
      queryClient.invalidateQueries({ queryKey: ["dkp_active_auctions"] });
      toast("success", `"${markName.trim()}" marked for bid.`);
      setShowMark(false); setMarkName(""); setMarkEnd(""); setMarkGuild(null); setMarkQty(1);
    } catch (err: any) { setError(err?.message || "Failed"); toast("error", err?.message || "Failed to mark item for bid"); } finally { setActing(false); }
  };

  const doBid = async (auctionId: string) => {
    setActing(true); setError(null);
    try { await placeBid(auctionId, bidAmt, serverId, auctions.find((a: ActiveAuction) => a.auction_id === auctionId)?.item_name); queryClient.invalidateQueries({ queryKey: ["dkp_balance"] }); queryClient.invalidateQueries({ queryKey: ["dkp_active_auctions"] }); queryClient.invalidateQueries({ queryKey: ["dkp_theater_bids"] }); queryClient.invalidateQueries({ queryKey: ["dkp_rankings", serverId] }); queryClient.invalidateQueries({ queryKey: ["dkp_history"] }); toast("success", `Bid placed.`); setShowBid(null); }
    catch (err: any) { setError(err?.message || "Failed"); toast("error", err?.message || "Failed to place bid"); } finally { setActing(false); }
  };

  const doResolve = async (auctionId: string, winnerId: string | null) => {
    setActing(true);
    try { await resolveAuction(auctionId, winnerId, serverId, auctions.find((a: ActiveAuction) => a.auction_id === auctionId)?.item_name); queryClient.invalidateQueries({ queryKey: ["dkp_active_auctions"] }); queryClient.invalidateQueries({ queryKey: ["dkp_balance"] }); queryClient.invalidateQueries({ queryKey: ["dkp_rankings", serverId] }); queryClient.invalidateQueries({ queryKey: ["dkp_past_auctions", serverId] }); queryClient.invalidateQueries({ queryKey: ["dkp_history"] }); toast("success", winnerId ? "Auction resolved." : "Auction cancelled."); setShowResolve(null); }
    catch (err: any) { setError(err?.message || "Failed"); toast("error", err?.message || "Failed to resolve auction"); } finally { setActing(false); }
  };

  const doDuplicate = (item: ActiveAuction) => {
    setMarkName(item.item_name);
    setMarkCost(item.dkp_cost || 10);
    setMarkQty(item.quantity || 1);
    setMarkGuild(item.guild_id || null);
    // Copy the original end date/time, converted to server timezone for the input
    if (item.bid_end_time) {
      const endDate = new Date(item.bid_end_time);
      const local = new Date(endDate.toLocaleString("en-US", { timeZone: tz }));
      const pad = (n: number) => String(n).padStart(2, "0");
      setMarkEnd(`${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`);
    } else {
      const now = new Date();
      const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
      local.setHours(23, 59, 0, 0);
      const pad = (n: number) => String(n).padStart(2, "0");
      setMarkEnd(`${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T23:59`);
    }
    setError(null);
    setShowMark(true);
  };

  return (
    <div className="bg-[#0d0d11] rounded-xl overflow-hidden shadow-lg shadow-amber-500/5 gradient-border">
      <div className="px-4 py-3 border-b border-amber-500/10 flex items-center justify-between bg-gradient-to-r from-amber-500/[0.06] via-amber-500/[0.03] to-transparent">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
          </span>
          <Gavel className="w-4 h-4 text-amber-400" /><span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Live Auction</span>
        </div>
        {isStaff && <button onClick={() => { setShowMark(true); setMarkName(""); setMarkCost(10); setMarkGuild(null); setMarkQty(1); setError(null); const now = new Date(); const local = new Date(now.toLocaleString("en-US", { timeZone: tz })); local.setHours(23, 59, 0, 0); const pad = (n: number) => String(n).padStart(2, "0"); setMarkEnd(`${local.getFullYear()}-${pad(local.getMonth()+1)}-${pad(local.getDate())}T23:59`); }} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition"><Plus className="w-3.5 h-3.5 inline mr-1.5" />Mark Item for Bid</button>}
      </div>
      {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>
      : visibleAuctions.length === 0 ? <div className="px-4 py-8 text-center"><Gavel className="w-8 h-8 text-[#3f3f46] mx-auto mb-2" /><p className="text-xs text-[#71717a]">No active auctions</p></div>
      : <div className="divide-y divide-[#1e1e2a]/50">{visibleAuctions.map((it: ActiveAuction) => <AuctionRow key={it.auction_id} item={it} isStaff={isStaff} memberId={memberId} tz={tz} onBid={() => { setShowBid(it.auction_id); setBidAmt(Math.max(it.dkp_cost || 1, (it.highest_bid || 0) + 1)); setError(null); }} onResolve={() => setShowResolve(it.auction_id)} onViewBids={() => setShowBids({ itemId: it.item_id, auctionId: it.auction_id })} onTheater={() => setShowTheater(it.auction_id)} onDuplicate={() => doDuplicate(it)} isHighlighted={activeHighlight === it.auction_id} />)}</div>}

      {showMark && <MarkModal name={markName} setName={setMarkName} cost={markCost} setCost={setMarkCost} end={markEnd} setEnd={setMarkEnd} acting={acting} error={error} onClose={() => setShowMark(false)} onMark={doMark} serverId={serverId} guildId={markGuild} setGuildId={setMarkGuild} qty={markQty} setQty={setMarkQty} />}
      {showBid && <BidModalUI auctionId={showBid} bidAmt={bidAmt} setBidAmt={setBidAmt} acting={acting} error={error} onClose={() => setShowBid(null)} onBid={() => doBid(showBid)} memberId={memberId} serverId={serverId} highestBid={auctions.find((a: ActiveAuction) => a.auction_id === showBid)?.highest_bid ?? 0} />}
      {showResolve && <ResolveModalUI auctionId={showResolve} onClose={() => setShowResolve(null)} onResolve={(w: string | null) => doResolve(showResolve, w)} />}
      {showBids && <BidsModal itemId={showBids.itemId} auctionId={showBids.auctionId} onClose={() => setShowBids(null)} />}
      {showTheater && <AuctionTheater auctionId={showTheater} serverId={serverId} onClose={() => setShowTheater(null)} />}
    </div>
  );
}

const RARITY_COLORS: Record<string, string> = { common: "#71717a", uncommon: "#22c55e", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ef4444" };
function rc(rarity?: string) { return RARITY_COLORS[rarity?.toLowerCase() ?? ""] || "#71717a"; }

/** Convert a datetime-local string (YYYY-MM-DDTHH:MM) in the given IANA timezone to an ISO 8601 UTC string. */
function serverLocalToUTC(dateTimeLocal: string, tz: string): string {
  const match = dateTimeLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return new Date(dateTimeLocal).toISOString(); // fallback for unexpected formats
  const [, y, mo, d, h, mi] = match.map(Number);

  // Detect the timezone offset for this date using Intl.DateTimeFormat
  const ref = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)); // noon UTC avoids DST midnight edge cases
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(ref);
  const tzStr = parts.find(p => p.type === "timeZoneName")?.value || "GMT";
  const offMatch = tzStr.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMin = offMatch
    ? (offMatch[1] === "-" ? -1 : 1) * (parseInt(offMatch[2]) * 60 + parseInt(offMatch[3]))
    : 0;

  // UTC = local - offset  (e.g. Manila 23:59 → UTC = Date.UTC(23,59) - 480min = 15:59 UTC)
  const utcMs = Date.UTC(y, mo - 1, d, h, mi) - offsetMin * 60 * 1000;
  return new Date(utcMs).toISOString();
}

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

function AuctionRow({ item, isStaff, memberId, tz, onBid, onResolve, onViewBids, onTheater, onDuplicate, isHighlighted }: { item: ActiveAuction; isStaff: boolean; memberId: string | null; tz: string; onBid: () => void; onResolve: () => void; onViewBids: () => void; onTheater: () => void; onDuplicate?: () => void; isHighlighted?: boolean }) {
  const cd = useCountdown(item.bid_end_time);
  const ended = cd.ended;
  const rarityColor = rc(item.rarity ?? undefined);
  const isWinning = memberId && item.top_bidder_member_id === memberId;
  const endingSoon = !ended && cd.totalMs < 3600000; // < 1 hour
  const endLocal = item.bid_end_time ? new Date(item.bid_end_time).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const fmt = (n: number) => String(n).padStart(2, "0");
  const totalDur = item.bid_end_time && item.created_at ? new Date(item.bid_end_time).getTime() - new Date(item.created_at).getTime() : 86400000;
  const barPct = ended ? 0 : Math.max(0, Math.min(100, (cd.totalMs / totalDur) * 100));
  return (
    <div id={`auction-${item.auction_id}`} className={`relative flex items-center gap-3 px-4 py-3 hover:bg-[#18181b]/50 transition cursor-pointer card-lift group ${isHighlighted ? "bg-amber-500/10 ring-1 ring-amber-500/40 animate-pulse" : ""}`} onClick={onViewBids}>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 h-0.5 rounded-b-xl transition-all duration-1000" style={{ width: `${barPct}%`, backgroundColor: ended ? '#52525b' : cd.totalMs < 3600000 ? '#ef4444' : cd.totalMs < 10800000 ? '#f59e0b' : '#22c55e' }} />
      {item.image_url ? <img src={item.image_url} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-[#1e1e2a]" style={{ backgroundColor: rarityColor + "20" }} /> : <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: rarityColor + "18" }}><Image className="w-4 h-4" style={{ color: rarityColor }} /></div>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate" style={{ color: rarityColor }}>{item.item_name}{item.quantity > 1 && <span className="text-[#71717a] ml-1">x{item.quantity}</span>}</p>
          {item.guild_name && (
            <span className={`flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded border shrink-0 ${guildColor(item.guild_name).bg} ${guildColor(item.guild_name).text} ${guildColor(item.guild_name).border}`}>
              <Shield className="w-2 h-2" />{item.guild_name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-amber-400 font-bold">{item.highest_bid || item.dkp_cost} DKP</span>
          <button onClick={(e) => { e.stopPropagation(); onViewBids(); }} className="text-[#52525b] hover:text-[#d4d4d8] transition">{item.bid_count} bid{item.bid_count !== 1 ? "s" : ""}</button>
          {!ended ? <span className={`flex items-center gap-0.5 tabular-nums ${endingSoon ? "text-red-400 animate-pulse" : "text-[#a1a1aa]"}`}><Clock className="w-3 h-3" />{cd.days > 0 ? `${cd.days}d ` : ""}{fmt(cd.hours)}:{fmt(cd.minutes)}:{fmt(cd.seconds)}</span> : <span className="text-red-400">Ended</span>}
          <span className="text-[#52525b]">· {endLocal}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={(e) => { e.stopPropagation(); onTheater(); }} className="px-1.5 py-1 rounded text-[11px] bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#3f3f46] transition-colors" title="Auction Theater">🎭</button>
        {memberId && !ended && !isWinning && <button onClick={(e) => { e.stopPropagation(); onBid(); }} className="px-5 py-1.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition"><Coins className="w-3.5 h-3.5 inline mr-1" />Bid</button>}
        {memberId && !ended && isWinning && <span className="px-2 py-1 rounded text-[11px] bg-emerald-500/10 text-emerald-400 font-medium" title="You're the highest bidder. Wait to be outbid before bidding again."><Check className="w-3 h-3 inline mr-0.5" />You're Winning</span>}
        {memberId && ended && <span className="px-2 py-1 rounded text-[11px] bg-amber-500/10 text-amber-400 font-medium animate-pulse"><Loader2 className="w-3 h-3 inline mr-1 animate-spin" />Finalizing...</span>}
        {isStaff && <button onClick={(e) => { e.stopPropagation(); onResolve(); }} className="px-5 py-1.5 rounded text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition">Cancel</button>}
        {isStaff && onDuplicate && <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="px-3 py-1.5 rounded text-[11px] bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition" title="Duplicate this auction with same details"><Copy className="w-3 h-3 inline mr-1" />Duplicate</button>}
      </div>
    </div>
  );
}

function MarkModal({ name, setName, cost, setCost, end, setEnd, acting, error, onClose, onMark, serverId, guildId, setGuildId, qty, setQty }: any) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Fetch guilds for the guild-restriction dropdown
  const { data: guilds = [] } = useQuery({
    queryKey: ["guilds", serverId],
    queryFn: async () => { const { data } = await supabase.from("guilds").select("id, name").eq("server_id", serverId).order("name"); return data || []; },
    enabled: !!serverId,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Auto-search when name is pre-filled (duplicate) — select first result
  useEffect(() => {
    if (!name || selectedItem) return;
    handleSearch(name);
  }, []); // run once on mount

  // After search results arrive, auto-select the matching item
  useEffect(() => {
    if (!name || selectedItem || !results.length) return;
    const match = results.find((r: any) => r.name.toLowerCase() === name.toLowerCase()) || results[0];
    if (match) selectItem(match);
  }, [results]);

  const handleSearch = async (q: string) => {
    setSearch(q);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      // Resolve game slug using same pattern as fetchItems in memberManagement.ts
      const { data: sv } = await supabase.from("servers").select("game, game_id").eq("id", serverId).single();
      let gameSlug: string | undefined = sv?.game ?? undefined;
      if (!gameSlug && sv?.game_id) {
        const { data: gd } = await supabase.from("games").select("slug").eq("id", sv.game_id).single();
        gameSlug = gd?.slug ?? undefined;
      }
      // Build query with .or() FIRST (matching fetchItems pattern) to avoid PostgREST ordering issues
      const orFilter = gameSlug
        ? `game.eq.${gameSlug},server_id.eq.${serverId}`
        : `server_id.eq.${serverId}`;
      const { data, error } = await supabase.from("items")
        .select("id, name, image_url, rarity")
        .or(orFilter)
        .neq("status", "rejected")
        .ilike("name", `%${q.trim()}%`)
        .order("name")
        .limit(8);
      if (error) { console.warn("MarkModal item search error:", error); }
      setResults(data || []);
    } catch (err) { console.warn("MarkModal search exception:", err); setResults([]); } finally { setSearching(false); }
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
      <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-5 w-96 max-w-[95vw] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#fafafa]">Mark Item for Bid</h3>
          <button onClick={onClose} className="text-[#52525b] hover:text-[#a1a1aa] transition p-1 -mr-1" title="Close"><X className="w-4 h-4" /></button>
        </div>
        {error && <p className="text-xs text-red-400 mb-2"><AlertTriangle className="w-3 h-3 inline mr-1" />{error}</p>}
        <div className="space-y-3">
          <div className="relative">
            <label className="text-[11px] text-[#71717a]">Item</label>
            {selectedItem ? (
              <div className="flex items-center gap-2 mt-1 p-2 rounded bg-[#18181b] border border-[#27272a]">
                {selectedItem.image_url ? <img src={selectedItem.image_url} className="w-8 h-8 rounded object-cover border border-[#1e1e2a]" style={{ backgroundColor: selColor + "20" }} /> : <div className="w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: selColor + "18" }}><Image className="w-4 h-4" style={{ color: selColor }} /></div>}
                <span className="text-sm flex-1 truncate" style={{ color: selColor }}>{selectedItem.name}</span>
                <button onClick={() => { setSelectedItem(null); setName(""); }} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
                className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#fafafa] outline-none mt-1 placeholder:text-[#52525b]" placeholder="Search catalog item..." />
            )}
            {searching && <Loader2 className="w-3.5 h-3.5 text-[#52525b] animate-spin absolute right-2 top-7" />}
            {results.length > 0 && !selectedItem && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-[#18181b] border border-[#27272a] rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                {results.map(item => <ItemResult key={item.id} item={item} onSelect={selectItem} />)}
              </div>
            )}
            {search && !searching && results.length === 0 && !selectedItem && (
              <p className="text-[11px] text-[#52525b] mt-1">No items found. Add it to the catalog first.</p>
            )}
          </div>
          <div><label className="text-[11px] text-[#71717a]">DKP Cost</label><input type="text" inputMode="numeric" value={cost || ""} onChange={e => { const v = parseInt(e.target.value); setCost(isNaN(v) ? 0 : v); }} className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#fafafa] outline-none mt-1" /></div>
          <div className="flex gap-3">
            <div className="flex-1"><label className="text-[11px] text-[#71717a]">Quantity</label><input type="text" inputMode="numeric" value={qty || ""} onChange={e => { const raw = e.target.value; if (raw === "") { setQty(0); return; } const v = parseInt(raw); setQty(isNaN(v) ? 0 : v); }} onBlur={() => { if (!qty || qty < 1) setQty(1); }} className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#fafafa] outline-none mt-1" /></div>
            <div className="flex-1"><label className="text-[11px] text-[#71717a]">End Date & Time</label><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#fafafa] outline-none mt-1 [color-scheme:dark]" /></div>
          </div>
          <div>
            <label className="text-[11px] text-[#71717a]">Restrict to Guild <span className="text-[#52525b]">(optional)</span></label>
            <select value={guildId || ""} onChange={e => setGuildId(e.target.value || null)} className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#d4d4d8] outline-none mt-1">
              <option value="">All Guilds</option>
              {guilds.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <button onClick={onMark} disabled={acting || !name.trim()} className="w-full py-2 rounded text-sm bg-[#27272a] text-[#fafafa] font-medium disabled:opacity-40 hover:bg-[#3f3f46] transition">{acting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Mark for Bid"}</button>
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

function BidModalUI({ auctionId, bidAmt, setBidAmt, acting, error, onClose, onBid, memberId, serverId, highestBid }: any) {
  const { data: item } = useQuery({ queryKey: ["auction_item", auctionId], queryFn: async () => { const { data } = await supabase.from("dkp_auctions").select("item_id, dkp_cost, bid_end_time, items:item_id(name, image_url, rarity)").eq("id", auctionId).single(); const it = data?.items as any; return { name: it?.name, image_url: it?.image_url, rarity: it?.rarity, dkp_cost: data?.dkp_cost, bid_end_time: data?.bid_end_time }; }, enabled: !!auctionId });
  const { data: balance } = useQuery({ queryKey: ["dkp_balance", memberId, serverId], queryFn: () => getMemberDkp(memberId, serverId), enabled: !!memberId && !!serverId });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const end = item?.bid_end_time ? new Date(item.bid_end_time) : null;
  const left = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 60000)) : 0;
  const hasEnded = left <= 0;
  const rarityColor = rc(item?.rarity);
  const effectiveMin = Math.max(item?.dkp_cost ?? 1, (highestBid ?? 0) + 1);
  const presets = [effectiveMin, effectiveMin + 5, effectiveMin + 10, effectiveMin + 25].filter((v, i, a) => a.indexOf(v) === i);
  const overBudget = balance != null && bidAmt > balance.balance;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          {item?.image_url ? <img src={item.image_url} className="w-12 h-12 rounded-lg object-cover shrink-0 border border-[#27272a]" style={{ backgroundColor: rarityColor + "20" }} /> : <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: rarityColor + "18" }}><Image className="w-5 h-5" style={{ color: rarityColor }} /></div>}
          <button onClick={onClose} className="text-[#52525b] hover:text-[#a1a1aa] transition p-1 -mr-1 -mt-1" title="Close"><X className="w-4 h-4" /></button>
        </div>
        <h3 className="text-sm font-semibold" style={{ color: rarityColor }}>{item?.name || "Item"}</h3>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-[11px] text-[#71717a]">Min bid: {effectiveMin} DKP · {hasEnded ? "Ended" : `${left}min left`}</p>
          {balance != null && <span className={`text-[11px] ml-auto ${overBudget ? "text-red-400" : "text-[#a1a1aa]"}`}>{balance.balance} DKP available</span>}
        </div>
        {hasEnded && <p className="text-xs text-[#a1a1aa] mt-2 flex items-center gap-1"><Hourglass className="w-3 h-3" />Bidding has ended — awaiting finalization.</p>}
        {error && <p className="text-xs text-red-400 mt-2"><AlertTriangle className="w-3 h-3 inline mr-1" />{error}</p>}
        <div className="mt-3 space-y-3">
          <div className="flex gap-1.5 flex-wrap">{presets.map(p => <button key={p} onClick={() => setBidAmt(p)} className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${bidAmt === p ? "bg-[#3f3f46] text-[#fafafa] border border-[#52525b]" : "bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-[#fafafa]"}`}>+{p}</button>)}</div>
          <input type="text" inputMode="numeric" value={bidAmt || ""} onChange={e => { const v = parseInt(e.target.value); setBidAmt(isNaN(v) ? 0 : v); }} className={`w-full bg-[#18181b] border rounded px-2 py-2 text-lg font-bold outline-none text-center ${overBudget ? "border-red-500/50 text-red-400" : "border-[#27272a] text-[#fafafa]"}`} min={effectiveMin} autoFocus disabled={hasEnded} />
          <button onClick={onBid} disabled={acting || bidAmt < effectiveMin || overBudget || hasEnded} className="w-full py-2 rounded text-sm bg-[#27272a] text-[#fafafa] font-medium disabled:opacity-40 hover:bg-[#3f3f46] transition">{acting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : hasEnded ? "Finalizing..." : "Place Bid"}</button>
        </div>
      </div>
    </div>
  );
}

function ResolveModalUI({ auctionId, onClose, onResolve }: { auctionId: string; onClose: () => void; onResolve: (w: string | null) => void }) {
  const { data: bids = [] } = useQuery({ queryKey: ["auction_bids", auctionId], queryFn: async () => { const { data } = await supabase.from("dkp_bids").select("id, member_id, bid_amount, status, created_at, members:member_id(name)").eq("auction_id", auctionId).order("bid_amount", { ascending: false }); return (data || []).map((b: any) => ({ ...b, member_name: b.members?.name })); }, enabled: !!auctionId });
  const { data: auction } = useQuery({ queryKey: ["auction", auctionId], queryFn: async () => { const { data } = await supabase.from("dkp_auctions").select("item_id, items:item_id(name)").eq("id", auctionId).single(); return data; }, enabled: !!auctionId });
  const auctionItem = (auction as any)?.items as any;
  const itemName = auctionItem?.name || "this item";
  const active = bids.filter((b: ItemBid) => b.status === "active");
  const [cancelInput, setCancelInput] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#fafafa]">Cancel Auction</h3>
          <button onClick={onClose} className="text-[#52525b] hover:text-[#a1a1aa] transition p-1 -mr-1"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[11px] text-[#71717a] mb-3">{active.length} active bid{active.length !== 1 ? "s" : ""}{auctionItem?.name ? ` · ${auctionItem.name}` : ""}</p>

        {active.length > 0 && (
          <div className="space-y-1 mb-3">{active.map(bid => (
            <div key={bid.id} className="flex items-center justify-between p-2 rounded bg-[#18181b] border border-[#27272a]">
              <div><p className="text-xs text-[#fafafa]">{bid.member_name}</p><p className="text-[11px] text-[#52525b]">{new Date(bid.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div>
              <div className="flex items-center gap-2"><span className="text-sm font-bold text-amber-400">{bid.bid_amount}</span></div>
            </div>
          ))}</div>
        )}

        <div className="space-y-3 border-t border-[#27272a] pt-3">
          <p className="text-xs text-[#fafafa]">Type <span className="text-red-400 font-bold">{itemName}</span> to confirm cancellation:</p>
          <input type="text" value={cancelInput} onChange={e => setCancelInput(e.target.value)} placeholder={itemName} autoFocus
            className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#fafafa] outline-none placeholder:text-[#52525b]" />
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 rounded text-sm bg-[#27272a] text-[#d4d4d8]">Back</button>
            <button onClick={() => { if (cancelInput.trim() === itemName) { onResolve(null); onClose(); } }} disabled={cancelInput.trim() !== itemName}
              className="flex-1 py-2 rounded text-sm font-medium bg-red-500/20 text-red-400 disabled:opacity-30 hover:bg-red-500/30 transition">Cancel Auction</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BidsModal({ itemId, auctionId, onClose, startedAfter, resolvedBefore }: { itemId: string; auctionId?: string | null; onClose: () => void; startedAfter?: string; resolvedBefore?: string }) {
  const { data: bids = [], isLoading } = useQuery({ queryKey: ["item_bids", itemId], queryFn: () => getItemBids(itemId), enabled: !!itemId });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Filter by auction if provided, then apply time window for past auctions
  const all = [...bids]
    .filter(b => !auctionId || b.auction_id === auctionId)
    .filter(b => !startedAfter || new Date(b.created_at) >= new Date(startedAfter))
    .filter(b => !resolvedBefore || new Date(b.created_at) <= new Date(resolvedBefore))
    .sort((a: ItemBid, b: ItemBid) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-5 w-96 max-h-[70vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#fafafa]">All Bids</h3>
            <p className="text-[11px] text-[#71717a]">{all.length} bid{all.length !== 1 ? "s" : ""} total</p>
          </div>
          <button onClick={onClose} className="text-[#52525b] hover:text-[#a1a1aa] transition p-1 -mr-1" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {isLoading ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-[#52525b] animate-spin" /></div>
        : all.length === 0 ? <p className="text-xs text-[#52525b] text-center py-4">No bids yet.</p>
        : <div className="space-y-1">
          {all.map((bid: ItemBid) => (
            <div key={bid.id} className="flex items-center justify-between p-2 rounded bg-[#18181b] border border-[#27272a]">
              <div><p className="text-xs text-[#fafafa]">{bid.member_name}</p><p className="text-[11px] text-[#52525b]">{new Date(bid.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold tabular-nums ${bid.status === "active" ? "text-amber-400" : bid.status === "won" ? "text-emerald-400" : "text-[#52525b]"}`}>{bid.bid_amount} DKP</span>
                {bid.status === "active" && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">Active</span>}
                {bid.status === "won" && <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Won</span>}
                {bid.status === "cancelled" && <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#27272a] text-[#52525b]">Refunded</span>}
              </div>
            </div>
          ))}
        </div>}
      </div>
    </div>
  );
}

function AuctionHistory({ serverId, memberId, isStaff, queryClient, toast, userId }: { serverId: string; memberId: string | null; isStaff: boolean; queryClient: any; toast: any; userId?: string }) {
  const [selectedItem, setSelectedItem] = useState<{ itemId: string; auctionId: string; startedAt: string; resolvedAt: string } | null>(null);
  const [auctionSearch, setAuctionSearch] = useState("");
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const historySearchRef = useRef<HTMLInputElement>(null);
  const { data: auctions = [], isLoading } = useQuery({
    queryKey: ["dkp_past_auctions", serverId],
    queryFn: () => getPastAuctions(serverId),
    staleTime: 10_000,
  });

  // Resolve current member name
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => {
    if (!memberId) return;
    supabase.from("members").select("name").eq("id", memberId).single()
      .then(({ data }) => { if (data) setMyName(data.name); });
  }, [memberId]);

  // ── Delete Confirmation Modal State ──
  const [deleteAuction, setDeleteAuction] = useState<PastAuction | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteActing, setDeleteActing] = useState(false);

  const handleDelete = (e: React.MouseEvent, a: PastAuction) => {
    e.stopPropagation();
    setDeleteAuction(a);
    setDeleteConfirmName("");
  };

  const confirmDelete = async () => {
    if (!deleteAuction) return;
    setDeleteActing(true);
    try {
      await deletePastAuction(deleteAuction.item_id, deleteAuction.auction_round);
      queryClient.invalidateQueries({ queryKey: ["dkp_past_auctions", serverId] });
      queryClient.invalidateQueries({ queryKey: ["dkp_history"] });
      queryClient.invalidateQueries({ queryKey: ["dkp_rankings", serverId] });
      queryClient.invalidateQueries({ queryKey: ["dkp_balance"] });
      toast("success", `Auction "${deleteAuction.item_name}" deleted.`);
      setDeleteAuction(null);
    } catch (err: any) {
      toast("error", err?.message || "Failed to delete auction");
    } finally { setDeleteActing(false); }
  };

  return (
    <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e2a] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <Gavel className="w-4 h-4 text-[#52525b]" />
          <span className="text-xs font-semibold text-[#71717a] uppercase tracking-wider">Auction History</span>
        </div>
        {historySearchOpen ? (
          <input
            ref={historySearchRef}
            type="text"
                        placeholder="Search items or winners..."
            value={auctionSearch}
            onChange={e => setAuctionSearch(e.target.value)}
            onBlur={() => { if (!auctionSearch) setHistorySearchOpen(false); }}
            onKeyDown={e => { if (e.key === "Escape") { setAuctionSearch(""); setHistorySearchOpen(false); } }}
            className="bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-[11px] text-[#d4d4d8] outline-none w-full max-w-40 focus:border-[#3f3f46] animate-slide-up"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setHistorySearchOpen(true)}
            className="p-1 rounded text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition shrink-0"
            title="Search"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>
      ) : auctions.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Gavel className="w-8 h-8 text-[#3f3f46] mx-auto mb-2" />
          <p className="text-xs text-[#71717a]">No past auctions</p>
        </div>
      ) : (
        <AuctionList auctions={auctions} auctionSearch={auctionSearch} myName={myName} isStaff={isStaff} handleDelete={handleDelete} setSelectedItem={setSelectedItem} queryClient={queryClient} serverId={serverId} toast={toast} userId={userId} />
      )}
      {selectedItem && <BidsModal itemId={selectedItem.itemId} auctionId={selectedItem.auctionId} startedAfter={selectedItem.startedAt} resolvedBefore={selectedItem.resolvedAt} onClose={() => setSelectedItem(null)} />}

      {/* ── Delete Auction Confirmation Modal ── */}
      {deleteAuction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDeleteAuction(null)}>
          <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-5 w-96 max-w-[95vw] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[#fafafa]">Delete Auction</h3>
                <p className="text-[11px] text-[#71717a] mt-0.5">This action cannot be undone.</p>
              </div>
              <button onClick={() => setDeleteAuction(null)} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-400">
                Deleting <span className="text-[#fafafa] font-medium">"{deleteAuction.item_name}"</span> (round {deleteAuction.auction_round}) will permanently remove:
              </p>
              <ul className="text-[11px] text-red-400/80 mt-1.5 space-y-0.5 list-disc list-inside">
                <li>All bids for this auction round</li>
                <li>All DKP transactions for these bids</li>
                <li>All distribution records</li>
                <li>The auction itself from history</li>
              </ul>
            </div>
            <label className="text-[11px] text-[#71717a] uppercase tracking-wider">Type the item name to confirm</label>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={e => setDeleteConfirmName(e.target.value)}
              placeholder={deleteAuction.item_name}
              className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-sm text-[#fafafa] outline-none mt-1 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
              autoFocus
              onKeyDown={e => { if (e.key === "Escape") setDeleteAuction(null); if (e.key === "Enter" && deleteConfirmName.toLowerCase().trim() === deleteAuction.item_name.toLowerCase().trim()) confirmDelete(); }}
            />
            <button
              onClick={confirmDelete}
              disabled={deleteActing || deleteConfirmName.toLowerCase().trim() !== deleteAuction.item_name.toLowerCase().trim()}
              className="w-full mt-3 py-2 rounded text-sm bg-red-500/20 text-red-400 border border-red-500/30 font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-red-500/30 transition"
            >
              {deleteActing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Delete Auction"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AuctionList({ auctions, auctionSearch, myName, isStaff, handleDelete, setSelectedItem, queryClient, serverId, toast, userId }: { auctions: PastAuction[]; auctionSearch: string; myName: string | null; isStaff: boolean; handleDelete: (e: React.MouseEvent, a: PastAuction) => void; setSelectedItem: (v: any) => void; queryClient: any; serverId: string; toast: any; userId?: string }) {
  const [showCount, setShowCount] = useState(60);
  const prevSearch = useRef(auctionSearch);
  if (auctionSearch !== prevSearch.current) {
    prevSearch.current = auctionSearch;
    if (showCount !== 60) setShowCount(60);
  }

  // ── Hooks must be called before any early return ──
  const { data: allMembers = [] } = useMembers({ includeInactive: true });
  const [showDistModal, setShowDistModal] = useState(false);
  const [distAuction, setDistAuction] = useState<PastAuction | null>(null);
  const [distMemberId, setDistMemberId] = useState("");
  const [distMemberSearch, setDistMemberSearch] = useState("");
  const [distQuantity, setDistQuantity] = useState(1);
  const [distReason, setDistReason] = useState("");

  const openDistributeModal = (e: React.MouseEvent, a: PastAuction) => {
    e.stopPropagation();
    setDistAuction(a);
    setDistQuantity(1);
    setDistReason(`Auction won — ${a.item_name} — ${a.winning_bid} DKP`);
    setDistMemberSearch("");
    setDistMemberId("");
    if (a.winner_name) {
      const winner = allMembers.find(m => m.name.toLowerCase() === a.winner_name?.toLowerCase());
      if (winner) {
        setDistMemberId(winner.id);
        setDistMemberSearch(winner.name);
      } else {
        setDistMemberSearch(a.winner_name ?? "");
      }
    }
    setShowDistModal(true);
  };

  const distMutation = useMutation({
    mutationFn: () => {
      if (!distAuction) throw new Error("No auction selected");
      const member = allMembers.find(m => m.id === distMemberId);
      return createDistribution({
        server_id: serverId,
        item_id: distAuction.item_id,
        member_id: distMemberId,
        player_name: member?.name ?? distAuction.winner_name ?? "Unknown",
        quantity: distQuantity,
        reason: distReason,
        distributed_by: userId,
      }, distAuction.item_name);
    },
    onSuccess: async () => {
      if (distAuction) {
        await toggleItemDistributed(distAuction.item_id, distAuction.auction_round, distAuction.auction_id, true).catch(() => {});
        writeAuditEntry({
          action: AuditAction.DKP_ITEM_DISTRIBUTED,
          server_id: serverId,
          target_id: distAuction.item_id,
          details: {
            auction_id: distAuction.auction_id,
            auction_round: distAuction.auction_round,
            item_name: distAuction.item_name,
            winner_name: distMemberSearch || distAuction.winner_name,
            winning_bid: distAuction.winning_bid,
            recipient_name: allMembers.find(m => m.id === distMemberId)?.name ?? distAuction.winner_name ?? "Unknown",
            quantity: distQuantity,
            reason: distReason,
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["dkp_past_auctions", serverId] });
      queryClient.invalidateQueries({ queryKey: ["distributions", serverId] });
      toast("success", `"${distAuction?.item_name}" distributed to ${distMemberSearch || distAuction?.winner_name}!`);
      setShowDistModal(false);
      setDistAuction(null);
      setDistMemberId("");
      setDistMemberSearch("");
      setDistQuantity(1);
      setDistReason("");
    },
    onError: (err: any) => {
      toast("error", err?.message || "Failed to distribute");
    },
  });

  const filtered = auctionSearch
    ? auctions.filter(a =>
        a.item_name.toLowerCase().includes(auctionSearch.toLowerCase()) ||
        (a.winner_name || "").toLowerCase().includes(auctionSearch.toLowerCase())
      )
    : auctions;
  if (filtered.length === 0) return <div className="px-4 py-6 text-center"><p className="text-xs text-[#71717a]">No items match</p></div>;

  const visible = filtered.slice(0, showCount);
  const hasMore = showCount < filtered.length;

  // Group by date period
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const monthStart = new Date(todayStart.getTime() - 30 * 86400000);

  const getDateGroup = (d: string): string => {
    const date = new Date(d);
    if (date >= todayStart) return "Today";
    if (date >= yesterdayStart) return "Yesterday";
    if (date >= weekStart) return "This Week";
    if (date >= monthStart) return "This Month";
    return "Older";
  };

  const groups: { label: string; items: PastAuction[] }[] = [];
  for (const a of visible) {
    const group = getDateGroup(a.resolved_at || a.started_at);
    const last = groups[groups.length - 1];
    if (last && last.label === group) last.items.push(a);
    else groups.push({ label: group, items: [a] });
  }

  return (
    <div className="max-h-[600px] overflow-y-auto">
      {groups.map(group => (
        <div key={group.label}>
          <div className="px-4 py-1.5 bg-[#0d0d11] border-b border-[#1e1e2a]/30 sticky top-0 z-10">
            <span className="text-[11px] font-semibold text-[#52525b] uppercase tracking-wider">{group.label}</span>
          </div>
          <div className="divide-y divide-[#1e1e2a]/50">
            {group.items.map((a: PastAuction) => {
        const isMyWin = myName && a.winner_name === myName;
        const startDate = a.started_at ? new Date(a.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
        const endDate = a.resolved_at ? new Date(a.resolved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
        const rColor = rc(a.rarity ?? undefined);
        return (
        <div
          key={a.auction_id}
          onClick={() => setSelectedItem({ itemId: a.item_id, auctionId: a.auction_id, startedAt: a.started_at, resolvedAt: a.resolved_at })}
          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#18181b] transition"
        >
          {a.image_url ? (
            <img src={a.image_url} alt={a.item_name} className="w-8 h-8 rounded object-cover border border-[#27272a] shrink-0" style={{ backgroundColor: rColor + "20" }} />
          ) : (
            <div className="w-8 h-8 rounded border border-[#27272a] flex items-center justify-center shrink-0" style={{ backgroundColor: rColor + "18" }}>
              <Image className="w-4 h-4" style={{ color: rColor }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs truncate" style={{ color: rColor }}>{a.item_name}</span>
              {a.guild_name && (
                <span className={`flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded border shrink-0 ${guildColor(a.guild_name).bg} ${guildColor(a.guild_name).text} ${guildColor(a.guild_name).border}`}>
                  <Shield className="w-2 h-2" />{a.guild_name}
                </span>
              )}
              {isMyWin && (
                <span className="text-[8px] px-1 py-0.5 rounded font-medium bg-emerald-500/10 text-emerald-400 shrink-0">You Won!</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#52525b] mt-0.5">
              <span>{a.bid_count} bid{a.bid_count !== 1 ? "s" : ""}</span>
              <span>·</span>
              <span className="text-amber-400 font-medium">{a.winning_bid} DKP</span>
              {a.winner_name ? (
                <>
                  <span>·</span>
                  <span className="text-[#a1a1aa]">{a.winner_name}</span>
                </>
              ) : a.bid_count > 0 ? (
                <>
                  <span>·</span>
                  <span className="text-[#52525b] italic">Cancelled</span>
                </>
              ) : (
                <>
                  <span>·</span>
                  <span className="text-[#52525b] italic">No bids</span>
                </>
              )}
              {endDate && <><span>·</span><span className="text-[#52525b]">{startDate} → {endDate}</span></>}
              {a.distributed && <><span>·</span><span className="flex items-center gap-0.5 text-emerald-400"><CheckCircle className="w-2.5 h-2.5" />Distributed</span></>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isStaff && !a.distributed && (
              <button onClick={(e) => openDistributeModal(e, a)} disabled={distMutation.isPending} className="text-[11px] px-1.5 py-0.5 rounded border transition border-[#27272a] text-[#52525b] hover:text-[#a1a1aa] hover:border-[#3f3f46]">
                Distribute
              </button>
            )}
            <Eye className="w-3 h-3 text-[#52525b]" />
            {isStaff && (
              <button onClick={(e) => handleDelete(e, a)} className="text-[#52525b] hover:text-red-400 transition" title="Delete auction">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )})}
          </div>
        </div>
      ))}
      {hasMore && (
        <button onClick={() => setShowCount(c => c + 30)} className="w-full px-4 py-2 text-xs text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] transition border-t border-[#1e1e2a]/50">
          Load more... ({filtered.length - visible.length} remaining)
        </button>
      )}

      {/* ── Distribute Modal ── */}
      {showDistModal && distAuction && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDistModal(false)}>
          <div className="bg-[#09090b] border border-[#27272a] rounded-t-xl sm:rounded-xl p-5 w-full max-w-md mx-0 sm:mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[#fafafa]">Distribute Item</h3>
                {(() => {
                  const rColor = rc(distAuction.rarity ?? undefined);
                  return (
                    <p className="text-[11px] text-[#a1a1aa] mt-0.5">
                      {distAuction.image_url && <img src={distAuction.image_url} alt="" className="w-6 h-6 rounded inline-block mr-1.5 object-cover border align-middle" style={{ borderColor: rColor, backgroundColor: rColor + "20" }} />}
                      <span className="font-medium" style={{ color: rColor }}>{distAuction.item_name}</span>
                      {" · "}<span className="text-amber-400 font-medium">{distAuction.winning_bid} DKP</span>
                      {distAuction.winner_name && <span>{" · "}won by <span className="text-[#d4d4d8]">{distAuction.winner_name}</span></span>}
                    </p>
                  );
                })()}
              </div>
              <button onClick={() => setShowDistModal(false)} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              {/* Recipient — read-only */}
              <div>
                <label className="text-[11px] text-[#71717a] uppercase tracking-wider">Recipient</label>
                <div className="mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa]">
                  {distMemberSearch || distAuction.winner_name || "—"}
                </div>
              </div>

              {/* Quantity — read-only */}
              <div>
                <label className="text-[11px] text-[#71717a] uppercase tracking-wider">Quantity</label>
                <div className="mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa]">
                  {distQuantity}
                </div>
              </div>

              {/* Reason — read-only, full text visible */}
              <div>
                <label className="text-[11px] text-[#71717a] uppercase tracking-wider">Reason</label>
                <div className="mt-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] whitespace-pre-wrap break-words">
                  {distReason}
                </div>
              </div>

              <button onClick={() => distMutation.mutate()}
                disabled={!distMemberId || distMutation.isPending}
                className="w-full py-2.5 bg-[#fafafa] text-[#09090b] rounded-lg text-sm font-semibold hover:bg-[#e4e4e7] transition disabled:opacity-40 flex items-center justify-center gap-2">
                {distMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                {distMutation.isPending ? "Distributing..." : "Distribute"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HistorySection({ memberId, serverId }: { memberId: string; serverId: string }) {
  const [collapsed, setCollapsed] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>();
  const [all, setAll] = useState<DkpTransaction[]>([]);
  const { data: txns = [], isLoading } = useQuery({ queryKey: ["dkp_history", memberId, serverId, cursor], queryFn: async () => { const r = await getMemberDkpHistory(memberId, serverId, 20, cursor); if (cursor) setAll(p => [...p, ...r]); else setAll(r); return r; }, staleTime: 0 });
  const display = cursor ? all : txns;
  const [selectedTxn, setSelectedTxn] = useState<DkpTransaction | null>(null);
  return (
    <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-4 py-3 border-b border-[#1e1e2a] flex items-center gap-2 hover:bg-[#18181b] transition cursor-pointer"
      >
        <History className="w-4 h-4 text-[#52525b]" />
        <span className="text-xs font-semibold text-[#71717a] uppercase tracking-wider">DKP History</span>
        <span className="ml-auto text-[#52525b] text-xs">{collapsed ? "Show" : "Hide"}</span>
      </button>
      {!collapsed && (
        <>
          {isLoading && display.length === 0 ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[#52525b] animate-spin" /></div>
          : display.length === 0 ? <div className="px-4 py-6 text-center"><p className="text-xs text-[#71717a]">No transactions yet.</p></div>
          : <div className="divide-y divide-[#1e1e2a]/50">{display.map(txn => (
              <div key={txn.id} onClick={() => setSelectedTxn(txn)} className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-[#18181b] transition"><div className="min-w-0"><p className="text-xs text-[#d4d4d8] truncate">{txn.reason || txn.type}{txn.bidder_name && <> by <span className="text-[#a1a1aa]">{txn.bidder_name}</span></>}{txn.item_name && <> — <span style={{ color: rc(txn.item_rarity ?? undefined) }}>{txn.item_name}</span>{txn.item_guild_name && <span className={`inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded border ml-1 align-middle ${guildColor(txn.item_guild_name).bg} ${guildColor(txn.item_guild_name).text} ${guildColor(txn.item_guild_name).border}`}><Shield className="w-2 h-2" />{txn.item_guild_name}</span>}</>}{txn.boss_name && <> — {txn.boss_name}{txn.guild_name && <span className="text-[#a1a1aa]"> ({txn.guild_name})</span>}</>}</p>
                <p className="text-[11px] text-[#52525b]">{new Date(txn.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div><span className={`text-sm font-bold tabular-nums shrink-0 ${txn.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>{txn.amount > 0 ? "+" : ""}{txn.amount}</span></div>))}
            {txns.length === 20 && <button onClick={() => setCursor(display[display.length - 1]?.created_at)} className="w-full px-4 py-2 text-xs text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] transition">Load more...</button>}</div>}
        </>
      )}
      {selectedTxn && <TxnDetailModal txn={selectedTxn} onClose={() => setSelectedTxn(null)} />}
    </div>
  );
}

function TxnDetailModal({ txn, onClose }: { txn: DkpTransaction; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-5 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#fafafa]">{txn.reason || txn.type}</h3>
          <button onClick={onClose} className="text-[#52525b] hover:text-[#a1a1aa] transition p-1 -mr-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-[#71717a]">Amount</span><span className={`font-bold ${txn.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>{txn.amount > 0 ? "+" : ""}{txn.amount} DKP</span></div>
          <div className="flex justify-between"><span className="text-[#71717a]">Type</span><span className="text-[#d4d4d8]">{txn.type}</span></div>
          {txn.item_name && <div className="flex justify-between"><span className="text-[#71717a]">Item</span><span style={{ color: rc(txn.item_rarity ?? undefined) }}>{txn.item_name}</span></div>}
          {txn.bidder_name && <div className="flex justify-between"><span className="text-[#71717a]">Bidder</span><span className="text-[#d4d4d8]">{txn.bidder_name}</span></div>}
          {txn.boss_name && <div className="flex justify-between"><span className="text-[#71717a]">Boss</span><span className="text-[#d4d4d8]">{txn.boss_name}</span></div>}
          {txn.guild_name && <div className="flex justify-between"><span className="text-[#71717a]">Guild</span><span className="text-[#d4d4d8]">{txn.guild_name}</span></div>}
          <div className="flex justify-between"><span className="text-[#71717a]">Date</span><span className="text-[#d4d4d8]">{new Date(txn.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
        </div>
      </div>
    </div>
  );
}
