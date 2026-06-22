import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useServer } from "@/contexts/ServerContext";
import { useServerId } from "@/contexts/ServerContext";
import { getMemberDkp, getServerDkpRankings, getMemberDkpHistory, getActiveBids, getDkpConfig, type DkpBalance, type DkpRanking, type DkpTransaction, type DkpBid, type DkpConfig } from "@/lib/supabase";
import { Coins, TrendingUp, TrendingDown, History, Gavel, Loader2, Shield } from "lucide-react";

export function DkpView() {
  const { user, isViewer } = useAuth();
  const { currentServer } = useServer();
  const serverId = useServerId();

  // Redirect viewers
  if (isViewer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-sm text-[#71717a]">DKP is not available in viewer mode. Claim your profile to participate.</p>
      </div>
    );
  }

  if (!currentServer || !serverId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-sm text-[#71717a]">Select a server to view DKP.</p>
      </div>
    );
  }

  return <DkpContent serverId={serverId} />;
}

function DkpContent({ serverId }: { serverId: string }) {
  const { user } = useAuth();
  const [memberId, setMemberId] = useState<string | null>(null);

  // Resolve member ID from auth user
  useEffect(() => {
    if (!user) return;
    import("@/lib/supabase").then(({ supabase }) => {
      supabase
        .from("members")
        .select("id")
        .eq("server_id", serverId)
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => { if (data) setMemberId(data.id); });
    });
  }, [user, serverId]);

  // DKP Config
  const { data: dkpConfig } = useQuery({
    queryKey: ["dkp_config", serverId],
    queryFn: () => getDkpConfig(serverId),
    enabled: !!serverId,
  });

  if (!dkpConfig?.enabled) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-3">
        <Coins className="w-10 h-10 text-[#3f3f46] mx-auto" />
        <p className="text-sm text-[#71717a]">DKP is not enabled on this server.</p>
        <p className="text-xs text-[#52525b]">The server owner can enable it in Server Settings → DKP.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Coins className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-bold text-[#fafafa]">DKP</h2>
      </div>

      {memberId ? (
        <MemberDkpView memberId={memberId} serverId={serverId} />
      ) : (
        <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-8 text-center">
          <Shield className="w-8 h-8 text-[#52525b] mx-auto mb-2" />
          <p className="text-sm text-[#a1a1aa]">Claim your profile to view your DKP</p>
          <p className="text-xs text-[#52525b] mt-1">Go to the Join Server page to claim your in-game character.</p>
        </div>
      )}

      {/* Server-wide rankings */}
      <DkpRankingsSection serverId={serverId} />
    </div>
  );
}

function MemberDkpView({ memberId, serverId }: { memberId: string; serverId: string }) {
  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ["dkp_balance", memberId, serverId],
    queryFn: () => getMemberDkp(memberId, serverId),
    refetchInterval: 10_000,
  });

  const { data: bids = [], isLoading: bidsLoading } = useQuery({
    queryKey: ["dkp_active_bids", serverId],
    queryFn: () => getActiveBids(serverId),
    refetchInterval: 10_000,
  });

  const myBids = bids.filter(b => true); // Will filter by member when we have member_id matching

  if (balanceLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>;
  }

  return (
    <>
      {/* Balance Card */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 text-center">
          <Coins className="w-4 h-4 text-amber-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-[#fafafa]">{balance?.balance ?? 0}</p>
          <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Balance</p>
        </div>
        <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 text-center">
          <TrendingUp className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-emerald-400">+{balance?.earned_this_week ?? 0}</p>
          <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Earned (7d)</p>
        </div>
        <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-4 text-center">
          <TrendingDown className="w-4 h-4 text-red-400 mx-auto mb-1" />
          <p className="text-2xl font-bold text-red-400">-{balance?.spent_this_week ?? 0}</p>
          <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Spent (7d)</p>
        </div>
      </div>

      {/* Transaction History */}
      <DkpHistorySection memberId={memberId} serverId={serverId} />
    </>
  );
}

function DkpHistorySection({ memberId, serverId }: { memberId: string; serverId: string }) {
  const [cursor, setCursor] = useState<string | undefined>();
  const [allTxns, setAllTxns] = useState<DkpTransaction[]>([]);

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ["dkp_history", memberId, serverId, cursor],
    queryFn: async () => {
      const result = await getMemberDkpHistory(memberId, serverId, 20, cursor);
      if (cursor) {
        setAllTxns(prev => [...prev, ...result]);
      } else {
        setAllTxns(result);
      }
      return result;
    },
    staleTime: 0,
  });

  const displayTxns = cursor ? allTxns : txns;

  return (
    <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e2a] flex items-center gap-2">
        <History className="w-4 h-4 text-[#52525b]" />
        <span className="text-sm font-semibold text-[#fafafa]">Transaction History</span>
      </div>
      {isLoading && displayTxns.length === 0 ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[#52525b] animate-spin" /></div>
      ) : displayTxns.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-[#71717a]">No transactions yet. DKP is earned from boss kills.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#1e1e2a]/50">
          {displayTxns.map(txn => (
            <div key={txn.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-[#d4d4d8] truncate">{txn.reason || txn.type}</p>
                <p className="text-[10px] text-[#52525b]">{new Date(txn.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <span className={`text-sm font-bold tabular-nums shrink-0 ${txn.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
                {txn.amount > 0 ? "+" : ""}{txn.amount}
              </span>
            </div>
          ))}
          {txns.length === 20 && (
            <button
              onClick={() => setCursor(displayTxns[displayTxns.length - 1]?.created_at)}
              className="w-full px-4 py-2 text-xs text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] transition"
            >
              Load more...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DkpRankingsSection({ serverId }: { serverId: string }) {
  const { data: rankings = [], isLoading } = useQuery({
    queryKey: ["dkp_rankings", serverId],
    queryFn: () => getServerDkpRankings(serverId),
    refetchInterval: 30_000,
  });

  return (
    <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1e1e2a] flex items-center gap-2">
        <Gavel className="w-4 h-4 text-[#52525b]" />
        <span className="text-sm font-semibold text-[#fafafa]">DKP Rankings</span>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[#52525b] animate-spin" /></div>
      ) : rankings.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-xs text-[#71717a]">No DKP earned yet. Rankings appear after boss kills.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#1e1e2a]/50">
          {rankings.slice(0, 20).map(r => (
            <div key={r.member_id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-xs font-bold text-[#52525b] w-6 text-right">{r.rank}</span>
              <span className="text-xs text-[#d4d4d8] flex-1 truncate">{r.member_name}</span>
              <span className="text-xs font-bold text-amber-400 tabular-nums">{r.balance}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
