import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { supabase, setCurrentViewerKey } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  user: User | null;
  userRole: string | null;
  roleLoading: boolean;
  loading: boolean;
  isViewer: boolean;
  viewerServerId: string | null;
  viewerServerName: string | null;
  viewerKey: string | null;
  viewerCanEdit: boolean;
  viewerCanMarkDied: boolean;
  viewerDiscordWebhookUrl: string | null;
  viewerTimezone: string | null;
  viewerSignIn: (key: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithDiscord: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const VIEWER_KEY_STORAGE = "raidscout-viewer-key";

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isViewer, setIsViewer] = useState(false);
  const [viewerServerId, setViewerServerId] = useState<string | null>(null);
  const [viewerServerName, setViewerServerName] = useState<string | null>(null);
  const [viewerKey, setViewerKey] = useState<string | null>(null);
  const [viewerCanEdit, setViewerCanEdit] = useState(false);
  const [viewerCanMarkDied, setViewerCanMarkDied] = useState(false);
  const [viewerDiscordWebhookUrl, setViewerDiscordWebhookUrl] = useState<string | null>(null);
  const [viewerTimezone, setViewerTimezone] = useState<string | null>(null);

  // Sync viewer key to supabase module for write operations
  useEffect(() => {
    setCurrentViewerKey(isViewer ? viewerKey : null);
  }, [isViewer, viewerKey]);
  const fetchRole = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      setUserRole(data?.role ?? null);
    } catch {
      setUserRole(null);
    }
  };

  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    // Check for stored viewer key — re-verify with server to avoid stale settings
    const storedViewerKey = localStorage.getItem(VIEWER_KEY_STORAGE);
    let viewerCancelled = false;
    let viewerResolved = !storedViewerKey; // no key = already resolved

    if (storedViewerKey) {
      try {
        const parsed = JSON.parse(storedViewerKey);
        // Re-verify with server to get latest viewer_can_edit, viewer_can_mark_died, etc.
        (async () => {
          try {
            const { data, error } = await supabase.rpc("get_server_by_viewer_key", { v_key: parsed.viewerKey });
            // If a real session was found while we were waiting, abort — don't clobber it
            if (viewerCancelled) { viewerResolved = true; return; }
            if (error || !data || (data as any[]).length === 0) {
              localStorage.removeItem(VIEWER_KEY_STORAGE);
              viewerResolved = true;
              return;
            }
            const server = (data as any[])[0];
            setIsViewer(true);
            setViewerServerId(server.id);
            setViewerServerName(server.name || null);
            setViewerKey(parsed.viewerKey);
            setViewerCanEdit(!!server.viewer_can_edit);
            setViewerCanMarkDied(!!server.viewer_can_mark_died);
            setViewerDiscordWebhookUrl(server.discord_webhook_url || null);
            setViewerTimezone(server.timezone || null);
            // Update localStorage with fresh settings
            localStorage.setItem(VIEWER_KEY_STORAGE, JSON.stringify({
              serverId: server.id,
              serverName: server.name,
              viewerKey: parsed.viewerKey,
              viewerCanEdit: !!server.viewer_can_edit,
              viewerCanMarkDied: !!server.viewer_can_mark_died,
              discordWebhookUrl: server.discord_webhook_url || null,
              timezone: server.timezone || null,
            }));
          } catch {
            localStorage.removeItem(VIEWER_KEY_STORAGE);
          } finally {
            viewerResolved = true;
          }
        })();
      } catch { localStorage.removeItem(VIEWER_KEY_STORAGE); viewerResolved = true; }
    }

    async function waitForViewer() {
      const start = Date.now();
      while (!viewerResolved && Date.now() - start < 5000) {
        await new Promise(r => setTimeout(r, 50));
      }
    }

    // Guard: prevent onAuthStateChange from setting loading=false before initial auth is done
    let initialAuthDone = false;

    // Always check Supabase session and set up auth listener
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Signal the viewer IIFE to abort — real session takes priority
        viewerCancelled = true;
        // Clear any leftover viewer state when a real session exists
        setIsViewer(false);
        setViewerServerId(null);
        setViewerServerName(null);
        setViewerKey(null);
        setViewerCanEdit(false);
        setViewerCanMarkDied(false);
        setViewerDiscordWebhookUrl(null);
        setViewerTimezone(null);
        localStorage.removeItem(VIEWER_KEY_STORAGE);
        fetchRole(session.user.id).finally(() => setRoleLoading(false));
      } else {
        setRoleLoading(false);
      }
      // Wait for viewer key check to finish before unblocking UI
      waitForViewer().finally(() => {
        initialAuthDone = true;
        setLoading(false);
      });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      // When user signs in with real account, clear viewer mode
      if (session?.user) {
        setIsViewer(false);
        setViewerServerId(null);
        setViewerServerName(null);
        setViewerKey(null);
        setViewerCanEdit(false);
        setViewerCanMarkDied(false);
        setViewerDiscordWebhookUrl(null);
        setViewerTimezone(null);
        localStorage.removeItem(VIEWER_KEY_STORAGE);
        fetchRole(session.user.id).finally(() => setRoleLoading(false));
      } else {
        setUserRole(null);
        setRoleLoading(false);
      }
      // Only set loading=false on subsequent auth changes, not initial load
      if (initialAuthDone) {
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (isViewer) {
      localStorage.removeItem(VIEWER_KEY_STORAGE);
      setIsViewer(false);
      setViewerServerId(null);
      setViewerServerName(null);
      setViewerKey(null);
      setViewerCanEdit(false);
      setViewerCanMarkDied(false);
      setViewerDiscordWebhookUrl(null);
      setViewerTimezone(null);
      return;
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // Sign-out failed server-side — clear local state anyway
      setSession(null);
      setUser(null);
      setUserRole(null);
    }
  };

  const changePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  };

  const signInWithDiscord = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: `${window.location.origin}/` },
    });
    return { error: error?.message ?? null };
  };

  const viewerSignIn = async (key: string) => {
    const { data, error } = await supabase
      .rpc("get_server_by_viewer_key", { v_key: key.trim() });
    if (error || !data || (data as any[]).length === 0) {
      return { error: "Invalid viewer key. Ask the server owner for the correct key." };
    }
    const server = (data as any[])[0];
    setIsViewer(true);
    setViewerServerId(server.id);
    setViewerServerName(server.name);
    setViewerCanEdit(!!server.viewer_can_edit);
    setViewerCanMarkDied(!!server.viewer_can_mark_died);
    setViewerDiscordWebhookUrl(server.discord_webhook_url || null);
    setViewerTimezone(server.timezone || null);
    setViewerKey(key.trim());
    localStorage.setItem(VIEWER_KEY_STORAGE, JSON.stringify({
      serverId: server.id,
      serverName: server.name,
      viewerKey: key.trim(),
      viewerCanEdit: !!server.viewer_can_edit,
      viewerCanMarkDied: !!server.viewer_can_mark_died,
      discordWebhookUrl: server.discord_webhook_url || null,
      timezone: server.timezone || null,
    }));
    return { error: null };
  };

  return (
    <AuthContext.Provider value={{ session, user, userRole, roleLoading, loading, isViewer, viewerServerId, viewerServerName, viewerKey, viewerCanEdit, viewerCanMarkDied, viewerDiscordWebhookUrl, viewerTimezone, viewerSignIn, signIn, signUp, signInWithDiscord, signOut, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
