import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminViewAs } from "@/hooks/useAdminViewAs";

declare const APP_VERSION: string;
import { useServer } from "@/contexts/ServerContext";
import { supabase } from "@/lib/supabase";
import { CreateServerModal } from "@/components/CreateServerModal";
import { DiscordWebhookBanner } from "@/components/DiscordWebhookBanner";
import { NoMembersBanner } from "@/components/NoMembersBanner";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useSpawnAlerts } from "@/hooks/useSpawnAlerts";
import { Calendar, LogOut, Clock, Trophy, Users, BarChart3, Server, Settings, Plus, Shield, Eye, ChevronDown, Globe, Loader2, Package, User, PanelLeftClose, PanelLeft, Crown, Swords, CreditCard, Bell, ScrollText, X, Coins } from "lucide-react";
import { version } from "../../package.json";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatVersionInTimezone } from "@/hooks/useUserTimezone";
import { useNotifications, typeIcon } from "@/hooks/useNotifications";
import { ServerActivityLogTab } from "@/pages/ServerSettingsView";
import { TIMEZONES } from "@/lib/timezones";
import { BotStatusIndicator } from "@/components/BotStatusIndicator";
import { ClaimNotificationBadge } from "@/components/ClaimNotificationBadge";
import { useClaimNotifications } from "@/hooks/useClaimNotifications";
import { useQueryClient } from "@tanstack/react-query";

let _audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext { if (!_audioCtx || _audioCtx.state === "closed") _audioCtx = new AudioContext(); return _audioCtx; }
function playAlertSound() {
  try {
    if (localStorage.getItem("raidscout-alert-muted") === "true") return;
    const vol = parseFloat(localStorage.getItem("raidscout-alert-volume") || "0.5");
    const ctx = getAudioContext();
    [587, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination); osc.type = "sine";
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.25 * vol, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
      osc.frequency.setValueAtTime(freq, t); osc.start(t); osc.stop(t + 0.5);
    });
  } catch {}
}

export function Layout() {
  const { user, signOut, userRole, isViewer, viewerServerName } = useAuth();
  const { servers, currentServer, setCurrentServer, loading: serverLoading, refreshServers } = useServer();
  const { timezone, setTimezone } = useUserTimezone(currentServer?.timezone);
  const [showCreate, setShowCreate] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [spawnToast, setSpawnToast] = useState<string | null>(null);
  const [discordGuilds, setDiscordGuilds] = useState<{ guild_id: string; name: string; icon_url: string | null }[]>([]);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { unreadClaim, dismiss: dismissClaim } = useClaimNotifications();
  const [toasts, setToasts] = useState<{ id: string; type: string; title: string; body: string; itemId: string; itemName?: string; rarity?: string }[]>([]);
  const seenNotifRef = useRef<Set<string>>(new Set());

  const dismissToast = (notifId: string) => {
    setToasts(prev => prev.filter(t => t.id !== notifId));
    markRead(notifId);
  };

  // When a claim is accepted, invalidate member queries so DKP auto-refreshes
  const queryClient = useQueryClient();
  useEffect(() => {
    if (unreadClaim?.status === "accepted") {
      queryClient.invalidateQueries({ queryKey: ["my_member_id"] });
      queryClient.invalidateQueries({ queryKey: ["dkp_balance"] });
    }
  }, [unreadClaim, queryClient]);

  // Show toasts when outbid or won via Realtime notification
  useEffect(() => {
    for (const n of notifications) {
      if (n.read || seenNotifRef.current.has(n.id)) continue;
      const isOutbid = n.type === "dkp_outbid";
      const isWon = n.type === "dkp_won";
      if (!isOutbid && !isWon) continue;
      seenNotifRef.current.add(n.id);
      const meta = n.metadata as Record<string, any> | undefined;
      const toast = {
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body || "",
        itemId: meta?.item_id || meta?.auction_id || "",
        itemName: meta?.item_name || undefined,
        rarity: meta?.rarity || undefined,
      };
      setToasts(prev => [...prev, toast]);
      // Auto-dismiss after 8 seconds
      setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== n.id)); markRead(n.id); }, 8000);
    }
  }, [notifications]);

  // ── Server switch loading overlay ──
  const [serverSwitching, setServerSwitching] = useState(false);
  const prevServerId = useRef(currentServer?.id);
  useEffect(() => {
    if (currentServer?.id && currentServer.id !== prevServerId.current) {
      setServerSwitching(true);
      // Hide after data settles (React Query refetches should complete within ~800ms)
      const t = setTimeout(() => setServerSwitching(false), 1000);
      prevServerId.current = currentServer.id;
      return () => clearTimeout(t);
    }
    prevServerId.current = currentServer?.id;
  }, [currentServer?.id]);

  const navigate = useNavigate(); const location = useLocation();
  const isAdmin = userRole === "admin"; const hasServer = !!currentServer;
  const { joining: adminJoining } = useAdminViewAs(isAdmin ? currentServer?.id ?? null : null, refreshServers);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("raidscout-sidebar-collapsed") === "true");
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const autoCollapsedRef = useRef(false);
  const serverNavRef = useRef<HTMLDivElement>(null);
  const toggleSidebar = () => { autoCollapsedRef.current = false; const n = !sidebarCollapsed; setSidebarCollapsed(n); localStorage.setItem("raidscout-sidebar-collapsed", String(n)); };

  // Auto-scroll to selected server on mount/change
  useEffect(() => {
    if (!currentServer?.id) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`server-${currentServer.id}`);
      if (el && serverNavRef.current) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [currentServer?.id]);

  useEffect(() => { if (serverLoading) return; if (isAdmin && !hasServer && !localStorage.getItem("lordnine-current-server-id") && location.pathname !== "/admin") navigate("/admin", { replace: true }); }, [isAdmin, hasServer, location.pathname, navigate]);
  useEffect(() => {
    const t: Record<string,string> = {"/":"Bosses / Activities \u2014 RaidScout","/schedule":"Weekly Schedule \u2014 RaidScout","/leaderboard":"Leaderboard \u2014 RaidScout","/dkp":"DKP \u2014 RaidScout","/history":"Kill History \u2014 RaidScout","/members":"Members \u2014 RaidScout","/analytics":"Analytics \u2014 RaidScout","/server-settings":"Server Settings \u2014 RaidScout","/billing":"Billing \u2014 RaidScout","/admin":"Admin Panel \u2014 RaidScout"};
    document.title = t[location.pathname] ?? "RaidScout";
  }, [location.pathname]);
  // Auto-collapse sidebar on settings pages, restore when leaving (don't persist)
  useEffect(() => {
    const isSettings = location.pathname === "/server-settings" || location.pathname === "/billing";
    if (isSettings && !sidebarCollapsed) {
      autoCollapsedRef.current = true;
      setSidebarCollapsed(true);
    } else if (!isSettings && autoCollapsedRef.current) {
      autoCollapsedRef.current = false;
      setSidebarCollapsed(false);
    }
  }, [location.pathname]);
  // Fetch Discord guild info for connected servers
  useEffect(() => {
    if (!currentServer?.id) { setDiscordGuilds([]); return; }
    let cancelled = false;
    const fetchGuilds = async () => {
      const { data: links } = await supabase.from("discord_configs").select("discord_guild_id").eq("raidscout_server_id", currentServer.id);
      if (!links?.length || cancelled) { if (!cancelled) setDiscordGuilds([]); return; }
      const results: typeof discordGuilds = [];
      for (const l of links) {
        try {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-discord-guild`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
            body: JSON.stringify({ guild_id: l.discord_guild_id }),
          });
          if (res.ok) {
            const data = await res.json();
            results.push({ guild_id: l.discord_guild_id, name: data.name, icon_url: data.icon_url });
          }
        } catch {}
      }
      if (!cancelled) setDiscordGuilds(results);
    };
    fetchGuilds();
    // Listen for refresh events from ServerSettings when Discord links change
    const handler = () => { if (!cancelled) fetchGuilds(); };
    window.addEventListener("discord-config-updated", handler);
    return () => { cancelled = true; window.removeEventListener("discord-config-updated", handler); };
  }, [currentServer?.id, isViewer]);
  useSpawnAlerts((bossName) => { setSpawnToast(bossName.startsWith("\u26A0\uFE0F") ? bossName : `\u26A1 ${bossName} spawning in \u2264 5 min!`); playAlertSound(); setTimeout(() => setSpawnToast(null), 8000); });

  const NAV_GROUPS = [
    { label: "Operations", abbr: "Ops", items: [{ to: "/", icon: Swords, label: "Bosses / Activities", end: true },{ to: "/schedule", icon: Calendar, label: "Schedule" },{ to: "/history", icon: Clock, label: "History" }] },
    { label: "Management", abbr: "Mgmt", items: [{ to: "/leaderboard", icon: Trophy, label: "Leaderboard" },{ to: "/members", icon: Users, label: "Members" }] },
    { label: "Assets", abbr: "Asts", items: [{ to: "/inventory", icon: Package, label: "Inventory" },{ to: "/dkp", icon: Coins, label: "DKP" }] },
    { label: "Insights", abbr: "Ins", items: [{ to: "/analytics", icon: BarChart3, label: "Analytics" }] },
  ].filter(g => g.items.length > 0);

  // Shared sidebar content — renders nav items in either "full" or "collapsed" mode
  const renderSidebarNav = (mode: "full" | "collapsed", onNavClick?: () => void) => (
    <>
      <nav ref={serverNavRef} className="flex-1 overflow-y-auto py-2 px-2 space-y-3 scrollbar-thin">
        <div>
          {mode === "full" ? (
            isViewer ? (<><div className="px-2 mb-0.5 text-[9px] font-semibold text-[#52525b] uppercase tracking-wider">Servers</div><div className="px-2.5 py-2 rounded-md bg-[#18181b] text-xs text-[#a1a1aa] flex items-center gap-2"><Eye className="w-3.5 h-3.5 shrink-0"/><span className="truncate">{viewerServerName||"Read-only"}</span></div></>)
            : currentServer ? (<><div className="px-2 mb-0.5 text-[9px] font-semibold text-[#52525b] uppercase tracking-wider">Servers</div><div className="space-y-0.5">{servers.map(s=>{const n=new Date();const e=s.subscription_ends_at?new Date(s.subscription_ends_at):null;const t=s.trial_ends_at?new Date(s.trial_ends_at):null;const d=e?Math.ceil((e.getTime()-n.getTime())/86400000):0;const td=t?Math.ceil((t.getTime()-n.getTime())/86400000):0;const isActive=d>0;const isTrial=!isActive&&td>0;const isExpired=!isActive&&!isTrial&&(e||t);const isCurrent=s.id===currentServer.id;return(<button key={s.id} id={`server-${s.id}`} onClick={()=>{if(!isCurrent){setCurrentServer(s);onNavClick?.()}}} className={`w-full flex items-center gap-2.5 rounded-md text-sm transition text-left h-9 ${isCurrent?"px-2.5 bg-[#1e1e2a] text-[#fafafa]":"px-2.5 text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}><Server className="w-4 h-4 shrink-0"/><span className="truncate">{s.name}</span>{!isCurrent && <span className={`ml-0.5 text-[10px] shrink-0 ${s.role==="owner"?"text-amber-500/60":"text-blue-400/60"}`}>{s.role==="owner"?"Owner":"Mod"}</span>}{isActive&&isCurrent?<span className="ml-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20"><Crown className="w-2.5 h-2.5"/>Pro · {d}d</span>:isActive?<span className="ml-auto shrink-0 text-[10px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{d}d</span>:isTrial?<span className="ml-auto shrink-0 text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Trial {td}d</span>:isExpired?<span className="ml-auto shrink-0 text-[10px] px-1 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Exp</span>:null}</button>)})}</div></>) : !isAdmin ? (<button onClick={()=>{setShowCreate(true);onNavClick?.()}} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition"><Plus className="w-3.5 h-3.5"/>New Server</button>) : null
          ) : (
            // Collapsed: abbreviated "Svrs" header + icon-only server list
            currentServer ? (<>
              <div className="flex justify-center mb-0.5 text-[9px] font-semibold text-[#52525b] uppercase tracking-wider">Svrs</div>
              <div className="flex flex-col items-center gap-0.5">
                {servers.map(s => {
                  const isCurrent = s.id === currentServer.id;
                  return (
                    <button key={s.id} id={`server-${s.id}`} onClick={() => { if (!isCurrent) setCurrentServer(s); }}
                      className={`flex items-center justify-center rounded-md transition h-9 w-9 ${isCurrent ? "bg-[#1e1e2a] text-[#d4d4d8]" : "text-[#52525b] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}
                      title={`${s.name}${isCurrent ? " (active)" : ""}`}>
                      <Server className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </>) : !currentServer && !isAdmin ? (
              <div className="flex justify-center pb-1"><button onClick={()=>setShowCreate(true)} className="p-1 rounded-md text-[#71717a] hover:text-[#fafafa] hover:bg-[#18181b] transition"><Plus className="w-4 h-4"/></button></div>
            ) : null
          )}
          <div className="my-2 border-t border-[#1a1a1e]" />
        </div>
        {NAV_GROUPS.map(g=>(
          <div key={g.label}>
            <div className={mode === "full" ? "px-2.5 mb-1 text-[10px] font-semibold text-[#52525b] uppercase tracking-wider" : "flex justify-center mb-1 text-[10px] font-semibold text-[#52525b] uppercase tracking-wider"}>{mode === "full" ? g.label : g.abbr}</div>
            <div className="space-y-0.5">{g.items.map(item=>(<NavLink key={item.to} to={item.to} end={item.end} onClick={onNavClick} className={mode === "full" ? ({isActive})=>`flex items-center gap-2.5 px-3 py-2 h-9 rounded-md text-sm font-medium transition-all duration-150 ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}` : ({isActive})=>`flex items-center justify-center px-3 py-2 h-9 rounded-md text-sm font-medium transition ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8]"}`} title={mode === "full" ? undefined : item.label}><item.icon className="w-4 h-4 shrink-0"/>{mode === "full" && <span>{item.label}</span>}</NavLink>))}</div>
          </div>
        ))}
      </nav>
      <div className="border-t border-[#1a1a1e] p-2 space-y-0.5 shrink-0">
        {hasServer&&!isViewer&&(<>
          <NavLink to="/server-settings" onClick={onNavClick} className={({isActive})=>`flex items-center gap-2.5 px-2.5 py-2 h-9 rounded-md text-sm font-medium transition ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`} title={mode === "full" ? undefined : "Server Settings"}><Settings className="w-4 h-4 shrink-0"/>{mode === "full" && <span>Server Settings</span>}</NavLink>
          <NavLink to="/billing" onClick={onNavClick} className={({isActive})=>`flex items-center gap-2.5 px-2.5 py-2 h-9 rounded-md text-sm font-medium transition ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`} title={mode === "full" ? undefined : "Billing"}><CreditCard className="w-4 h-4 shrink-0"/>{mode === "full" && <span>Billing</span>}</NavLink>
        </>)}
        <button onClick={toggleSidebar} className="w-full flex items-center gap-2.5 px-2.5 py-2 h-9 rounded-md text-sm text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#18181b]/50 transition" title={mode === "full" ? undefined : (sidebarCollapsed ? "Expand" : "Collapse")}>
          <PanelLeft className="w-4 h-4 shrink-0"/>{mode === "full" && <span>{sidebarCollapsed ? "Expand" : "Collapse"}</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className="h-dvh bg-[#09090b] flex flex-col overflow-hidden" onClick={() => { showUserMenu && setShowUserMenu(false); showNotifications && setShowNotifications(false); }}>
      {adminJoining && (<div className="fixed inset-0 z-[100] bg-[#09090b]/80 flex items-center justify-center"><div className="text-center space-y-3"><Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin mx-auto" /><p className="text-sm text-[#a1a1aa]">Joining server as owner{"\u2026"}</p></div></div>)}
      {/* DKP toast banners (outbid / won) — stacked bottom-right */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[90] flex flex-col-reverse gap-2 max-w-md">
          {toasts.map((t) => (
            <div key={t.id} className="animate-bounce-in-right">
              <button
                onClick={() => { navigate(`/dkp?highlight=${t.itemId}`); dismissToast(t.id); }}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-2xl transition cursor-pointer border w-full ${t.type === "dkp_won" ? "bg-[#18181b] border-emerald-500/30 shadow-emerald-500/10 hover:border-emerald-500/60" : "bg-[#18181b] border-amber-500/30 shadow-amber-500/10 hover:border-amber-500/60"}`}
              >
                <span className="text-lg shrink-0">{t.type === "dkp_won" ? "🏆" : "↗️"}</span>
                <div className="text-left min-w-0">
                  <p className={`text-xs font-semibold ${t.type === "dkp_won" ? "text-emerald-400" : "text-amber-400"}`}>{t.title}</p>
                  <p className="text-[11px] text-[#a1a1aa] line-clamp-2">
                    {t.itemName
                      ? (() => {
                          const rc = (r?: string) => ({ common: "#a1a1aa", uncommon: "#22c55e", rare: "#3b82f6", epic: "#a855f7", legendary: "#f59e0b", mythic: "#ef4444" })[r?.toLowerCase() ?? ""] || "#a1a1aa";
                          const parts = t.body.split(t.itemName!);
                          if (parts.length === 1) return t.body;
                          return <>{parts[0]}<span style={{ color: rc(t.rarity) }} className="font-medium">{t.itemName}</span>{parts.slice(1).join(t.itemName!)}</>;
                        })()
                      : t.body
                    }
                  </p>
                  <p className={`text-[10px] mt-1 ${t.type === "dkp_won" ? "text-emerald-500/70" : "text-amber-500/70"}`}>Tap to view →</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); dismissToast(t.id); }} className="text-[#71717a] hover:text-[#fafafa] shrink-0 self-start mt-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Server switch overlay — covers tab content until data settles */}
      {serverSwitching && !adminJoining && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#09090b]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#27272a] border-t-[#a1a1aa] rounded-full animate-spin" />
            <span className="text-sm text-[#71717a]">Loading {currentServer?.name}...</span>
          </div>
        </div>
      )}
      <a href="#main-content" className="skip-to-content">Skip to content</a>

      {/* -- Top Bar -- */}
      <header className="shrink-0 h-12 bg-[#0a0a0c] border-b border-[#1a1a1e] flex items-center px-4 gap-3 z-40">
        <div className="flex items-center gap-2 shrink-0">
          <img src="/logo.png" alt="RaidScout" className="w-6 h-6 rounded-md" />
          <span className="font-semibold text-[#fafafa] text-sm tracking-tight">RaidScout</span>
        </div>
        {/* Mobile server name + Pro badge */}
        {currentServer && (
          <div className="md:hidden flex items-center gap-1 shrink-0 min-w-0 max-w-[40%]">
            <Server className="w-3 h-3 text-[#a1a1aa] shrink-0" />
            <span className="text-[10px] text-[#d4d4d8] truncate font-medium">{currentServer.name}</span>
            {(()=>{const n=new Date();const e=currentServer.subscription_ends_at?new Date(currentServer.subscription_ends_at):null;if(!e)return null;const d=Math.ceil((e.getTime()-n.getTime())/86400000);if(d>0)return(<span className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[8px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20"><Crown className="w-2 h-2"/>Pro</span>);return(<span className="shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[8px] font-semibold bg-red-500/10 text-red-300 border border-red-500/20">Expired</span>)})()}
          </div>
        )}
        {/* Discord connection indicator */}
        {discordGuilds.length > 0 && (
          <div className="hidden md:flex items-center gap-2.5 shrink-0 ml-1 pl-3 border-l border-[#27272a]">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#18181b]/60 border border-[#27272a]/60">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5865F2] shadow-[0_0_6px_rgba(88,101,242,0.5)]" />
              <span className="text-[10px] text-[#8686f0] font-semibold tracking-wide">DISCORD CONNECTED</span>
            </div>
            {discordGuilds.map((g, i) => (
              <div key={g.guild_id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-[#18181b]/40 border border-[#27272a]/40 hover:border-[#3f3f46] transition-colors">
                {g.icon_url ? (
                  <img src={g.icon_url} alt="" className="w-5 h-5 rounded-full ring-1 ring-[#5865F2]/30 ring-offset-1 ring-offset-[#09090b]" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[#5865F2] ring-1 ring-[#5865F2]/30 ring-offset-1 ring-offset-[#09090b] flex items-center justify-center">
                    <span className="text-[8px] text-white font-bold">D</span>
                  </div>
                )}
                <span className="text-[11px] text-[#d4d4d8] font-medium leading-none truncate max-w-[120px]">{g.name}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {/* Bot status */}
        <ClaimNotificationBadge />
        <BotStatusIndicator />
        {/* Activity Log button */}
        {currentServer && !isViewer && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowActivityLog(true); }}
            className="relative flex items-center gap-1.5 px-1.5 py-1.5 rounded-md text-[#fafafa]/70 hover:text-[#fafafa] hover:bg-[#18181b] transition text-xs font-medium sm:px-2"
            title="Activity Log"
          >
            <ScrollText className="w-4 h-4" />
            <span className="hidden sm:inline">Activity Log</span>
          </button>
        )}
        {/* Notification bell */}
        <div className="relative shrink-0">
          <button
            ref={notifBtnRef}
            onClick={(e) => { e.stopPropagation(); if (!showNotifications && unreadCount > 0) markAllRead(); setShowNotifications(!showNotifications); }}
            className="relative flex items-center justify-center p-1.5 rounded-md text-[#fafafa]/70 hover:text-[#fafafa] hover:bg-[#18181b] transition"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center px-1 leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {showNotifications && createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setShowNotifications(false)} />
              <div className="fixed z-[9999] right-4 top-12 w-80 max-h-[420px] bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272a] shrink-0">
                  <span className="text-sm font-semibold text-[#fafafa]">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-[11px] text-[#d4d4d8] hover:text-[#fafafa] transition">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-[#a1a1aa]">No notifications yet</div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          if (!n.read) markRead(n.id);
                          setExpandedNotifId(expandedNotifId === n.id ? null : n.id);
                          if (n.type.startsWith("dkp_")) { setShowNotifications(false); navigate("/dkp"); }
                          if (n.type === "member_unlinked") { setShowNotifications(false); navigate("/join"); }
                        }}
                        className={`w-full text-left px-4 py-3 border-b border-white/[0.03] hover:bg-[#1a1a1e] transition ${!n.read ? "bg-amber-500/[0.03]" : ""}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-sm shrink-0 mt-0.5">{typeIcon(n.type)}</span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs ${!n.read ? "text-[#fafafa] font-medium" : "text-[#d4d4d8]"}`}>{n.title}</p>
                            {n.body && <p className={`text-[11px] text-[#d4d4d8] mt-0.5 ${expandedNotifId !== n.id ? "line-clamp-2" : ""}`}>{n.body}</p>}
                            <p className="text-[10px] text-[#71717a] mt-1">
                              {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              {" � "}
                              {new Date(n.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </p>
                          </div>
                          {!n.read && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>,
            document.body
          )}
        </div>
        {/* User dropdown */}
        <div className="relative shrink-0">
          <button ref={menuBtnRef} onClick={()=>{if(!showUserMenu&&menuBtnRef.current){const r=menuBtnRef.current.getBoundingClientRect();setMenuPos({top:r.bottom+4,right:Math.max(4,window.innerWidth-r.right)})}setShowUserMenu(!showUserMenu)}} className="flex items-center gap-1.5 text-[#fafafa]/70 hover:text-[#fafafa] text-sm transition p-1.5 rounded-md hover:bg-[#18181b]" title="Account"><User className="w-4 h-4"/><span className="hidden sm:block text-xs max-w-[100px] truncate">{user?.email?.split("@")[0]}</span><ChevronDown className={`w-3 h-3 transition ${showUserMenu?"rotate-180":""}`}/></button>
          {showUserMenu&&createPortal(<><div className="fixed inset-0 z-[9998]" onClick={()=>setShowUserMenu(false)}/><div className="fixed z-[9999] w-56 bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto" style={menuPos?{top:menuPos.top,right:menuPos.right}:{}}><div className="px-4 py-3 border-b border-[#27272a]"><div className="text-sm font-semibold text-[#fafafa]">{user?.email?.split("@")[0]}</div><div className="text-xs text-[#71717a]">{user?.email}</div></div><div className="py-1"><div className="px-4 py-1.5 flex items-center gap-2 text-xs text-[#71717a]"><Globe className="w-3.5 h-3.5"/><select defaultValue={timezone} onChange={e=>setTimezone(e.target.value)} onClick={e=>e.stopPropagation()} className="flex-1 bg-transparent text-[#a1a1aa] text-xs focus:outline-none cursor-pointer">{TIMEZONES.map(tz=>(<option key={tz.value} value={tz.value} className="bg-[#11161e]">{tz.label}</option>))}</select></div>{hasServer&&!isViewer&&<div className="md:hidden"><NavLink to="/server-settings" onClick={()=>setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#18181b] transition"><Settings className="w-4 h-4"/>Server Settings</NavLink><NavLink to="/billing" onClick={()=>setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#18181b] transition"><CreditCard className="w-4 h-4"/>Billing</NavLink></div>}{isAdmin&&<NavLink to="/admin" onClick={()=>setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#18181b] transition"><Shield className="w-4 h-4"/>Admin Panel</NavLink>}<button onClick={()=>{setShowUserMenu(false);setShowLogoutConfirm(true)}} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#18181b] transition border-t border-white/[0.06]"><LogOut className="w-4 h-4"/>Sign Out</button></div></div></>,document.body)}
        </div>
      </header>

      {/* -- Body: Sidebar + Content -- */}
      <div className="flex-1 flex min-h-0 relative">
        <aside
          onMouseEnter={() => sidebarCollapsed && setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
          className={`hidden md:flex flex-col shrink-0 bg-[#0a0a0c] border-r border-[#1a1a1e] transition-all duration-200 ${sidebarCollapsed ? "w-[56px]" : "w-[220px]"}`}
        >
          {/* Hover overlay (collapsed → expand on hover) */}
          {sidebarCollapsed && (
            <div className={`absolute left-0 top-0 w-[220px] h-full bg-[#0a0a0c] border-r border-[#1a1a1e] shadow-2xl shadow-black/50 z-40 flex flex-col transition-all duration-200 ease-out ${sidebarHovered ? "translate-x-0 opacity-100" : "-translate-x-3 opacity-0 pointer-events-none"}`}>
              {renderSidebarNav("full", () => setSidebarHovered(false))}
            </div>
          )}
          {/* Main content: collapsed icons or full expanded */}
          {sidebarCollapsed ? renderSidebarNav("collapsed") : renderSidebarNav("full")}
        </aside>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <DiscordWebhookBanner/><NoMembersBanner/><SubscriptionBanner/>
          {/* Claim notification banner */}
          {unreadClaim && (
            <div className={`px-4 py-2 text-xs text-center font-medium ${
              unreadClaim.status === "accepted" 
                ? "bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-400" 
                : "bg-red-500/10 border-b border-red-500/20 text-red-400"
            }`}>
              {unreadClaim.status === "accepted" 
                ? `✅ Your claim for "${unreadClaim.requested_name}" on ${unreadClaim.server_name} was accepted!`
                : `❌ Your claim for "${unreadClaim.requested_name}" on ${unreadClaim.server_name} was declined${unreadClaim.decline_reason ? ` — ${unreadClaim.decline_reason}` : ""}.`
              }
              <button onClick={dismissClaim} className="ml-3 underline underline-offset-2 hover:opacity-70">Dismiss</button>
            </div>
          )}
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0 flex flex-col"><div className="flex-1"><Outlet/></div>
          <footer className="shrink-0 border-t border-[#1a1a1e] bg-[#09090b]"><div className="px-4 py-2 flex items-center justify-between text-[11px] text-[#52525b]"><span>© {new Date().toLocaleDateString("en-US", { timeZone: timezone, year: "numeric" })} RaidScout · v{formatVersionInTimezone(APP_VERSION, timezone)}</span><div className="flex items-center gap-3"><Link to="/terms" className="hover:text-[#a1a1aa] transition">Terms</Link><Link to="/privacy" className="hover:text-[#a1a1aa] transition">Privacy</Link><Link to="/refund" className="hover:text-[#a1a1aa] transition">Refunds</Link><Link to="/changelog" className="hover:text-[#a1a1aa] transition">Changelog</Link></div></div></footer>
          </main>
        </div>
      </div>

      {/* -- Mobile Bottom Nav -- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#09090b]/95 backdrop-blur-xl border-t border-[#27272a] safe-area-bottom">
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
          <NavLink to="/" end className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Swords className="w-4 h-4"/><span className="text-[8px] font-medium">Bosses</span></NavLink>
          <NavLink to="/schedule" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Calendar className="w-4 h-4"/><span className="text-[8px] font-medium">Sched</span></NavLink>
          <NavLink to="/history" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Clock className="w-4 h-4"/><span className="text-[8px] font-medium">History</span></NavLink>
          <NavLink to="/leaderboard" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Trophy className="w-4 h-4"/><span className="text-[8px] font-medium">Leaderboard</span></NavLink>
          <NavLink to="/dkp" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Coins className="w-4 h-4"/><span className="text-[8px] font-medium">DKP</span></NavLink>
          <NavLink to="/members" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Users className="w-4 h-4"/><span className="text-[8px] font-medium">Members</span></NavLink>
          <NavLink to="/inventory" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Package className="w-4 h-4"/><span className="text-[8px] font-medium">Items</span></NavLink>
          <NavLink to="/analytics" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><BarChart3 className="w-4 h-4"/><span className="text-[8px] font-medium">Stats</span></NavLink>
        </div>
      </nav>

      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} />}
      <ConfirmDialog open={showLogoutConfirm} title="Sign Out" message="Are you sure you want to sign out?" confirmLabel="Sign Out" onConfirm={async () => { setShowLogoutConfirm(false); await signOut(); }} onCancel={() => setShowLogoutConfirm(false)} />
      {spawnToast && (<div className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 shadow-2xl animate-slide-up"><p className="text-sm text-[#fafafa]">{spawnToast}</p></div>)}

      {/* Activity Log Modal */}
      {showActivityLog && currentServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm overflow-y-auto p-4" onClick={() => setShowActivityLog(false)}>
          <div className="bg-[#0d0d11] border border-[#27272a] rounded-xl w-full max-w-6xl mx-4 shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e1e2a]">
              <div className="flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-[#a1a1aa]" />
                <h3 className="text-sm font-semibold text-[#fafafa]">Activity Log</h3>
              </div>
              <button onClick={() => setShowActivityLog(false)} className="p-1 rounded hover:bg-[#1e1e2a] text-[#a1a1aa] hover:text-[#fafafa] transition">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <ServerActivityLogTab serverId={currentServer.id} timezone={timezone} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
