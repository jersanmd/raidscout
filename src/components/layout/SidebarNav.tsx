import { useState, useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Server, Plus, Crown, PanelLeft, Eye, Settings, CreditCard,
  Swords, Calendar, Trophy, Users, BarChart3, Clock, Package, Coins,
} from "lucide-react";

const NAV_GROUPS = [
  { label: "Operations", abbr: "Ops", items: [{ to: "/", icon: Swords, label: "Bosses / Activities", end: true }, { to: "/schedule", icon: Calendar, label: "Schedule" }, { to: "/history", icon: Clock, label: "History" }] },
  { label: "Management", abbr: "Mgmt", items: [{ to: "/leaderboard", icon: Trophy, label: "Leaderboard" }, { to: "/members", icon: Users, label: "Members" }] },
  { label: "Assets", abbr: "Asts", items: [{ to: "/inventory", icon: Package, label: "Inventory" }, { to: "/dkp", icon: Coins, label: "DKP" }] },
  { label: "Insights", abbr: "Ins", items: [{ to: "/analytics", icon: BarChart3, label: "Analytics" }] },
].filter(g => g.items.length > 0);

interface SidebarNavProps {
  mode: "full" | "collapsed";
  onNavClick?: () => void;
  servers: any[];
  currentServer: any;
  serverLoading: boolean;
  isAdmin: boolean;
  isViewer: boolean;
  viewerServerName: string | null;
  setCurrentServer: (s: any) => void;
  setShowCreate: (v: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export function SidebarNav({
  mode, onNavClick, servers, currentServer, serverLoading, isAdmin,
  isViewer, viewerServerName, setCurrentServer, setShowCreate,
  sidebarCollapsed, toggleSidebar,
}: SidebarNavProps) {
  const serverNavRef = useRef<HTMLDivElement>(null);

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

  const renderServerList = () => {
    if (isViewer) {
      return (
        <>
          <div className="px-2 mb-0.5 text-[11px] font-semibold text-[#52525b] uppercase tracking-wider">Servers</div>
          <div className="px-2.5 py-2 rounded-md bg-[#18181b] text-xs text-[#a1a1aa] flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{viewerServerName || "Read-only"}</span>
          </div>
        </>
      );
    }

    if (currentServer) {
      return (
        <>
          <div className="px-2 mb-0.5 text-[11px] font-semibold text-[#52525b] uppercase tracking-wider">Servers</div>
          <div className="space-y-0.5">
            {servers.map(s => {
              const n = new Date();
              const e = s.subscription_ends_at ? new Date(s.subscription_ends_at) : null;
              const t = s.trial_ends_at ? new Date(s.trial_ends_at) : null;
              const d = e ? Math.ceil((e.getTime() - n.getTime()) / 86400000) : 0;
              const td = t ? Math.ceil((t.getTime() - n.getTime()) / 86400000) : 0;
              const isActive = d > 0;
              const isTrial = !isActive && td > 0;
              const isExpired = !isActive && !isTrial && (e || t);
              const isCurrent = s.id === currentServer.id;
              return (
                <button key={s.id} id={`server-${s.id}`}
                  onClick={() => { if (!isCurrent) { setCurrentServer(s); onNavClick?.(); } }}
                  className={`w-full flex items-center gap-2.5 rounded-md text-sm transition text-left h-9 ${isCurrent ? "px-2.5 bg-[#1e1e2a] text-[#fafafa]" : "px-2.5 text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}>
                  <Server className="w-4 h-4 shrink-0" />
                  <span className="truncate">{s.name}</span>
                  {!isCurrent && <span className={`ml-0.5 text-[11px] shrink-0 ${s.role === "owner" ? "text-amber-500/60" : "text-blue-400/60"}`}>{s.role === "owner" ? "Owner" : "Mod"}</span>}
                  {isActive && isCurrent
                    ? <span className="ml-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20"><Crown className="w-2.5 h-2.5" />Pro · {d}d</span>
                    : isActive
                      ? <span className="ml-auto shrink-0 text-[11px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{d}d</span>
                      : isTrial
                        ? <span className="ml-auto shrink-0 text-[11px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Trial {td}d</span>
                        : isExpired
                          ? <span className="ml-auto shrink-0 text-[11px] px-1 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Exp</span>
                          : null}
                </button>
              );
            })}
          </div>
        </>
      );
    }

    if (!isAdmin) {
      return (
        <button onClick={() => { setShowCreate(true); onNavClick?.(); }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition">
          <Plus className="w-3.5 h-3.5" />New Server
        </button>
      );
    }

    return null;
  };

  const renderCollapsedServerList = () => {
    if (!currentServer) return null;
    return (
      <>
        <div className="flex justify-center mb-0.5 text-[11px] font-semibold text-[#52525b] uppercase tracking-wider">Svrs</div>
        <div className="flex flex-col items-center gap-0.5">
          {servers.map(s => {
            const isCurrent = s.id === currentServer.id;
            return (
              <button key={s.id} id={`server-${s.id}`}
                onClick={() => { if (!isCurrent) setCurrentServer(s); }}
                className={`flex items-center justify-center rounded-md transition h-9 w-9 ${isCurrent ? "bg-[#1e1e2a] text-[#d4d4d8]" : "text-[#52525b] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}
                title={`${s.name}${isCurrent ? " (active)" : ""}`}>
                <Server className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <>
      <nav ref={serverNavRef} className="flex-1 overflow-y-auto py-2 px-2 space-y-3 scrollbar-thin">
        <div>
          {mode === "full" ? renderServerList() : renderCollapsedServerList()}
          {!currentServer && !isAdmin && mode === "collapsed" && (
            <div className="flex justify-center pb-1">
              <button onClick={() => setShowCreate(true)}
                className="p-1 rounded-md text-[#71717a] hover:text-[#fafafa] hover:bg-[#18181b] transition">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="my-2 border-t border-[#1a1a1e]" />
        </div>
        {NAV_GROUPS.map(g => (
          <div key={g.label}>
            <div className={mode === "full" ? "px-2.5 mb-1 text-[10px] font-semibold text-[#52525b] uppercase tracking-wider" : "flex justify-center mb-1 text-[10px] font-semibold text-[#52525b] uppercase tracking-wider"}>
              {mode === "full" ? g.label : g.abbr}
            </div>
            <div className="space-y-0.5">
              {g.items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavClick}
                  className={mode === "full"
                    ? ({ isActive }) => `flex items-center gap-2.5 px-3 py-2 h-9 rounded-md text-sm font-medium transition-all duration-150 ${isActive ? "bg-[#1a1a1e] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`
                    : ({ isActive }) => `flex items-center justify-center px-3 py-2 h-9 rounded-md text-sm font-medium transition ${isActive ? "bg-[#1a1a1e] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8]"}`}
                  title={mode === "full" ? undefined : item.label}>
                  <item.icon className="w-4 h-4 shrink-0" />
                  {mode === "full" && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-[#1a1a1e] p-2 space-y-0.5 shrink-0">
        {currentServer && !isViewer && (
          <>
            <NavLink to="/server-settings" onClick={onNavClick}
              className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 h-9 rounded-md text-sm font-medium transition ${isActive ? "bg-[#1a1a1e] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}
              title={mode === "full" ? undefined : "Server Settings"}>
              <Settings className="w-4 h-4 shrink-0" />
              {mode === "full" && <span>Server Settings</span>}
            </NavLink>
            <NavLink to="/billing" onClick={onNavClick}
              className={({ isActive }) => `flex items-center gap-2.5 px-2.5 py-2 h-9 rounded-md text-sm font-medium transition ${isActive ? "bg-[#1a1a1e] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8] hover:bg-[#18181b]/50"}`}
              title={mode === "full" ? undefined : "Billing"}>
              <CreditCard className="w-4 h-4 shrink-0" />
              {mode === "full" && <span>Billing</span>}
            </NavLink>
          </>
        )}
        <button onClick={toggleSidebar}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 h-9 rounded-md text-sm text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#18181b]/50 transition"
          title={mode === "full" ? undefined : (sidebarCollapsed ? "Expand" : "Collapse")}>
          <PanelLeft className="w-4 h-4 shrink-0" />
          {mode === "full" && <span>{sidebarCollapsed ? "Expand" : "Collapse"}</span>}
        </button>
      </div>
    </>
  );
}
