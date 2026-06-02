import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { deleteServer, transferServerOwnership, removeServerModerator, addServerModerator, supabase, fetchServerMembers, type ServerMember, fetchGuilds, createGuild, updateGuildName, deleteGuild, fetchBossGuilds, setBossGuilds, fetchAllBossGuildsForServer, upsertBossGuildPoints, batchSetGuildSalary, fetchBosses, setBossPoints, setBossSalary, notifyDiscord, fetchModeratorPermissions, updateModeratorPermissions, updateThreadConfig, type ModeratorPermissions, DEFAULT_MODERATOR_PERMISSIONS } from "@/lib/supabase";
import type { Guild, BossGuild, Boss } from "@/types";
import { Loader2, Trash2, Crown, ArrowLeft, Server, Check, Key, Copy, RefreshCw, Plus, LogIn, Users, Bell, Link, Settings, AlertTriangle, X, Shield, Pencil, Swords, ChevronUp, ChevronDown, CheckSquare, Square, Eye, EyeOff, UserPlus, Minus, Trophy, Send, Save, MessageCircle } from "lucide-react";
import { CreateServerModal } from "@/components/CreateServerModal";
import { useToast } from "@/contexts/ToastContext";

export function ServerSettingsView() {
  const { currentServer, servers, loading: serversLoading, setCurrentServer, refreshServers, bumpWebhookVersion } = useServer();
  const { user, userRole, isViewer } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Permission hierarchy: parent → children
  const PERMISSION_HIERARCHY: Record<string, string[]> = {
    can_access_settings: ["can_change_timezone", "can_access_integrations", "can_manage_viewer_key"],
    can_manage_guilds: ["can_manage_boss_guilds"],
    can_record_death: ["can_edit_death_records", "can_edit_participants", "can_set_spawn", "can_rotate_guilds"],
    can_manage_moderators: ["can_manage_raid_members", "can_adjust_points", "can_export_attendance"],
  };

  // Reverse map: child → parent
  const PERMISSION_PARENT: Record<string, string> = {};
  for (const [parent, children] of Object.entries(PERMISSION_HIERARCHY)) {
    for (const child of children) {
      PERMISSION_PARENT[child] = parent;
    }
  }

  // Permission labels grouped by section with hierarchy (indent)
  const PERMISSION_SECTIONS = [
    { section: "Server Access", items: [
      { key: "can_access_settings" as const, label: "Access Server Settings", indent: false, parent: true },
      { key: "can_change_timezone" as const, label: "Change Timezone", indent: true, parent: false },
      { key: "can_access_integrations" as const, label: "Access Integrations", indent: true, parent: false },
      { key: "can_manage_viewer_key" as const, label: "Manage Viewer Key", indent: true, parent: false },
    ]},
    { section: "Guilds", items: [
      { key: "can_manage_guilds" as const, label: "Manage Guilds", indent: false, parent: true },
      { key: "can_manage_boss_guilds" as const, label: "Boss-Guild Assignments", indent: true, parent: false },
    ]},
    { section: "Boss Actions", items: [
      { key: "can_record_death" as const, label: "Record Boss Kills", indent: false, parent: true },
      { key: "can_edit_death_records" as const, label: "Edit/Delete Death Records", indent: true, parent: false },
      { key: "can_edit_participants" as const, label: "Edit Kill Participants", indent: true, parent: false },
      { key: "can_set_spawn" as const, label: "Set Spawn Overrides", indent: true, parent: false },
      { key: "can_rotate_guilds" as const, label: "Rotate Guild Assignments", indent: true, parent: false },
    ]},
    { section: "Members & Points", items: [
      { key: "can_manage_moderators" as const, label: "Manage Moderators", indent: false, parent: true },
      { key: "can_manage_raid_members" as const, label: "Manage Raid Members", indent: true, parent: false },
      { key: "can_adjust_points" as const, label: "Adjust Points", indent: true, parent: false },
      { key: "can_export_attendance" as const, label: "Export Attendance", indent: true, parent: false },
    ]},
    { section: "Discord", items: [
      { key: "can_announce_discord" as const, label: "Announce 24h Spawns to Discord", indent: false, parent: false },
    ]},
  ];

  // Redirect viewers — they have no business in settings
  useEffect(() => {
    if (isViewer) {
      navigate("/", { replace: true });
    }
  }, [isViewer, navigate]);

  // Redirect if no server selected and not admin (but wait for loading to finish)
  useEffect(() => {
    if (serversLoading) return;
    if (!currentServer && userRole !== "admin") {
      navigate("/", { replace: true });
    }
  }, [currentServer, userRole, navigate, serversLoading]);

  // Sync form fields when current server changes
  useEffect(() => {
    if (currentServer) {
      setName(currentServer.name);
      setTransferId("");
      setShowDeleteConfirm(false);
      setDeleteConfirmName("");
      // Fetch members
      setMembersLoading(true);
      fetchServerMembers(currentServer.id)
        .then(setMembers)
        .catch(() => setMembers([]))
        .finally(() => setMembersLoading(false));
      // Fetch guilds
      setGuildsLoading(true);
      fetchGuilds(currentServer.id)
        .then(setGuilds)
        .catch(() => setGuilds([]))
        .finally(() => setGuildsLoading(false));
      // Fetch bosses + guild assignments + boss points matrix
      setBossGuildsLoading(true);
      Promise.all([
        fetchBosses(currentServer.id),
        fetchBossGuilds(currentServer.id),
        fetchAllBossGuildsForServer(currentServer.id),
      ]).then(([b, bg, abg]) => {
        setBosses(b);
        setBossGuildsState(bg);
        setAllBossGuilds(abg);
        // Initialize bossModes from data
        const modes: Record<string, "none" | "rotation" | "schedule" | "daily"> = {};
        for (const boss of b) {
          const bgs = bg.filter(x => x.boss_id === boss.id);
          if (bgs.length === 0) modes[boss.id] = "none";
          else if (bgs[0].mode === "daily") modes[boss.id] = "daily";
          else if (bgs[0].mode === "schedule") modes[boss.id] = "schedule";
          else if (bgs[0].sort_order !== null) modes[boss.id] = "rotation";
          else modes[boss.id] = "none";
        }
        setBossModes(modes);
      })
        .catch(() => { setBosses([]); setBossGuildsState([]); setAllBossGuilds([]); })
        .finally(() => setBossGuildsLoading(false));
      // Fetch Discord bot configs
      (async () => {
        try {
          const { data } = await supabase
            .from("discord_configs")
            .select("*")
            .eq("raidscout_server_id", currentServer.id)
            .order("created_at");
          setDiscordLinks(data || []);
        } catch { /* ignore */ }
      })();
    }
  }, [currentServer?.id]);

  const [name, setName] = useState(currentServer?.name ?? "");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [transferId, setTransferId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(currentServer?.discord_webhook_url ?? "");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [notifPrefix, setNotifPrefix] = useState(currentServer?.notification_prefix ?? "@everyone");
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [modEmail, setModEmail] = useState("");
  const [addingMod, setAddingMod] = useState(false);
  const [viewerKey, setViewerKey] = useState("");
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [showViewerKey, setShowViewerKey] = useState(false);
  const [discordLinks, setDiscordLinks] = useState<{ id: string; discord_guild_id: string; label?: string; webhook_url?: string; command_prefix?: string; notification_channel_id?: string; command_channel_id?: string; thread_channel_id?: string; thread_guilds?: string[]; notification_prefix?: string }[]>([]);
  const [newDiscordId, setNewDiscordId] = useState("");
  const [newDiscordLabel, setNewDiscordLabel] = useState("");
  const [newDiscordPrefix, setNewDiscordPrefix] = useState("!");
  const [savingDiscord, setSavingDiscord] = useState(false);
  const [usedPrefixes, setUsedPrefixes] = useState(new Set());
  const [editAliasLinkId, setEditAliasLinkId] = useState<string | null>(null);
  const [editAliases, setEditAliases] = useState<Record<string, string>>({});
  const [channelValues, setChannelValues] = useState<Record<string, { notif: string; cmd: string }>>({});
  const [pingValues, setPingValues] = useState<Record<string, string>>({});
  const [threadValues, setThreadValues] = useState<Record<string, { channelId: string; guilds: string[] }>>({});
  const [testingDiscord, setTestingDiscord] = useState<Set<string>>(new Set());
  const [expandedModPerms, setExpandedModPerms] = useState<string | null>(null); // user_id of expanded moderator
  const [modPermsData, setModPermsData] = useState<Record<string, ModeratorPermissions>>({}); // loaded permissions per user
  const [savingPerms, setSavingPerms] = useState<string | null>(null); // user_id being saved
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = (tabParam === "general" || tabParam === "members" || tabParam === "integrations" || tabParam === "danger" || tabParam === "boss-points")
    ? tabParam
    : "general";
  const [tab, setTab] = useState<string>(initialTab);

  useEffect(() => {
    const gid = newDiscordId.trim();
    if (!gid) { setUsedPrefixes(new Set()); return; }
    supabase.from("discord_configs").select("command_prefix").eq("discord_guild_id", gid)
      .then(({ data }) => setUsedPrefixes(new Set((data || []).map((d: any) => d.command_prefix))));
  }, [newDiscordId]);

  // Highlight Discord Server ID input when navigated from banner
  const discordIdInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (highlight === "discord-id" && discordIdInputRef.current) {
      // Switch to integrations tab
      setTab("integrations");
      // Scroll to and highlight the input after render
      setTimeout(() => {
        discordIdInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        discordIdInputRef.current?.classList.add("animate-highlight-input");
        discordIdInputRef.current?.focus();
      }, 200);
      // Remove the highlight param from URL without reload
      const params = new URLSearchParams(searchParams);
      params.delete("highlight");
      window.history.replaceState(null, "", `?${params.toString()}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Boss-Guild state
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [bossGuilds, setBossGuildsState] = useState<BossGuild[]>([]);
  const [bossGuildsLoading, setBossGuildsLoading] = useState(false);

  // Boss Points matrix state
  const [allBossGuilds, setAllBossGuilds] = useState<BossGuild[]>([]);
  const [bossPointsLoading, setBossPointsLoading] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null); // "bossId-guildId" while saving

  // Boss priority ordering (for display in Boss Guilds tab)
  const BOSS_PRIORITY = [
    "Venatus", "Viorent", "Ego", "Clemantis", "Livera", "Araneo", "Undomiel",
    "Saphirus", "Neutro", "Lady Dalia", "General Aquleus", "Thymele", "Amentis",
    "Baron", "Milavy", "Wannitas", "Metus", "Duplican", "Shuliar", "Ringor",
    "Roderick", "Gareth", "Titore", "Larba", "Catena", "Auraq", "Secreta",
    "Ordo", "Asta", "Supore", "Chaiflock", "Benji", "Libitina", "Rakajeth",
    "Icaruthia", "Motti", "Nevaeh", "Tumier", "Lucus",
  ];

  const sortedBosses = useMemo(() => {
    return [...bosses].sort((a, b) => {
      const ia = BOSS_PRIORITY.indexOf(a.name);
      const ib = BOSS_PRIORITY.indexOf(b.name);
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [bosses]);

  // Guilds state
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [newGuildName, setNewGuildName] = useState("");
  const [addingGuild, setAddingGuild] = useState(false);
  const [editingGuildId, setEditingGuildId] = useState<string | null>(null);
  const [editGuildName, setEditGuildName] = useState("");

  const [expandedBoss, setExpandedBoss] = useState<string | null>(null);
  // Track user-selected mode per boss (survives clearing assignments)
  const [bossModes, setBossModes] = useState<Record<string, "none" | "rotation" | "schedule" | "daily">>({});
  // Track which boss is currently being modified
  const [savingBossId, setSavingBossId] = useState<string | null>(null);

  // Multi-select for Boss Guilds
  const [selectedBossIds, setSelectedBossIds] = useState<Set<string>>(new Set());
  const [bossMultiMode, setBossMultiMode] = useState(false);
  const [bulkMode, setBulkMode] = useState<"rotation" | "schedule" | "daily" | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkRotationAdded, setBulkRotationAdded] = useState<string[]>([]);
  const [bulkDailyAdded, setBulkDailyAdded] = useState<string[]>([]);
  const [bulkScheduleDays, setBulkScheduleDays] = useState<Record<number, string | null>>({});

  const toggleBossSelect = (bossId: string) => {
    setSelectedBossIds(prev => {
      const next = new Set(prev);
      if (next.has(bossId)) next.delete(bossId); else next.add(bossId);
      return next;
    });
  };

  const clearBossSelection = () => { setSelectedBossIds(new Set()); setBulkMode(null); setBulkRotationAdded([]); setBulkDailyAdded([]); setBulkScheduleDays({}); };

  // Bulk set mode for all selected bosses
  const handleBulkSetMode = async (mode: "none" | "rotation" | "schedule" | "daily") => {
    setBulkProcessing(true);
    try {
      if (mode === "none") {
        for (const bossId of selectedBossIds) {
          await setBossGuilds(bossId, []);
          setBossModes(prev => ({ ...prev, [bossId]: "none" }));
          setBossGuildsState(prev => prev.filter(bg => bg.boss_id !== bossId));
        }
        clearBossSelection();
        return;
      }
      for (const bossId of selectedBossIds) {
        await setBossGuilds(bossId, []);
        setBossModes(prev => ({ ...prev, [bossId]: mode }));
        setBossGuildsState(prev => prev.filter(bg => bg.boss_id !== bossId));
      }
      setBulkMode(mode);
      setBulkRotationAdded([]);
      setBulkDailyAdded([]);
      setBulkScheduleDays({});
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to set mode");
    } finally {
      setBulkProcessing(false);
    }
  };

  // Bulk add guild to rotation for all selected bosses
  const handleBulkAddRotationGuild = async (guildId: string) => {
    setBulkProcessing(true);
    // Build the new ordered list locally (state update is async)
    const newList = [...bulkRotationAdded, guildId];
    setBulkRotationAdded(newList);
    try {
      for (const bossId of selectedBossIds) {
        // Apply the full ordered list to each boss (replaces existing rotation)
        const newAssignments = newList.map((gid, i) => ({ guild_id: gid, sort_order: i + 1 }));
        await setBossGuilds(bossId, newAssignments);
        setBossModes(prev => ({ ...prev, [bossId]: "rotation" }));
      }
      const updated = await fetchBossGuilds(currentServer!.id);
      setBossGuildsState(updated);
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to add guild");
    } finally {
      setBulkProcessing(false);
    }
  };

  // Bulk add guild to daily rotation for all selected bosses
  const handleBulkAddDailyGuild = async (guildId: string) => {
    setBulkProcessing(true);
    const newList = [...bulkDailyAdded, guildId];
    setBulkDailyAdded(newList);
    try {
      for (const bossId of selectedBossIds) {
        const newAssignments = newList.map((gid, i) => ({ guild_id: gid, sort_order: i + 1 }));
        await setBossGuilds(bossId, newAssignments, "daily");
        setBossModes(prev => ({ ...prev, [bossId]: "daily" }));
      }
      const updated = await fetchBossGuilds(currentServer!.id);
      setBossGuildsState(updated);
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to add guild");
    } finally {
      setBulkProcessing(false);
    }
  };

  // Bulk set schedule guild for a day across all selected bosses
  const handleBulkSetSchedule = async (dayOfWeek: number, guildId: string | null) => {
    setBulkProcessing(true);
    setBulkScheduleDays(prev => ({ ...prev, [dayOfWeek]: guildId }));
    try {
      for (const bossId of selectedBossIds) {
        const existing = getBossGuildsForBoss(bossId).filter(bg => bg.day_of_week !== dayOfWeek);
        const newAssignments = existing.map(bg => ({ guild_id: bg.guild_id, day_of_week: bg.day_of_week! }));
        if (guildId) newAssignments.push({ guild_id: guildId, day_of_week: dayOfWeek });
        await setBossGuilds(bossId, newAssignments, "schedule");
        setBossModes(prev => ({ ...prev, [bossId]: newAssignments.length > 0 ? "schedule" : "none" }));
      }
      const updated = await fetchBossGuilds(currentServer!.id);
      setBossGuildsState(updated);
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to set schedule");
    } finally {
      setBulkProcessing(false);
    }
  };

  // Sync webhook URL when server changes
  useEffect(() => {
    if (currentServer) {
      setWebhookUrl(currentServer.discord_webhook_url ?? "");
      setNotifPrefix(currentServer.notification_prefix ?? "@everyone");
    }
  }, [currentServer?.id]);

  // Determine ownership early (before conditional returns — hooks rule)
  const isOwner = currentServer?.role === "owner";
  const isOwnerOrModerator = currentServer?.role === "owner" || currentServer?.role === "moderator";

  // Redirect moderators away from owner-only tabs
  useEffect(() => {
    if (!isOwner && tab === "danger") {
      setTab("general");
    }
  }, [isOwner, tab]);

  // Fetch viewer key when server changes
  useEffect(() => {
    if (!currentServer) return;
    const fetchKey = async () => {
      try {
        const { data } = await supabase.rpc("get_server_viewer_key", { s_id: currentServer.id });
        if (data) setViewerKey(data as string);
      } catch {}
    };
    fetchKey();
  }, [currentServer?.id]);

  if (serversLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (!currentServer) {
    const isAdmin = userRole === "admin";
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-3">
        <Server className="w-12 h-12 text-slate-700 mx-auto" />
        <p className="text-slate-400">
          {isAdmin
            ? "As an admin, use the Admin Panel to select a server first."
            : "No server selected. Create one first."}
        </p>
        {isAdmin && (
          <button
            onClick={() => navigate("/admin")}
            className="text-sm text-purple-400 hover:text-purple-300 transition"
          >
            Go to Admin Panel →
          </button>
        )}
      </div>
    );
  }

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteServer(currentServer.id);
      await refreshServers();
      queryClient.invalidateQueries();
      navigate("/");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to delete");
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmName("");
    }
  };

  const handleRemoveMod = async (userId: string) => {
    try {
      await removeServerModerator(currentServer.id, userId);
      // Refresh member list
      setMembers(members.filter((m) => m.user_id !== userId));
      toast("success", "Moderator removed");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to remove");
    }
  };

  const handleAddMod = async () => {
    const email = modEmail.trim();
    if (!email) return;
    setAddingMod(true);
    try {
      await addServerModerator(currentServer.id, email);
      // Refresh member list
      const updated = await fetchServerMembers(currentServer.id);
      setMembers(updated);
      setModEmail("");
      toast("success", "Moderator added! They can now manage bosses and configure integrations.");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to add moderator");
    } finally {
      setAddingMod(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferId.trim()) return;
    setTransferring(true);
    try {
      await transferServerOwnership(currentServer.id, transferId.trim());
      // Update current server role in-memory so UI reflects the demotion immediately
      setCurrentServer({ ...currentServer, role: "moderator" });
      await refreshServers();
      setTransferId("");
      toast("success", "Ownership transferred! You are now a moderator.");
      // Navigate to bosses page to reset all owner-only UI
      navigate("/");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to transfer");
    } finally {
      setTransferring(false);
    }
  };

  // ── Moderator Permissions ──────────────────────────────────

  const handleToggleModPerms = async (userId: string) => {
    if (expandedModPerms === userId) {
      setExpandedModPerms(null);
      return;
    }
    setExpandedModPerms(userId);
    if (!modPermsData[userId] && currentServer) {
      const all = await fetchModeratorPermissions(currentServer.id).catch(() => ({} as Record<string, ModeratorPermissions>));
      setModPermsData(prev => ({ ...prev, [userId]: all[userId] ?? { ...DEFAULT_MODERATOR_PERMISSIONS } }));
    }
  };

  const handleTogglePermission = (userId: string, perm: keyof ModeratorPermissions) => {
    setModPermsData(prev => {
      const current = prev[userId] ?? { ...DEFAULT_MODERATOR_PERMISSIONS };
      const newValue = !current[perm];
      const updated = { ...current, [perm]: newValue };

      // Cascade: if checking a parent, auto-check all children
      if (newValue && PERMISSION_HIERARCHY[perm]) {
        for (const child of PERMISSION_HIERARCHY[perm]) {
          updated[child as keyof ModeratorPermissions] = true;
        }
      }

      // Cascade: if unchecking a parent, auto-uncheck all children
      if (!newValue && PERMISSION_HIERARCHY[perm]) {
        for (const child of PERMISSION_HIERARCHY[perm]) {
          updated[child as keyof ModeratorPermissions] = false;
        }
      }

      // Cascade: if checking a child, auto-check its parent
      if (newValue && PERMISSION_PARENT[perm]) {
        updated[PERMISSION_PARENT[perm] as keyof ModeratorPermissions] = true;
      }

      return { ...prev, [userId]: updated };
    });
  };

  const handleSavePermissions = async (userId: string) => {
    if (!currentServer) return;
    setSavingPerms(userId);
    try {
      await updateModeratorPermissions(currentServer.id, userId, modPermsData[userId] ?? {});
      toast("success", "Permissions saved");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to save permissions");
    } finally {
      setSavingPerms(null);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    setJoining(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc("join_server_by_invite", {
        invite: inviteCode.trim(),
      });
      if (rpcErr) throw rpcErr;
      if ((data as any)?.error) {
        toast("error", (data as any).error);
        return;
      }
      await refreshServers();
      setInviteCode("");
      toast("success", "Joined server!");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to join server");
    } finally {
      setJoining(false);
    }
  };

  const handleRegenerateInvite = async () => {
    try {
      const { data, error: rpcErr } = await supabase.rpc("regenerate_invite_code", { s_id: currentServer.id });
      if (rpcErr) throw rpcErr;
      const newCode = data as string;
      // Update current server in-memory so UI refreshes immediately
      setCurrentServer({ ...currentServer, invite_code: newCode });
      await refreshServers();
      toast("success", "Invite code regenerated!");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to regenerate");
    }
  };

  const handleRegenerateViewerKey = async () => {
    try {
      const { data, error: rpcErr } = await supabase.rpc("regenerate_viewer_key", { s_id: currentServer.id });
      if (rpcErr) throw rpcErr;
      setViewerKey(data as string);
      toast("success", "Viewer key regenerated!");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to regenerate viewer key");
    }
  };

  const handleSaveWebhook = async () => {
    if (!webhookUrl.trim()) return;
    setSavingWebhook(true);
    try {
      const { error } = await supabase
        .rpc("set_server_webhook", { s_id: currentServer.id, webhook_url: webhookUrl.trim() });
      if (error) throw error;
      await refreshServers();

      // Update current server in-memory so banner hides immediately
      setCurrentServer({ ...currentServer, discord_webhook_url: webhookUrl.trim() });

      // Send a greeting message to the Discord server
      const serverName = currentServer.name || "Your Server";
      try {
        await fetch(webhookUrl.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "RaidScout",
            embeds: [
              {
                title: "🛡️ RaidScout has been connected!",
                description: `**RaidScout** is now linked to **${serverName}**.\n\nBoss kill alerts, spawn announcements, and @everyone pings are now active.`,
                color: 0x22c55e,
                fields: [
                  { name: "Server", value: serverName, inline: true },
                  { name: "Status", value: "🟢 Online", inline: true },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: "RaidScout Boss Timer" },
              },
            ],
          }),
        });
      } catch {
        // Silently ignore greeting failure — webhook is still saved
      }

      toast("success", "Webhook saved! All Discord features are now unlocked — boss alerts, spawn announcements, and @everyone pings are active.");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to save webhook");
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleSavePrefix = async () => {
    setSavingPrefix(true);
    try {
      const { error } = await supabase
        .rpc("set_notification_prefix", { p_server_id: currentServer.id, p_prefix: notifPrefix.trim() || "@everyone" });
      if (error) throw error;
      await refreshServers();
      setCurrentServer({ ...currentServer, notification_prefix: notifPrefix.trim() || "@everyone" });
      toast("success", "Notification prefix saved!");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to save prefix");
    } finally {
      setSavingPrefix(false);
    }
  };

  // ── Discord Bot helpers ────────────────────────────────
  const handleAddDiscordLink = async () => {
    const gid = newDiscordId.trim();
    if (!gid || !currentServer) return;
    const allPrefixes = ["!",";","$",".","~","?","%","&","-","+","=",":","rs!","rs;","rs.","rb!","rb;","boss!","boss;"];
    const prefix = allPrefixes.find(p => !usedPrefixes.has(p)) || "!";
    setSavingDiscord(true);
    try {
      const { data, error } = await supabase.from("discord_configs").insert({
        discord_guild_id: gid,
        raidscout_server_id: currentServer.id,
        label: newDiscordLabel.trim() || null,
        command_prefix: prefix,
      }).select().single();
      if (error) throw error;
      setDiscordLinks(prev => [...prev, data]);
      setNewDiscordId("");
      setNewDiscordLabel("");
      setNewDiscordPrefix("!");
      bumpWebhookVersion();
      toast("success", `Discord server linked! Use \`${prefix}notifhere\` for alerts and \`${prefix}cmdhere\` to restrict commands.`);
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to link");
    } finally {
      setSavingDiscord(false);
    }
  };

  const handleRemoveDiscordLink = async (id: string) => {
    try {
      const { error } = await supabase.from("discord_configs").delete().eq("id", id);
      if (error) throw error;
      setDiscordLinks(prev => prev.filter(d => d.id !== id));
      bumpWebhookVersion();
      toast("success", "Discord link removed");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to remove");
    }
  };

  // ── Guild handlers ──
  const handleAddGuild = async () => {
    const name = newGuildName.trim();
    if (!name) return;
    // Check duplicate
    if (guilds.some(g => g.name.toLowerCase() === name.toLowerCase())) {
      toast("error", `Guild "${name}" already exists`);
      return;
    }
    setAddingGuild(true);
    try {
      const g = await createGuild(name, currentServer.id);
      setGuilds(prev => [...prev, g].sort((a, b) => a.name.localeCompare(b.name)));
      setNewGuildName("");
      toast("success", `Guild "${name}" created`);
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to create guild");
    } finally {
      setAddingGuild(false);
    }
  };

  const handleEditGuild = async (id: string) => {
    const name = editGuildName.trim();
    const oldName = guilds.find(g => g.id === id)?.name;
    if (!name || name === oldName) { setEditingGuildId(null); return; }
    if (guilds.some(g => g.id !== id && g.name.toLowerCase() === name.toLowerCase())) {
      toast("error", `Guild "${name}" already exists`);
      return;
    }
    try {
      await updateGuildName(id, name);
      setGuilds(prev => prev.map(g => g.id === id ? { ...g, name } : g).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingGuildId(null);
      toast("success", `Guild renamed to "${name}"`);
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to rename guild");
    }
  };

  const handleDeleteGuild = async (id: string, name: string) => {
    try {
      await deleteGuild(id);
      setGuilds(prev => prev.filter(g => g.id !== id));
      toast("success", `Guild "${name}" deleted`);
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to delete guild");
    }
  };

  // ── Boss-Guild handlers ──
  const getBossGuildsForBoss = (bossId: string) => bossGuilds.filter(bg => bg.boss_id === bossId);

  const getBossMode = (bossId: string): "none" | "rotation" | "schedule" | "daily" => {
    if (bossModes[bossId]) return bossModes[bossId];
    const bgs = getBossGuildsForBoss(bossId);
    if (bgs.length === 0) return "none";
    if (bgs[0].mode === "daily") return "daily";
    if (bgs[0].mode === "schedule") return "schedule";
    if (bgs[0].sort_order !== null) return "rotation";
    return "none";
  };

  const handleSetBossMode = async (bossId: string, mode: "none" | "rotation" | "schedule" | "daily") => {
    // Update state immediately so UI reflects the change
    setBossModes(prev => ({ ...prev, [bossId]: mode }));
    setExpandedBoss(bossId); // keep expanded

    if (mode === "none") {
      await setBossGuilds(bossId, []);
      setBossGuildsState(prev => prev.filter(bg => bg.boss_id !== bossId));
      return;
    }
    // Clear existing assignments for the new mode
    await setBossGuilds(bossId, []);
    setBossGuildsState(prev => prev.filter(bg => bg.boss_id !== bossId));
  };

  const handleAddRotationGuild = async (bossId: string, guildId: string) => {
    setSavingBossId(bossId);
    try {
      const existing = getBossGuildsForBoss(bossId).filter(bg => bg.sort_order !== null);
      const nextOrder = existing.length > 0 ? Math.max(...existing.map(bg => bg.sort_order ?? 0)) + 1 : 1;
      const newAssignments = [...existing.map(bg => ({ guild_id: bg.guild_id, sort_order: bg.sort_order! })), { guild_id: guildId, sort_order: nextOrder }];
      await setBossGuilds(bossId, newAssignments, "rotation");
      const updated = await fetchBossGuilds(currentServer!.id);
      setBossGuildsState(updated);
      setBossModes(prev => ({ ...prev, [bossId]: "rotation" }));
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to add guild to rotation");
    } finally {
      setSavingBossId(null);
    }
  };

  const handleRemoveRotationGuild = async (bossId: string, entryId: string) => {
    // Remove the specific entry by its ID (supports duplicate guilds in rotation)
    const existing = getBossGuildsForBoss(bossId).filter(bg => bg.id !== entryId);
    const reordered = existing.map((bg, i) => ({ guild_id: bg.guild_id, sort_order: i + 1 }));
    await setBossGuilds(bossId, reordered, "rotation");
    const updated = await fetchBossGuilds(currentServer!.id);
    setBossGuildsState(updated);
    if (reordered.length === 0) setBossModes(prev => ({ ...prev, [bossId]: "none" }));
  };

  const handleMoveRotationGuild = async (bossId: string, entryId: string, direction: "up" | "down") => {
    const existing = getBossGuildsForBoss(bossId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = existing.findIndex(bg => bg.id === entryId);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === existing.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [existing[idx], existing[swapIdx]] = [existing[swapIdx], existing[idx]];
    const reordered = existing.map((bg, i) => ({ guild_id: bg.guild_id, sort_order: i + 1 }));
    await setBossGuilds(bossId, reordered, "rotation");
    const updated = await fetchBossGuilds(currentServer!.id);
    setBossGuildsState(updated);
  };

  // ── Daily mode handlers ──
  const handleAddDailyGuild = async (bossId: string, guildId: string) => {
    setSavingBossId(bossId);
    try {
      const existing = getBossGuildsForBoss(bossId);
      const nextOrder = existing.length > 0 ? Math.max(...existing.map(bg => bg.sort_order ?? 0)) + 1 : 1;
      const newAssignments = [...existing.map(bg => ({ guild_id: bg.guild_id, sort_order: bg.sort_order! })), { guild_id: guildId, sort_order: nextOrder }];
      await setBossGuilds(bossId, newAssignments, "daily");
      const updated = await fetchBossGuilds(currentServer!.id);
      setBossGuildsState(updated);
      setBossModes(prev => ({ ...prev, [bossId]: "daily" }));
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to add guild");
    } finally {
      setSavingBossId(null);
    }
  };

  const handleRemoveDailyGuild = async (bossId: string, entryId: string) => {
    const existing = getBossGuildsForBoss(bossId).filter(bg => bg.id !== entryId);
    const reordered = existing.map((bg, i) => ({ guild_id: bg.guild_id, sort_order: i + 1 }));
    await setBossGuilds(bossId, reordered, "daily");
    const updated = await fetchBossGuilds(currentServer!.id);
    setBossGuildsState(updated);
    if (reordered.length === 0) setBossModes(prev => ({ ...prev, [bossId]: "none" }));
  };

  const handleMoveDailyGuild = async (bossId: string, entryId: string, direction: "up" | "down") => {
    const existing = getBossGuildsForBoss(bossId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = existing.findIndex(bg => bg.id === entryId);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === existing.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [existing[idx], existing[swapIdx]] = [existing[swapIdx], existing[idx]];
    const reordered = existing.map((bg, i) => ({ guild_id: bg.guild_id, sort_order: i + 1 }));
    await setBossGuilds(bossId, reordered, "daily");
    const updated = await fetchBossGuilds(currentServer!.id);
    setBossGuildsState(updated);
  };

  const handleSetScheduleGuild = async (bossId: string, dayOfWeek: number, guildId: string | null) => {
    const existing = getBossGuildsForBoss(bossId).filter(bg => bg.day_of_week !== dayOfWeek);
    const newAssignments = existing.map(bg => ({ guild_id: bg.guild_id, day_of_week: bg.day_of_week! }));
    if (guildId) {
      newAssignments.push({ guild_id: guildId, day_of_week: dayOfWeek });
    }
    await setBossGuilds(bossId, newAssignments, "schedule");
    const updated = await fetchBossGuilds(currentServer!.id);
    setBossGuildsState(updated);
    setBossModes(prev => ({ ...prev, [bossId]: newAssignments.length > 0 ? "schedule" : "none" }));
  };

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/")} className="text-slate-400 hover:text-white p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-white">Server Settings</h2>
        {isOwner && <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded-full">Owner</span>}
      </div>

      {/* My Servers — always visible */}
      {servers.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Server className="w-3 h-3" /> My Servers
          </h3>
          <div className="space-y-1">
            {servers.map((s) => (
              <button
                key={s.id}
                onClick={() => setCurrentServer(s)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                  s.id === currentServer.id
                    ? "bg-blue-900/30 border border-blue-800 text-white"
                    : "bg-slate-800/50 border border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <span>{s.name}</span>
                <span className="flex items-center gap-1.5">
                  {s.role === "owner" && <span className="text-xs text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">Owner</span>}
                  {s.role === "moderator" && <span className="text-xs text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">Mod</span>}
                  {s.id === currentServer.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-slate-800 pt-3 space-y-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Add Server</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Create New
              </button>
              <div className="flex-1 flex gap-1">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Invite code..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 transition"
                />
                <button
                  onClick={handleJoin}
                  disabled={joining || !inviteCode.trim()}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50 whitespace-nowrap"
                >
                  {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {showCreateModal && <CreateServerModal onClose={() => setShowCreateModal(false)} />}

      {/* Tabs */}
      <div className="flex bg-slate-800 rounded-lg p-0.5">
        {([
          ["general", "General", Settings],
          ["guilds", "Guilds", Shield],
          ["boss-guilds", "Boss Guilds", Swords],
          ["boss-points", "Boss Points", Trophy],
          ["members", "Members", Users],
          ["integrations", "Integrations", Bell],
          ...(isOwner ? [["danger", "Danger", AlertTriangle] as const] : []),
        ] as readonly (readonly [string, string, React.ComponentType<{ className?: string }>])[]).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition ${
              tab === key ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Icon className="w-3 h-3" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* General Tab */}
      {tab === "general" && (
        <div className="space-y-4">
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white mb-2">Server Name</h3>
            <div className="flex gap-2">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-purple-500 transition disabled:opacity-50" />
              {isOwner && (
                <button onClick={async () => {
                  const trimmed = name.trim();
                  if (!trimmed) return toast("error", "Server name cannot be empty.");
                  if (trimmed === currentServer.name) return;
                  const { data: dup } = await supabase.from("servers").select("id").eq("name", trimmed).neq("id", currentServer.id).maybeSingle();
                  if (dup) return toast("error", `A server named "${trimmed}" already exists.`);
                  await supabase.from("servers").update({ name: trimmed }).eq("id", currentServer.id);
                  setCurrentServer({ ...currentServer, name: trimmed });
                  toast("success", "Server name updated!");
                }} className="px-3 py-2 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 transition">Save</button>
              )}
            </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Server Timezone</h3>
            <p className="text-sm text-slate-400">All spawn times will display in this timezone.</p>
            <select
              value={currentServer.timezone || "Asia/Manila"}
              onChange={async (e) => {
                const tz = e.target.value;
                await supabase.from("servers").update({ timezone: tz }).eq("id", currentServer.id);
                setCurrentServer({ ...currentServer, timezone: tz });
                toast("success", "Timezone updated");
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-purple-500 transition"
            >
              <option value="Asia/Manila">GMT+8 — Asia/Manila</option>
              <option value="Asia/Singapore">GMT+8 — Asia/Singapore</option>
              <option value="Asia/Tokyo">GMT+9 — Asia/Tokyo</option>
              <option value="Asia/Seoul">GMT+9 — Asia/Seoul</option>
              <option value="Australia/Sydney">GMT+10 — Australia/Sydney</option>
              <option value="Pacific/Auckland">GMT+12 — Pacific/Auckland</option>
              <option value="Asia/Jakarta">GMT+7 — Asia/Jakarta</option>
              <option value="Asia/Bangkok">GMT+7 — Asia/Bangkok</option>
              <option value="Asia/Dhaka">GMT+6 — Asia/Dhaka</option>
              <option value="Asia/Kolkata">GMT+5:30 — Asia/Kolkata</option>
              <option value="Asia/Dubai">GMT+4 — Asia/Dubai</option>
              <option value="Europe/Moscow">GMT+3 — Europe/Moscow</option>
              <option value="Europe/London">GMT+1 — Europe/London</option>
              <option value="UTC">GMT+0 — UTC</option>
              <option value="America/New_York">GMT-4 — America/New York</option>
              <option value="America/Chicago">GMT-5 — America/Chicago</option>
              <option value="America/Denver">GMT-6 — America/Denver</option>
              <option value="America/Los_Angeles">GMT-7 — America/Los Angeles</option>
            </select>
          </section>

          {isOwner && (
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3 h-3" /> Invite Code
              </h3>
              <p className="text-sm text-slate-400">
                Share this code with others so they can join as moderators.
              </p>
              <div className="flex items-center gap-2">
                <code className={`flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base font-mono tracking-wider text-center select-all transition ${showInviteCode ? "text-blue-400" : "text-slate-500"}`}>
                  {showInviteCode ? currentServer.invite_code : "••••••••"}
                </code>
                <button
                  onClick={() => setShowInviteCode(!showInviteCode)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  title={showInviteCode ? "Hide" : "Show"}
                >
                  {showInviteCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(currentServer.invite_code); toast("success", "Invite code copied!"); }}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  title="Copy invite code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleRegenerateInvite}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate code
              </button>
            </section>
          )}

          {isOwnerOrModerator && (
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3 h-3" /> Viewer Key
              </h3>
              <p className="text-sm text-slate-400">
                Share this key to let others monitor your server without an account. Viewers cannot make changes.
              </p>
              {viewerKey ? (
                <>
                  <div className="flex items-center gap-2">
                    <code className={`flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base font-mono tracking-wider text-center select-all transition ${showViewerKey ? "text-emerald-400" : "text-slate-500"}`}>
                      {showViewerKey ? viewerKey : "••••••••"}
                    </code>
                    <button
                      onClick={() => setShowViewerKey(!showViewerKey)}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      title={showViewerKey ? "Hide" : "Show"}
                    >
                      {showViewerKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { navigator.clipboard.writeText(viewerKey); toast("success", "Viewer key copied!"); }}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                      title="Copy viewer key"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-400 truncate select-all">
                      {window.location.origin}/view/{viewerKey}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/view/${viewerKey}`); toast("success", "Viewer link copied!"); }}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
                      title="Copy viewer link"
                    >
                      <Link className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500">Loading...</p>
              )}
              {isOwner && (
              <button
                onClick={handleRegenerateViewerKey}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate key
              </button>
              )}
            </section>
          )}
        </div>
      )}

      {/* Guilds Tab */}
      {tab === "guilds" && (
        <div className="space-y-4">
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3 h-3" /> Guilds ({guilds.length})
            </h3>

            {/* Add guild */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newGuildName}
                onChange={(e) => setNewGuildName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddGuild()}
                placeholder="New guild name..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition"
              />
              <button
                onClick={handleAddGuild}
                disabled={addingGuild || !newGuildName.trim()}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition disabled:opacity-50 flex items-center gap-1"
              >
                {addingGuild ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add
              </button>
            </div>

            {/* Guild list */}
            {guildsLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
              </div>
            ) : guilds.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-2">No guilds yet. Create one above.</p>
            ) : (
              <div className="space-y-1">
                {guilds.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/30 text-sm"
                  >
                    {editingGuildId === g.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editGuildName}
                          onChange={(e) => setEditGuildName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleEditGuild(g.id); if (e.key === "Escape") setEditingGuildId(null); }}
                          className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                          autoFocus
                        />
                        <button onClick={() => handleEditGuild(g.id)} className="p-1 text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingGuildId(null)} className="p-1 text-slate-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <>
                        <span className="text-slate-300 text-xs">{g.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingGuildId(g.id); setEditGuildName(g.name); }}
                            className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteGuild(g.id, g.name)}
                            className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Boss Guilds Tab */}
      {tab === "boss-guilds" && (
        <div className="space-y-4">
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Swords className="w-3 h-3" /> Boss Guild Assignments
              </h3>
              {guilds.length > 0 && sortedBosses.length > 0 && (
                <button
                  onClick={() => { if (bossMultiMode) clearBossSelection(); setBossMultiMode(!bossMultiMode); setBulkMode(null); }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition ${
                    bossMultiMode ? "bg-blue-900/30 border border-blue-800 text-blue-400" : "bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <CheckSquare className="w-3 h-3" />
                  {bossMultiMode ? `Selecting (${selectedBossIds.size})` : "Select Multiple"}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Assign guilds to bosses and set custom points per boss.
              Rotation mode alternates guilds each spawn.
              Schedule mode assigns a guild per day of the week.
            </p>
            <p className="text-xs text-amber-400/80 flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              The <span className="text-white font-mono">- 1 +</span> controls set <strong>boss points</strong> — each attendee earns this many points per kill on the leaderboard.
            </p>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> Fixed Hours</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Fixed Schedule</span>
            </div>

            {bossGuildsLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-slate-500 animate-spin" /></div>
            ) : sortedBosses.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No bosses in this server.</p>
            ) : guilds.length === 0 ? (
              <p className="text-xs text-amber-400 text-center py-4">Create guilds first (in the Guilds tab) before assigning them to bosses.</p>
            ) : (
              <div className={`space-y-2 max-h-[60vh] overflow-y-auto ${bossMultiMode && selectedBossIds.size > 0 ? "pb-32" : ""}`}>
                {sortedBosses.map((boss) => {
                  const mode = getBossMode(boss.id);
                  const bossAssignments = getBossGuildsForBoss(boss.id);
                  const isExpanded = expandedBoss === boss.id;
                  const isSelected = selectedBossIds.has(boss.id);

                  return (
                    <div key={boss.id} className={`bg-slate-800/30 rounded-lg overflow-hidden ${isSelected ? "ring-2 ring-blue-500 ring-inset" : ""}`}>
                      {/* Boss header row */}
                      <button
                        onClick={() => {
                          if (bossMultiMode) { toggleBossSelect(boss.id); return; }
                          setExpandedBoss(isExpanded ? null : boss.id);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-700/30 transition text-left"
                      >
                        {bossMultiMode && (
                          isSelected ? <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" /> : <Square className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${boss.spawn_type === "fixed_schedule" ? "bg-blue-400" : "bg-orange-400"}`} title={boss.spawn_type === "fixed_schedule" ? "Fixed Schedule" : "Fixed Hours"} />
                        <span className="text-xs text-white font-medium flex-1 truncate">{boss.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          mode === "rotation" ? "text-blue-400 bg-blue-900/30" :
                          mode === "daily" ? "text-cyan-400 bg-cyan-900/30" :
                          mode === "schedule" ? "text-purple-400 bg-purple-900/30" :
                          "text-slate-500 bg-slate-800"
                        }`}>
                          {mode === "rotation" ? `Rotation (${bossAssignments.length})` :
                           mode === "daily" ? `Daily (${bossAssignments.length})` :
                           mode === "schedule" ? "Schedule" : "None"}
                        </span>
                        {/* Boss Points */}
                        <span className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <span
                            onClick={async () => {
                              const val = Math.max(0, (boss.boss_points ?? 1) - 1);
                              try {
                                await setBossPoints(boss.id, val);
                                queryClient.invalidateQueries({ queryKey: ["bosses"] });
                                setBosses(prev => prev.map(b => b.id === boss.id ? { ...b, boss_points: val } : b));
                              } catch { /* ignore */ }
                            }}
                            className={`p-0.5 rounded cursor-pointer transition ${(boss.boss_points ?? 1) <= 0 ? "text-slate-700 cursor-default" : "text-slate-500 hover:text-red-400"}`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                          >
                            <Minus className="w-3 h-3" />
                          </span>
                          <span className="text-xs text-white font-mono w-5 text-center tabular-nums">{boss.boss_points ?? 1}</span>
                          <span
                            onClick={async () => {
                              const val = Math.min(99, (boss.boss_points ?? 1) + 1);
                              try {
                                await setBossPoints(boss.id, val);
                                queryClient.invalidateQueries({ queryKey: ["bosses"] });
                                setBosses(prev => prev.map(b => b.id === boss.id ? { ...b, boss_points: val } : b));
                              } catch { /* ignore */ }
                            }}
                            className={`p-0.5 rounded cursor-pointer transition ${(boss.boss_points ?? 1) >= 99 ? "text-slate-700 cursor-default" : "text-slate-500 hover:text-emerald-400"}`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                          >
                            <Plus className="w-3 h-3" />
                          </span>
                        </span>
                        <span className="text-slate-600 mx-1">|</span>
                        {/* Salary toggle (deprecated — per-guild salary now in Boss Points tab) */}
                        <label className="flex items-center gap-1 cursor-not-allowed shrink-0 opacity-40" title="Salary is now per-guild — use the Boss Points tab">
                          <input
                            type="checkbox"
                            checked={(boss as any).has_salary === true}
                            disabled
                            className="w-3 h-3 rounded border-slate-600 bg-slate-800 text-slate-600"
                          />
                          <span className="text-[10px] text-slate-600">Sal</span>
                        </label>
                        {!bossMultiMode && (isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />)}
                      </button>

                      {/* Expanded config (hidden in multi-mode) */}
                      {!bossMultiMode && isExpanded && (
                        <div className="border-t border-slate-700/50 px-4 py-3 space-y-3">
                          {/* Mode selector */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 w-12">Mode:</span>
                            <select
                              value={mode}
                              onChange={(e) => {
                                const newMode = e.target.value as "none" | "rotation" | "schedule" | "daily";
                                handleSetBossMode(boss.id, newMode);
                              }}
                              className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                            >
                              <option value="none">None</option>
                              <option value="rotation">Rotation (per kill)</option>
                              <option value="daily">Daily (per day)</option>
                              <option value="schedule">Schedule</option>
                            </select>
                          </div>

                          {/* Daily mode */}
                          {mode === "daily" && (
                            <div className="space-y-1.5">
                              <p className="text-xs text-slate-500">Guild rotation order (first → last):</p>
                              {bossAssignments
                                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                .map((bg, idx) => {
                                  const guild = guilds.find(g => g.id === bg.guild_id);
                                  return (
                                    <div key={bg.id} className="flex items-center gap-1 bg-slate-800/50 rounded px-2 py-1.5">
                                      <span className="text-xs text-slate-500 w-4">{idx + 1}.</span>
                                      <span className="text-sm text-slate-200 flex-1">{guild?.name ?? "Unknown"}</span>
                                      <button onClick={() => handleMoveDailyGuild(boss.id, bg.id, "up")} disabled={idx === 0} className="p-0.5 text-slate-500 hover:text-emerald-400 disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                                      <button onClick={() => handleMoveDailyGuild(boss.id, bg.id, "down")} disabled={idx === bossAssignments.length - 1} className="p-0.5 text-slate-500 hover:text-red-400 disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                                      <button onClick={() => handleRemoveDailyGuild(boss.id, bg.id)} className="p-0.5 text-slate-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                                    </div>
                                  );
                                })}
                              {savingBossId === boss.id ? (
                                <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Adding...
                                </div>
                              ) : (
                                <select
                                  key={`add-daily-${boss.id}-${bossAssignments.length}`}
                                  value=""
                                  onChange={(e) => { if (e.target.value) handleBulkAddDailyGuild(e.target.value); }}
                                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-400 outline-none focus:border-cyan-500"
                                >
                                  <option value="">+ Add guild to daily rotation...</option>
                                  {guilds.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}

                          {/* Rotation mode */}
                          {mode === "rotation" && (
                            <div className="space-y-1.5">
                              <p className="text-xs text-slate-500">Guild rotation order (first → last):</p>
                              {bossAssignments
                                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                .map((bg, idx) => {
                                  const guild = guilds.find(g => g.id === bg.guild_id);
                                  return (
                                    <div key={bg.id} className="flex items-center gap-1 bg-slate-800/50 rounded px-2 py-1.5">
                                      <span className="text-xs text-slate-500 w-4">{idx + 1}.</span>
                                      <span className="text-sm text-slate-200 flex-1">{guild?.name ?? "Unknown"}</span>
                                      <button onClick={() => handleMoveRotationGuild(boss.id, bg.id, "up")} disabled={idx === 0} className="p-0.5 text-slate-500 hover:text-emerald-400 disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                                      <button onClick={() => handleMoveRotationGuild(boss.id, bg.id, "down")} disabled={idx === bossAssignments.length - 1} className="p-0.5 text-slate-500 hover:text-red-400 disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                                      <button onClick={() => handleRemoveRotationGuild(boss.id, bg.id)} className="p-0.5 text-slate-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                                    </div>
                                  );
                                })}
                              {savingBossId === boss.id ? (
                                <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Adding...
                                </div>
                              ) : (
                                <select
                                  key={`add-${boss.id}-${bossAssignments.length}`}
                                  value=""
                                  onChange={(e) => { if (e.target.value) handleBulkAddRotationGuild(e.target.value); }}
                                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-400 outline-none focus:border-blue-500"
                                >
                                  <option value="">+ Add guild to rotation...</option>
                                  {guilds.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}

                          {/* Schedule mode */}
                          {mode === "schedule" && (
                            <div className="space-y-1.5">
                              <p className="text-xs text-slate-500">Assign guild per day:</p>
                              <div className="grid grid-cols-7 gap-1">
                                {DAY_LABELS.map((label, dow) => {
                                  const bg = bossAssignments.find(a => a.day_of_week === dow);
                                  const guild = bg ? guilds.find(g => g.id === bg.guild_id) : null;
                                  return (
                                    <div key={dow} className="text-center space-y-1">
                                      <span className="text-xs text-slate-500 block">{label}</span>
                                      <select
                                        value={guild?.id ?? ""}
                                        onChange={(e) => handleSetScheduleGuild(boss.id, dow, e.target.value || null)}
                                        className={`w-full rounded-lg px-1.5 py-1.5 text-xs outline-none disabled:opacity-50 border ${
                                          guild
                                            ? "bg-purple-900/20 border-purple-700 text-purple-300"
                                            : "bg-slate-800 border-slate-700 text-white"
                                        } focus:border-purple-500`}
                                      >
                                        <option value="">—</option>
                                        <option value="">Clear</option>
                                        {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                      </select>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Floating multi-select action bar */}
          {bossMultiMode && selectedBossIds.size > 0 && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900 border border-blue-800 rounded-xl px-5 py-4 shadow-2xl space-y-4 w-[95vw] max-w-2xl">
              {/* Close button */}
              <button
                onClick={() => { clearBossSelection(); setBossMultiMode(false); }}
                disabled={bulkProcessing}
                className="absolute top-3 right-3 p-1 text-slate-500 hover:text-white transition disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Spinner overlay */}
              {bulkProcessing && (
                <div className="absolute inset-0 bg-slate-900/80 rounded-xl flex items-center justify-center gap-2 z-10">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                  <span className="text-sm text-slate-300">Applying...</span>
                </div>
              )}

              {/* Header */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-white font-medium">{selectedBossIds.size} boss{selectedBossIds.size !== 1 ? "es" : ""} selected</span>
              </div>

              {/* Step 1: Choose mode */}
              {!bulkMode && (
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-medium">Choose assignment mode:</span>
                  <div className="flex gap-2">
                    <button onClick={() => handleBulkSetMode("rotation")} disabled={bulkProcessing} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition disabled:opacity-50">🔄 Rotation</button>
                    <button onClick={() => handleBulkSetMode("daily")} disabled={bulkProcessing} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-cyan-600 text-white hover:bg-cyan-500 transition disabled:opacity-50">📆 Daily</button>
                    <button onClick={() => handleBulkSetMode("schedule")} disabled={bulkProcessing} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-500 transition disabled:opacity-50">📅 Schedule</button>
                    <button onClick={() => handleBulkSetMode("none")} disabled={bulkProcessing} className="py-2.5 px-4 rounded-lg text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition disabled:opacity-50">Clear</button>
                  </div>
                </div>
              )}

              {/* Step 2b: Daily */}
              {bulkMode === "daily" && guilds.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-cyan-400 font-medium">Daily — guilds alternate by day across all selected bosses</span>
                    <button onClick={() => setBulkMode(null)} disabled={bulkProcessing} className="text-xs text-slate-400 hover:text-white transition disabled:opacity-50">← Change mode</button>
                  </div>
                  <p className="text-xs text-slate-500">Guild alternation order (first → last):</p>
                  {bulkDailyAdded.map((gid, idx) => {
                    const guild = guilds.find(g => g.id === gid);
                    return (
                      <div key={`daily-${gid}-${idx}`} className="flex items-center gap-1 bg-slate-800/50 rounded px-2 py-1.5">
                        <span className="text-xs text-slate-500 w-4">{idx + 1}.</span>
                        <span className="text-sm text-slate-200 flex-1">{guild?.name ?? "Unknown"}</span>
                        <button
                          onClick={() => setBulkDailyAdded(prev => { if (idx === 0) return prev; const n = [...prev]; [n[idx], n[idx-1]] = [n[idx-1], n[idx]]; return n; })}
                          disabled={idx === 0 || bulkProcessing}
                          className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30"
                        ><ChevronUp className="w-3 h-3" /></button>
                        <button
                          onClick={() => setBulkDailyAdded(prev => { if (idx === prev.length-1) return prev; const n = [...prev]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; return n; })}
                          disabled={idx === bulkDailyAdded.length - 1 || bulkProcessing}
                          className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30"
                        ><ChevronDown className="w-3 h-3" /></button>
                        <button
                          onClick={() => setBulkDailyAdded(prev => prev.filter((_, i) => i !== idx))}
                          disabled={bulkProcessing}
                          className="p-0.5 text-slate-500 hover:text-red-400 disabled:opacity-50"
                        ><X className="w-3 h-3" /></button>
                      </div>
                    );
                  })}
                  {bulkProcessing ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Adding...
                    </div>
                  ) : (
                    <select
                      key={`bulk-add-daily-${bulkDailyAdded.length}`}
                      value=""
                      onChange={(e) => { if (e.target.value) handleBulkAddDailyGuild(e.target.value); }}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-400 outline-none focus:border-cyan-500"
                    >
                      <option value="">+ Add guild to daily rotation...</option>
                      {guilds.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Step 2a: Rotation */}
              {bulkMode === "rotation" && guilds.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-blue-400 font-medium">Rotation — guilds to add to all selected bosses</span>
                    <button onClick={() => setBulkMode(null)} disabled={bulkProcessing} className="text-xs text-slate-400 hover:text-white transition disabled:opacity-50">← Change mode</button>
                  </div>
                  <p className="text-xs text-slate-500">Guild rotation order (first → last):</p>
                  {bulkRotationAdded.map((gid, idx) => {
                    const guild = guilds.find(g => g.id === gid);
                    return (
                      <div key={`${gid}-${idx}`} className="flex items-center gap-1 bg-slate-800/50 rounded px-2 py-1.5">
                        <span className="text-xs text-slate-500 w-4">{idx + 1}.</span>
                        <span className="text-sm text-slate-200 flex-1">{guild?.name ?? "Unknown"}</span>
                        <button
                          onClick={() => setBulkRotationAdded(prev => { if (idx === 0) return prev; const n = [...prev]; [n[idx], n[idx-1]] = [n[idx-1], n[idx]]; return n; })}
                          disabled={idx === 0 || bulkProcessing}
                          className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30"
                        ><ChevronUp className="w-3 h-3" /></button>
                        <button
                          onClick={() => setBulkRotationAdded(prev => { if (idx === prev.length-1) return prev; const n = [...prev]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; return n; })}
                          disabled={idx === bulkRotationAdded.length - 1 || bulkProcessing}
                          className="p-0.5 text-slate-500 hover:text-white disabled:opacity-30"
                        ><ChevronDown className="w-3 h-3" /></button>
                        <button
                          onClick={() => setBulkRotationAdded(prev => prev.filter((_, i) => i !== idx))}
                          disabled={bulkProcessing}
                          className="p-0.5 text-slate-500 hover:text-red-400 disabled:opacity-50"
                        ><X className="w-3 h-3" /></button>
                      </div>
                    );
                  })}
                  {bulkProcessing ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Adding...
                    </div>
                  ) : (
                    <select
                      key={`bulk-add-${bulkRotationAdded.length}`}
                      value=""
                      onChange={(e) => { if (e.target.value) handleBulkAddRotationGuild(e.target.value); }}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-400 outline-none focus:border-blue-500"
                    >
                      <option value="">+ Add guild to rotation...</option>
                      {guilds.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Step 2b: Schedule */}
              {bulkMode === "schedule" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-purple-400 font-medium">Schedule — assign guild per day to all selected bosses</span>
                    <button onClick={() => setBulkMode(null)} disabled={bulkProcessing} className="text-xs text-slate-400 hover:text-white transition disabled:opacity-50">← Change mode</button>
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {DAY_LABELS.map((label, dow) => {
                      const selectedGuildId = bulkScheduleDays[dow];
                      const selectedGuild = selectedGuildId ? guilds.find(g => g.id === selectedGuildId) : null;
                      return (
                        <div key={dow} className="space-y-1">
                          <span className="text-xs text-slate-500 text-center block">{label}</span>
                          <select
                            value={selectedGuildId ?? ""}
                            disabled={bulkProcessing}
                            onChange={(e) => {
                              const val = e.target.value || null;
                              handleBulkSetSchedule(dow, val);
                            }}
                            className={`w-full rounded-lg px-1.5 py-1.5 text-xs outline-none disabled:opacity-50 border ${
                              selectedGuild
                                ? "bg-purple-900/20 border-purple-700 text-purple-300"
                                : "bg-slate-800 border-slate-700 text-white"
                            } focus:border-purple-500`}
                          >
                            <option value="">—</option>
                            <option value="">Clear</option>
                            {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Boss Points Tab */}
      {tab === "boss-points" && (
        <BossPointsMatrix
          bosses={sortedBosses}
          guilds={guilds}
          allBossGuilds={allBossGuilds}
          savingCell={savingCell}
          onPointsChange={async (bossId, guildId, points) => {
            const cellKey = `${bossId}-${guildId}`;
            setSavingCell(cellKey);
            try {
              await upsertBossGuildPoints(bossId, guildId, points, undefined);
              setAllBossGuilds(prev => {
                const existing = prev.find(bg => bg.boss_id === bossId && bg.guild_id === guildId);
                if (existing) {
                  return prev.map(bg => bg.boss_id === bossId && bg.guild_id === guildId ? { ...bg, points } : bg);
                }
                return [...prev, { id: "", boss_id: bossId, guild_id: guildId, sort_order: null, day_of_week: null, points } as BossGuild];
              });
            } catch { /* ignore */ }
            setSavingCell(null);
          }}
          onSalaryChange={async (bossId, guildId, hasSalary) => {
            const cellKey = `${bossId}-${guildId}`;
            setSavingCell(cellKey);
            try {
              await upsertBossGuildPoints(bossId, guildId, undefined, hasSalary);
              setAllBossGuilds(prev => {
                const existing = prev.find(bg => bg.boss_id === bossId && bg.guild_id === guildId);
                if (existing) {
                  return prev.map(bg => bg.boss_id === bossId && bg.guild_id === guildId ? { ...bg, has_salary: hasSalary } : bg);
                }
                return [...prev, { id: "", boss_id: bossId, guild_id: guildId, sort_order: null, day_of_week: null, has_salary: hasSalary } as BossGuild];
              });
            } catch { /* ignore */ }
            setSavingCell(null);
          }}
          onBatchSalaryChange={async (guildId, bossIds, hasSalary) => {
            await batchSetGuildSalary(guildId, bossIds, hasSalary);
            // Refresh allBossGuilds
            try {
              const updated = await fetchAllBossGuildsForServer(currentServer!.id);
              setAllBossGuilds(updated);
            } catch { /* refresh failed, but data is saved */ }
          }}
        />
      )}

      {/* Members Tab */}
      {tab === "members" && (
        <div className="space-y-4">
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Members ({members.length})
            </h3>
            {membersLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-xs text-slate-500">No members yet.</p>
            ) : (
              <div className="space-y-1">
                {members.map((m) => {
                  const isExpanded = expandedModPerms === m.user_id;
                  const perms = modPermsData[m.user_id] ?? DEFAULT_MODERATOR_PERMISSIONS;
                  return (
                  <div key={m.user_id}>
                    <div
                      className={`flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/30 text-sm ${m.role === "moderator" && isOwner ? "cursor-pointer hover:bg-slate-800/50 transition" : ""}`}
                      onClick={() => m.role === "moderator" && isOwner && handleToggleModPerms(m.user_id)}
                    >
                    <span className="text-slate-300 text-xs truncate max-w-[200px]">
                      {m.email ?? m.user_id}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        m.role === "owner" ? "text-amber-400 bg-amber-900/30" : "text-slate-400 bg-slate-800"
                      }`}>
                        {m.role}
                      </span>
                      {isOwner && m.role === "moderator" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveMod(m.user_id); }}
                          className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition"
                          title="Remove moderator"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Permissions panel — slide down for moderators */}
                  {isOwner && m.role === "moderator" && (
                    <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}>
                      <div className="border-t border-slate-700/50 px-3 py-3 bg-slate-900/30 space-y-3">
                        <span className="text-xs font-medium text-white">Permissions for {m.email ?? "moderator"}</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {PERMISSION_SECTIONS.map(section => (
                            <div key={section.section} className="space-y-1.5">
                              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{section.section}</span>
                              {section.items.map(({ key, label, indent, parent }) => (
                                <label key={key} className={`flex items-center gap-2 cursor-pointer group ${indent ? "ml-5" : ""}`}>
                                  <input
                                    type="checkbox"
                                    checked={perms[key] === true}
                                    onChange={() => handleTogglePermission(m.user_id, key)}
                                    className={`rounded border-slate-600 bg-slate-800 focus:ring-purple-500/50 cursor-pointer ${parent ? "w-4 h-4 text-purple-600" : "w-3.5 h-3.5 text-purple-500/70"}`}
                                  />
                                  <span className={`group-hover:text-slate-300 transition ${parent ? "text-xs text-slate-300 font-medium" : "text-xs text-slate-400"}`}>{label}</span>
                                </label>
                              ))}
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => handleSavePermissions(m.user_id)}
                          disabled={savingPerms === m.user_id}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-50"
                        >
                          {savingPerms === m.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save Permissions
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
              </div>
            )}
          </section>

          {/* Add Moderator — owner only */}
          {isOwner && (
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-3 h-3" /> Add Moderator
            </h3>
            <p className="text-sm text-slate-400">
              Moderators can manage bosses, configure Discord webhooks, and edit server settings.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={modEmail}
                onChange={(e) => setModEmail(e.target.value)}
                placeholder="user@email.com"
                onKeyDown={(e) => e.key === "Enter" && handleAddMod()}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-purple-500 transition"
              />
              <button
                onClick={handleAddMod}
                disabled={addingMod || !modEmail.trim()}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-500 transition disabled:opacity-50"
              >
                {addingMod ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                Add
              </button>
            </div>
          </section>
          )}

          {isOwner && (() => {
            const moderators = members.filter((m) => m.role === "moderator");
            return (
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-white">Ownership</h3>

              <div>
                <h4 className="text-xs font-semibold text-amber-400 flex items-center gap-1 mb-2">
                  <Crown className="w-3 h-3" /> Transfer Ownership
                </h4>
                <p className="text-xs text-slate-400 mb-2">
                  Transfer ownership to a current moderator. You'll become a moderator.
                </p>
                {moderators.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No moderators to transfer to. Share the invite code to add moderators first.</p>
                ) : (
                <div className="flex gap-2">
                  <select
                    value={transferId}
                    onChange={(e) => setTransferId(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-amber-500 transition"
                  >
                    <option value="">Select a moderator...</option>
                    {moderators.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.email ?? m.user_id}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleTransfer}
                    disabled={transferring || !transferId}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-500 transition disabled:opacity-50"
                  >
                    {transferring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crown className="w-3 h-3" />}
                    Transfer
                  </button>
                </div>
                )}
              </div>
            </section>
            );
          })()}
        </div>
      )}

      {/* Integrations Tab — Discord Bot & Notifications */}
      {tab === "integrations" && (
        <div className="space-y-6">
          {/* Connected Servers */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Swords className="w-4 h-4" /> Linked Discord Servers
            </h3>

            {discordLinks.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No Discord servers linked yet.</p>
            ) : (
              <div className="space-y-3">
                {discordLinks.map(link => {
                  const isEditingChannels = !!channelValues[link.id];
                  const isEditingThreads = !!threadValues[link.id];
                  return (
                    <div key={link.id} className="bg-slate-800/40 border border-slate-700/50 rounded-lg overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center gap-3 px-4 py-3 bg-slate-800/60">
                        <span className="text-xs font-bold font-mono text-amber-400 bg-slate-700 px-2 py-1 rounded">{link.command_prefix || "!"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-mono truncate">{link.discord_guild_id}</p>
                          {link.label && <p className="text-[11px] text-slate-500 truncate">{link.label}</p>}
                        </div>
                        <button onClick={() => handleRemoveDiscordLink(link.id)} className="p-1.5 rounded hover:bg-red-900/30 text-slate-400 hover:text-red-400 transition" title="Remove link">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Body */}
                      <div className="p-4 space-y-4">
                        {/* Channels */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                              <Bell className="w-3.5 h-3.5" /> Notification & Command Channels
                            </h4>
                            {!isEditingChannels ? (
                              <button onClick={() => setChannelValues(prev => ({ ...prev, [link.id]: { notif: link.notification_channel_id || "", cmd: link.command_channel_id || "" } }))}
                                className="text-xs px-2.5 py-1 rounded bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition font-medium">
                                <Pencil className="w-3 h-3 inline mr-1" />Edit
                              </button>
                            ) : (
                              <div className="flex gap-1">
                                <button onClick={async () => {
                                  const vals = channelValues[link.id]; if (!vals) return;
                                  await supabase.from("discord_configs").update({ notification_channel_id: vals.notif.trim() || undefined, command_channel_id: vals.cmd.trim() || undefined }).eq("id", link.id);
                                  setDiscordLinks(prev => prev.map(d => d.id === link.id ? { ...d, notification_channel_id: vals.notif.trim() || undefined, command_channel_id: vals.cmd.trim() || undefined } : d));
                                  setChannelValues(prev => { const n = { ...prev }; delete n[link.id]; return n; });
                                }} className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-500 transition font-medium flex items-center gap-1">
                                  <Check className="w-3 h-3" />Save
                                </button>
                                <button onClick={() => setChannelValues(prev => { const n = { ...prev }; delete n[link.id]; return n; })}
                                  className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-400 hover:text-white transition">Cancel</button>
                              </div>
                            )}
                          </div>
                          {isEditingChannels ? (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] text-slate-500 block mb-1">Alert Channel ID</label>
                                <input type="text" value={channelValues[link.id].notif} onChange={(e) => setChannelValues(prev => ({ ...prev, [link.id]: { ...prev[link.id], notif: e.target.value }}))}
                                  placeholder="e.g. 1510221200259940442"
                                  className="w-full bg-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none focus:ring-1 focus:ring-blue-500" />
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-500 block mb-1">Command Channel ID</label>
                                <input type="text" value={channelValues[link.id].cmd} onChange={(e) => setChannelValues(prev => ({ ...prev, [link.id]: { ...prev[link.id], cmd: e.target.value }}))}
                                  placeholder="e.g. 1507015001091608729"
                                  className="w-full bg-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none focus:ring-1 focus:ring-blue-500" />
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-4 text-xs">
                              <span className="text-slate-500">Alerts: {link.notification_channel_id ? <code className="text-slate-300 font-mono">{link.notification_channel_id}</code> : <span className="italic text-slate-600">not set</span>}</span>
                              <span className="text-slate-500">Commands: {link.command_channel_id ? <code className="text-slate-300 font-mono">{link.command_channel_id}</code> : <span className="italic text-slate-600">not set</span>}</span>
                            </div>
                          )}
                        </div>

                        {/* Auto-Threads */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">
                              <MessageCircle className="w-3.5 h-3.5" /> Auto-Threads
                            </h4>
                            {!isEditingThreads ? (
                              <button onClick={() => setThreadValues(prev => ({ ...prev, [link.id]: { channelId: link.thread_channel_id || "", guilds: link.thread_guilds || [] } }))}
                                className="text-xs px-2.5 py-1 rounded bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition font-medium">
                                <Pencil className="w-3 h-3 inline mr-1" />Edit
                              </button>
                            ) : (
                              <div className="flex gap-1">
                                <button onClick={async () => {
                                  const vals = threadValues[link.id]; if (!vals) return;
                                  await updateThreadConfig(link.id, vals.channelId.trim() || null, vals.guilds);
                                  setDiscordLinks(prev => prev.map(d => d.id === link.id ? { ...d, thread_channel_id: vals.channelId.trim() || undefined, thread_guilds: vals.guilds } : d));
                                  setThreadValues(prev => { const n = { ...prev }; delete n[link.id]; return n; });
                                }} className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-500 transition font-medium flex items-center gap-1">
                                  <Check className="w-3 h-3" />Save
                                </button>
                                <button onClick={() => setThreadValues(prev => { const n = { ...prev }; delete n[link.id]; return n; })}
                                  className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-400 hover:text-white transition">Cancel</button>
                              </div>
                            )}
                          </div>
                          {isEditingThreads ? (
                            <div className="space-y-3">
                              {guilds.length > 0 && (
                                <div>
                                  <label className="text-[11px] text-slate-500 block mb-1.5">Guilds that trigger threads</label>
                                  <div className="flex flex-wrap gap-2">
                                    {guilds.map(g => {
                                      const checked = threadValues[link.id].guilds.includes(g.id);
                                      return (
                                        <label key={g.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer border text-xs font-medium transition ${
                                          checked ? "bg-purple-900/30 border-purple-700 text-purple-300" : "bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300"
                                        }`}>
                                          <input type="checkbox" checked={checked} onChange={() => {
                                            setThreadValues(prev => ({ ...prev, [link.id]: { ...prev[link.id], guilds: checked ? prev[link.id].guilds.filter(id => id !== g.id) : [...prev[link.id].guilds, g.id] } }));
                                          }} className="sr-only" />
                                          {g.name}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              <div>
                                <label className="text-[11px] text-slate-500 block mb-1">Thread Channel ID</label>
                                <input type="text" value={threadValues[link.id].channelId} onChange={(e) => setThreadValues(prev => ({ ...prev, [link.id]: { ...prev[link.id], channelId: e.target.value } }))}
                                  placeholder="Paste forum or text channel ID"
                                  className="w-full bg-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono outline-none focus:ring-1 focus:ring-purple-500" />
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500">
                              Threads: {link.thread_channel_id ? (
                                <><code className="text-slate-300 font-mono">{link.thread_channel_id}</code> <span className="text-purple-400">({((link.thread_guilds || []).map(gid => guilds.find(g => g.id === gid)?.name).filter(Boolean).join(", ")) || "no guilds"})</span></>
                              ) : (
                                <span className="italic text-slate-600">not set</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-1 border-t border-slate-700/50">
                          <button onClick={() => {
                            if (editAliasLinkId === link.id) { setEditAliasLinkId(null); return; }
                            setEditAliasLinkId(link.id); setEditAliases((link as any).command_aliases || {});
                          }}
                            className={`text-xs px-2.5 py-1 rounded font-medium flex items-center gap-1.5 transition ${
                              editAliasLinkId === link.id ? "bg-amber-600 text-white" : "bg-amber-900/30 text-amber-400 hover:bg-amber-900/50"
                            }`}>
                            <Pencil className="w-3 h-3" />{editAliasLinkId === link.id ? "Close Aliases" : "Command Aliases"}
                          </button>
                          <div className="flex items-center gap-1.5 ml-auto">
                            <label className="text-[11px] text-slate-500">Ping:</label>
                            <input type="text"
                              value={pingValues[link.id] ?? ((link as any).notification_prefix || "")}
                              onChange={(e) => setPingValues(prev => ({ ...prev, [link.id]: e.target.value }))}
                              placeholder="@everyone"
                              className={`bg-slate-700 border border-slate-600 px-2 py-1 text-xs text-slate-200 font-mono outline-none focus:ring-1 focus:ring-blue-500 transition ${
                                (pingValues[link.id] ?? "") !== ((link as any).notification_prefix || "")
                                  ? "rounded-l w-28" : "rounded w-36"
                              }`} />
                            {(pingValues[link.id] ?? "") !== ((link as any).notification_prefix || "") && (
                              <button
                                onClick={async () => {
                                  const val = (pingValues[link.id] || "").trim();
                                  await supabase.from("discord_configs").update({ notification_prefix: val || null }).eq("id", link.id);
                                  setDiscordLinks(prev => prev.map(d => d.id === link.id ? { ...d, notification_prefix: val } : d));
                                  setPingValues(prev => { const n = { ...prev }; delete n[link.id]; return n; });
                                  toast("success", val ? `Ping set to "${val}"` : "Ping reset to default");
                                }}
                                className="text-xs px-2 py-1 rounded-r bg-blue-600 text-white hover:bg-blue-500 transition font-medium">Save</button>
                            )}
                          </div>
                          <button onClick={async () => {
                            if (!currentServer) return;
                            setTestingDiscord(prev => new Set(prev).add(link.id));
                            try {
                              const events: Array<{ event: "boss_spawning" | "boss_spawned" | "boss_died"; delay: number }> = [
                                { event: "boss_spawning", delay: 0 }, { event: "boss_spawned", delay: 800 }, { event: "boss_died", delay: 1600 },
                              ];
                              let okCount = 0;
                              for (const { event, delay } of events) {
                                await new Promise(r => setTimeout(r, delay));
                                const r = await notifyDiscord(currentServer.id, event, { boss_name: "Test Notification (Ignore)", guild_name: "System" });
                                if (r.ok) okCount++;
                              }
                              if (okCount === 3) toast("success", "All 3 test notifications sent!");
                              else if (okCount > 0) toast("warning", `${okCount}/3 sent. Check channel IDs and bot status.`);
                              else toast("error", "Failed to send. Check channel IDs and bot status.");
                            } catch { toast("error", "Failed to send. Is the bot online?"); }
                            finally { setTestingDiscord(prev => { const n = new Set(prev); n.delete(link.id); return n; }); }
                          }} disabled={testingDiscord.has(link.id)}
                            className="text-xs px-2.5 py-1 rounded bg-green-900/30 text-green-400 hover:bg-green-900/50 transition font-medium flex items-center gap-1.5 disabled:opacity-50">
                            {testingDiscord.has(link.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            Test Notifications
                          </button>
                        </div>

                        {/* Inline Command Aliases Editor */}
                        {editAliasLinkId === link.id && (
                          <div className="pt-3 border-t border-slate-700/50 animate-slideDown">
                            <div className="space-y-2">
                              {["list","nextspawn","killed","forcespawn","forcespawnall","commands","notifhere","threadhere","cmdhere"].map(cmd => (
                                <div key={cmd} className="flex items-center gap-2">
                                  <span className="text-xs text-amber-400 w-24 font-mono">{cmd}</span>
                                  <span className="text-xs text-slate-600">→</span>
                                  <input type="text" value={editAliases[cmd] || ""} onChange={e => setEditAliases(prev => ({ ...prev, [cmd]: e.target.value }))}
                                    placeholder={cmd}
                                    className="flex-1 bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500 transition font-mono" />
                                </div>
                              ))}
                              <button onClick={async () => {
                                const { error } = await supabase.from("discord_configs").update({ command_aliases: editAliases }).eq("id", editAliasLinkId);
                                if (error) { toast("error", error.message); return; }
                                setDiscordLinks(prev => prev.map(d => d.id === editAliasLinkId ? { ...d, command_aliases: editAliases } : d));
                                setEditAliasLinkId(null); toast("success", "Aliases saved!");
                              }} className="px-4 py-2 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-500 transition flex items-center gap-1.5">
                                <Check className="w-3.5 h-3.5" /> Save Aliases
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new link */}
            <div className="pt-2 border-t border-slate-800">
              <h4 className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Link New Discord Server
              </h4>
              <div className="flex gap-2">
                <input type="text" value={newDiscordId} onChange={(e) => setNewDiscordId(e.target.value)}
                  placeholder="Discord Server ID" ref={discordIdInputRef}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-purple-500 transition font-mono" />
                <input type="text" value={newDiscordLabel} onChange={(e) => setNewDiscordLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="w-36 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-purple-500 transition" />
                <button onClick={handleAddDiscordLink} disabled={savingDiscord || !newDiscordId.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-500 transition disabled:opacity-50">
                  {savingDiscord ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                  Link
                </button>
              </div>
            </div>
          </section>

          {/* Getting Started Guide */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Getting Started</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-purple-400 bg-purple-900/20 px-2 py-0.5 rounded">Step 1</span>
                <p className="text-xs text-slate-300 font-medium">Link your Discord server</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Enable <strong>Developer Mode</strong> in Discord (Settings → Advanced). Right-click your server icon → <strong>Copy Server ID</strong>. Paste above and click <strong>Link</strong>.
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-purple-400 bg-purple-900/20 px-2 py-0.5 rounded">Step 2</span>
                <p className="text-xs text-slate-300 font-medium">Invite the bot</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  <a href="https://discord.com/api/oauth2/authorize?client_id=1508368991272566975&permissions=2147485696&scope=bot%20applications.commands" target="_blank" rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 underline font-medium">Click here to invite RaidScout Bot</a> to your Discord server.
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-purple-400 bg-purple-900/20 px-2 py-0.5 rounded">Step 3</span>
                <p className="text-xs text-slate-300 font-medium">Configure channels</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  In Discord, type <code className="bg-slate-800 px-1 rounded text-amber-400 font-mono text-xs">&lt;prefix&gt;notifhere</code> for alerts, <code className="bg-slate-800 px-1 rounded text-amber-400 font-mono text-xs">&lt;prefix&gt;threadhere</code> for auto-threads, and <code className="bg-slate-800 px-1 rounded text-amber-400 font-mono text-xs">&lt;prefix&gt;cmdhere</code> to restrict commands.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800">
              <h4 className="text-xs font-semibold text-slate-400 mb-2">Available Commands</h4>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;nextspawn</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Boss spawns in 24h</span></p>
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;nextspawn &lt;boss&gt;</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Check a specific boss</span></p>
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;nextspawn &lt;guild&gt;</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Spawns for a guild</span></p>
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;killed &lt;boss&gt;</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Record a kill now</span></p>
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;killed &lt;boss&gt; HH:MM</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Kill at custom time</span></p>
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;forcespawn &lt;boss&gt;</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Force a boss to spawn</span></p>
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;forcespawnall</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Spawn all fixed-timer bosses</span></p>
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;list</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Show all boss names</span></p>
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;notifhere</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Set notification channel</span></p>
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;threadhere</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Set auto-thread channel</span></p>
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;cmdhere</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Restrict commands to channel</span></p>
                <p className="text-xs"><code className="text-amber-400 font-mono text-xs">&lt;prefix&gt;commands</code> <span className="text-slate-500">—</span> <span className="text-slate-400">Show all commands</span></p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Danger Tab */}
      {tab === "danger" && isOwner && (
        <section className="bg-slate-900 border border-red-900/30 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
          <p className="text-sm text-slate-400">
            Archive this server. Your data is preserved and can be restored by an admin. You won't see this server anymore.
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-900/30 text-red-400 hover:bg-red-900/50 transition border border-red-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Archive Server
            </button>
          ) : (
            <div className="space-y-3 p-3 rounded-lg bg-red-900/10 border border-red-900/30">
              <p className="text-xs text-red-300 font-medium">
                Type <code className="bg-red-900/30 px-1 rounded text-red-200">{currentServer.name}</code> to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={currentServer.name}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-red-500 transition"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmName(""); }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteConfirmName.trim() !== currentServer.name}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {deleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Archive Server
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ── Boss Points Matrix (per-guild points + salary) ─────────

const BOSS_PRIORITY_LIST = [
  "Venatus", "Viorent", "Ego", "Clemantis", "Livera", "Araneo", "Undomiel",
  "Saphirus", "Neutro", "Lady Dalia", "General Aquleus", "Thymele", "Amentis",
  "Baron", "Milavy", "Wannitas", "Metus", "Duplican", "Shuliar", "Ringor",
  "Roderick", "Gareth", "Titore", "Larba", "Catena", "Auraq", "Secreta",
  "Ordo", "Asta", "Supore", "Chaiflock", "Benji", "Libitina", "Rakajeth",
  "Icaruthia", "Motti", "Nevaeh", "Tumier", "Lucus",
];

function BossPointsMatrix({
  bosses,
  guilds,
  allBossGuilds,
  savingCell,
  onPointsChange,
  onSalaryChange,
  onBatchSalaryChange,
}: {
  bosses: Boss[];
  guilds: Guild[];
  allBossGuilds: BossGuild[];
  savingCell: string | null;
  onPointsChange: (bossId: string, guildId: string, points: number | null) => Promise<void>;
  onSalaryChange: (bossId: string, guildId: string, hasSalary: boolean) => Promise<void>;
  onBatchSalaryChange: (guildId: string, bossIds: string[], hasSalary: boolean) => Promise<void>;
}) {
  const sortedBosses = useMemo(() => {
    return [...bosses].sort((a, b) => {
      const ia = BOSS_PRIORITY_LIST.indexOf(a.name);
      const ib = BOSS_PRIORITY_LIST.indexOf(b.name);
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [bosses]);

  // Build lookup: "bossId|guildId" → BossGuild
  const bgLookup = useMemo(() => {
    const map = new Map<string, BossGuild>();
    for (const bg of allBossGuilds) {
      map.set(`${bg.boss_id}|${bg.guild_id}`, bg);
    }
    return map;
  }, [allBossGuilds]);

  // Compute whether each guild has all salaries checked (from data)
  const guildAllChecked = useMemo(() => {
    const result = new Map<string, boolean>();
    for (const guild of guilds) {
      const allChecked = sortedBosses.every(boss => {
        const bg = bgLookup.get(`${boss.id}|${guild.id}`);
        return bg?.has_salary === true;
      });
      result.set(guild.id, allChecked);
    }
    return result;
  }, [guilds, sortedBosses, bgLookup]);

  const handleCheckAllSalary = async (guildId: string) => {
    const currentlyAll = guildAllChecked.get(guildId) ?? false;

    // Batch all bosses
    const target = !currentlyAll;
    const bossIds = sortedBosses.map(b => b.id);
    try {
      await onBatchSalaryChange(guildId, bossIds, target);
    } catch (err: any) {
      console.error("Check-all salary failed:", err?.message ?? err);
    }
  };

  if (guilds.length === 0) {
    return (
      <div className="text-center py-16">
        <Shield className="w-10 h-10 text-slate-700 mx-auto mb-3" />
        <p className="text-slate-500">No guilds created yet.</p>
        <p className="text-slate-600 text-sm mt-1">Create guilds in the Guilds tab first.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-900 px-3 py-2 text-left text-slate-400 font-medium border-b border-r border-slate-700/50 z-10 min-w-[160px]">
              Boss
            </th>
            {guilds.map(g => (
              <th key={g.id} colSpan={2} className="px-3 py-2 text-center text-slate-400 font-medium border-b border-slate-700/50 border-l border-slate-700/30">
                {g.name}
              </th>
            ))}
          </tr>
          <tr>
            <th className="sticky left-0 bg-slate-900 px-3 py-1 border-r border-slate-700/50 z-10" />
            {guilds.map(g => (
              <Fragment key={g.id}>
                <th className="px-2 py-1 text-center text-[10px] text-slate-500 font-normal border-l border-slate-700/30">Pts</th>
                <th className="px-2 py-1 text-center border-l-0">
                  <label className="flex items-center justify-center gap-1 cursor-pointer" title="Check/uncheck all salaries for this guild">
                    <input
                      type="checkbox"
                      checked={guildAllChecked.get(g.id) ?? false}
                      onChange={() => handleCheckAllSalary(g.id)}
                      className="w-3 h-3 rounded border-slate-600 bg-slate-800 text-emerald-600 focus:ring-emerald-500/50 cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-500 font-normal">Salary</span>
                  </label>
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedBosses.map(boss => (
            <tr key={boss.id} className="group border-b border-slate-800/50 hover:bg-slate-800/20 transition">
              <td className="sticky left-0 bg-slate-900 group-hover:bg-slate-800/20 px-3 py-2 text-white font-medium border-r border-slate-700/30 z-10 transition">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${boss.spawn_type === "fixed_schedule" ? "bg-blue-400" : "bg-orange-400"}`} />
                  {boss.name}
                </div>
              </td>
              {guilds.map(guild => {
                const key = `${boss.id}|${guild.id}`;
                const bg = bgLookup.get(key);
                const points = bg?.points ?? null;
                const hasSalary = bg?.has_salary ?? false;
                const isSaving = savingCell === `${boss.id}-${guild.id}`;

                return (
                  <Fragment key={guild.id}>
                    {/* Points cell */}
                    <td className="px-1 py-1 text-center border-l border-slate-700/30">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => onPointsChange(boss.id, guild.id, Math.max(0, (points ?? 1) - 1))}
                          disabled={isSaving || (points ?? 1) <= 0}
                          className={`p-0.5 rounded transition ${(points ?? 1) <= 0 ? "text-slate-700 cursor-default" : "text-slate-500 hover:text-red-400"}`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className={`font-mono tabular-nums min-w-[1.5em] text-center ${points != null ? "text-amber-400" : "text-slate-500"}`}>
                          {isSaving ? <Loader2 className="w-3 h-3 animate-spin inline" /> : (points ?? boss.boss_points ?? 1)}
                        </span>
                        <button
                          onClick={() => onPointsChange(boss.id, guild.id, Math.min(99, (points ?? 1) + 1))}
                          disabled={isSaving || (points ?? 1) >= 99}
                          className={`p-0.5 rounded transition ${(points ?? 1) >= 99 ? "text-slate-700 cursor-default" : "text-slate-500 hover:text-emerald-400"}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    {/* Salary cell */}
                    <td className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={hasSalary}
                        disabled={isSaving}
                        onChange={() => onSalaryChange(boss.id, guild.id, !hasSalary)}
                        className="w-3 h-3 rounded border-slate-600 bg-slate-800 text-emerald-600 focus:ring-emerald-500/50 cursor-pointer disabled:opacity-50"
                      />
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-600 mt-2 text-center">
        Points default to server-wide value if not overridden. Salary is per-guild.
      </p>
    </div>
  );
}
