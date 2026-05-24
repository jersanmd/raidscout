import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { supabase, setCurrentServerId } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface Server {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at?: string;
  discord_webhook_url?: string;
  timezone?: string;
  notification_prefix?: string;
  role: "owner" | "moderator";
  viewer_can_edit?: boolean;
  viewer_can_mark_died?: boolean;
}

interface ServerState {
  servers: Server[];
  currentServer: Server | null;
  loading: boolean;
  setCurrentServer: (server: Server) => void;
  refreshServers: () => Promise<void>;
}

const ServerContext = createContext<ServerState | undefined>(undefined);

export function ServerProvider({ children }: { children: ReactNode }) {
  const { user, isViewer, viewerServerId, viewerServerName, viewerDiscordWebhookUrl, userRole } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [currentServer, setCurrentServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const currentRef = useRef<Server | null>(null);

  // Viewer mode: directly set the viewer's server
  useEffect(() => {
    if (isViewer && viewerServerId) {
      const viewerServer: Server = {
        id: viewerServerId,
        name: viewerServerName || "Server",
        owner_id: "",
        invite_code: "",
        created_at: undefined,
        discord_webhook_url: viewerDiscordWebhookUrl ?? undefined,
        role: "moderator",
      };
      setServers([viewerServer]);
      setCurrentServer(viewerServer);
      currentRef.current = viewerServer;
      setCurrentServerId(viewerServerId);
      setLoading(false);
    }
  }, [isViewer, viewerServerId, viewerServerName, viewerDiscordWebhookUrl]);

  // Keep ref in sync with state, and persist to localStorage
  const setCurrentServerWrapped = useCallback((server: Server | null) => {
    currentRef.current = server;
    setCurrentServer(server);
    if (server) {
      localStorage.setItem("lordnine-current-server-id", server.id);
    } else {
      localStorage.removeItem("lordnine-current-server-id");
    }
  }, []);

  const refreshServers = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase.from("bosses").select("id, server_id");
      if (!data || data.length === 0) {
        setServers([]);
        setCurrentServerWrapped(null);
        return;
      }

      const uniqueIds = [...new Set((data as any[]).map(b => b.server_id))];

      // Fetch servers and user's roles in parallel
      const [srvRes, roleRes] = await Promise.all([
        supabase.from("servers").select("id, name, owner_id, invite_code, created_at, discord_webhook_url, timezone, notification_prefix").in("id", uniqueIds),
        supabase.from("server_members").select("server_id, role").eq("user_id", user.id).in("server_id", uniqueIds),
      ]);

      const srvData = srvRes.data as any[] | null;
      const roleData = roleRes.data as any[] | null;

      // Build role map: server_id → role
      const roleMap = new Map<string, "owner" | "moderator">();
      if (roleData) {
        for (const r of roleData) {
          roleMap.set(r.server_id, r.role);
        }
      }

      const list: Server[] = [];
      if (srvData && srvData.length > 0) {
        for (const s of srvData) {
          const role = roleMap.get(s.id) ?? (s.owner_id === user.id ? "owner" : undefined);
          if (!role && userRole !== "admin") continue;
          list.push({
            id: s.id,
            name: s.name,
            owner_id: s.owner_id,
            invite_code: s.invite_code || s.id.substring(0, 8),
            created_at: s.created_at,
            discord_webhook_url: s.discord_webhook_url,
            timezone: s.timezone || 'Asia/Manila',
            notification_prefix: s.notification_prefix || '@everyone',
            role: (role ?? "owner") as "owner" | "moderator",
          });
        }
      } else {
        uniqueIds.forEach((id, i) => list.push({ id, name: `Server ${i + 1}`, owner_id: user.id, invite_code: id.substring(0, 8), role: "owner" as const }));
      }
      
      setServers(list);
      // Restore persisted server or pick first
      if (list.length > 0) {
        const persistedId = localStorage.getItem("lordnine-current-server-id");
        const match = persistedId ? list.find(s => s.id === persistedId) : null;
        if (!currentRef.current || !list.find(s => s.id === currentRef.current?.id)) {
          setCurrentServerWrapped(match ?? list[0]);
        }
      } else {
        setCurrentServerWrapped(null);
      }
    } catch (err) { console.error("Failed to refresh servers:", err); }
  }, [user, setCurrentServerWrapped, userRole]);

  useEffect(() => {
    // Skip server loading for viewer mode (handled above)
    if (isViewer) return;
    if (!user) {
      setServers([]);
      setCurrentServerWrapped(null);
      setLoading(false);
      return;
    }
    refreshServers().finally(() => setLoading(false));
  }, [user?.id, refreshServers, isViewer]);

  // Sync server ID to supabase module for inserts
  useEffect(() => {
    setCurrentServerId(currentServer?.id ?? null);
  }, [currentServer]);

  return (
    <ServerContext.Provider
      value={{ servers, currentServer, loading, setCurrentServer: setCurrentServerWrapped, refreshServers }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error("useServer must be used within ServerProvider");
  return ctx;
}

/** Get the current server ID for use in queries. Returns null if no server selected. */
export function useServerId(): string | null {
  const { currentServer } = useServer();
  return currentServer?.id ?? null;
}
