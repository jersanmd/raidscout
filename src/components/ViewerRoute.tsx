import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * ViewerRoute — auto-authenticates a viewer via URL key.
 * Route: /view/:viewerKey
 * After successful auth, renders the app. On failure, shows an error.
 */
export function ViewerRoute() {
  const { viewerKey } = useParams<{ viewerKey: string }>();
  const { viewerSignIn, isViewer } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!viewerKey) {
      setError("No viewer key provided.");
      setLoading(false);
      return;
    }

    // If already in viewer mode (e.g., from localStorage), skip
    if (isViewer) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const { error: err } = await viewerSignIn(viewerKey);
      if (cancelled) return;
      if (err) {
        setError(err);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [viewerKey, viewerSignIn, isViewer]);

  // Redirect to home after successful viewer sign-in
  useEffect(() => {
    if (isViewer) {
      navigate("/", { replace: true });
    }
  }, [isViewer, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-4 max-w-sm px-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-red-900/30 flex items-center justify-center">
            <span className="text-2xl">🔑</span>
          </div>
          <h1 className="text-xl font-bold text-white">Invalid Viewer Key</h1>
          <p className="text-slate-400 text-sm">{error}</p>
          <button
            onClick={() => navigate("/", { replace: true })}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition text-sm"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return null;
}
