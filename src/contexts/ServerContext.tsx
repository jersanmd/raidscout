import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { supabase, setCurrentServerId, fetchModeratorPermissions, type ModeratorPermissions, DEFAULT_MODERATOR_PERMISSIONS } from "@/lib/supabase";
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
  webhookVersion: number;
  bumpWebhookVersion: () => void;
  permissions: ModeratorPermissions | null;
}

const ServerContext = createContext<ServerState | undefined>(undefined);

export function ServerProvider({ children }: { children: ReactNode }) {
  const { user, isViewer, viewerServerId, viewerServerName, viewerDiscordWebhookUrl, viewerTimezone, userRole } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [currentServer, setCurrentServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const currentRef = useRef<Server | null>(null);
  const [webhookVersion, setWebhookVersion] = useState(0);
  const bumpWebhookVersion = useCallback(() => setWebhookVersion(v => v + 1), []);
  const [permissions, setPermissions] = useState<ModeratorPermissions | null>(null);

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
        timezone: viewerTimezone ?? undefined,
        role: "moderator",
      };
      setServers([viewerServer]);
      setCurrentServer(viewerServer);
      currentRef.current = viewerServer;
      setCurrentServerId(viewerServerId);
      setLoading(false);
    }
  }, [isViewer, viewerServerId, viewerServerName, viewerDiscordWebhookUrl, viewerTimezone]);

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
        supabase.from("servers").select("id, name, owner_id, invite_code, created_at, discord_webhook_url, timezone, notification_prefix, deleted_at").in("id", uniqueIds),
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
          // Skip soft-deleted servers
          if (s.deleted_at) continue;
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
        // No server metadata returned from Supabase — don't fabricate fake entries.
        // This can happen due to RLS issues or deleted servers.
        console.warn("No server data found for boss ids:", uniqueIds);
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

  // Load moderator permissions when server changes
  useEffect(() => {
    if (!user) return;
    if (currentServer && currentServer.role === "moderator" && !isViewer) {
      fetchModeratorPermissions(currentServer.id)
        .then(all => setPermissions(all[user.id] ?? DEFAULT_MODERATOR_PERMISSIONS))
        .catch(() => setPermissions(DEFAULT_MODERATOR_PERMISSIONS));
    } else if (currentServer?.role === "owner" || userRole === "admin") {
      setPermissions(null); // null = full access
    } else {
      setPermissions(DEFAULT_MODERATOR_PERMISSIONS);
    }
  }, [currentServer?.id, currentServer?.role, userRole, user?.id, isViewer]);

  return (
    <ServerContext.Provider
      value={{ servers, currentServer, loading, setCurrentServer: setCurrentServerWrapped, refreshServers, webhookVersion, bumpWebhookVersion, permissions }}
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

/** Check if the current user has a specific moderator permission.
 *  Owners and platform admins always return true.
 *  Moderators check their permissions object.
 *  Returns false if no server is selected. */
export function useHasPermission(permission: keyof ModeratorPermissions): boolean {
  const { currentServer, permissions } = useServer();
  const { userRole } = useAuth();
  if (!currentServer) return false;
  if (currentServer.role === "owner" || userRole === "admin") return true;
  if (!permissions) return false;
  return permissions[permission] === true;
}
