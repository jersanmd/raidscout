import { useState, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { useHasPermission } from "@/contexts/ServerContext";
import { useToast } from "@/contexts/ToastContext";
import {
  fetchAllBossesForServer, fetchAllActivitiesForServer,
  updateCustomBoss, updateCustomActivity,
  toggleBossEnabled, toggleActivityEnabled,
  supabase, fetchGames,
} from "@/lib/supabase";
import { AddBossForm } from "@/components/AddBossForm";
import { BossImage } from "@/components/BossImage";
import { AddActivityForm } from "@/components/AddActivityForm";
import { EditBossForm } from "@/components/EditBossForm";
import { EditActivityForm } from "@/components/EditActivityForm";
import {
  Loader2, Plus, Skull, Calendar, RefreshCw,
  Pencil, ToggleLeft, ToggleRight, AlertTriangle,
  Gamepad2, X, Trash2, Search,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Boss, Activity } from "@/types";

export function ServerBossesActivitiesTab({ mode = "all" }: { mode?: "all" | "bosses" | "activities" }) {
  const { currentServer } = useServer();
  const { userRole } = useAuth();
  const hasPerm = useHasPermission("can_manage_server_content");
  const canManage = currentServer?.role === "owner" || userRole === "admin" || hasPerm;
  const queryClient = useQueryClient();
  const serverId = currentServer?.id ?? "";

  const [showAddBoss, setShowAddBoss] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [editingBossId, setEditingBossId] = useState<string | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [showSeedPicker, setShowSeedPicker] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "boss" | "activity"; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activitySearch, setActivitySearch] = useState("");
  const [bossSearch, setBossSearch] = useState("");
  const { toast } = useToast();

  const { data: games = [] } = useQuery({
    queryKey: ["games"],
    queryFn: fetchGames,
    staleTime: 60_000,
  });

  const { data: bosses = [], isLoading: bossesLoading } = useQuery({
    queryKey: ["bosses-all", serverId],
    queryFn: () => fetchAllBossesForServer(serverId),
    enabled: !!serverId,
  });

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ["activities-all", serverId],
    queryFn: () => fetchAllActivitiesForServer(serverId),
    enabled: !!serverId,
  });

  const handleToggleBoss = async (id: string, enabled: boolean) => {
    await toggleBossEnabled(id, enabled);
    queryClient.invalidateQueries({ queryKey: ["bosses-all", serverId] });
    queryClient.invalidateQueries({ queryKey: ["bosses"] });
  };

  const handleToggleActivity = async (id: string, enabled: boolean) => {
    await toggleActivityEnabled(id, enabled);
    queryClient.invalidateQueries({ queryKey: ["activities-all", serverId] });
    queryClient.invalidateQueries({ queryKey: ["activities"] });
    queryClient.invalidateQueries({ queryKey: ["activity-guilds", serverId] });
    queryClient.invalidateQueries({ queryKey: ["activity-points"] });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "boss") {
        const { error } = await supabase.rpc("soft_delete_boss", { p_boss_id: deleteTarget.id });
        if (error) throw error;
      } else if (deleteTarget.type === "activity") {
        const { data, error } = await supabase.from("activities").update({ deleted_at: new Date().toISOString(), is_enabled: false }).eq("id", deleteTarget.id).select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("No rows updated — you may not have permission.");
      }
      const queryKey = deleteTarget.type === "boss" ? "bosses-all" : "activities-all";
      queryClient.invalidateQueries({ queryKey: [queryKey, serverId] });
      queryClient.refetchQueries({ queryKey: [queryKey, serverId] });
      queryClient.invalidateQueries({ queryKey: [deleteTarget.type === "boss" ? "bosses" : "activities"] });
      queryClient.invalidateQueries({ queryKey: ["activity-guilds", serverId] });
      queryClient.invalidateQueries({ queryKey: ["activity-points"] });
      toast("success", deleteTarget.type === "activity" ? `"${deleteTarget.name}" disabled` : `"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast("error", err?.message ?? `Failed to delete ${deleteTarget.type}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleSeed = async () => {
    if (!selectedGameId) { setSeedResult("Please select a game first."); return; }
    setSeeding(true);
    setSeedResult(null);
    try {
      const { data, error } = await supabase.rpc("seed_from_game", { p_server_id: serverId, p_game_id: selectedGameId });
      if (error) throw error;
      setSeedResult(`Seeded ${data.b} bosses and ${data.a} activities from templates.`);
      queryClient.invalidateQueries({ queryKey: ["bosses-all", serverId] });
      queryClient.invalidateQueries({ queryKey: ["bosses"] });
      queryClient.invalidateQueries({ queryKey: ["activities-all", serverId] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["activity-guilds", serverId] });
      queryClient.invalidateQueries({ queryKey: ["activity-points"] });
    } catch (err: any) {
      setSeedResult(err?.message ?? "Seeding failed.");
    } finally {
      setSeeding(false);
    }
  };

  const isLoading = bossesLoading || activitiesLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-[#71717a]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Bosses Section ── */}
      {mode !== "activities" && (
      <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Skull className="w-4 h-4 text-[#a1a1aa]" />
            <h3 className="text-sm font-semibold text-[#fafafa]">Bosses ({bosses.length})</h3>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <>
                {showSeedPicker ? (
                  <div className="flex items-center gap-1.5">
                    <Gamepad2 className="w-3.5 h-3.5 text-[#71717a]" />
                    <select
                      value={selectedGameId}
                      onChange={e => setSelectedGameId(e.target.value)}
                      className="px-2 py-1.5 rounded-lg text-xs bg-[#18181b] border border-[#27272a] text-[#fafafa] focus:outline-none focus:border-[#52525b]"
                    >
                      <option value="">Select game...</option>
                      {games.map((g: any) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleSeed}
                      disabled={seeding || !selectedGameId}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50"
                    >
                      {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : "Seed"}
                    </button>
                    <button onClick={() => { setShowSeedPicker(false); setSelectedGameId(""); }} className="text-[#71717a] hover:text-[#fafafa]">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSeedPicker(true)}
                    disabled={seeding}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:bg-[#27272a] transition disabled:opacity-50"
                  >
                    {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Re-seed
                  </button>
                )}
                <button
                  onClick={() => setShowAddBoss(!showAddBoss)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition"
                >
                  <Plus className="w-3 h-3" />
                  Add Boss
                </button>
              </>
            )}
          </div>
        </div>
        {seedResult && (
          <div className="mb-3 flex items-center gap-2 text-xs text-[#a1a1aa] bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2">
            {seedResult.includes("failed") || seedResult.includes("error") ? (
              <AlertTriangle className="w-3 h-3 text-[#f87171]" />
            ) : null}
            {seedResult}
          </div>
        )}
        {showAddBoss && canManage && (
          <div className="mb-3">
            <AddBossForm
              serverId={serverId}
              gameId=""
              gameSlug=""
              onCreated={() => {
                setShowAddBoss(false);
                queryClient.invalidateQueries({ queryKey: ["bosses-all", serverId] });
                queryClient.invalidateQueries({ queryKey: ["bosses"] });
              }}
              onCancel={() => setShowAddBoss(false)}
            />
          </div>
        )}
        {bosses.length === 0 ? (
          <p className="text-sm text-[#71717a] py-4 text-center">No bosses in this server yet.</p>
        ) : (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
              <input
                type="text"
                placeholder="Search bosses..."
                value={bossSearch}
                onChange={e => setBossSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"
              />
            </div>
          <div className="space-y-1">
            {(() => {
              const searchFilter = (b: Boss) => !bossSearch.trim() || b.name.toLowerCase().includes(bossSearch.toLowerCase());
              const active = bosses.filter(b => b.is_enabled && searchFilter(b));
              const disabled = bosses.filter(b => !b.is_enabled && searchFilter(b));
              const renderRow = (boss: Boss) => (
                <Fragment key={boss.id}>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a]">
                <BossImage bossName={boss.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#fafafa] truncate">{boss.name}</span>
                    {boss.is_custom ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#27272a] text-[#a1a1aa]">Custom</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#18181b] border border-[#27272a] text-[#71717a]">Seeded</span>
                    )}
                  </div>
                  <span className="text-xs text-[#71717a]">
                    {boss.spawn_type === "fixed_hours" ? `${boss.respawn_hours ?? "?"}h respawn` : "Schedule"}
                    {" · "}{boss.is_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleBoss(boss.id, !boss.is_enabled)}
                      className="p-1 rounded hover:bg-[#27272a] transition"
                      title={boss.is_enabled ? "Disable" : "Enable"}
                    >
                      {boss.is_enabled ? (
                        <ToggleRight className="w-4 h-4 text-[#a1a1aa]" />
                      ) : (
                        <ToggleLeft className="w-4 h-4 text-[#52525b]" />
                      )}
                    </button>
                    {canManage && (
                      <button
                        onClick={() => setEditingBossId(editingBossId === boss.id ? null : boss.id)}
                        className="p-1 rounded hover:bg-[#27272a] transition"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[#a1a1aa]" />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget({ type: "boss", id: boss.id, name: boss.name })}
                      className="p-1 rounded hover:bg-[#27272a] transition"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[#71717a] hover:text-[#f87171]" />
                    </button>
                  </div>
                )}
              </div>
              {/* Edit form appears below this boss */}
              <div className={`grid transition-all duration-300 ease-in-out ${editingBossId === boss.id ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 overflow-hidden"}`}>
                <div className="overflow-hidden">
                  <EditBossForm
                    boss={{
                    id: boss.id,
                    name: boss.name,
                    spawn_type: boss.spawn_type as string,
                    respawn_hours: boss.respawn_hours ?? null,
                    schedule: boss.schedule ?? null,
                    is_recurring: boss.is_recurring ?? true,
                    points: boss.boss_points ?? boss.points ?? 1,
                    category: boss.category ?? null,
                    tags: boss.tags ?? [],
                    image_url: boss.image_url ?? null,
                  } as any}
                  gameSlug=""
                  serverId={serverId}
                  onSaved={() => {
                    setEditingBossId(null);
                    queryClient.invalidateQueries({ queryKey: ["bosses-all", serverId] });
                    queryClient.invalidateQueries({ queryKey: ["bosses"] });
                  }}
                  onCancel={() => setEditingBossId(null)}
                />
                </div>
              </div>
              </Fragment>
              );
              return (
                <>
                  {active.map(renderRow)}
                  {disabled.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 pt-4 pb-1">
                        <span className="text-[10px] text-[#71717a] uppercase tracking-wider">Disabled</span>
                        <div className="flex-1 h-px bg-[#27272a]" />
                      </div>
                      {disabled.map(renderRow)}
                    </>
                  )}
                </>
              );
            })()}
          </div>
          </>
        )}
      </section>
      )}

      {/* ── Activities Section ── */}
      {mode !== "bosses" && (
      <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#a1a1aa]" />
            <h3 className="text-sm font-semibold text-[#fafafa]">Activities ({activities.length})</h3>
          </div>
          {canManage && (
            <button
              onClick={() => setShowAddActivity(!showAddActivity)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition"
            >
              <Plus className="w-3 h-3" />
              Add Activity
            </button>
          )}
        </div>
        {showAddActivity && canManage && (
          <div className="mb-3">
            <AddActivityForm
              serverId={serverId}
              gameId=""
              gameSlug=""
              timezone={currentServer?.timezone}
              onCreated={() => {
                setShowAddActivity(false);
                queryClient.invalidateQueries({ queryKey: ["activities-all", serverId] });
                queryClient.refetchQueries({ queryKey: ["activities-all", serverId] });
                queryClient.invalidateQueries({ queryKey: ["activities"] });
                queryClient.invalidateQueries({ queryKey: ["activity-guilds", serverId] });
                queryClient.invalidateQueries({ queryKey: ["activity-points"] });
              }}
              onCancel={() => setShowAddActivity(false)}
            />
          </div>
        )}
        {activities.length === 0 ? (
          <p className="text-sm text-[#71717a] py-4 text-center">No activities in this server yet.</p>
        ) : (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
              <input
                type="text"
                placeholder="Search activities..."
                value={activitySearch}
                onChange={e => setActivitySearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"
              />
            </div>
          <div className="space-y-1">
            {(() => {
              const searchFilter = (a: Activity) => !activitySearch.trim() || a.name.toLowerCase().includes(activitySearch.toLowerCase());
              const active = activities.filter(a => a.is_enabled && searchFilter(a));
              const disabled = activities.filter(a => !a.is_enabled && searchFilter(a));
              const renderRow = (activity: Activity) => (
                <Fragment key={activity.id}>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a]">
                {activity.image_url ? (
                  <img src={activity.image_url} alt={activity.name} className="w-8 h-8 rounded-lg object-cover border border-[#27272a] shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-[#09090b] border border-[#27272a] flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-[#52525b]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#fafafa] truncate">{activity.name}</span>
                    {activity.is_custom ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#27272a] text-[#a1a1aa]">Custom</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#18181b] border border-[#27272a] text-[#71717a]">Seeded</span>
                    )}
                  </div>
                  <span className="text-xs text-[#71717a]">
                    {activity.schedule_type} · {activity.points_per_participant}pts
                    {activity.party_size ? ` · Party: ${activity.party_size}` : ""}
                  </span>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleActivity(activity.id, !activity.is_enabled)}
                      className="p-1 rounded hover:bg-[#27272a] transition"
                      title={activity.is_enabled ? "Disable" : "Enable"}
                    >
                      {activity.is_enabled ? (
                        <ToggleRight className="w-4 h-4 text-[#a1a1aa]" />
                      ) : (
                        <ToggleLeft className="w-4 h-4 text-[#52525b]" />
                      )}
                    </button>
                    {activity.is_custom && (
                      <button
                        onClick={() => setEditingActivityId(editingActivityId === activity.id ? null : activity.id)}
                        className="p-1 rounded hover:bg-[#27272a] transition"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[#a1a1aa]" />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget({ type: "activity", id: activity.id, name: activity.name })}
                      className="p-1 rounded hover:bg-[#27272a] transition"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[#71717a] hover:text-[#f87171]" />
                    </button>
                  </div>
                )}
              </div>
              {/* Edit form appears below this activity */}
              <div className={`grid transition-all duration-300 ease-in-out ${editingActivityId === activity.id && activity.is_custom ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 overflow-hidden"}`}>
                <div className="overflow-hidden">
                  <EditActivityForm
                    activity={{
                      id: activity.id,
                      name: activity.name,
                      schedule_type: activity.schedule_type,
                      schedule: activity.schedule ?? null,
                      duration_minutes: activity.duration_minutes ?? null,
                      points_per_participant: activity.points_per_participant,
                      party_size: activity.party_size ?? null,
                      category: (activity as any).category ?? null,
                      tags: (activity as any).tags ?? [],
                      image_url: activity.image_url ?? null,
                    }}
                    gameSlug=""
                    serverId={serverId}
                    timezone={currentServer?.timezone}
                    onSaved={() => {
                      setEditingActivityId(null);
                      queryClient.invalidateQueries({ queryKey: ["activities-all", serverId] });
                      queryClient.invalidateQueries({ queryKey: ["activities"] });
                      queryClient.invalidateQueries({ queryKey: ["activity-guilds", serverId] });
                      queryClient.invalidateQueries({ queryKey: ["activity-points"] });
                    }}
                    onCancel={() => setEditingActivityId(null)}
                  />
                </div>
              </div>
              </Fragment>
              );
              return (
                <>
                  {active.map(renderRow)}
                  {disabled.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 pt-4 pb-1">
                        <span className="text-[10px] text-[#71717a] uppercase tracking-wider">Disabled</span>
                        <div className="flex-1 h-px bg-[#27272a]" />
                      </div>
                      {disabled.map(renderRow)}
                    </>
                  )}
                </>
              );
            })()}
          </div>
          </>
        )}
      </section>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          title={`${deleteTarget.type === "boss" ? "Delete Boss" : "Delete Activity"}`}
          message={deleteTarget.type === "activity"
            ? `Deleting "${deleteTarget.name}" will hide it permanently. All history and schedule data will be preserved.`
            : `Deleting "${deleteTarget.name}" will hide it permanently. All history and schedule data will be preserved.`
          }
          confirmLabel={deleteTarget.type === "activity" ? "Delete" : "Delete"}
          confirmText={deleteTarget.name}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}