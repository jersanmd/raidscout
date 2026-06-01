import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchGames, createGame, updateGame, deleteGame,
  fetchBossTemplates, fetchActivityTemplates,
  createBossTemplate, updateBossTemplate, deleteBossTemplate,
  createActivityTemplate, updateActivityTemplate, deleteActivityTemplate,
  uploadGameIcon, uploadBossImage,
} from "@/lib/supabase";
import { localSlotToUtc, utcSlotToLocal, formatScheduleSlot, type ScheduleSlot } from "@/lib/scheduleTimezone";
import { useAuth } from "@/contexts/AuthContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Loader2, Plus, Trash2, Pencil, ChevronDown, ChevronUp,
  Gamepad2, Skull, Calendar, Save, X, Image,
} from "lucide-react";

type Game = { id: string; name: string; slug: string; icon_url?: string | null; supported_spawn_types: string[]; created_at: string };
type BossTemplate = { id: string; game_id: string; name: string; spawn_type: string; respawn_hours?: number | null; schedule?: any; is_recurring: boolean; category?: string | null; tags?: string[]; points: number; image_url?: string | null };
type ActivityTemplate = { id: string; game_id: string; name: string; schedule_type: string; schedule?: any; duration_minutes?: number | null; points_per_participant: number; party_size?: number | null; category?: string | null; tags?: string[] };

const BOSS_CATEGORIES = ["World Boss", "Dungeon Boss", "Raid Boss", "Field Boss", "Event Boss"];
const BOSS_TAGS = ["world", "field", "dungeon", "raid", "pvp", "weekly", "daily", "elite", "mini", "guild", "solo", "party"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  const [newBoss, setNewBoss] = useState({ name: "", spawn_type: "fixed_hours", respawn_hours: "", schedule: "", is_recurring: true, points: 1, category: "", tags: [] as string[] });
  const [bossImageFile, setBossImageFile] = useState<File | null>(null);
  const [bossImagePreview, setBossImagePreview] = useState<string | null>(null);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);

  // Activity template editor state
  const [editingActivity, setEditingActivity] = useState<Partial<ActivityTemplate> | null>(null);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [newActivity, setNewActivity] = useState({ name: "", schedule_type: "recurring", schedule: "", duration_minutes: "", points_per_participant: 1, party_size: "", category: "", tags: "" });

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
  const handleCreateBoss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expandedGame || !newBoss.name.trim()) return;

    // Upload image if provided
    let imageUrl: string | undefined;
    if (bossImageFile) {
      const game = games.find(g => g.id === expandedGame);
      try {
        imageUrl = await uploadBossImage(game?.slug || "unknown", newBoss.name.trim(), bossImageFile);
      } catch (err) { console.error("Boss image upload failed:", err); }
    }

    await createBossTemplate({
      game_id: expandedGame,
      name: newBoss.name.trim(),
      spawn_type: newBoss.spawn_type,
      respawn_hours: newBoss.respawn_hours ? Number(newBoss.respawn_hours) : null,
      schedule: newBoss.spawn_type === "fixed_schedule" && scheduleSlots.length > 0
        ? scheduleSlots.map(s => localSlotToUtc(s.day, s.time))
        : null,
      is_recurring: newBoss.is_recurring,
      points: Number(newBoss.points) || 1,
      category: newBoss.category || null,
      tags: newBoss.tags,
      image_url: imageUrl,
    });
    setShowAddBoss(false);
    setNewBoss({ name: "", spawn_type: "fixed_hours", respawn_hours: "", schedule: "", is_recurring: true, points: 1, category: "", tags: [] });
    setScheduleSlots([]);
    setBossImageFile(null);
    setBossImagePreview(null);
    refreshTemplates();
  };

  const handleUpdateBoss = async () => {
    if (!editingBoss?.id) return;
    await updateBossTemplate(editingBoss.id, {
      name: editingBoss.name?.trim(),
      spawn_type: editingBoss.spawn_type,
      respawn_hours: editingBoss.respawn_hours ? Number(editingBoss.respawn_hours) : null,
      schedule: editingBoss.schedule && Array.isArray(editingBoss.schedule)
        ? (editingBoss.schedule as ScheduleSlot[]).map(s => localSlotToUtc(s.day, s.time))
        : null,
      is_recurring: editingBoss.is_recurring,
      points: Number(editingBoss.points) || 1,
      category: editingBoss.category || null,
      tags: editingBoss.tags ?? [],
      image_url: editingBoss.image_url ?? null,
    });
    setEditingBoss(null);
    refreshTemplates();
  };

  const handleDeleteBoss = async () => {
    if (!deleteConfirm || deleteConfirm.type !== "boss") return;
    await deleteBossTemplate(deleteConfirm.id);
    setDeleteConfirm(null);
    refreshTemplates();
  };

  // Activity template handlers
  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expandedGame || !newActivity.name.trim()) return;
    await createActivityTemplate({
      game_id: expandedGame,
      name: newActivity.name.trim(),
      schedule_type: newActivity.schedule_type,
      schedule: newActivity.schedule ? JSON.parse(newActivity.schedule) : undefined,
      duration_minutes: newActivity.duration_minutes ? Number(newActivity.duration_minutes) : null,
      points_per_participant: Number(newActivity.points_per_participant) || 1,
      party_size: newActivity.party_size ? Number(newActivity.party_size) : null,
      category: newActivity.category.trim() || null,
      tags: newActivity.tags ? newActivity.tags.split(",").map(s => s.trim()).filter(Boolean) : [],
    });
    setShowAddActivity(false);
    setNewActivity({ name: "", schedule_type: "recurring", schedule: "", duration_minutes: "", points_per_participant: 1, party_size: "", category: "", tags: "" });
    refreshTemplates();
  };

  const handleUpdateActivity = async () => {
    if (!editingActivity?.id) return;
    await updateActivityTemplate(editingActivity.id, {
      name: editingActivity.name?.trim(),
      schedule_type: editingActivity.schedule_type,
      schedule: editingActivity.schedule ? (typeof editingActivity.schedule === "string" ? JSON.parse(editingActivity.schedule) : editingActivity.schedule) : null,
      duration_minutes: editingActivity.duration_minutes ? Number(editingActivity.duration_minutes) : null,
      points_per_participant: Number(editingActivity.points_per_participant) || 1,
      party_size: editingActivity.party_size ? Number(editingActivity.party_size) : null,
      category: editingActivity.category?.trim() || null,
      tags: editingActivity.tags ? (Array.isArray(editingActivity.tags) ? editingActivity.tags : (editingActivity.tags as string).split(",").map(s => s.trim()).filter(Boolean)) : [],
    });
    setEditingActivity(null);
    refreshTemplates();
  };

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

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Games ({games.length})</h3>
          <p className="text-sm text-slate-500">Manage supported games and their boss/activity seeds</p>
        </div>
        <button onClick={() => setShowAddGame(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition">
          <Plus className="w-4 h-4" /> Add Game
        </button>
      </div>

      {/* Add Game Form */}
      {showAddGame && (
        <form onSubmit={handleCreateGame} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">New Game</span>
            <button type="button" onClick={() => setShowAddGame(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Name</label>
              <input value={newGame.name} onChange={e => setNewGame(p => ({ ...p, name: e.target.value }))} required placeholder="LordNine: Infinite Class" className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Slug</label>
              <input value={newGame.slug} onChange={e => setNewGame(p => ({ ...p, slug: e.target.value }))} required placeholder="lordnine" className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Game Icon</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer transition">
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
                    <img src={iconPreview} alt="Preview" className="w-8 h-8 rounded object-cover border border-slate-600" />
                    <button onClick={() => { setIconFile(null); setIconPreview(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-400 transition">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 mb-1.5">Spawn Types</label>
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
                      className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                    />
                    <span className="text-xs text-slate-300">{t === "fixed_hours" ? "Fixed Hours" : "Fixed Schedule"}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition">
            <Save className="w-3.5 h-3.5" /> Create Game
          </button>
        </form>
      )}

      {/* Game List */}
      <div className="space-y-2">
        {games.map((game: Game) => (
          <div key={game.id} className="bg-slate-800/30 border border-slate-700/50 rounded-lg overflow-hidden">
            {/* Game Row */}
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => toggleGame(game.id)} className="flex items-center gap-3 flex-1 text-left">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/20">
                  <Gamepad2 className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{game.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 font-mono">{game.slug}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {(Array.isArray(game.supported_spawn_types) ? game.supported_spawn_types : []).map((t: string) => (
                      <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{t}</span>
                    ))}
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-1">
                <button onClick={() => setEditingGame({ id: game.id, name: game.name, slug: game.slug, icon_url: game.icon_url, supported_spawn_types: Array.isArray(game.supported_spawn_types) ? game.supported_spawn_types : [] })} className="p-1.5 text-slate-500 hover:text-slate-300 transition">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDeleteConfirm({ type: "game", id: game.id, name: game.name })} className="p-1.5 text-slate-500 hover:text-red-400 transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {expandedGame === game.id ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
              </div>
            </div>

            {/* Edit Game Form */}
            {editingGame?.id === game.id && (
              <div className="px-4 pb-3 border-t border-slate-700/30 pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Name</label>
                    <input value={editingGame.name || ""} onChange={e => setEditingGame(p => ({ ...p, name: e.target.value }))} className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Slug</label>
                    <input value={editingGame.slug || ""} onChange={e => setEditingGame(p => ({ ...p, slug: e.target.value }))} className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">Game Icon</label>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer transition">
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
                          <img src={editingGame.icon_url} alt="Icon" className="w-8 h-8 rounded object-cover border border-slate-600" />
                          <button onClick={() => setEditingGame(p => ({ ...p, icon_url: null }))} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-400 transition">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1.5">Spawn Types</label>
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
                              className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                            />
                            <span className="text-xs text-slate-300">{t === "fixed_hours" ? "Fixed Hours" : "Fixed Schedule"}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleUpdateGame} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition"><Save className="w-3 h-3" /> Save</button>
                  <button onClick={() => setEditingGame(null)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition"><X className="w-3 h-3" /> Cancel</button>
                </div>
              </div>
            )}

            {/* Templates Section (expanded) */}
            {expandedGame === game.id && (
              <div className="border-t border-slate-700/50 px-4 py-3 space-y-4">
                {loadingTemplates ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
                ) : (
                  <>
                    {/* Boss Templates */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Skull className="w-3.5 h-3.5 text-red-400" /> Boss Templates ({bossTemplates[game.id]?.length || 0})</h4>
                        <button onClick={() => setShowAddBoss(true)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition">
                          <Plus className="w-3 h-3" /> Add Boss
                        </button>
                      </div>

                      {/* Add Boss Form */}
                      {showAddBoss && (
                        <form onSubmit={handleCreateBoss} className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 mb-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-white">New Boss Template</span>
                            <button type="button" onClick={() => setShowAddBoss(false)} className="text-slate-500 hover:text-white"><X className="w-3 h-3" /></button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-slate-500 mb-0.5">Name *</label>
                              <input value={newBoss.name} onChange={e => setNewBoss(p => ({ ...p, name: e.target.value }))} required className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-0.5">Spawn Type</label>
                              <select value={newBoss.spawn_type} onChange={e => { setNewBoss(p => ({ ...p, spawn_type: e.target.value })); setScheduleSlots([]); }} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                                <option value="fixed_hours">Fixed Hours</option>
                                <option value="fixed_schedule">Fixed Schedule</option>
                              </select>
                            </div>
                            {newBoss.spawn_type === "fixed_hours" && (
                              <div className="col-span-2">
                                <label className="block text-xs text-slate-500 mb-1">Respawn Time</label>
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <select
                                      value={newBoss.respawn_hours ? Math.floor(Number(newBoss.respawn_hours)) : ""}
                                      onChange={e => {
                                        const h = Number(e.target.value) || 0;
                                        const m = newBoss.respawn_hours ? Math.round((Number(newBoss.respawn_hours) % 1) * 60) : 0;
                                        setNewBoss(p => ({ ...p, respawn_hours: String(h + m / 60) }));
                                      }}
                                      className="w-20 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                                      <option value="">h</option>
                                      {Array.from({ length: 200 }, (_, i) => i).map(h => <option key={h} value={h}>{h}h</option>)}
                                    </select>
                                    <select
                                      value={newBoss.respawn_hours ? Math.round((Number(newBoss.respawn_hours) % 1) * 60) : 0}
                                      onChange={e => {
                                        const m = Number(e.target.value) || 0;
                                        const h = newBoss.respawn_hours ? Math.floor(Number(newBoss.respawn_hours)) : 0;
                                        setNewBoss(p => ({ ...p, respawn_hours: String(h + m / 60) }));
                                      }}
                                      className="w-16 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                                      {[0, 15, 30, 45].map(m => <option key={m} value={m}>{m}m</option>)}
                                    </select>
                                  </div>
                                  <span className="text-xs text-slate-600">
                                    {newBoss.respawn_hours ? `${Math.floor(Number(newBoss.respawn_hours))}h ${Math.round((Number(newBoss.respawn_hours) % 1) * 60)}m` : "—"}
                                  </span>
                                </div>
                              </div>
                            )}
                            {newBoss.spawn_type === "fixed_schedule" && (
                              <div className="col-span-2">
                                <label className="block text-xs text-slate-500 mb-1">
                                  Weekly Schedule
                                  <span className="text-slate-600 ml-1">(your local time — saved as UTC)</span>
                                </label>
                                <div className="space-y-1.5">
                                  {scheduleSlots.map((slot, i) => (
                                    <div key={i} className="flex items-center gap-1.5">
                                      <select value={slot.day} onChange={e => {
                                        const updated = [...scheduleSlots];
                                        updated[i] = { ...updated[i], day: Number(e.target.value) };
                                        setScheduleSlots(updated);
                                      }} className="w-16 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                                        {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                                      </select>
                                      <input type="time" value={slot.time} onChange={e => {
                                        const updated = [...scheduleSlots];
                                        updated[i] = { ...updated[i], time: e.target.value };
                                        setScheduleSlots(updated);
                                      }} className="w-28 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                                      <button onClick={() => setScheduleSlots(scheduleSlots.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400 transition"><X className="w-3 h-3" /></button>
                                    </div>
                                  ))}
                                  <button type="button" onClick={() => setScheduleSlots([...scheduleSlots, { day: 0, time: "21:00" }])} className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition">
                                    <Plus className="w-3 h-3" /> Add spawn time
                                  </button>
                                </div>
                              </div>
                            )}
                            <div>
                              <label className="block text-xs text-slate-500 mb-0.5">Category</label>
                              <select value={newBoss.category} onChange={e => setNewBoss(p => ({ ...p, category: e.target.value }))} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                                <option value="">None</option>
                                {BOSS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-0.5">Points</label>
                              <input value={newBoss.points} onChange={e => setNewBoss(p => ({ ...p, points: Number(e.target.value) || 1 }))} type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs text-slate-500 mb-1">Tags</label>
                              <div className="flex flex-wrap gap-1.5">
                                {BOSS_TAGS.map(t => (
                                  <label key={t} className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition ${newBoss.tags.includes(t) ? "bg-purple-600/30 text-purple-300 border border-purple-500/50" : "bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300"}`}>
                                    <input type="checkbox" checked={newBoss.tags.includes(t)}
                                      onChange={e => setNewBoss(p => ({ ...p, tags: e.target.checked ? [...p.tags, t] : p.tags.filter(x => x !== t) }))}
                                      className="sr-only" />
                                    {t}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Boss Image</label>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer transition">
                                <Image className="w-3.5 h-3.5" /> Choose Image
                                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                                  onChange={e => {
                                    const file = e.target.files?.[0] || null;
                                    setBossImageFile(file);
                                    setBossImagePreview(file ? URL.createObjectURL(file) : null);
                                  }}
                                  className="hidden" />
                              </label>
                              {bossImagePreview && (
                                <div className="relative">
                                  <img src={bossImagePreview} alt="Preview" className="w-8 h-8 rounded object-cover border border-slate-600" />
                                  <button onClick={() => { setBossImageFile(null); setBossImagePreview(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-400 transition">
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <button type="submit" className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition"><Save className="w-3 h-3" /> Add</button>
                        </form>
                      )}

                      {/* Edit Boss Form */}
                      {editingBoss && (
                        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 mb-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-white">Edit: {editingBoss.name}</span>
                            <button onClick={() => setEditingBoss(null)} className="text-slate-500 hover:text-white"><X className="w-3 h-3" /></button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-slate-500 mb-0.5">Name</label>
                              <input value={editingBoss.name || ""} onChange={e => setEditingBoss(p => ({ ...p, name: e.target.value }))} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-0.5">Spawn Type</label>
                              <select value={editingBoss.spawn_type || "fixed_hours"} onChange={e => setEditingBoss(p => ({ ...p, spawn_type: e.target.value }))} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                                <option value="fixed_hours">Fixed Hours</option>
                                <option value="fixed_schedule">Fixed Schedule</option>
                              </select>
                            </div>
                            {(editingBoss.spawn_type === "fixed_hours" || (!editingBoss.spawn_type)) && (
                              <div className="col-span-2">
                                <label className="block text-xs text-slate-500 mb-1">Respawn Time</label>
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <select
                                      value={editingBoss.respawn_hours != null ? Math.floor(editingBoss.respawn_hours) : ""}
                                      onChange={e => {
                                        const h = Number(e.target.value) || 0;
                                        const m = editingBoss.respawn_hours != null ? Math.round((editingBoss.respawn_hours % 1) * 60) : 0;
                                        setEditingBoss(p => ({ ...p, respawn_hours: h + m / 60 }));
                                      }}
                                      className="w-20 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                                      <option value="">h</option>
                                      {Array.from({ length: 200 }, (_, i) => i).map(h => <option key={h} value={h}>{h}h</option>)}
                                    </select>
                                    <select
                                      value={editingBoss.respawn_hours != null ? Math.round((editingBoss.respawn_hours % 1) * 60) : 0}
                                      onChange={e => {
                                        const m = Number(e.target.value) || 0;
                                        const h = editingBoss.respawn_hours != null ? Math.floor(editingBoss.respawn_hours) : 0;
                                        setEditingBoss(p => ({ ...p, respawn_hours: h + m / 60 }));
                                      }}
                                      className="w-16 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                                      {[0, 15, 30, 45].map(m => <option key={m} value={m}>{m}m</option>)}
                                    </select>
                                  </div>
                                  <span className="text-xs text-slate-600">
                                    {editingBoss.respawn_hours != null ? `${Math.floor(editingBoss.respawn_hours)}h ${Math.round((editingBoss.respawn_hours % 1) * 60)}m` : "—"}
                                  </span>
                                </div>
                              </div>
                            )}
                            {editingBoss.spawn_type === "fixed_schedule" && (
                              <div className="col-span-2">
                                <label className="block text-xs text-slate-500 mb-1">
                                  Weekly Schedule
                                  <span className="text-slate-600 ml-1">(your local time — saved as UTC)</span>
                                </label>
                                <div className="space-y-1.5">
                                  {(() => {
                                    const slots: ScheduleSlot[] = editingBoss.schedule
                                      ? (Array.isArray(editingBoss.schedule) ? editingBoss.schedule : typeof editingBoss.schedule === "string" ? JSON.parse(editingBoss.schedule) : [])
                                      : [];
                                    return slots.map((slot: ScheduleSlot, i: number) => (
                                      <div key={i} className="flex items-center gap-1.5">
                                        <select value={slot.day} onChange={e => {
                                          const updated = [...slots];
                                          updated[i] = { ...updated[i], day: Number(e.target.value) };
                                          setEditingBoss(p => ({ ...p, schedule: updated }));
                                        }} className="w-16 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                                          {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                                        </select>
                                        <input type="time" value={slot.time} onChange={e => {
                                          const updated = [...slots];
                                          updated[i] = { ...updated[i], time: e.target.value };
                                          setEditingBoss(p => ({ ...p, schedule: updated }));
                                        }} className="w-28 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                                        <button onClick={() => {
                                          const updated = slots.filter((_, j) => j !== i);
                                          setEditingBoss(p => ({ ...p, schedule: updated }));
                                        }} className="text-slate-500 hover:text-red-400 transition"><X className="w-3 h-3" /></button>
                                      </div>
                                    ));
                                  })()}
                                  <button type="button" onClick={() => {
                                    const slots: ScheduleSlot[] = editingBoss.schedule
                                      ? (Array.isArray(editingBoss.schedule) ? editingBoss.schedule : typeof editingBoss.schedule === "string" ? JSON.parse(editingBoss.schedule) : [])
                                      : [];
                                    setEditingBoss(p => ({ ...p, schedule: [...slots, { day: 0, time: "21:00" }] }));
                                  }} className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition">
                                    <Plus className="w-3 h-3" /> Add spawn time
                                  </button>
                                </div>
                              </div>
                            )}
                            <div>
                              <label className="block text-xs text-slate-500 mb-0.5">Category</label>
                              <select value={editingBoss.category || ""} onChange={e => setEditingBoss(p => ({ ...p, category: e.target.value || null }))} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                                <option value="">None</option>
                                {BOSS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-slate-500 mb-0.5">Points</label>
                              <input value={editingBoss.points ?? 1} onChange={e => setEditingBoss(p => ({ ...p, points: Number(e.target.value) || 1 }))} type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-xs text-slate-500 mb-1">Tags</label>
                              <div className="flex flex-wrap gap-1.5">
                                {BOSS_TAGS.map(t => {
                                  const current = Array.isArray(editingBoss.tags) ? editingBoss.tags : [];
                                  return (
                                    <label key={t} className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition ${current.includes(t) ? "bg-purple-600/30 text-purple-300 border border-purple-500/50" : "bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300"}`}>
                                      <input type="checkbox" checked={current.includes(t)}
                                        onChange={e => setEditingBoss(p => ({ ...p, tags: e.target.checked ? [...current, t] : current.filter(x => x !== t) }))}
                                        className="sr-only" />
                                      {t}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer transition">
                              <Image className="w-3.5 h-3.5" /> {editingBoss.image_url ? "Replace Image" : "Add Image"}
                              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={async e => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const game = games.find(g => g.id === expandedGame);
                                  try {
                                    const url = await uploadBossImage(game?.slug || "unknown", editingBoss.name || "boss", file);
                                    setEditingBoss(p => ({ ...p, image_url: url }));
                                  } catch (err) { console.error("Boss image upload failed:", err); }
                                }}
                                className="hidden" />
                            </label>
                            {editingBoss.image_url && (
                              <div className="relative">
                                <img src={editingBoss.image_url} alt="Boss" className="w-8 h-8 rounded object-cover border border-slate-600" />
                                <button onClick={() => setEditingBoss(p => ({ ...p, image_url: null }))} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-400 transition">
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                          <button onClick={handleUpdateBoss} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition"><Save className="w-3 h-3" /> Save</button>
                        </div>
                      )}

                      {/* Boss List */}
                      <div className="space-y-1">
                        {(bossTemplates[game.id] || []).map((bt: BossTemplate) => (
                          <div key={bt.id} className="flex items-center justify-between px-3 py-2 bg-slate-900/30 rounded text-sm">
                            <div className="flex items-center gap-2">
                              {bt.image_url ? (
                                <img src={bt.image_url} alt={bt.name} className="w-5 h-5 rounded object-cover border border-slate-700" />
                              ) : (
                                <Skull className="w-4 h-4 text-slate-600" />
                              )}
                              <span className="text-white">{bt.name}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{bt.spawn_type}</span>
                              {bt.spawn_type === "fixed_hours" && bt.respawn_hours != null && <span className="text-xs text-slate-500">{bt.respawn_hours}h</span>}
                              <span className="text-xs text-slate-500">{bt.points}pt{bt.points !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => {
                                const sched = Array.isArray(bt.schedule) ? bt.schedule.map((s: any) => utcSlotToLocal(s.day, s.time)) : bt.schedule;
                                setEditingBoss({ id: bt.id, name: bt.name, spawn_type: bt.spawn_type, respawn_hours: bt.respawn_hours, schedule: sched, is_recurring: bt.is_recurring, points: bt.points, category: bt.category, tags: bt.tags, image_url: bt.image_url });
                              }} className="p-1 text-slate-600 hover:text-slate-300"><Pencil className="w-3 h-3" /></button>
                              <button onClick={() => setDeleteConfirm({ type: "boss", id: bt.id, name: bt.name, gameName: game.name })} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                        ))}
                        {(!bossTemplates[game.id] || bossTemplates[game.id].length === 0) && <p className="text-xs text-slate-600 py-2">No boss templates yet.</p>}
                      </div>
                    </div>

                    {/* Activity Templates */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-cyan-400" /> Activity Templates ({activityTemplates[game.id]?.length || 0})</h4>
                        <button onClick={() => setShowAddActivity(true)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition">
                          <Plus className="w-3 h-3" /> Add Activity
                        </button>
                      </div>

                      {/* Add Activity Form */}
                      {showAddActivity && (
                        <form onSubmit={handleCreateActivity} className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 mb-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-white">New Activity Template</span>
                            <button type="button" onClick={() => setShowAddActivity(false)} className="text-slate-500 hover:text-white"><X className="w-3 h-3" /></button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input value={newActivity.name} onChange={e => setNewActivity(p => ({ ...p, name: e.target.value }))} required placeholder="Activity name" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            <select value={newActivity.schedule_type} onChange={e => setNewActivity(p => ({ ...p, schedule_type: e.target.value }))} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                              <option value="recurring">Recurring</option>
                              <option value="one_time">One-Time</option>
                            </select>
                            <input value={newActivity.schedule} onChange={e => setNewActivity(p => ({ ...p, schedule: e.target.value }))} placeholder='Schedule JSON (optional)' className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono" />
                            <input value={newActivity.duration_minutes} onChange={e => setNewActivity(p => ({ ...p, duration_minutes: e.target.value }))} placeholder="Duration (min)" type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            <input value={newActivity.points_per_participant} onChange={e => setNewActivity(p => ({ ...p, points_per_participant: Number(e.target.value) || 1 }))} placeholder="Points per participant" type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            <input value={newActivity.party_size} onChange={e => setNewActivity(p => ({ ...p, party_size: e.target.value }))} placeholder="Party size" type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            <input value={newActivity.category} onChange={e => setNewActivity(p => ({ ...p, category: e.target.value }))} placeholder="Category (optional)" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            <input value={newActivity.tags} onChange={e => setNewActivity(p => ({ ...p, tags: e.target.value }))} placeholder="Tags: pvp, guild (comma)" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                          </div>
                          <button type="submit" className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition"><Save className="w-3 h-3" /> Add</button>
                        </form>
                      )}

                      {/* Edit Activity Form */}
                      {editingActivity && (
                        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 mb-2 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-white">Edit: {editingActivity.name}</span>
                            <button onClick={() => setEditingActivity(null)} className="text-slate-500 hover:text-white"><X className="w-3 h-3" /></button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input value={editingActivity.name || ""} onChange={e => setEditingActivity(p => ({ ...p, name: e.target.value }))} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            <select value={editingActivity.schedule_type || "recurring"} onChange={e => setEditingActivity(p => ({ ...p, schedule_type: e.target.value }))} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                              <option value="recurring">Recurring</option>
                              <option value="one_time">One-Time</option>
                            </select>
                            <input value={typeof editingActivity.schedule === "string" ? editingActivity.schedule : JSON.stringify(editingActivity.schedule || "")} onChange={e => setEditingActivity(p => ({ ...p, schedule: e.target.value }))} placeholder="Schedule JSON" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono" />
                            <input value={editingActivity.duration_minutes ?? ""} onChange={e => setEditingActivity(p => ({ ...p, duration_minutes: e.target.value ? Number(e.target.value) : null }))} placeholder="Duration (min)" type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            <input value={editingActivity.points_per_participant ?? 1} onChange={e => setEditingActivity(p => ({ ...p, points_per_participant: Number(e.target.value) || 1 }))} placeholder="Points" type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            <input value={editingActivity.party_size ?? ""} onChange={e => setEditingActivity(p => ({ ...p, party_size: e.target.value ? Number(e.target.value) : null }))} placeholder="Party size" type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            <input value={editingActivity.category || ""} onChange={e => setEditingActivity(p => ({ ...p, category: e.target.value }))} placeholder="Category" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                            <input value={Array.isArray(editingActivity.tags) ? editingActivity.tags.join(",") : ""} onChange={e => setEditingActivity(p => ({ ...p, tags: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) }))} placeholder="Tags (comma)" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                          </div>
                          <button onClick={handleUpdateActivity} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition"><Save className="w-3 h-3" /> Save</button>
                        </div>
                      )}

                      {/* Activity List */}
                      <div className="space-y-1">
                        {(activityTemplates[game.id] || []).map((at: ActivityTemplate) => (
                          <div key={at.id} className="flex items-center justify-between px-3 py-2 bg-slate-900/30 rounded text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-white">{at.name}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{at.schedule_type}</span>
                              {at.duration_minutes != null && <span className="text-xs text-slate-500">{at.duration_minutes}min</span>}
                              <span className="text-xs text-slate-500">{at.points_per_participant}pt/p</span>
                              {at.party_size != null && <span className="text-xs text-slate-500">{at.party_size}p</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setEditingActivity({ id: at.id, name: at.name, schedule_type: at.schedule_type, schedule: at.schedule, duration_minutes: at.duration_minutes, points_per_participant: at.points_per_participant, party_size: at.party_size, category: at.category, tags: at.tags })} className="p-1 text-slate-600 hover:text-slate-300"><Pencil className="w-3 h-3" /></button>
                              <button onClick={() => setDeleteConfirm({ type: "activity", id: at.id, name: at.name, gameName: game.name })} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                        ))}
                        {(!activityTemplates[game.id] || activityTemplates[game.id].length === 0) && <p className="text-xs text-slate-600 py-2">No activity templates yet.</p>}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {games.length === 0 && <p className="text-center text-sm text-slate-500 py-8">No games configured yet. Add your first game above.</p>}
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
