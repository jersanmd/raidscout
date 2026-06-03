import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchGames, createGame, updateGame, deleteGame,
  fetchBossTemplates, fetchActivityTemplates,
  deleteBossTemplate,
  deleteActivityTemplate,
  uploadGameIcon,
} from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AddBossForm } from "@/components/AddBossForm";
import { AddActivityForm } from "@/components/AddActivityForm";
import { EditBossForm } from "@/components/EditBossForm";
import { EditActivityForm } from "@/components/EditActivityForm";
import {
  Loader2, Plus, Trash2, Pencil, ChevronDown, ChevronUp,
  Gamepad2, Skull, Calendar, Save, X, Image,
} from "lucide-react";

type Game = { id: string; name: string; slug: string; icon_url?: string | null; supported_spawn_types: string[]; created_at: string };
type BossTemplate = { id: string; game_id: string; name: string; spawn_type: string; respawn_hours?: number | null; schedule?: any; is_recurring: boolean; category?: string | null; tags?: string[]; points: number; image_url?: string | null };
type ActivityTemplate = { id: string; game_id: string; name: string; schedule_type: string; schedule?: any; duration_minutes?: number | null; points_per_participant: number; party_size?: number | null; category?: string | null; tags?: string[]; image_url?: string | null };

export function AdminGamesTab() {
  const queryClient = useQueryClient();
  const { userRole } = useAuth();
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [editingGame, setEditingGame] = useState<Partial<Game> | null>(null);
  const [showAddGame, setShowAddGame] = useState(false);
  const [newGame, setNewGame] = useState({ name: "", slug: "", supported_spawn_types: ["fixed_hours", "fixed_schedule"] as string[] });
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "game" | "boss" | "activity"; id: string; name: string; gameName?: string } | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Boss template editor state
  const [editingBoss, setEditingBoss] = useState<Partial<BossTemplate> | null>(null);
  const [showAddBoss, setShowAddBoss] = useState(false);

  // Activity template editor state
  const [editingActivity, setEditingActivity] = useState<Partial<ActivityTemplate> | null>(null);
  const [showAddActivity, setShowAddActivity] = useState(false);

  const { data: games = [], isLoading } = useQuery({
    queryKey: ["admin", "games"],
    queryFn: fetchGames,
    staleTime: 10_000,
    enabled: userRole === "admin",
  });

  const [bossTemplates, setBossTemplates] = useState<Record<string, BossTemplate[]>>({});
  const [activityTemplates, setActivityTemplates] = useState<Record<string, ActivityTemplate[]>>({});

  useEffect(() => {
    if (expandedGame && !bossTemplates[expandedGame]) {
      setLoadingTemplates(true);
      Promise.all([
        fetchBossTemplates(expandedGame).catch(() => []),
        fetchActivityTemplates(expandedGame).catch(() => []),
      ]).then(([bosses, activities]) => {
        setBossTemplates(prev => ({ ...prev, [expandedGame]: bosses }));
        setActivityTemplates(prev => ({ ...prev, [expandedGame]: activities }));
        setLoadingTemplates(false);
      });
    }
  }, [expandedGame]);

  const toggleGame = (id: string) => setExpandedGame(prev => prev === id ? null : id);

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGame.name.trim() || !newGame.slug.trim()) return;
    const slug = newGame.slug.trim().toLowerCase();

    // Upload icon first if provided
    let iconUrl: string | undefined;
    if (iconFile) {
      try {
        iconUrl = await uploadGameIcon(slug, iconFile);
      } catch (err) { console.error("Icon upload failed:", err); }
    }

    await createGame(newGame.name.trim(), slug, newGame.supported_spawn_types, iconUrl);
    setShowAddGame(false);
    setNewGame({ name: "", slug: "", supported_spawn_types: ["fixed_hours", "fixed_schedule"] });
    setIconFile(null);
    setIconPreview(null);
    queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
  };

  const handleUpdateGame = async () => {
    if (!editingGame?.id || !editingGame.name?.trim()) return;
    const types = Array.isArray(editingGame.supported_spawn_types) ? editingGame.supported_spawn_types : typeof editingGame.supported_spawn_types === "string" ? (editingGame.supported_spawn_types as string).split(",").map(s => s.trim()).filter(Boolean) : [];
    await updateGame(editingGame.id, {
      name: editingGame.name.trim(),
      slug: editingGame.slug?.trim().toLowerCase(),
      supported_spawn_types: types,
      icon_url: editingGame.icon_url?.trim() || null,
    });
    setEditingGame(null);
    queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
  };

  const handleDeleteGame = async () => {
    if (!deleteConfirm || deleteConfirm.type !== "game") return;
    await deleteGame(deleteConfirm.id);
    setDeleteConfirm(null);
    setExpandedGame(null);
    queryClient.invalidateQueries({ queryKey: ["admin", "games"] });
  };

  // Boss template handlers
  const handleDeleteBoss = async () => {
    if (!deleteConfirm || deleteConfirm.type !== "boss") return;
    await deleteBossTemplate(deleteConfirm.id);
    setDeleteConfirm(null);
    refreshTemplates();
  };

  // Activity template handlers
  const handleDeleteActivity = async () => {
    if (!deleteConfirm || deleteConfirm.type !== "activity") return;
    await deleteActivityTemplate(deleteConfirm.id);
    setDeleteConfirm(null);
    refreshTemplates();
  };

  const refreshTemplates = () => {
    if (!expandedGame) return;
    Promise.all([
      fetchBossTemplates(expandedGame).catch(() => []),
      fetchActivityTemplates(expandedGame).catch(() => []),
    ]).then(([bosses, activities]) => {
      setBossTemplates(prev => ({ ...prev, [expandedGame]: bosses }));
      setActivityTemplates(prev => ({ ...prev, [expandedGame]: activities }));
    });
  };

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[#a1a1aa]" /></div>;

  return (
    <div className="space-y-4 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#fafafa]">Games ({games.length})</h3>
          <p className="text-sm text-[#71717a]">Manage supported games and their boss/activity seeds</p>
        </div>
        <button onClick={() => setShowAddGame(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition">
          <Plus className="w-4 h-4" /> Add Game
        </button>
      </div>

      {/* Add Game Form */}
      {showAddGame && (
        <form onSubmit={handleCreateGame} className="bg-[#18181b] border border-[#27272a] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#fafafa]">New Game</span>
            <button type="button" onClick={() => setShowAddGame(false)} className="text-[#71717a] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Name</label>
              <input value={newGame.name} onChange={e => setNewGame(p => ({ ...p, name: e.target.value }))} required placeholder="LordNine: Infinite Class" className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
            </div>
            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Slug</label>
              <input value={newGame.slug} onChange={e => setNewGame(p => ({ ...p, slug: e.target.value }))} required placeholder="lordnine" className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-[#a1a1aa] mb-1">Game Icon</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-[#d4d4d8] cursor-pointer transition">
                  <Image className="w-3.5 h-3.5" /> Choose Image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={e => {
                      const file = e.target.files?.[0] || null;
                      setIconFile(file);
                      setIconPreview(file ? URL.createObjectURL(file) : null);
                    }}
                    className="hidden"
                  />
                </label>
                {iconPreview && (
                  <div className="relative">
                    <img src={iconPreview} alt="Preview" className="w-8 h-8 rounded object-cover border border-[#3f3f46]" />
                    <button onClick={() => { setIconFile(null); setIconPreview(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#3f3f46] text-[#fafafa] flex items-center justify-center hover:bg-[#52525b] transition">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-[#a1a1aa] mb-1.5">Spawn Types</label>
              <div className="flex gap-3">
                {["fixed_hours", "fixed_schedule"].map(t => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newGame.supported_spawn_types.includes(t)}
                      onChange={e => setNewGame(p => ({
                        ...p,
                        supported_spawn_types: e.target.checked
                          ? [...p.supported_spawn_types, t]
                          : p.supported_spawn_types.filter(x => x !== t),
                      }))}
                      className="w-3.5 h-3.5 rounded border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] focus:ring-[#52525b] focus:ring-offset-0"
                    />
                    <span className="text-xs text-[#d4d4d8]">{t === "fixed_hours" ? "Fixed Hours" : "Fixed Schedule"}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition">
            <Save className="w-3.5 h-3.5" /> Create Game
          </button>
        </form>
      )}

      {/* Game List */}
      <div className="space-y-2">
        {games.map((game: Game) => (
          <div key={game.id} className="bg-[#18181b] border border-[#27272a] rounded-lg overflow-hidden">
            {/* Game Row */}
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => toggleGame(game.id)} className="flex items-center gap-3 flex-1 text-left">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#18181b] overflow-hidden">
                  {game.icon_url ? (
                    <img src={game.icon_url} alt={game.name} className="w-full h-full object-cover" />
                  ) : (
                    <Gamepad2 className="w-4 h-4 text-[#a1a1aa]" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#fafafa]">{game.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[#27272a] text-[#a1a1aa] font-mono">{game.slug}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {(Array.isArray(game.supported_spawn_types) ? game.supported_spawn_types : []).map((t: string) => (
                      <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-[#27272a] text-[#a1a1aa]">{t}</span>
                    ))}
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-1">
                <button onClick={() => setEditingGame({ id: game.id, name: game.name, slug: game.slug, icon_url: game.icon_url, supported_spawn_types: Array.isArray(game.supported_spawn_types) ? game.supported_spawn_types : [] })} className="p-1.5 text-[#71717a] hover:text-[#d4d4d8] transition">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDeleteConfirm({ type: "game", id: game.id, name: game.name })} className="p-1.5 text-[#71717a] hover:text-[#f87171] transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {expandedGame === game.id ? <ChevronUp className="w-4 h-4 text-[#71717a]" /> : <ChevronDown className="w-4 h-4 text-[#71717a]" />}
              </div>
            </div>

            {/* Edit Game Form */}
            {editingGame?.id === game.id && (
              <div className="px-4 pb-3 border-t border-[#27272a] pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Name</label>
                    <input value={editingGame.name || ""} onChange={e => setEditingGame(p => ({ ...p, name: e.target.value }))} className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Slug</label>
                    <input value={editingGame.slug || ""} onChange={e => setEditingGame(p => ({ ...p, slug: e.target.value }))} className="w-full px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-[#a1a1aa] mb-1">Game Icon</label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-[#d4d4d8] cursor-pointer transition">
                        <Image className="w-3.5 h-3.5" /> {editingGame.icon_url ? "Replace" : "Choose Image"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={e => {
                            const file = e.target.files?.[0] || null;
                            if (file) {
                              const slug = editingGame.slug || "";
                              uploadGameIcon(slug, file).then(url => setEditingGame(p => ({ ...p, icon_url: url }))).catch(() => {});
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      {editingGame.icon_url && (
                        <div className="relative">
                          <img src={editingGame.icon_url} alt="Icon" className="w-8 h-8 rounded object-cover border border-[#3f3f46]" />
                          <button onClick={() => setEditingGame(p => ({ ...p, icon_url: null }))} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#3f3f46] text-[#fafafa] flex items-center justify-center hover:bg-[#52525b] transition">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-[#a1a1aa] mb-1.5">Spawn Types</label>
                    <div className="flex gap-3">
                      {["fixed_hours", "fixed_schedule"].map(t => {
                        const current = Array.isArray(editingGame.supported_spawn_types) ? editingGame.supported_spawn_types : typeof editingGame.supported_spawn_types === "string" ? (editingGame.supported_spawn_types as string).split(",").map(s => s.trim()) : [];
                        return (
                          <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={current.includes(t)}
                              onChange={e => setEditingGame(p => ({
                                ...p,
                                supported_spawn_types: e.target.checked
                                  ? [...current, t]
                                  : current.filter(x => x !== t),
                              }))}
                              className="w-3.5 h-3.5 rounded border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] focus:ring-[#52525b] focus:ring-offset-0"
                            />
                            <span className="text-xs text-[#d4d4d8]">{t === "fixed_hours" ? "Fixed Hours" : "Fixed Schedule"}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleUpdateGame} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition"><Save className="w-3 h-3" /> Save</button>
                  <button onClick={() => setEditingGame(null)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-[#27272a] hover:bg-[#3f3f46] text-[#d4d4d8] transition"><X className="w-3 h-3" /> Cancel</button>
                </div>
              </div>
            )}

            {/* Templates Section (expanded) */}
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${expandedGame === game.id ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}`}>
            {expandedGame === game.id && (
              <div className="border-t border-[#27272a] px-4 py-3 space-y-4">
                {loadingTemplates ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#a1a1aa]" />
                    <span className="text-xs text-[#71717a]">Loading templates...</span>
                  </div>
                ) : (
                  <>
                    {/* Boss Templates */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-[#d4d4d8] flex items-center gap-1.5"><Skull className="w-3.5 h-3.5 text-red-400" /> Boss Templates ({bossTemplates[game.id]?.length || 0})</h4>
                        <button onClick={() => setShowAddBoss(true)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-[#27272a] hover:bg-[#3f3f46] text-[#d4d4d8] transition">
                          <Plus className="w-3 h-3" /> Add Boss
                        </button>
                      </div>

                      {/* Add Boss Form */}
                      {showAddBoss && (
                        <AddBossForm
                          gameId={game.id}
                          gameSlug={game.slug}
                          onCreated={() => { setShowAddBoss(false); refreshTemplates(); }}
                          onCancel={() => setShowAddBoss(false)}
                        />
                      )}

                      {/* Boss List */}
                      <div className="space-y-1">
                        {(bossTemplates[game.id] || []).map((bt: BossTemplate) => {
                          const isEditing = editingBoss?.id === bt.id;
                          return (
                          <div key={bt.id} className="bg-[#18181b]/30 rounded overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 text-sm">
                            <div className="flex items-center gap-2">
                              {bt.image_url ? (
                                <img src={bt.image_url} alt={bt.name} className="w-5 h-5 rounded object-cover border border-[#27272a]" />
                              ) : (
                                <Skull className="w-4 h-4 text-[#52525b]" />
                              )}
                              <span className="text-[#fafafa]">{bt.name}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-[#27272a] text-[#a1a1aa]">{bt.spawn_type}</span>
                              {bt.spawn_type === "fixed_hours" && bt.respawn_hours != null && <span className="text-xs text-[#71717a]">{bt.respawn_hours}h</span>}
                              <span className="text-xs text-[#71717a]">{bt.points}pt{bt.points !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setEditingBoss(isEditing ? null : { id: bt.id, name: bt.name, spawn_type: bt.spawn_type, respawn_hours: bt.respawn_hours, schedule: bt.schedule, is_recurring: bt.is_recurring, points: bt.points, category: bt.category, tags: bt.tags, image_url: bt.image_url })} className="p-1 text-[#52525b] hover:text-[#d4d4d8]"><Pencil className="w-3 h-3" /></button>
                              <button onClick={() => setDeleteConfirm({ type: "boss", id: bt.id, name: bt.name, gameName: game.name })} className="p-1 text-[#52525b] hover:text-[#f87171]"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                          {/* Edit form slides down */}
                          <div className={`transition-all duration-300 ease-in-out ${isEditing ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}`}>
                            {isEditing && editingBoss && (
                              <EditBossForm
                                boss={editingBoss as any}
                                gameSlug={game.slug}
                                onSaved={() => { setEditingBoss(null); refreshTemplates(); }}
                                onCancel={() => setEditingBoss(null)}
                              />
                            )}
                          </div>
                        </div>
                        );
                      })}
                        {(!bossTemplates[game.id] || bossTemplates[game.id].length === 0) && <p className="text-xs text-[#52525b] py-2">No boss templates yet.</p>}
                      </div>
                    </div>

                    {/* Activity Templates */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-[#d4d4d8] flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-[#a1a1aa]" /> Activity Templates ({activityTemplates[game.id]?.length || 0})</h4>
                        <button onClick={() => setShowAddActivity(true)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-[#27272a] hover:bg-[#3f3f46] text-[#d4d4d8] transition">
                          <Plus className="w-3 h-3" /> Add Activity
                        </button>
                      </div>

                      {/* Add Activity Form */}
                      {showAddActivity && (
                        <AddActivityForm
                          gameId={game.id}
                          gameSlug={game.slug}
                          onCreated={() => { setShowAddActivity(false); refreshTemplates(); }}
                          onCancel={() => setShowAddActivity(false)}
                        />
                      )}

                      {/* Activity List */}
                      <div className="space-y-1">
                        {(activityTemplates[game.id] || []).map((at: ActivityTemplate) => {
                          const isEditing = editingActivity?.id === at.id;
                          return (
                          <div key={at.id} className="bg-[#18181b]/30 rounded overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 text-sm">
                            <div className="flex items-center gap-2">
                              {at.image_url ? (
                                <img src={at.image_url} alt={at.name} className="w-5 h-5 rounded object-cover border border-[#27272a]" />
                              ) : (
                                <Calendar className="w-4 h-4 text-[#52525b]" />
                              )}
                              <span className="text-[#fafafa]">{at.name}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-[#27272a] text-[#a1a1aa]">{at.schedule_type === "fixed_schedule" ? "Fixed Schedule" : at.schedule_type === "fixed_hours" ? "Fixed Hours" : "One Time"}</span>
                              <span className="text-xs text-[#71717a]">{at.points_per_participant}pt/p</span>
                              {at.party_size != null && <span className="text-xs text-[#71717a]">{at.party_size}p</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setEditingActivity(isEditing ? null : { id: at.id, name: at.name, schedule_type: at.schedule_type, schedule: at.schedule, duration_minutes: at.duration_minutes, points_per_participant: at.points_per_participant, party_size: at.party_size, category: at.category, tags: at.tags, image_url: at.image_url })} className="p-1 text-[#52525b] hover:text-[#d4d4d8]"><Pencil className="w-3 h-3" /></button>
                              <button onClick={() => setDeleteConfirm({ type: "activity", id: at.id, name: at.name, gameName: game.name })} className="p-1 text-[#52525b] hover:text-[#f87171]"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                          {/* Edit form slides down */}
                          <div className={`transition-all duration-300 ease-in-out ${isEditing ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}`}>
                            {isEditing && editingActivity && (
                              <EditActivityForm
                                activity={editingActivity as any}
                                gameSlug={game.slug}
                                onSaved={() => { setEditingActivity(null); refreshTemplates(); }}
                                onCancel={() => setEditingActivity(null)}
                              />
                            )}
                          </div>
                        </div>
                        );
                      })}
                        {(!activityTemplates[game.id] || activityTemplates[game.id].length === 0) && <p className="text-xs text-[#52525b] py-2">No activity templates yet.</p>}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            </div>          </div>        ))}
        {games.length === 0 && <p className="text-center text-sm text-[#71717a] py-8">No games configured yet. Add your first game above.</p>}
      </div>

      {/* Delete Confirmations */}
      {deleteConfirm && (
        <ConfirmDialog
          open={true}
          title={`Delete ${deleteConfirm.type === "game" ? "Game" : deleteConfirm.type === "boss" ? "Boss Template" : "Activity Template"}`}
          message={deleteConfirm.type === "game"
            ? `Are you sure you want to delete "${deleteConfirm.name}"? This will also remove all associated templates and servers.`
            : `Delete "${deleteConfirm.name}"${deleteConfirm.gameName ? ` from ${deleteConfirm.gameName}` : ""}? This will sync-delete it from all servers.`
          }
          confirmLabel="Delete"
          onConfirm={deleteConfirm.type === "game" ? handleDeleteGame : deleteConfirm.type === "boss" ? handleDeleteBoss : handleDeleteActivity}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
