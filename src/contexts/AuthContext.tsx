import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  user: User | null;
  userRole: string | null;
  loading: boolean;
  isViewer: boolean;
  viewerServerId: string | null;
  viewerServerName: string | null;
  viewerSignIn: (key: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
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

  // Fetch user role from database
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

  useEffect(() => {
    // Check for stored viewer key first
    const storedViewerKey = localStorage.getItem(VIEWER_KEY_STORAGE);
    if (storedViewerKey) {
      try {
        const parsed = JSON.parse(storedViewerKey);
        setIsViewer(true);
        setViewerServerId(parsed.serverId);
        setViewerServerName(parsed.serverName || null);
        setLoading(false);
        return;
      } catch { localStorage.removeItem(VIEWER_KEY_STORAGE); }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) fetchRole(session.user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) fetchRole(session.user.id);
      else setUserRole(null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (isViewer) {
      localStorage.removeItem(VIEWER_KEY_STORAGE);
      setIsViewer(false);
      setViewerServerId(null);
      setViewerServerName(null);
      return;
    }
    await supabase.auth.signOut({ scope: "local" });
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
    localStorage.setItem(VIEWER_KEY_STORAGE, JSON.stringify({ serverId: server.id, serverName: server.name }));
    return { error: null };
  };

  return (
    <AuthContext.Provider value={{ session, user, userRole, loading, isViewer, viewerServerId, viewerServerName, viewerSignIn, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
