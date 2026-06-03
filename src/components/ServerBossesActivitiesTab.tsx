import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { useHasPermission } from "@/contexts/ServerContext";
import {
  fetchAllBossesForServer, fetchAllActivitiesForServer,
  updateCustomBoss, updateCustomActivity,
  toggleBossEnabled, toggleActivityEnabled,
  supabase, fetchGames,
} from "@/lib/supabase";
import { AddBossForm } from "@/components/AddBossForm";
import { AddActivityForm } from "@/components/AddActivityForm";
import { EditBossForm } from "@/components/EditBossForm";
import { EditActivityForm } from "@/components/EditActivityForm";
import {
  Loader2, Plus, Skull, Calendar, RefreshCw,
  Pencil, ToggleLeft, ToggleRight, AlertTriangle,
  Gamepad2, X, Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Boss, Activity } from "@/types";

export function ServerBossesActivitiesTab() {
  const { currentServer } = useServer();
  const { userRole } = useAuth();
  const hasPerm = useHasPermission("can_manage_boss_guilds");
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
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const table = deleteTarget.type === "boss" ? "bosses" : "activities";
    const queryKey = deleteTarget.type === "boss" ? "bosses-all" : "activities-all";
    await supabase.from(table).delete().eq("id", deleteTarget.id);
    queryClient.invalidateQueries({ queryKey: [queryKey, serverId] });
    queryClient.refetchQueries({ queryKey: [queryKey, serverId] });
    queryClient.invalidateQueries({ queryKey: [deleteTarget.type === "boss" ? "bosses" : "activities"] });
    setDeleteTarget(null);
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
          <div className="space-y-1">
            {bosses.map((boss: Boss) => (
              <div key={boss.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a]">
                {boss.image_url ? (
                  <img src={boss.image_url} alt={boss.name} className="w-8 h-8 rounded-lg object-cover border border-[#27272a] shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-[#09090b] border border-[#27272a] flex items-center justify-center shrink-0">
                    <Skull className="w-4 h-4 text-[#52525b]" />
                  </div>
                )}
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
                    {boss.is_custom && (
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
            ))}
            {/* Inline EditBossForm */}
            {editingBossId && (() => {
              const boss = bosses.find(b => b.id === editingBossId);
              if (!boss) return null;
              return (
                <div className="mt-1">
                  <EditBossForm
                    boss={{
                      id: boss.id,
                      name: boss.name,
                      spawn_type: boss.spawn_type,
                      respawn_hours: boss.respawn_hours ?? null,
                      schedule: boss.schedule ?? null,
                      is_recurring: boss.is_recurring ?? true,
                      points: boss.boss_points ?? boss.points ?? 1,
                      category: boss.category ?? null,
                      tags: boss.tags ?? [],
                      image_url: boss.image_url ?? null,
                    }}
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
              );
            })()}
          </div>
        )}
      </section>

      {/* ── Activities Section ── */}
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
              onCreated={() => {
                setShowAddActivity(false);
                queryClient.invalidateQueries({ queryKey: ["activities-all", serverId] });
                queryClient.invalidateQueries({ queryKey: ["activities"] });
              }}
              onCancel={() => setShowAddActivity(false)}
            />
          </div>
        )}
        {activities.length === 0 ? (
          <p className="text-sm text-[#71717a] py-4 text-center">No activities in this server yet.</p>
        ) : (
          <div className="space-y-1">
            {activities.map((activity: Activity) => (
              <div key={activity.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a]">
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
                    {" · "}{activity.is_enabled ? "Enabled" : "Disabled"}
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
            ))}
            {/* Inline EditActivityForm */}
            {editingActivityId && (() => {
              const act = activities.find(a => a.id === editingActivityId);
              if (!act) return null;
              return (
                <div className="mt-1">
                  <EditActivityForm
                    activity={{
                      id: act.id,
                      name: act.name,
                      schedule_type: act.schedule_type,
                      schedule: act.schedule ?? null,
                      duration_minutes: act.duration_minutes ?? null,
                      points_per_participant: act.points_per_participant,
                      party_size: act.party_size ?? null,
                      category: act.category ?? null,
                      tags: act.tags ?? [],
                      image_url: null,
                    }}
                    gameSlug=""
                    serverId={serverId}
                    onSaved={() => {
                      setEditingActivityId(null);
                      queryClient.invalidateQueries({ queryKey: ["activities-all", serverId] });
                      queryClient.invalidateQueries({ queryKey: ["activities"] });
                    }}
                    onCancel={() => setEditingActivityId(null)}
                  />
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          title={`Delete ${deleteTarget.type === "boss" ? "Boss" : "Activity"}`}
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}