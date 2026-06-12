import { useState, useEffect } from "react";
import { supabase, createServer, fetchGames } from "@/lib/supabase";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useServer } from "@/contexts/ServerContext";
import { Loader2, Plus, X, Server, Shield, ArrowLeft, ArrowRight, Gamepad2 } from "lucide-react";

export function CreateServerModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"choose" | "create">("choose");
  const [games, setGames] = useState<any[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<any>(null);
  const [name, setName] = useState("");
  const [guildName, setGuildName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshServers } = useServer();

  useEffect(() => {
    fetchGames()
      .then(setGames)
      .catch(() => setGames([]))
      .finally(() => setGamesLoading(false));
  }, []);

  useEscapeKey(onClose, !loading);

  const handleCreate = async () => {
    const trimmed = name.trim();
    const guildTrimmed = guildName.trim();
    if (!trimmed || !guildTrimmed || !selectedGame) return;
    setLoading(true);
    setError(null);
    try {
      const { data: existing } = await supabase
        .from("servers")
        .select("id")
        .eq("name", trimmed)
        .maybeSingle();
      if (existing) {
        setError("A server with this name already exists. Choose a different name.");
        setLoading(false);
        return;
      }

      const gameId = selectedGame.id === "custom" ? null : selectedGame.id;
      const isSeeded = selectedGame.id !== "custom";
      await createServer(trimmed, gameId as any, isSeeded, guildTrimmed);
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

      {loading ? (
        <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-sm shadow-2xl p-8">
          <div className="text-center space-y-5">
            <div className="relative mx-auto w-12 h-12">
              <div className="absolute inset-0 rounded-full border-3 border-[#27272a]" />
              <div className="absolute inset-0 rounded-full border-3 border-t-[#a1a1aa] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#fafafa]">Creating your server</h3>
              <p className="text-sm text-[#71717a] mt-1">
                {selectedGame?.id !== "custom"
                  ? `Seeding from ${selectedGame?.name ?? "templates"}...`
                  : "Setting up empty server..."}
              </p>
              {guildName.trim() && (
                <p className="text-xs text-[#52525b] mt-1">
                  Assigning all bosses to {guildName.trim()} (rotation mode)...
                </p>
              )}
              <p className="text-xs text-[#52525b] mt-2">This may take a few seconds</p>
            </div>
          </div>
        </div>
      ) : step === "choose" ? (
        /* ── Step 1: Choose Game ── */
        <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-sm shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
            <h3 className="text-sm font-bold text-[#fafafa] flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-[#a1a1aa]" />
              Select a Game
            </h3>
            <button onClick={onClose} className="text-[#71717a] hover:text-[#fafafa] p-1 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-2">
            <p className="text-xs text-[#71717a] mb-3">
              Choose a game to start tracking bosses and activities.
            </p>
            {gamesLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 text-[#52525b] animate-spin" />
              </div>
            ) : (
              <>
                {games.map(g => (
                  <button
                    key={g.id}
                    onClick={() => { setSelectedGame(g); setStep("create"); }}
                    className="group w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#09090b] border border-[#27272a] hover:bg-[#1c1d22] transition-all duration-200 text-left"
                  >
                    {g.icon_url ? (
                      <img src={g.icon_url} alt={g.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    ) : (
                      <Gamepad2 className="w-4 h-4 text-[#52525b] shrink-0 group-hover:text-[#a1a1aa] transition-colors" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#d4d4d8] group-hover:text-[#fafafa] transition-colors">
                        {g.name}
                      </p>
                      <p className="font-mono text-[10px] text-[#52525b]">
                        {g.supported_spawn_types?.length || 0} spawn types preset
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#3f3f46] shrink-0 group-hover:text-[#a1a1aa] group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
                <button
                  onClick={() => { setSelectedGame({ id: "custom", name: "Custom (no seed)" }); setStep("create"); }}
                  className="group w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#09090b] border border-[#27272a] hover:bg-[#1c1d22] transition-all duration-200 text-left"
                >
                  <Plus className="w-4 h-4 text-[#52525b] shrink-0 group-hover:text-[#a1a1aa] transition-colors" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#d4d4d8] group-hover:text-[#fafafa] transition-colors">
                      Custom (no seed)
                    </p>
                    <p className="font-mono text-[10px] text-[#52525b]">Start with an empty server</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#3f3f46] shrink-0 group-hover:text-[#a1a1aa] group-hover:translate-x-0.5 transition-all" />
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ── Step 2: Server Details ── */
        <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-sm shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
            <button onClick={() => setStep("choose")} className="text-[#71717a] hover:text-[#fafafa] p-1 transition" title="Back to game selection">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold text-[#fafafa]">
              Create Server
            </h3>
            <button onClick={onClose} className="text-[#71717a] hover:text-[#fafafa] p-1 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-xs text-[#71717a]">
              {selectedGame?.id === "custom"
                ? "Start with an empty server."
                : `Based on ${selectedGame?.name ?? "templates"}.`}
            </p>
            <div>
              <label className="block text-xs text-[#71717a] mb-1">Server Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Server"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#52525b] outline-none focus:border-[#52525b] focus:ring-1 focus:ring-[#27272a] transition"
              />
            </div>
            <div>
              <label className="block text-xs text-[#71717a] mb-1">Default Guild Name</label>
              <input
                type="text"
                value={guildName}
                onChange={(e) => setGuildName(e.target.value)}
                placeholder="My Guild"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#52525b] outline-none focus:border-[#52525b] focus:ring-1 focus:ring-[#27272a] transition"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={loading || !name.trim() || !guildName.trim()}
              className="w-full py-2.5 rounded-lg font-medium text-sm bg-[#fafafa] text-[#09090b] hover:bg-white transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
              Create Server
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
