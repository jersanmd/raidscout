import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { supabase, setCurrentServerId } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface Server {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
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
  const { user, isViewer, viewerServerId, viewerServerName } = useAuth();
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
        role: "moderator",
      };
      setServers([viewerServer]);
      setCurrentServer(viewerServer);
      currentRef.current = viewerServer;
      setCurrentServerId(viewerServerId);
      setLoading(false);
    }
  }, [isViewer, viewerServerId, viewerServerName]);

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
      // Single query: server_members joined with servers — no boss table scan needed
      const { data, error } = await supabase
        .from("server_members")
        .select("server_id, role, servers!inner(id, name, owner_id, invite_code, discord_webhook_url, timezone, notification_prefix)")
        .eq("user_id", user.id);

      if (error) throw error;

      if (!data || data.length === 0) {
        setServers([]);
        setCurrentServerWrapped(null);
        return;
      }

      const list: Server[] = [];
      for (const row of data as any[]) {
        const s = row.servers;
        if (!s) continue;
        list.push({
          id: s.id,
          name: s.name,
          owner_id: s.owner_id,
          invite_code: s.invite_code || s.id.substring(0, 8),
          discord_webhook_url: s.discord_webhook_url,
          timezone: s.timezone || 'Asia/Manila',
          notification_prefix: s.notification_prefix || '@everyone',
          role: (row.role as "owner" | "moderator") ?? (s.owner_id === user.id ? "owner" : "moderator"),
        });
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
  }, [user, setCurrentServerWrapped]);

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
