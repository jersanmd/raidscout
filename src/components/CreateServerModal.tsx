import { useState } from "react";
import { createServer, createGuild } from "@/lib/supabase";
import { useServer } from "@/contexts/ServerContext";
import { Loader2, Plus, X, Server, Shield } from "lucide-react";

export function CreateServerModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [guildName, setGuildName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshServers } = useServer();

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const server = await createServer(trimmed);
      // Create initial guild if name provided
      if (guildName.trim()) {
        try { await createGuild(guildName.trim(), server.id); } catch { /* guild creation is optional */ }
      }
      await refreshServers();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to create server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" />
            Create Server
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-slate-400">
            Create a new server with 39 bosses pre-loaded. You'll be the owner.
          </p>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Server"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Initial Guild Name (optional)</label>
            <input
              type="text"
              value={guildName}
              onChange={(e) => setGuildName(e.target.value)}
              placeholder="First guild..."
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-purple-500 transition"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="w-full py-2.5 rounded-lg font-medium text-sm bg-gradient-to-r from-emerald-600 to-green-500 text-white hover:from-emerald-500 hover:to-green-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
            Create Server
          </button>
        </div>
      </div>
    </div>
  );
}
