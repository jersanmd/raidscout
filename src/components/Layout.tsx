import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminViewAs } from "@/hooks/useAdminViewAs";
import { useServer } from "@/contexts/ServerContext";
import { supabase } from "@/lib/supabase";
import { CreateServerModal } from "@/components/CreateServerModal";
import { DiscordWebhookBanner } from "@/components/DiscordWebhookBanner";
import { NoMembersBanner } from "@/components/NoMembersBanner";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useSpawnAlerts } from "@/hooks/useSpawnAlerts";
import { Calendar, LogOut, Clock, Trophy, Users, BarChart3, Server, Settings, Plus, Shield, Eye, ChevronDown, Globe, Loader2, Package, User, PanelLeftClose, PanelLeft, Crown, Swords, CreditCard, Bell } from "lucide-react";
import { version } from "../../package.json";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { useNotifications, typeIcon } from "@/hooks/useNotifications";
import { TIMEZONES } from "@/lib/timezones";

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
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [spawnToast, setSpawnToast] = useState<string | null>(null);
  const [discordGuilds, setDiscordGuilds] = useState<{ guild_id: string; name: string; icon_url: string | null }[]>([]);
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate(); const location = useLocation();
  const isAdmin = userRole === "admin"; const hasServer = !!currentServer;
  const { joining: adminJoining } = useAdminViewAs(isAdmin ? currentServer?.id ?? null : null, refreshServers);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("raidscout-sidebar-collapsed") === "true");
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const autoCollapsedRef = useRef(false);
  const toggleSidebar = () => { autoCollapsedRef.current = false; const n = !sidebarCollapsed; setSidebarCollapsed(n); localStorage.setItem("raidscout-sidebar-collapsed", String(n)); };

  useEffect(() => { if (serverLoading) return; if (isAdmin && !hasServer && !localStorage.getItem("lordnine-current-server-id") && location.pathname !== "/admin") navigate("/admin", { replace: true }); }, [isAdmin, hasServer, location.pathname, navigate]);
  useEffect(() => {
    const t: Record<string,string> = {"/":"Bosses / Activities \u2014 RaidScout","/schedule":"Weekly Schedule \u2014 RaidScout","/leaderboard":"Leaderboard \u2014 RaidScout","/history":"Kill History \u2014 RaidScout","/members":"Members \u2014 RaidScout","/analytics":"Analytics \u2014 RaidScout","/server-settings":"Server Settings \u2014 RaidScout","/billing":"Billing \u2014 RaidScout","/admin":"Admin Panel \u2014 RaidScout"};
    document.title = t[location.pathname] ?? "RaidScout";
  }, [location.pathname]);
  // Auto-collapse sidebar on settings pages, restore when leaving
  useEffect(() => {
    const isSettings = location.pathname === "/server-settings" || location.pathname === "/billing";
    if (isSettings && !sidebarCollapsed) {
      autoCollapsedRef.current = true;
      setSidebarCollapsed(true);
      localStorage.setItem("raidscout-sidebar-collapsed", "true");
    } else if (!isSettings && autoCollapsedRef.current) {
      autoCollapsedRef.current = false;
      setSidebarCollapsed(false);
      localStorage.setItem("raidscout-sidebar-collapsed", "false");
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
    { label: "Operations", items: [{ to: "/", icon: Swords, label: "Bosses / Activities", end: true },{ to: "/schedule", icon: Calendar, label: "Schedule" },{ to: "/history", icon: Clock, label: "History" }] },
    { label: "Management", items: [{ to: "/leaderboard", icon: Trophy, label: "Ranks" },...(!isViewer?[{ to: "/members", icon: Users, label: "Members" }]:[])] },
    { label: "Assets", items: [...(!isViewer?[{ to: "/inventory", icon: Package, label: "Inventory" }]:[])] },
    { label: "Insights", items: [{ to: "/analytics", icon: BarChart3, label: "Analytics" }] },
  ].filter(g => g.items.length > 0);

  return (
    <div className="h-screen bg-[#09090b] flex flex-col overflow-hidden" onClick={() => { showUserMenu && setShowUserMenu(false); showNotifications && setShowNotifications(false); }}>
      {adminJoining && (<div className="fixed inset-0 z-[100] bg-[#09090b]/80 flex items-center justify-center"><div className="text-center space-y-3"><Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin mx-auto" /><p className="text-sm text-[#a1a1aa]">Joining server as owner{"\u2026"}</p></div></div>)}
      <a href="#main-content" className="skip-to-content">Skip to content</a>

      {/* -- Top Bar -- */}
      <header className="shrink-0 h-12 bg-[#0a0a0c] border-b border-[#1a1a1e] flex items-center px-4 gap-3 z-40">
        <div className="flex items-center gap-2 shrink-0">
          <img src="/logo.png" alt="RaidScout" className="w-6 h-6 rounded-md" />
          <span className="font-semibold text-[#fafafa] text-sm tracking-tight">RaidScout</span>
        </div>
        {/* Mobile server name + Pro badge */}
        {currentServer && (
          <div className="md:hidden flex items-center gap-1.5 shrink-0 min-w-0">
            <Server className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0" />
            <span className="text-xs text-[#d4d4d8] truncate font-medium">{currentServer.name}</span>
            {(()=>{const n=new Date();const e=currentServer.subscription_ends_at?new Date(currentServer.subscription_ends_at):null;if(!e)return null;const d=Math.ceil((e.getTime()-n.getTime())/86400000);if(d>0)return(<span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20"><Crown className="w-2.5 h-2.5"/>Pro � {d}d</span>);return(<span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-500/10 text-red-300 border border-red-500/20">Expired</span>)})()}
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
        {/* Notification bell */}
        <div className="relative shrink-0">
          <button
            ref={notifBtnRef}
            onClick={(e) => { e.stopPropagation(); setShowNotifications(!showNotifications); }}
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
          <button ref={menuBtnRef} onClick={()=>{if(!showUserMenu&&menuBtnRef.current){const r=menuBtnRef.current.getBoundingClientRect();setMenuPos({top:r.bottom+4,right:window.innerWidth-r.right})}setShowUserMenu(!showUserMenu)}} className="flex items-center gap-1.5 text-[#fafafa]/70 hover:text-[#fafafa] text-sm transition p-1.5 rounded-md hover:bg-[#18181b]" title="Account"><User className="w-4 h-4"/><span className="hidden sm:block text-xs max-w-[100px] truncate">{user?.email?.split("@")[0]}</span><ChevronDown className={`w-3 h-3 transition ${showUserMenu?"rotate-180":""}`}/></button>
          {showUserMenu&&createPortal(<><div className="fixed inset-0 z-[9998]" onClick={()=>setShowUserMenu(false)}/><div className="fixed z-[9999] w-56 bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden" style={menuPos?{top:menuPos.top,right:menuPos.right}:{}}><div className="px-4 py-3 border-b border-[#27272a]"><div className="text-sm font-semibold text-[#fafafa]">{user?.email?.split("@")[0]}</div><div className="text-xs text-[#71717a]">{user?.email}</div></div><div className="py-1"><div className="px-4 py-1.5 flex items-center gap-2 text-xs text-[#71717a]"><Globe className="w-3.5 h-3.5"/><select defaultValue={timezone} onChange={e=>setTimezone(e.target.value)} onClick={e=>e.stopPropagation()} className="flex-1 bg-transparent text-[#a1a1aa] text-xs focus:outline-none cursor-pointer">{TIMEZONES.map(tz=>(<option key={tz.value} value={tz.value} className="bg-[#11161e]">{tz.label}</option>))}</select></div>{hasServer&&!isViewer&&<div className="md:hidden"><NavLink to="/server-settings" onClick={()=>setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#18181b] transition"><Settings className="w-4 h-4"/>Server Settings</NavLink><NavLink to="/billing" onClick={()=>setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#18181b] transition"><CreditCard className="w-4 h-4"/>Billing</NavLink></div>}{isAdmin&&<NavLink to="/admin" onClick={()=>setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#18181b] transition"><Shield className="w-4 h-4"/>Admin Panel</NavLink>}<button onClick={()=>{setShowUserMenu(false);setShowLogoutConfirm(true)}} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#18181b] transition border-t border-white/[0.06]"><LogOut className="w-4 h-4"/>Sign Out</button></div></div></>,document.body)}
        </div>
      </header>

      {/* -- Body: Sidebar + Content -- */}
      <div className="flex-1 flex min-h-0 relative">
        <aside
          onMouseEnter={() => sidebarCollapsed && setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
          className={`hidden md:flex flex-col shrink-0 bg-[#0a0a0c] border-r border-[#1a1a1e] transition-all duration-200 ${sidebarCollapsed ? "w-[56px]" : "w-[220px]"}`}
        >
          {/* -- Floating expanded overlay (collapsed + hovered) -- */}
          {sidebarCollapsed && (
            <div className={`absolute left-0 top-0 w-[220px] h-full bg-[#0a0a0c] border-r border-[#1a1a1e] shadow-2xl shadow-black/50 z-40 flex flex-col transition-all duration-200 ease-out ${sidebarHovered ? "translate-x-0 opacity-100" : "-translate-x-3 opacity-0 pointer-events-none"}`}>
              <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-3 scrollbar-thin">
                <div>
                  {isViewer ? (<><div className="px-2 mb-0.5 text-[9px] font-semibold text-[#52525b] uppercase tracking-wider">Servers</div><div className="px-2.5 py-2 rounded-md bg-[#18181b] text-xs text-[#a1a1aa] flex items-center gap-2"><Eye className="w-3.5 h-3.5 shrink-0"/><span className="truncate">{viewerServerName||"Read-only"}</span></div></>)
                  : currentServer ? (<><div className="px-2 mb-0.5 text-[9px] font-semibold text-[#52525b] uppercase tracking-wider">Servers</div><div className="space-y-1">
                    <div className="px-2.5 py-2 rounded-md bg-[#18181b] flex items-center gap-2"><Server className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0"/><span className="text-xs text-[#d4d4d8] truncate font-medium">{currentServer.name}</span><span className="ml-0.5 text-[9px] text-amber-500/60 shrink-0">{currentServer.role==="owner"?"Owner":"Mod"}</span>
                    {(()=>{const n=new Date();const e=currentServer.subscription_ends_at?new Date(currentServer.subscription_ends_at):null;if(!e)return null;const d=Math.ceil((e.getTime()-n.getTime())/86400000);if(d>0)return(<span className="ml-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20"><Crown className="w-2.5 h-2.5"/>Pro � {d}d</span>);return(<span className="ml-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-500/10 text-red-300 border border-red-500/20">Expired</span>)})()}
                    </div>
                    {servers.length>1&&(<div className="space-y-0.5 pl-1">{servers.filter(s=>s.id!==currentServer.id).map(s=>(<button key={s.id} onClick={()=>{setCurrentServer(s);setSidebarHovered(false)}} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 transition text-left"><Server className="w-3 h-3 shrink-0"/><span className="truncate">{s.name}</span><span className={`ml-0.5 text-[9px] shrink-0 ${s.role==="owner"?"text-amber-500/60":"text-blue-400/60"}`}>{s.role==="owner"?"Owner":"Mod"}</span></button>))}</div>)}
                  </div></>) : !isAdmin ? (<button onClick={()=>{setShowCreate(true);setSidebarHovered(false)}} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition"><Plus className="w-3.5 h-3.5"/>New Server</button>) : null}
                  <div className="my-2 border-t border-[#1a1a1e]" />
                </div>
                {NAV_GROUPS.map(g=>(
                  <div key={g.label}>
                    <div className="px-2.5 mb-1 text-[10px] font-semibold text-[#52525b] uppercase tracking-wider">{g.label}</div>
                    <div className="space-y-0.5">{g.items.map(item=>(<NavLink key={item.to} to={item.to} end={item.end} onClick={()=>setSidebarHovered(false)} className={({isActive})=>`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}><item.icon className="w-4 h-4 shrink-0"/><span>{item.label}</span></NavLink>))}</div>
                  </div>
                ))}
              </nav>
              <div className="border-t border-[#1a1a1e] p-2 space-y-0.5 shrink-0">
                {hasServer&&!isViewer&&(<><NavLink to="/server-settings" onClick={()=>setSidebarHovered(false)} className={({isActive})=>`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}><Settings className="w-4 h-4 shrink-0"/>Server Settings</NavLink><NavLink to="/billing" onClick={()=>setSidebarHovered(false)} className={({isActive})=>`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}><CreditCard className="w-4 h-4 shrink-0"/>Billing</NavLink></>)}
                <button onClick={toggleSidebar} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#18181b]/50 transition"><PanelLeft className="w-4 h-4 shrink-0"/><span>Expand</span></button>
              </div>
            </div>
          )}

          {/* -- Collapsed icons (always visible when collapsed) -- */}
          {sidebarCollapsed && (<>
            <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-3 scrollbar-thin">
              {currentServer && <div className="flex justify-center pb-1"><Server className="w-4 h-4 text-[#a1a1aa]"/></div>}
              {!currentServer && !isAdmin && <div className="flex justify-center pb-1"><button onClick={()=>setShowCreate(true)} className="p-1 rounded-md text-[#71717a] hover:text-[#fafafa] hover:bg-[#18181b] transition"><Plus className="w-4 h-4"/></button></div>}
              <div className="border-t border-[#1a1a1e] mb-1" />
              {NAV_GROUPS.map(g=>(
                <div key={g.label} className="space-y-0.5">
                  {g.items.map(item=>(<NavLink key={item.to} to={item.to} end={item.end} className={({isActive})=>`flex justify-center px-2 py-2 rounded-md text-sm font-medium transition ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8]"}`} title={item.label}><item.icon className="w-4 h-4 shrink-0"/></NavLink>))}
                </div>
              ))}
            </nav>
            <div className="border-t border-[#1a1a1e] p-2 space-y-0.5 shrink-0">
              {hasServer&&!isViewer&&(<><NavLink to="/server-settings" className={({isActive})=>`flex justify-center px-2 py-2 rounded-md transition ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8]"}`} title="Server Settings"><Settings className="w-4 h-4"/></NavLink><NavLink to="/billing" className={({isActive})=>`flex justify-center px-2 py-2 rounded-md transition ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8]"}`} title="Billing"><CreditCard className="w-4 h-4"/></NavLink></>)}
              <button onClick={toggleSidebar} className="w-full flex justify-center px-2 py-2 rounded-md text-sm text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#18181b]/50 transition" title="Expand"><PanelLeft className="w-4 h-4"/></button>
            </div>
          </>)}

          {/* -- Normal expanded (when not collapsed) -- */}
          {!sidebarCollapsed && (<>
            <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-3 scrollbar-thin">
              <div>
                {isViewer ? (<><div className="px-2 mb-0.5 text-[9px] font-semibold text-[#52525b] uppercase tracking-wider">Servers</div><div className="px-2.5 py-2 rounded-md bg-[#18181b] text-xs text-[#a1a1aa] flex items-center gap-2"><Eye className="w-3.5 h-3.5 shrink-0"/><span className="truncate">{viewerServerName||"Read-only"}</span></div></>)
                : currentServer ? (<><div className="px-2 mb-0.5 text-[9px] font-semibold text-[#52525b] uppercase tracking-wider">Servers</div><div className="space-y-1">
                  <div className="px-2.5 py-2 rounded-md bg-[#18181b] flex items-center gap-2"><Server className="w-3.5 h-3.5 text-[#a1a1aa] shrink-0"/><span className="text-xs text-[#d4d4d8] truncate font-medium">{currentServer.name}</span><span className="ml-0.5 text-[9px] text-amber-500/60 shrink-0">{currentServer.role==="owner"?"Owner":"Mod"}</span>
                  {(()=>{const n=new Date();const e=currentServer.subscription_ends_at?new Date(currentServer.subscription_ends_at):null;if(!e)return null;const d=Math.ceil((e.getTime()-n.getTime())/86400000);if(d>0)return(<span className="ml-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20"><Crown className="w-2.5 h-2.5"/>Pro � {d}d</span>);return(<span className="ml-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-500/10 text-red-300 border border-red-500/20">Expired</span>)})()}
                  </div>
                  {servers.length>1&&(<div className="space-y-0.5 pl-1">{servers.filter(s=>s.id!==currentServer.id).map(s=>(<button key={s.id} onClick={()=>setCurrentServer(s)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50 transition text-left"><Server className="w-3 h-3 shrink-0"/><span className="truncate">{s.name}</span><span className={`ml-0.5 text-[9px] shrink-0 ${s.role==="owner"?"text-amber-500/60":"text-blue-400/60"}`}>{s.role==="owner"?"Owner":"Mod"}</span></button>))}</div>)}
                </div></>) : !isAdmin ? (<button onClick={()=>setShowCreate(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition"><Plus className="w-3.5 h-3.5"/>New Server</button>) : null}
                <div className="my-2 border-t border-[#1a1a1e]" />
              </div>
              {NAV_GROUPS.map(g=>(
                <div key={g.label}>
                  <div className="px-2.5 mb-1 text-[10px] font-semibold text-[#52525b] uppercase tracking-wider">{g.label}</div>
                  <div className="space-y-0.5">{g.items.map(item=>(<NavLink key={item.to} to={item.to} end={item.end} className={({isActive})=>`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}><item.icon className="w-4 h-4 shrink-0"/><span>{item.label}</span></NavLink>))}</div>
                </div>
              ))}
            </nav>
            <div className="border-t border-[#1a1a1e] p-2 space-y-0.5 shrink-0">
              {hasServer&&!isViewer&&(<><NavLink to="/server-settings" className={({isActive})=>`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}><Settings className="w-4 h-4 shrink-0"/>Server Settings</NavLink><NavLink to="/billing" className={({isActive})=>`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition ${isActive?"bg-[#1a1a1e] text-[#fafafa]":"text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}><CreditCard className="w-4 h-4 shrink-0"/>Billing</NavLink></>)}
              <button onClick={toggleSidebar} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#18181b]/50 transition"><PanelLeftClose className="w-4 h-4 shrink-0"/><span>Collapse</span></button>
            </div>
          </>)}
        </aside>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <DiscordWebhookBanner/><NoMembersBanner/><SubscriptionBanner/>
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0"><Outlet/></main>
          <footer className="hidden md:block shrink-0 border-t border-[#1a1a1e] bg-[#09090b]"><div className="px-4 py-2 flex items-center justify-between text-[11px] text-[#52525b]"><span>� {new Date().getFullYear()} RaidScout. All rights reserved.</span><div className="flex items-center gap-3"><Link to="/terms" className="hover:text-[#a1a1aa] transition">Terms</Link><Link to="/privacy" className="hover:text-[#a1a1aa] transition">Privacy</Link><Link to="/refund" className="hover:text-[#a1a1aa] transition">Refunds</Link><Link to="/changelog" className="hover:text-[#a1a1aa] transition">Changelog</Link></div></div></footer>
        </div>
      </div>

      {/* -- Mobile Bottom Nav -- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#09090b]/95 backdrop-blur-xl border-t border-[#27272a] safe-area-bottom">
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
          <NavLink to="/" end className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Swords className="w-4 h-4"/><span className="text-[8px] font-medium">Bosses</span></NavLink>
          <NavLink to="/schedule" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Calendar className="w-4 h-4"/><span className="text-[8px] font-medium">Sched</span></NavLink>
          <NavLink to="/history" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Clock className="w-4 h-4"/><span className="text-[8px] font-medium">History</span></NavLink>
          <NavLink to="/leaderboard" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Trophy className="w-4 h-4"/><span className="text-[8px] font-medium">Ranks</span></NavLink>
          {!isViewer&&<NavLink to="/members" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Users className="w-4 h-4"/><span className="text-[8px] font-medium">Members</span></NavLink>}
          {!isViewer&&<NavLink to="/inventory" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><Package className="w-4 h-4"/><span className="text-[8px] font-medium">Items</span></NavLink>}
          <NavLink to="/analytics" className={({isActive})=>`flex flex-col items-center justify-center gap-0.5 px-1 py-1 min-w-0 flex-1 rounded-lg transition-colors ${isActive?"text-[#fafafa]":"text-[#52525b]"}`}><BarChart3 className="w-4 h-4"/><span className="text-[8px] font-medium">Stats</span></NavLink>
        </div>
      </nav>

      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} />}
      <ConfirmDialog open={showLogoutConfirm} title="Sign Out" message="Are you sure you want to sign out?" confirmLabel="Sign Out" onConfirm={async () => { setShowLogoutConfirm(false); await signOut(); }} onCancel={() => setShowLogoutConfirm(false)} />
      {spawnToast && (<div className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 shadow-2xl animate-slide-up"><p className="text-sm text-[#fafafa]">{spawnToast}</p></div>)}
    </div>
  );
}
