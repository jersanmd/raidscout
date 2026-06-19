import { useState, useEffect, useRef, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { useHasPermission } from "@/contexts/ServerContext";
import { useToast } from "@/contexts/ToastContext";
import {
  fetchAllBossesForServer, fetchAllActivitiesForServer,
  updateCustomBoss, updateCustomActivity,
  toggleBossEnabled, toggleActivityEnabled,
  supabase, fetchGames, fetchGuilds, setBossGuilds, setActivityGuilds,
  writeAuditEntry, AuditAction,
} from "@/lib/supabase";
import { AddBossForm } from "@/components/AddBossForm";
import { BossImage } from "@/components/BossImage";
import { AddActivityForm } from "@/components/AddActivityForm";
import { EditBossForm } from "@/components/EditBossForm";
import { EditActivityForm } from "@/components/EditActivityForm";
import {
  Loader2, Plus, Skull, Calendar, RefreshCw,
  Pencil, ToggleLeft, ToggleRight, AlertTriangle,
  Gamepad2, X, Trash2, Search, ChevronUp, ChevronDown,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Boss, Activity, Guild } from "@/types";

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
  const [activityFilter, setActivityFilter] = useState<"all" | "seeded" | "custom">("all");
  const [bossSearch, setBossSearch] = useState("");
  const [bossFilter, setBossFilter] = useState<"all" | "seeded" | "custom">("all");
  const { toast } = useToast();

  // Guild assignment state for Add Boss form
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildMode, setGuildMode] = useState<"none" | "rotation" | "daily" | "schedule">("rotation");
  const [selectedGuildIds, setSelectedGuildIds] = useState<string[]>([]);
  const [scheduleDays, setScheduleDays] = useState<Record<number, string | null>>({});
  const [submittingGuilds, setSubmittingGuilds] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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

  // Fetch guilds for assignment
  useEffect(() => {
    if (serverId) {
      fetchGuilds(serverId).then(setGuilds).catch(() => setGuilds([]));
    }
  }, [serverId]);

  // Auto-select first guild as default for rotation
  useEffect(() => {
    if (guilds.length > 0 && selectedGuildIds.length === 0) {
      setSelectedGuildIds([guilds[0].id]);
    }
  }, [guilds]);

  const handleAssignGuilds = async (bossId: string) => {
    if (guildMode === "none") return;
    setSubmittingGuilds(true);
    try {
      if (guildMode === "schedule") {
        const assignments = Object.entries(scheduleDays)
          .filter(([, gid]) => gid !== null && gid !== undefined)
          .map(([day, gid]) => ({ guild_id: gid as string, day_of_week: parseInt(day) }));
        if (assignments.length > 0) await setBossGuilds(bossId, assignments, "schedule");
      } else {
        if (selectedGuildIds.length === 0) { setSubmittingGuilds(false); return; }
        const assignments = selectedGuildIds.map((gid, i) => ({ guild_id: gid, sort_order: i + 1 }));
        await setBossGuilds(bossId, assignments, guildMode);
      }
    } catch (err) {
      console.error("[ServerBossesActivitiesTab] Guild assignment failed:", err);
    } finally {
      setSubmittingGuilds(false);
    }
  };

  const addGuild = (guildId: string) => {
    if (!guildId || selectedGuildIds.includes(guildId)) return;
    setSelectedGuildIds(prev => [...prev, guildId]);
  };
  const removeGuild = (guildId: string) => setSelectedGuildIds(prev => prev.filter(id => id !== guildId));
  const moveGuild = (guildId: string, direction: "up" | "down") => {
    setSelectedGuildIds(prev => {
      const idx = prev.indexOf(guildId);
      if (idx === -1) return prev;
      const next = [...prev];
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };
  const availableGuilds = guilds.filter(g => !selectedGuildIds.includes(g.id));

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
        writeAuditEntry({ action: AuditAction.BOSS_DELETE, server_id: serverId, target_id: deleteTarget.id, details: { boss_name: deleteTarget.name } });
      } else if (deleteTarget.type === "activity") {
        const { data, error } = await supabase.from("activities").update({ deleted_at: new Date().toISOString(), is_enabled: false }).eq("id", deleteTarget.id).select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("No rows updated — you may not have permission.");
        writeAuditEntry({ action: AuditAction.ACTIVITY_DELETE, server_id: serverId, target_id: deleteTarget.id, details: { activity_name: deleteTarget.name } });
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
      writeAuditEntry({ action: AuditAction.SEED_FROM_GAME, server_id: serverId, details: { game_id: selectedGameId, bosses: (data as any).b, activities: (data as any).a } });
      setSeedResult(`Seeded ${(data as any).b} bosses and ${(data as any).a} activities from templates.`);
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
            <h3 className="text-sm font-semibold text-[#fafafa]">Bosses ({(() => {
              let c = bosses;
              if (bossFilter === "seeded") c = c.filter(b => !b.is_custom);
              if (bossFilter === "custom") c = c.filter(b => b.is_custom);
              if (bossSearch.trim()) c = c.filter(b => b.name.toLowerCase().includes(bossSearch.toLowerCase()));
              return c.length;
            })()}{bossFilter !== "all" || bossSearch.trim() ? ` of ${bosses.length}` : ""})</h3>
            <select
              value={bossFilter}
              onChange={e => setBossFilter(e.target.value as typeof bossFilter)}
              className="px-2 py-1 rounded-md text-[11px] bg-[#18181b] border border-[#27272a] text-[#a1a1aa] focus:outline-none focus:border-[#52525b] cursor-pointer ml-1"
            >
              <option value="all">All</option>
              <option value="seeded">Seeded</option>
              <option value="custom">Custom</option>
            </select>
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
          <div className="mb-3 bg-[#18181b] border border-[#27272a] rounded-lg p-3 space-y-3">
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
              onCreatedWithId={handleAssignGuilds}
              hideSubmitButton
              formRef={formRef}
            />

            {/* Guild Assignment Section */}
            {guilds.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-[#fafafa]">Guild Assignment</h3>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#71717a] w-10">Mode:</span>
                  <select
                    value={guildMode}
                    onChange={(e) => {
                      setGuildMode(e.target.value as "none" | "rotation" | "daily" | "schedule");
                      setSelectedGuildIds([]);
                      setScheduleDays({});
                    }}
                    className="flex-1 bg-[#09090b] border border-[#3f3f46] rounded px-2 py-1.5 text-xs text-[#fafafa] outline-none focus:ring-1 focus:ring-[#52525b]"
                  >
                    <option value="none">None</option>
                    <option value="rotation">Rotation (per kill)</option>
                    <option value="daily">Daily (per day)</option>
                    <option value="schedule">Schedule</option>
                  </select>
                </div>

                {(guildMode === "rotation" || guildMode === "daily") && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-[#71717a]">Guild order (first → last):</p>
                    {selectedGuildIds.map((gid, idx) => {
                      const g = guilds.find(x => x.id === gid);
                      return (
                        <div key={gid} className="flex items-center gap-1 bg-[#09090b]/50 rounded px-2 py-1.5">
                          <span className="text-[10px] text-[#71717a] w-4">{idx + 1}.</span>
                          <span className="text-xs text-[#e4e4e7] flex-1">{g?.name ?? "Unknown"}</span>
                          <button onClick={() => moveGuild(gid, "up")} disabled={idx === 0} className="p-0.5 text-[#71717a] hover:text-[#a1a1aa] disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                          <button onClick={() => moveGuild(gid, "down")} disabled={idx === selectedGuildIds.length - 1} className="p-0.5 text-[#71717a] hover:text-[#a1a1aa] disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                          <button onClick={() => removeGuild(gid)} className="p-0.5 text-[#71717a] hover:text-[#f87171]"><X className="w-3 h-3" /></button>
                        </div>
                      );
                    })}
                    {availableGuilds.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => addGuild(e.target.value)}
                        className="w-full bg-[#09090b] border border-[#3f3f46] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none focus:ring-1 focus:ring-[#52525b]"
                      >
                        <option value="">+ Add guild...</option>
                        {availableGuilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    )}
                  </div>
                )}

                {guildMode === "schedule" && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-[#71717a]">Assign a guild per day:</p>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] text-[#71717a] w-8">{day}</span>
                        <select
                          value={scheduleDays[i] ?? ""}
                          onChange={(e) => setScheduleDays(prev => ({ ...prev, [i]: e.target.value || null }))}
                          className="flex-1 bg-[#09090b] border border-[#3f3f46] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none focus:ring-1 focus:ring-[#52525b]"
                        >
                          <option value="">—</option>
                          {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                {submittingGuilds && (
                  <p className="text-[10px] text-[#71717a]">Assigning guilds to boss...</p>
                )}
              </div>
            )}

            {/* Footer Add button */}
            <button
              onClick={() => formRef.current?.requestSubmit()}
              disabled={submittingGuilds}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submittingGuilds ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : "Add Boss"}
            </button>
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
              const searchFilter = (b: Boss) => {
                if (bossSearch.trim() && !b.name.toLowerCase().includes(bossSearch.toLowerCase())) return false;
                if (bossFilter === "seeded" && b.is_custom) return false;
                if (bossFilter === "custom" && !b.is_custom) return false;
                return true;
              };
              const active = bosses.filter(b => b.is_enabled && searchFilter(b));
              const disabled = bosses.filter(b => !b.is_enabled && searchFilter(b));
              const renderRow = (boss: Boss) => (
                <Fragment key={boss.id}>
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a]">
                <BossImage bossName={boss.name} imageUrl={boss.image_url} size="sm" />
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
              {/* Edit form appears below this boss — only rendered when editing */}
              {editingBossId === boss.id && (
                <div className="mb-1">
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
              )}
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
            <h3 className="text-sm font-semibold text-[#fafafa]">Activities ({(() => {
              let c = activities;
              if (activityFilter === "seeded") c = c.filter(a => !a.is_custom);
              if (activityFilter === "custom") c = c.filter(a => a.is_custom);
              if (activitySearch.trim()) c = c.filter(a => a.name.toLowerCase().includes(activitySearch.toLowerCase()));
              return c.length;
            })()}{activityFilter !== "all" || activitySearch.trim() ? ` of ${activities.length}` : ""})</h3>
            <select
              value={activityFilter}
              onChange={e => setActivityFilter(e.target.value as typeof activityFilter)}
              className="px-2 py-1 rounded-md text-[11px] bg-[#18181b] border border-[#27272a] text-[#a1a1aa] focus:outline-none focus:border-[#52525b] cursor-pointer ml-1"
            >
              <option value="all">All</option>
              <option value="seeded">Seeded</option>
              <option value="custom">Custom</option>
            </select>
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
          <div className="mb-3 bg-[#18181b] border border-[#27272a] rounded-lg p-3 space-y-3">
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
              onCreatedWithId={async (activityId) => {
                if (guildMode === "none") return;
                setSubmittingGuilds(true);
                try {
                  if (guildMode === "schedule") {
                    const assignments = Object.entries(scheduleDays)
                      .filter(([, gid]) => gid !== null && gid !== undefined)
                      .map(([day, gid]) => ({ guild_id: gid as string, day_of_week: parseInt(day) }));
                    if (assignments.length > 0) await setActivityGuilds(activityId, assignments, "schedule", serverId);
                  } else {
                    if (selectedGuildIds.length === 0) return;
                    const assignments = selectedGuildIds.map((gid, i) => ({ guild_id: gid, sort_order: i + 1 }));
                    await setActivityGuilds(activityId, assignments, guildMode, serverId);
                  }
                } catch (err) {
                  console.error("[ServerBossesActivitiesTab] Activity guild assignment failed:", err);
                } finally {
                  setSubmittingGuilds(false);
                }
              }}
              hideSubmitButton
              formRef={formRef}
            />

            {/* Guild Assignment Section */}
            {guilds.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-[#fafafa]">Guild Assignment</h3>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#71717a] w-10">Mode:</span>
                  <select
                    value={guildMode}
                    onChange={(e) => {
                      setGuildMode(e.target.value as "none" | "rotation" | "daily" | "schedule");
                      setSelectedGuildIds([]);
                      setScheduleDays({});
                    }}
                    className="flex-1 bg-[#09090b] border border-[#3f3f46] rounded px-2 py-1.5 text-xs text-[#fafafa] outline-none focus:ring-1 focus:ring-[#52525b]"
                  >
                    <option value="none">None</option>
                    <option value="rotation">Rotation (per kill)</option>
                    <option value="daily">Daily (per day)</option>
                    <option value="schedule">Schedule</option>
                  </select>
                </div>

                {(guildMode === "rotation" || guildMode === "daily") && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-[#71717a]">Guild order (first → last):</p>
                    {selectedGuildIds.map((gid, idx) => {
                      const g = guilds.find(x => x.id === gid);
                      return (
                        <div key={gid} className="flex items-center gap-1 bg-[#09090b]/50 rounded px-2 py-1.5">
                          <span className="text-[10px] text-[#71717a] w-4">{idx + 1}.</span>
                          <span className="text-xs text-[#e4e4e7] flex-1">{g?.name ?? "Unknown"}</span>
                          <button onClick={() => moveGuild(gid, "up")} disabled={idx === 0} className="p-0.5 text-[#71717a] hover:text-[#a1a1aa] disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                          <button onClick={() => moveGuild(gid, "down")} disabled={idx === selectedGuildIds.length - 1} className="p-0.5 text-[#71717a] hover:text-[#a1a1aa] disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                          <button onClick={() => removeGuild(gid)} className="p-0.5 text-[#71717a] hover:text-[#f87171]"><X className="w-3 h-3" /></button>
                        </div>
                      );
                    })}
                    {availableGuilds.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => addGuild(e.target.value)}
                        className="w-full bg-[#09090b] border border-[#3f3f46] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none focus:ring-1 focus:ring-[#52525b]"
                      >
                        <option value="">+ Add guild...</option>
                        {availableGuilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    )}
                  </div>
                )}

                {guildMode === "schedule" && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-[#71717a]">Assign a guild per day:</p>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] text-[#71717a] w-8">{day}</span>
                        <select
                          value={scheduleDays[i] ?? ""}
                          onChange={(e) => setScheduleDays(prev => ({ ...prev, [i]: e.target.value || null }))}
                          className="flex-1 bg-[#09090b] border border-[#3f3f46] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none focus:ring-1 focus:ring-[#52525b]"
                        >
                          <option value="">—</option>
                          {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                {submittingGuilds && (
                  <p className="text-[10px] text-[#71717a]">Assigning guilds to activity...</p>
                )}
              </div>
            )}

            {/* Footer Add button */}
            <button
              onClick={() => formRef.current?.requestSubmit()}
              disabled={submittingGuilds}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submittingGuilds ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : "Add Activity"}
            </button>
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
              const searchFilter = (a: Activity) => {
                if (activitySearch.trim() && !a.name.toLowerCase().includes(activitySearch.toLowerCase())) return false;
                if (activityFilter === "seeded" && a.is_custom) return false;
                if (activityFilter === "custom" && !a.is_custom) return false;
                return true;
              };
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
              {/* Edit form appears below this activity — only rendered when editing */}
              {editingActivityId === activity.id && activity.is_custom && (
                <div className="mb-1">
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
              )}
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