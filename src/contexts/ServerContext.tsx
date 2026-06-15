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
  role: "owner" | "moderator" | "viewer";
  viewer_can_edit?: boolean;
  viewer_can_mark_died?: boolean;
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
  paypal_subscription_id?: string | null;
  isExpired?: boolean;
}

/** Check if a server's trial and subscription have both expired. */
function computeIsExpired(trialEnds: string | null, subEnds: string | null): boolean {
  const now = new Date();
  // Active subscription overrides trial
  if (subEnds && new Date(subEnds) > now) return false;
  // Active trial
  if (trialEnds && new Date(trialEnds) > now) return false;
  // Both expired or subscription expired with no active trial
  return true;
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
      // Fetch trial/subscription info so we know if the server is expired
      supabase
        .from("servers")
        .select("name, trial_ends_at, subscription_ends_at, timezone, discord_webhook_url")
        .eq("id", viewerServerId)
        .is("deleted_at", null)
        .maybeSingle()
        .then(({ data: srv }) => {
          const trialEnds = srv?.trial_ends_at ?? null;
          const subEnds = srv?.subscription_ends_at ?? null;
          const viewerServer: Server = {
            id: viewerServerId,
            name: srv?.name || viewerServerName || "Server",
            owner_id: "",
            invite_code: "",
            created_at: undefined,
            discord_webhook_url: srv?.discord_webhook_url ?? viewerDiscordWebhookUrl ?? undefined,
            timezone: srv?.timezone ?? viewerTimezone ?? undefined,
            role: "viewer",
            trial_ends_at: trialEnds,
            subscription_ends_at: subEnds,
            isExpired: computeIsExpired(trialEnds, subEnds),
          };
          setServers([viewerServer]);
          setCurrentServer(viewerServer);
          currentRef.current = viewerServer;
          setCurrentServerId(viewerServerId);
          setLoading(false);
        }, () => {
          // Fallback if fetch fails
          const viewerServer: Server = {
            id: viewerServerId,
            name: viewerServerName || "Server",
            owner_id: "",
            invite_code: "",
            created_at: undefined,
            discord_webhook_url: viewerDiscordWebhookUrl ?? undefined,
            timezone: viewerTimezone ?? undefined,
            role: "viewer",
          };
          setServers([viewerServer]);
          setCurrentServer(viewerServer);
          currentRef.current = viewerServer;
          setCurrentServerId(viewerServerId);
          setLoading(false);
        });
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
      // For admins, fetch ALL servers instead of just their memberships
      if (userRole === "admin") {
        const { data: allServers } = await supabase
          .from("servers")
          .select("id, name, owner_id, invite_code, created_at, discord_webhook_url, timezone, notification_prefix, deleted_at, trial_ends_at, subscription_ends_at, paypal_subscription_id")
          .is("deleted_at", null)
          .order("name");

        const list: Server[] = [];
        if (allServers) {
          for (const s of allServers) {
            list.push({
              id: s.id, name: s.name, owner_id: s.owner_id,
              invite_code: s.invite_code || s.id.substring(0, 8),
              created_at: s.created_at,
              discord_webhook_url: s.discord_webhook_url,
              timezone: s.timezone || 'Asia/Manila',
              notification_prefix: s.notification_prefix || '@everyone',
              role: "owner" as "owner" | "moderator",
              trial_ends_at: s.trial_ends_at,
              subscription_ends_at: s.subscription_ends_at,
              paypal_subscription_id: s.paypal_subscription_id,
              isExpired: computeIsExpired(s.trial_ends_at, s.subscription_ends_at),
            });
          }
        }
        setServers(list);
        if (list.length > 0) {
          const persistedId = localStorage.getItem("lordnine-current-server-id");
          const match = persistedId ? list.find(s => s.id === persistedId) : null;
          // Always update currentServer with fresh data (needed after payment, etc.)
          const freshCurrent = list.find(s => s.id === currentRef.current?.id);
          if (freshCurrent) {
            setCurrentServerWrapped(freshCurrent);
          } else if (!currentRef.current || !list.find(s => s.id === currentRef.current?.id)) {
            setCurrentServerWrapped(match ?? list[0]);
          }
        } else {
          setCurrentServerWrapped(null);
        }
        return;
      }

      // Get all server IDs the user is a member of
      const { data: roleData } = await supabase
        .from("server_members")
        .select("server_id, role")
        .eq("user_id", user.id);

      // Also get servers where user is owner (via servers table)
      const { data: ownedData } = await supabase
        .from("servers")
        .select("id")
        .eq("owner_id", user.id);

      const allIds = new Set<string>();
      (roleData || []).forEach(r => allIds.add(r.server_id));
      (ownedData || []).forEach(s => allIds.add(s.id));

      if (allIds.size === 0) {
        setServers([]);
        setCurrentServerWrapped(null);
        return;
      }

      const uniqueIds = [...allIds];

      // Fetch servers with all fields
      const { data: srvData } = await supabase
        .from("servers")
        .select("id, name, owner_id, invite_code, created_at, discord_webhook_url, timezone, notification_prefix, deleted_at, trial_ends_at, subscription_ends_at, paypal_subscription_id")
        .in("id", uniqueIds);

      // Build role map
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
            trial_ends_at: s.trial_ends_at,
            subscription_ends_at: s.subscription_ends_at,
            paypal_subscription_id: s.paypal_subscription_id,
            isExpired: computeIsExpired(s.trial_ends_at, s.subscription_ends_at),
          });
        }
      } else {
        // No server metadata returned from Supabase — don't fabricate fake entries.
        // This can happen due to RLS issues or deleted servers.
        console.warn("No server data found for boss ids:", uniqueIds);
      }
      
      setServers(list);
      // Restore persisted server or pick first — always update with fresh data
      if (list.length > 0) {
        const persistedId = localStorage.getItem("lordnine-current-server-id");
        const match = persistedId ? list.find(s => s.id === persistedId) : null;
        const freshCurrent = list.find(s => s.id === currentRef.current?.id);
        if (freshCurrent) {
          setCurrentServerWrapped(freshCurrent);
        } else if (!currentRef.current || !list.find(s => s.id === currentRef.current?.id)) {
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
  if (userRole === "admin") return true;
  if (!currentServer) return false;
  if (currentServer.role === "owner") return true;
  if (!permissions) return false;
  return permissions[permission] === true;
}
