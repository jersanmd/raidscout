import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { useNavigate, useSearchParams, Link as RouterLink } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useServer } from "@/contexts/ServerContext";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAuditLog, AUDIT_ACTION_GROUPS, writeAuditEntry, AuditAction, deleteServer, transferServerOwnership, removeServerModerator, addServerModerator, supabase, fetchServerMembers, type ServerMember, fetchGuilds, createGuild, updateGuildName, deleteGuild, fetchBossGuilds, setBossGuilds, fetchAllBossGuildsForServer, upsertBossGuildPoints, batchSetGuildSalary, fetchBosses, setBossPoints, setBossSalary, notifyDiscord, fetchModeratorPermissions, updateModeratorPermissions, updateThreadConfig, fetchPointRules, createPointRule, updatePointRule, deletePointRule, fetchBossAssists, toggleBossAssist, fetchAllActivitiesForServer, fetchAllActivityGuildsForServer, upsertActivityGuildPoints, fetchActivityAssists, toggleActivityAssist, type ModeratorPermissions, DEFAULT_MODERATOR_PERMISSIONS } from "@/lib/supabase";
import type { Guild, BossGuild, Boss, PointRule, BossAssist, Activity, ActivityGuild, ActivityAssist } from "@/types";
import { Loader2, Trash2, Crown, ArrowLeft, Server, Check, Key, Copy, RefreshCw, Plus, LogIn, Users, Bell, Link as LinkIcon, Settings, AlertTriangle, X, Shield, Pencil, Swords, ChevronUp, ChevronDown, CheckSquare, Square, Eye, EyeOff, UserPlus, Minus, Trophy, Send, Save, MessageCircle, Zap, Calendar, Search, Skull, CreditCard, Lock, Mail, MailCheck, MailWarning, ScrollText } from "lucide-react";
import { ServerBossesActivitiesTab } from "@/components/ServerBossesActivitiesTab";
import { ActivityGuildsTab } from "@/components/server/ActivityGuildsTab";
import { ActivityPointsMatrix } from "@/components/server/ActivityPointsMatrix";
import { CreateServerModal } from "@/components/CreateServerModal";
import { ExpiredGate } from "@/components/ExpiredGate";
import { useToast } from "@/contexts/ToastContext";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export function ServerSettingsView() {
  const { currentServer, servers, loading: serversLoading, setCurrentServer, refreshServers, bumpWebhookVersion } = useServer();
  const { user, userRole, isViewer } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Permission list — flat, each gates a distinct area
  const PERMISSION_SECTIONS = [
    { section: "Core Access", items: [
      { key: "can_access_settings" as const, label: "Access Server Settings" },
      { key: "can_manage_integrations" as const, label: "Manage Integrations & Discord" },
    ]},
    { section: "Data & Records", items: [
      { key: "can_record_death" as const, label: "Record & Edit Kills / Activities" },
      { key: "can_manage_spawns" as const, label: "Manage Spawns & Rotations" },
      { key: "can_manage_server_content" as const, label: "Manage Server Bosses & Activities" },
    ]},
    { section: "Guilds & Members", items: [
      { key: "can_manage_guilds" as const, label: "Manage Guilds & Assignments" },
      { key: "can_manage_members" as const, label: "Manage Members & Moderators" },
    ]},
    { section: "Economy", items: [
      { key: "can_manage_points" as const, label: "Manage Points & Attendance" },
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
      // Fetch verification status for all members
      supabase.rpc("get_member_verification", { p_server_id: currentServer.id })
        .then(({ data }) => {
          if (data) {
            const map: Record<string, boolean> = {};
            (data as any[]).forEach((r: any) => { map[r.user_id] = r.is_verified; });
            setVerificationStatus(map);
          }
        }, () => setVerificationStatus({}));
      // Fetch admin user IDs (for masking admin emails)
      supabase.rpc("get_admin_user_ids")
        .then(({ data }) => {
          if (data) setAdminUserIds(new Set((data as any[]).map((r: any) => r.user_id)));
        }, () => {});
      // Fetch guilds
      setGuildsLoading(true);
      fetchGuilds(currentServer.id)
        .then(setGuilds)
        .catch(() => setGuilds([]))
        .finally(() => setGuildsLoading(false));
      // Fetch activities + activity guild points
      setActivitiesLoading(true);
      Promise.all([
        fetchAllActivitiesForServer(currentServer.id).catch(err => { console.error("Failed to fetch activities:", err); return [] as Activity[]; }),
        fetchAllActivityGuildsForServer(currentServer.id).catch(err => { console.error("Failed to fetch activity guilds:", err); return [] as ActivityGuild[]; }),
      ]).then(([a, ag]) => {
        setActivities(a);
        setAllActivityGuilds(ag);
      }).catch(err => { console.error("Failed to process activity data:", err); })
        .finally(() => setActivitiesLoading(false));
      // Fetch activity assists
      fetchActivityAssists(currentServer.id)
        .then(setActivityAssists)
        .catch(() => setActivityAssists([]));
      // Fetch bosses + guild assignments + boss points matrix
      setBossGuildsLoading(true);
      Promise.all([
        fetchBosses(currentServer.id).catch(err => { console.error("Failed to fetch bosses:", err); return [] as Boss[]; }),
        fetchBossGuilds(currentServer.id).catch(err => { console.error("Failed to fetch boss guilds:", err); return [] as BossGuild[]; }),
        fetchAllBossGuildsForServer(currentServer.id).catch(err => { console.error("Failed to fetch all boss guilds:", err); return [] as BossGuild[]; }),
      ]).then(([b, bg, abg]) => {
        setBosses(b);
        setBossGuildsState(bg);
        setAllBossGuilds(abg);
        // Initialize bossModes from data
        const modes: Record<string, "none" | "rotation" | "schedule" | "daily"> = {};
        for (const boss of b) {
          // Filter out points-only rows (sort_order = -1 sentinel)
          const bgs = bg.filter(x => x.boss_id === boss.id && x.sort_order !== -1);
          if (bgs.length === 0) modes[boss.id] = "none";
          else if (bgs[0].mode === "daily") modes[boss.id] = "daily";
          else if (bgs[0].mode === "schedule") modes[boss.id] = "schedule";
          else if (bgs[0].sort_order !== null) modes[boss.id] = "rotation";
          else modes[boss.id] = "none";
        }
        setBossModes(modes);
      })
        .catch(err => { console.error("Failed to process boss data:", err); })
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
      // Fetch point rules
      setRulesLoading(true);
      fetchPointRules(currentServer.id)
        .then(setPointRules)
        .catch(() => setPointRules([]))
        .finally(() => setRulesLoading(false));
      // Fetch boss assists
      setAssistsLoading(true);
      fetchBossAssists(currentServer.id)
        .then(setBossAssists)
        .catch(() => setBossAssists([]))
        .finally(() => setAssistsLoading(false));
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
  const [pendingTimezone, setPendingTimezone] = useState<string | null>(null);
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<Record<string, boolean>>({});
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [allActivityGuilds, setAllActivityGuilds] = useState<ActivityGuild[]>([]);
  const [activityAssists, setActivityAssists] = useState<ActivityAssist[]>([]);
  const [webhookUrl, setWebhookUrl] = useState(currentServer?.discord_webhook_url ?? "");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [notifPrefix, setNotifPrefix] = useState(currentServer?.notification_prefix ?? "@everyone");
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [modEmail, setModEmail] = useState("");
  const [addingMod, setAddingMod] = useState(false);
  const [viewerKey, setViewerKey] = useState("");
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [showViewerKey, setShowViewerKey] = useState(false);
  const [discordLinks, setDiscordLinks] = useState<{ id: string; discord_guild_id: string; label?: string; webhook_url?: string; command_prefix?: string; notification_channel_id?: string; command_channel_id?: string; progress_channel_id?: string; thread_channel_id?: string; thread_guilds?: string[]; notification_prefix?: string }[]>([]);
  const [newDiscordId, setNewDiscordId] = useState("");
  const [newDiscordLabel, setNewDiscordLabel] = useState("");
  const [newDiscordPrefix, setNewDiscordPrefix] = useState("!");
  const [savingDiscord, setSavingDiscord] = useState(false);
  const [discordToRemove, setDiscordToRemove] = useState<{ id: string; label: string } | null>(null);
  const [discordRemoveConfirmLabel, setDiscordRemoveConfirmLabel] = useState("");
  const [channelToClear, setChannelToClear] = useState<{ linkId: string; field: string; value: string; label: string } | null>(null);
  const [channelClearConfirm, setChannelClearConfirm] = useState("");
  const notifyDiscordUpdated = () => window.dispatchEvent(new Event("discord-config-updated"));
  const [usedPrefixes, setUsedPrefixes] = useState(new Set<string>());
  const [globalPrefixOwners, setGlobalPrefixOwners] = useState<Map<string, Set<string>>>(new Map());
  const [editAliasLinkId, setEditAliasLinkId] = useState<string | null>(null);
  const [editAliases, setEditAliases] = useState<Record<string, string>>({});
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLinkValues, setEditLinkValues] = useState<{ discord_guild_id: string; label: string; command_prefix: string }>({ discord_guild_id: "", label: "", command_prefix: "!" });
  const [channelValues, setChannelValues] = useState<Record<string, { notif: string; cmd: string; progress?: string }>>({});
  const [pingValues, setPingValues] = useState<Record<string, string>>({});
  const [threadValues, setThreadValues] = useState<Record<string, { channelId: string; guilds: string[] }>>({});
  const [testingDiscord, setTestingDiscord] = useState<Set<string>>(new Set());
  const [expandedModPerms, setExpandedModPerms] = useState<string | null>(null); // user_id of expanded moderator
  const [modPermsData, setModPermsData] = useState<Record<string, ModeratorPermissions>>({}); // loaded permissions per user
  const [savingPerms, setSavingPerms] = useState<string | null>(null); // user_id being saved
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = (tabParam === "general" || tabParam === "members" || tabParam === "integrations" || tabParam === "danger" || tabParam === "boss-points" || tabParam === "bosses" || tabParam === "activities" || tabParam === "activity-points" || tabParam === "activity-guilds" || tabParam === "boss-guilds" || tabParam === "guilds" || tabParam === "account")
    ? tabParam
    : "general";
  const [tab, setTab] = useState<string>(initialTab);

  // Update both state and URL when tab changes
  const setTabAndUrl = (key: string) => {
    setTab(key);
    const params = new URLSearchParams(searchParams);
    params.set("tab", key);
    navigate(`?${params.toString()}`, { replace: true });
  };

  const GATED_TABS = new Set(["bosses", "boss-points", "boss-guilds", "activities", "activity-points", "activity-guilds", "integrations"]);
  const isExpired = currentServer?.isExpired ?? false;
  const isTabLocked = isExpired && GATED_TABS.has(tab);

  useEffect(() => {
    const gid = newDiscordId.trim();
    if (!gid) { setUsedPrefixes(new Set()); return; }
    // Fetch prefixes already used by this guild across ALL servers.
    // A guild CANNOT reuse a prefix it already uses elsewhere.
    supabase.from("discord_configs").select("command_prefix").eq("discord_guild_id", gid)
      .then(({ data }) => setUsedPrefixes(new Set((data || []).map((d: any) => d.command_prefix))));
  }, [newDiscordId]);

  // Fetch all guild → prefixes assignments across all servers (for edit select)
  useEffect(() => {
    supabase.from("discord_configs").select("command_prefix,discord_guild_id")
      .then(({ data }) => {
        const map = new Map<string, Set<string>>(); // guild_id → set of prefixes
        (data || []).forEach((d: any) => {
          if (!map.has(d.discord_guild_id)) map.set(d.discord_guild_id, new Set());
          map.get(d.discord_guild_id)!.add(d.command_prefix);
        });
        setGlobalPrefixOwners(map);
      });
  }, []);

  // Highlight Discord Server ID input when navigated from banner
  const discordIdInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (highlight === "discord-id" && discordIdInputRef.current) {
      // Switch to integrations tab
      setTabAndUrl("integrations");
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

  // Point Rules state
  const [pointRules, setPointRules] = useState<PointRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleGuildId, setNewRuleGuildId] = useState("");
  const [newRuleStartHour, setNewRuleStartHour] = useState(0);
  const [newRuleEndHour, setNewRuleEndHour] = useState(6);
  const [newRuleMultiplier, setNewRuleMultiplier] = useState(2);
  const [savingRule, setSavingRule] = useState(false);

  // Boss Assists state
  const [bossAssists, setBossAssists] = useState<BossAssist[]>([]);
  const [assistsLoading, setAssistsLoading] = useState(false);

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
  const [bossSearch, setBossSearch] = useState("");

  // Escape key closes all inline panels
  useEscapeKey(() => {
    setShowDeleteConfirm(false);
    setDeleteConfirmName("");
    setShowAddRule(false);
  });

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
        const existing = getBossGuildsForBoss(bossId).filter(bg => bg.day_of_week !== null && bg.day_of_week !== dayOfWeek);
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
      setTabAndUrl("general");
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
        <Loader2 className="w-6 h-6 text-[#71717a] animate-spin" />
      </div>
    );
  }

  if (!currentServer) {
    const isAdmin = userRole === "admin";
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-3">
        <Server className="w-12 h-12 text-[#3f3f46] mx-auto" />
        <p className="text-[#a1a1aa]">
          {isAdmin
            ? "As an admin, use the Admin Panel to select a server first."
            : "No server selected. Create one first."}
        </p>
        {isAdmin && (
          <button
            onClick={() => navigate("/admin")}
            className="text-sm text-[#a1a1aa] hover:text-[#d4d4d8] transition"
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
      try {
        const all = await fetchModeratorPermissions(currentServer.id);
        setModPermsData(prev => ({ ...prev, [userId]: all[userId] ?? { ...DEFAULT_MODERATOR_PERMISSIONS } }));
      } catch (err: any) {
        toast("error", err?.message ?? "Failed to load permissions");
        setModPermsData(prev => ({ ...prev, [userId]: { ...DEFAULT_MODERATOR_PERMISSIONS } }));
      }
    }
  };

  const handleTogglePermission = (userId: string, perm: keyof ModeratorPermissions) => {
    setModPermsData(prev => {
      const current = prev[userId] ?? { ...DEFAULT_MODERATOR_PERMISSIONS };
      return { ...prev, [userId]: { ...current, [perm]: !current[perm] } };
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
      writeAuditEntry({ action: AuditAction.INVITE_REGENERATE, server_id: currentServer.id });
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
      writeAuditEntry({ action: AuditAction.VIEWER_KEY_REGENERATE, server_id: currentServer.id });
      toast("success", "Viewer key regenerated!");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to regenerate viewer key");
    }
  };

  // ── Point Rules handlers ──────────────────────────────────

  const handleAddPointRule = async () => {
    if (!newRuleGuildId || !currentServer) return;
    setSavingRule(true);
    try {
      const rule = await createPointRule(currentServer.id, newRuleGuildId, "time_multiplier", {
        start_hour: newRuleStartHour,
        end_hour: newRuleEndHour,
        multiplier: newRuleMultiplier,
      });
      setPointRules(prev => [...prev, rule]);
      setShowAddRule(false);
      setNewRuleGuildId("");
      setNewRuleStartHour(0);
      setNewRuleEndHour(6);
      setNewRuleMultiplier(2);
      toast("success", "Point rule added!");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to add rule");
    } finally {
      setSavingRule(false);
    }
  };

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      await updatePointRule(ruleId, { enabled });
      setPointRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled } : r));
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to toggle rule");
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await deletePointRule(ruleId);
      setPointRules(prev => prev.filter(r => r.id !== ruleId));
      toast("success", "Rule deleted");
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to delete rule");
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
    // Pick first prefix this guild hasn't already used in another server
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
      // Auto-assign all guilds to auto-thread by default
      const allGuildIds = guilds.map(g => g.id);
      if (allGuildIds.length > 0) {
        await supabase.from("discord_configs").update({ thread_guilds: allGuildIds }).eq("id", data.id);
        data.thread_guilds = allGuildIds;
      }
      setDiscordLinks(prev => [...prev, data]);
      notifyDiscordUpdated();
      queryClient.invalidateQueries({ queryKey: ["discord_configs", currentServer.id] });
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
      notifyDiscordUpdated();
      queryClient.invalidateQueries({ queryKey: ["discord_configs", currentServer.id] });
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
    const bgs = getBossGuildsForBoss(bossId).filter(bg => bg.sort_order !== -1);
    if (bgs.length === 0) return "none";
    if (bgs[0].mode === "daily") return "daily";
    if (bgs[0].mode === "schedule") return "schedule";
    if (bgs[0].sort_order !== null) return "rotation";
    return "none";
  };

  const handleSetBossMode = async (bossId: string, mode: "none" | "rotation" | "schedule" | "daily") => {
    const currentMode = bossModes[bossId];
    if (currentMode === mode) return;

    setSavingBossId(bossId);
    setBossModes(prev => ({ ...prev, [bossId]: mode }));
    setExpandedBoss(bossId);

    try {
      // Clear local state immediately so stale rows don't leak into schedule handlers
      setBossGuildsState(prev => prev.filter(bg => bg.boss_id !== bossId));
      await setBossGuilds(bossId, []);
    } catch (err: any) {
      toast("error", err?.message ?? "Failed to set mode");
      // Revert the mode change on error
      setBossModes(prev => ({ ...prev, [bossId]: currentMode }));
    } finally {
      setSavingBossId(null);
    }
  };

  const handleAddRotationGuild = async (bossId: string, guildId: string) => {
    setSavingBossId(bossId);
    try {
      const existing = getBossGuildsForBoss(bossId).filter(bg => bg.sort_order !== null && bg.sort_order > 0);
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
    // Optimistic update: update local state immediately so the dropdown reflects the change
    const existing = getBossGuildsForBoss(bossId).filter(bg => bg.day_of_week !== null && bg.day_of_week !== dayOfWeek);
    const newAssignments = existing.map(bg => ({ guild_id: bg.guild_id, day_of_week: bg.day_of_week! }));
    if (guildId) {
      newAssignments.push({ guild_id: guildId, day_of_week: dayOfWeek });
    }
    // Build optimistic rows for local state (with temporary ids)
    const optimisticRows = newAssignments.map(a => ({
      id: `opt-${bossId}-${a.guild_id}-${a.day_of_week}`,
      boss_id: bossId,
      guild_id: a.guild_id,
      sort_order: null as number | null,
      day_of_week: a.day_of_week ?? null,
      mode: "schedule" as const,
      points: null as number | null,
      has_salary: false,
    }));
    setBossGuildsState(prev => [...prev.filter(bg => bg.boss_id !== bossId), ...optimisticRows]);
    setBossModes(prev => ({ ...prev, [bossId]: newAssignments.length > 0 ? "schedule" : "none" }));

    try {
      await setBossGuilds(bossId, newAssignments, "schedule");
      // Trust the optimistic update — don't refetch (edge function may return stale data)
    } catch (err: any) {
      // Revert on failure
      const reverted = await fetchBossGuilds(currentServer!.id);
      setBossGuildsState(reverted);
      setBossModes(prev => ({ ...prev, [bossId]: getBossMode(bossId) }));
      toast("error", err?.message ?? "Failed to set schedule");
    }
  };

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="max-w-[100%] 2xl:max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6 overflow-x-hidden">
      <div className="flex items-center gap-3 mb-3 sm:mb-0">
        <button onClick={() => navigate("/")} className="text-[#a1a1aa] hover:text-[#fafafa] p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg sm:text-xl font-bold text-[#fafafa]">Server Settings</h2>
        {isOwner && <span className="text-xs bg-[#18181b] text-[#a1a1aa] px-2 py-0.5 rounded-full">Owner</span>}
      </div>

      {/* Mobile tab bar */}
      <div className="sm:hidden flex flex-wrap items-center gap-1 pb-1 mt-2">
        {(["general","guilds","bosses","boss-points","boss-guilds","activities","activity-points","activity-guilds","members","integrations","account",...(isOwner?["danger"]:[])] as string[]).map((key) => {
          const labels: Record<string,string> = {general:"General",guilds:"Guilds",bosses:"Bosses","boss-points":"Boss Points","boss-guilds":"Boss Guild Assignments",activities:"Activities","activity-points":"Activity Points","activity-guilds":"Activity Guild Assignments",members:"Moderator/Permissions",integrations:"Integrations",account:"Account",danger:"Danger"};
          const locked = isExpired && GATED_TABS.has(key);
          return <button key={key} onClick={() => { if (!locked) setTabAndUrl(key); }}
            disabled={locked}
            className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium transition whitespace-nowrap ${
              locked ? "text-[#3f3f46] cursor-not-allowed" :
              tab===key ? "bg-[#27272a] text-[#fafafa]" : "text-[#71717a] hover:text-[#d4d4d8]"
            }`}>
            {locked && <Lock className="w-3 h-3 inline mr-1" />}
            {labels[key]}
          </button>;
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start mt-3 sm:mt-6">
        {/* Sidebar — hidden on mobile */}
        <div className="hidden sm:block w-[220px] lg:w-[260px] shrink-0 space-y-3 sm:space-y-4 sticky top-6">
          <div className="space-y-2">
            <button onClick={() => setShowCreateModal(true)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#18181b] border border-[#27272a] text-[#fafafa] hover:bg-[#27272a] transition">
              <Plus className="w-3.5 h-3.5" /> Create New
            </button>
            <div className="flex gap-1">
              <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Invite code..."
                className="flex-1 bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-2 text-xs text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition" />
              <button onClick={handleJoin} disabled={joining || !inviteCode.trim()}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-[#18181b] border border-[#27272a] text-[#fafafa] hover:bg-[#27272a] transition disabled:opacity-40">
                {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          {showCreateModal && <CreateServerModal onClose={() => setShowCreateModal(false)} />}
          <nav className="bg-[#18181b] border border-[#27272a] rounded-xl p-1 space-y-0.5">
            {(["general","guilds","bosses","boss-points","boss-guilds","activities","activity-points","activity-guilds","members","integrations","account",...(isOwner?["danger"]:[])] as string[]).map((key) => {
              const icons: Record<string,React.ComponentType<{className?:string}>> = {general:Settings,guilds:Shield,bosses:Skull,"boss-points":Trophy,"boss-guilds":Swords,activities:Calendar,"activity-points":Trophy,"activity-guilds":Calendar,members:Users,integrations:Bell,account:Key,danger:AlertTriangle};
              const labels: Record<string,string> = {general:"General",guilds:"Guilds",bosses:"Bosses","boss-points":"Boss Points","boss-guilds":"Boss Guild Assignments",activities:"Activities","activity-points":"Activity Points","activity-guilds":"Activity Guild Assignments",members:"Moderator/Permissions",integrations:"Integrations",account:"Account",danger:"Danger"};
              const Icon = icons[key];
              const locked = isExpired && GATED_TABS.has(key);
              return <button key={key} onClick={() => { if (!locked) setTabAndUrl(key); }}
                disabled={locked}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                  locked ? "text-[#3f3f46] cursor-not-allowed" :
                  tab===key ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a]/50"
                }`}>
                {locked ? <Lock className="w-3.5 h-3.5 shrink-0" /> : <Icon className="w-3.5 h-3.5 shrink-0" />}
                {labels[key]}
              </button>;
            })}
          </nav>
          {/* Billing link */}
          <RouterLink
            to="/billing"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b]"
          >
            <CreditCard className="w-3.5 h-3.5 shrink-0" />
            Billing
          </RouterLink>
          {servers.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-[11px] font-semibold text-[#71717a] uppercase tracking-wider px-1">Servers</h3>
              {servers.map((s) => {
                const subEnd = s.subscription_ends_at ? new Date(s.subscription_ends_at) : null;
                const daysLeft = subEnd && subEnd > new Date() ? Math.ceil((subEnd.getTime() - Date.now()) / 86400000) : 0;
                const isExpired = subEnd && subEnd <= new Date();
                const isActive = s.id === currentServer.id;
                return (
                <button key={s.id} onClick={() => setCurrentServer(s)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition text-left ${
                    isActive ? "bg-[#18181b] border border-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b]/50 border border-transparent"
                  }`}>
                  <Server className={`shrink-0 ${isActive ? "w-3.5 h-3.5" : "w-3 h-3"}`} />
                  <span className="text-xs truncate font-medium">{s.name}</span>
                  <span className={`text-[9px] shrink-0 ${s.role === "owner" ? "text-amber-500/60" : "text-blue-400/60"}`}>{s.role === "owner" ? "Owner" : "Mod"}</span>
                  {daysLeft > 0 && <span className="ml-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20"><Crown className="w-2.5 h-2.5"/>Pro · {daysLeft}d</span>}
                  {isExpired && <span className="ml-auto shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-500/10 text-red-300 border border-red-500/20">Expired</span>}
                  {isActive && !daysLeft && !isExpired && <Check className="w-3 h-3 text-[#a1a1aa] ml-auto" />}
                </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-4 w-full sm:w-auto">

      {/* Expired gate for locked tabs */}
      {isTabLocked ? (
        <ExpiredGate page={tab === "bosses" ? "Bosses" : tab === "boss-points" ? "Boss Points" : tab === "boss-guilds" ? "Boss Guild Assignments" : tab === "activities" ? "Activities" : tab === "activity-points" ? "Activity Points" : "Activity Guild Assignments"} />
      ) : (
      <>
      {/* General Tab */}
      {tab === "general" && (
        <div className="space-y-4">
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#fafafa] mb-2">Server Name</h3>
            <div className="flex gap-2">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} className="flex-1 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition disabled:opacity-50" />
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
                }} className="px-3 py-2 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition">Save</button>
              )}
            </div>
          </section>

          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#fafafa]">Server Timezone</h3>
            <p className="text-xs text-[#71717a] leading-relaxed">
              This timezone is used by the <strong className="text-[#a1a1aa]">Discord bot</strong> when processing <code className="text-[11px] bg-[#18181b] px-1 py-0.5 rounded">!kill</code> and <code className="text-[11px] bg-[#18181b] px-1 py-0.5 rounded">!nextspawn</code> commands. Schedule boss times and date boundaries depend on this setting. Changing it may shift all displayed spawn times.
            </p>
            {pendingTimezone ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-2">
                <p className="text-xs text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Change timezone to <strong>{pendingTimezone}</strong>?
                </p>
                <p className="text-[10px] text-amber-400/70">The Discord bot relies on this timezone. Boss spawn times and schedule days will shift.</p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const tz = pendingTimezone;
                      await supabase.from("servers").update({ timezone: tz }).eq("id", currentServer.id);
                      setCurrentServer({ ...currentServer, timezone: tz });
                      setPendingTimezone(null);
                      toast("success", "Timezone updated to " + tz);
                    }}
                    className="px-3 py-1.5 rounded text-xs font-medium bg-amber-500 text-black hover:bg-amber-400 transition"
                  >
                    Yes, change to {pendingTimezone}
                  </button>
                  <button onClick={() => setPendingTimezone(null)} className="px-3 py-1.5 rounded text-xs text-[#a1a1aa] hover:text-[#fafafa] transition">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <select
                value={currentServer.timezone || "Asia/Manila"}
                onChange={(e) => setPendingTimezone(e.target.value)}
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#52525b] transition"
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
            )}
          </section>

          {isOwner && (
            <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3 h-3" /> Invite Code
              </h3>
              <p className="text-sm text-[#a1a1aa]">
                Share this code with others so they can join as moderators.
              </p>
              <div className="flex items-center gap-2">
                <code className={`flex-1 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-base font-mono tracking-wider text-center select-all transition ${showInviteCode ? "text-[#a1a1aa]" : "text-[#71717a]"}`}>
                  {showInviteCode ? currentServer.invite_code : "••••••••"}
                </code>
                <button
                  onClick={() => setShowInviteCode(!showInviteCode)}
                  className="p-2 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] transition"
                  title={showInviteCode ? "Hide" : "Show"}
                >
                  {showInviteCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(currentServer.invite_code); toast("success", "Invite code copied!"); }}
                  className="p-2 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] transition"
                  title="Copy invite code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleRegenerateInvite}
                className="flex items-center gap-1.5 text-xs text-[#a1a1aa] hover:text-[#a1a1aa] transition"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate code
              </button>
            </section>
          )}

          {isOwnerOrModerator && (
            <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3 h-3" /> Viewer Key
              </h3>
              <p className="text-sm text-[#a1a1aa]">
                Share this key to let others monitor your server without an account. Viewers cannot make changes.
              </p>
              {viewerKey ? (
                <>
                  <div className="flex items-center gap-2">
                    <code className={`flex-1 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-base font-mono tracking-wider text-center select-all transition ${showViewerKey ? "text-[#a1a1aa]" : "text-[#71717a]"}`}>
                      {showViewerKey ? viewerKey : "••••••••"}
                    </code>
                    <button
                      onClick={() => setShowViewerKey(!showViewerKey)}
                      className="p-2 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] transition"
                      title={showViewerKey ? "Hide" : "Show"}
                    >
                      {showViewerKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { navigator.clipboard.writeText(viewerKey); toast("success", "Viewer key copied!"); }}
                      className="p-2 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] transition"
                      title="Copy viewer key"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-[#a1a1aa] truncate select-all">
                      {window.location.origin}/view/{viewerKey}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/view/${viewerKey}`); toast("success", "Viewer link copied!"); }}
                      className="p-2 rounded-lg text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b] transition shrink-0"
                      title="Copy viewer link"
                    >
                      <LinkIcon className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-[#71717a]">Loading...</p>
              )}
              {isOwner && (
              <button
                onClick={handleRegenerateViewerKey}
                className="flex items-center gap-1.5 text-xs text-[#a1a1aa] hover:text-[#a1a1aa] transition"
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
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-1.5">
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
                className="flex-1 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition"
              />
              <button
                onClick={handleAddGuild}
                disabled={addingGuild || !newGuildName.trim()}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50 flex items-center gap-1"
              >
                {addingGuild ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add
              </button>
            </div>

            {/* Guild list */}
            {guildsLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-4 h-4 text-[#71717a] animate-spin" />
              </div>
            ) : guilds.length === 0 ? (
              <p className="text-xs text-[#71717a] text-center py-2">No guilds yet. Create one above.</p>
            ) : (
              <div className="space-y-1">
                {guilds.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#18181b]/30 text-sm"
                  >
                    {editingGuildId === g.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editGuildName}
                          onChange={(e) => setEditGuildName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleEditGuild(g.id); if (e.key === "Escape") setEditingGuildId(null); }}
                          className="flex-1 bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-xs text-[#fafafa] outline-none focus:border-[#52525b]"
                          autoFocus
                        />
                        <button onClick={() => handleEditGuild(g.id)} className="p-1 text-[#a1a1aa] hover:text-[#d4d4d8]"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingGuildId(null)} className="p-1 text-[#a1a1aa] hover:text-[#fafafa]"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <>
                        <span className="text-[#d4d4d8] text-xs">{g.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingGuildId(g.id); setEditGuildName(g.name); }}
                            className="p-1 rounded text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteGuild(g.id, g.name)}
                            className="p-1 rounded text-[#71717a] hover:text-[#f87171] hover:bg-red-900/20 transition"
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
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-1.5">
                <Swords className="w-3 h-3" /> Boss Guild Assignments
              </h3>
              {guilds.length > 0 && sortedBosses.length > 0 && (
                <button
                  onClick={() => { if (bossMultiMode) clearBossSelection(); setBossMultiMode(!bossMultiMode); setBulkMode(null); }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition ${
                    bossMultiMode ? "bg-[#18181b] border border-[#27272a] text-[#a1a1aa]" : "bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-[#e4e4e7]"
                  }`}
                >
                  <CheckSquare className="w-3 h-3" />
                  {bossMultiMode ? `Selecting (${selectedBossIds.size})` : "Select Multiple"}
                </button>
              )}
            </div>
            <p className="text-xs text-[#71717a]">
              Assign guilds to bosses and set custom points per boss.
              Rotation mode alternates guilds each spawn.
              Schedule mode assigns a guild per day of the week.
            </p>
            <p className="text-xs text-[#a1a1aa]/80 flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              The <span className="text-[#fafafa] font-mono">- 1 +</span> controls set <strong>boss points</strong> — each attendee earns this many points per kill on the leaderboard.
            </p>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <div className="flex items-center gap-3 text-[#71717a]">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Fixed Hours</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" /> Fixed Schedule</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> One-time</span>
              </div>
              <div className="flex-1" />
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#52525b]" />
                <input
                  type="text"
                  placeholder="Search bosses..."
                  value={bossSearch}
                  onChange={(e) => setBossSearch(e.target.value)}
                  className="w-40 bg-[#18181b] border border-[#27272a] rounded pl-7 pr-2 py-1 text-xs text-[#fafafa] placeholder-[#52525b] outline-none focus:border-[#52525b] transition"
                />
              </div>
            </div>

            {bossGuildsLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-[#71717a] animate-spin" /></div>
            ) : sortedBosses.length === 0 ? (
              <p className="text-xs text-[#71717a] text-center py-4">No bosses in this server.</p>
            ) : guilds.length === 0 ? (
              <p className="text-xs text-[#a1a1aa] text-center py-4">Create guilds first (in the Guilds tab) before assigning them to bosses.</p>
            ) : (() => {
              const filtered = sortedBosses.filter(boss => !bossSearch || boss.name.toLowerCase().includes(bossSearch.toLowerCase()));
              if (filtered.length === 0) {
                return <p className="text-xs text-[#71717a] text-center py-4">{bossSearch ? "No bosses match your search." : "No bosses in this server."}</p>;
              }
              return (
              <div className={`space-y-2 ${bossMultiMode && selectedBossIds.size > 0 ? "pb-32" : ""}`}>
                {filtered.map((boss) => {
                  const mode = getBossMode(boss.id);
                  const bossAssignments = getBossGuildsForBoss(boss.id);
                  const isExpanded = expandedBoss === boss.id;
                  const isSelected = selectedBossIds.has(boss.id);

                  return (
                    <div key={boss.id} className={`bg-[#18181b]/30 rounded-lg overflow-hidden ${isSelected ? "ring-2 ring-[#52525b] ring-inset" : ""}`}>
                      {/* Boss header row */}
                      <button
                        onClick={() => {
                          if (bossMultiMode) { toggleBossSelect(boss.id); return; }
                          setExpandedBoss(isExpanded ? null : boss.id);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[#27272a]/30 transition text-left"
                      >
                        {bossMultiMode && (
                          isSelected ? <CheckSquare className="w-4 h-4 text-[#a1a1aa] shrink-0" /> : <Square className="w-4 h-4 text-[#52525b] shrink-0" />
                        )}
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          boss.spawn_type === "fixed_schedule" ? "bg-violet-400" :
                          boss.spawn_type === "one_time" ? "bg-amber-400" :
                          "bg-emerald-400"
                        }`} title={boss.spawn_type === "fixed_schedule" ? "Fixed Schedule" : boss.spawn_type === "one_time" ? "One-time" : "Fixed Hours"} />
                        <span className="text-xs text-[#fafafa] font-medium flex-1 truncate">{boss.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          mode === "rotation" ? "text-[#a1a1aa] bg-[#18181b]" :
                          mode === "daily" ? "text-[#a1a1aa] bg-cyan-900/30" :
                          mode === "schedule" ? "text-[#a1a1aa] bg-purple-900/30" :
                          "text-[#71717a] bg-[#18181b]"
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
                              } catch (err: any) {
                                toast("error", err?.message ?? "Failed to update points");
                              }
                            }}
                            className={`p-0.5 rounded cursor-pointer transition ${(boss.boss_points ?? 1) <= 0 ? "text-[#3f3f46] cursor-default" : "text-[#71717a] hover:text-[#f87171]"}`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                          >
                            <Minus className="w-3 h-3" />
                          </span>
                          <span className="text-xs text-[#fafafa] font-mono w-5 text-center tabular-nums">{boss.boss_points ?? 1}</span>
                          <span
                            onClick={async () => {
                              const val = Math.min(99, (boss.boss_points ?? 1) + 1);
                              try {
                                await setBossPoints(boss.id, val);
                                queryClient.invalidateQueries({ queryKey: ["bosses"] });
                                setBosses(prev => prev.map(b => b.id === boss.id ? { ...b, boss_points: val } : b));
                              } catch (err: any) {
                                toast("error", err?.message ?? "Failed to update points");
                              }
                            }}
                            className={`p-0.5 rounded cursor-pointer transition ${(boss.boss_points ?? 1) >= 99 ? "text-[#3f3f46] cursor-default" : "text-[#71717a] hover:text-[#a1a1aa]"}`}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
                          >
                            <Plus className="w-3 h-3" />
                          </span>
                        </span>
                        <span className="text-[#52525b] mx-1">|</span>
                        {/* Salary toggle (deprecated — per-guild salary now in Boss Points tab) */}
                        <label className="flex items-center gap-1 cursor-not-allowed shrink-0 opacity-40" title="Salary is now per-guild — use the Boss Points tab">
                          <input
                            type="checkbox"
                            checked={(boss as any).has_salary === true}
                            disabled
                            className="w-3 h-3 rounded border-[#3f3f46] bg-[#18181b] text-[#52525b]"
                          />
                          <span className="text-[10px] text-[#52525b]">Sal</span>
                        </label>
                        {!bossMultiMode && (isExpanded ? <ChevronUp className="w-4 h-4 text-[#71717a]" /> : <ChevronDown className="w-4 h-4 text-[#71717a]" />)}
                      </button>

                      {/* Expanded config (hidden in multi-mode) */}
                      {!bossMultiMode && isExpanded && (
                        <div className="border-t border-[#27272a]/50 px-4 py-3 space-y-3">
                          {/* Mode selector */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#71717a] w-12">Mode:</span>
                            <select
                              value={mode}
                              onChange={(e) => {
                                const newMode = e.target.value as "none" | "rotation" | "schedule" | "daily";
                                handleSetBossMode(boss.id, newMode);
                              }}
                              className="bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-xs text-[#fafafa] outline-none focus:border-[#52525b]"
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
                              <p className="text-xs text-[#71717a]">Guild rotation order (first → last):</p>
                              {bossAssignments
                                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                .map((bg, idx) => {
                                  const guild = guilds.find(g => g.id === bg.guild_id);
                                  return (
                                    <div key={bg.id} className="flex items-center gap-1 bg-[#18181b]/50 rounded px-2 py-1.5">
                                      <span className="text-xs text-[#71717a] w-4">{idx + 1}.</span>
                                      <span className="text-sm text-[#e4e4e7] flex-1">{guild?.name ?? "Unknown"}</span>
                                      <button onClick={() => handleMoveDailyGuild(boss.id, bg.id, "up")} disabled={idx === 0} className="p-0.5 text-[#71717a] hover:text-[#a1a1aa] disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                                      <button onClick={() => handleMoveDailyGuild(boss.id, bg.id, "down")} disabled={idx === bossAssignments.length - 1} className="p-0.5 text-[#71717a] hover:text-[#f87171] disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                                      <button onClick={() => handleRemoveDailyGuild(boss.id, bg.id)} className="p-0.5 text-[#71717a] hover:text-[#f87171]"><X className="w-3 h-3" /></button>
                                    </div>
                                  );
                                })}
                              {savingBossId === boss.id ? (
                                <div className="flex items-center gap-2 text-xs text-[#a1a1aa] py-1">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Adding...
                                </div>
                              ) : (
                                <select
                                  key={`add-daily-${boss.id}-${bossAssignments.length}`}
                                  value=""
                                  onChange={(e) => { if (e.target.value) handleAddDailyGuild(boss.id, e.target.value); }}
                                  className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none focus:border-[#52525b]"
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
                              <p className="text-xs text-[#71717a]">Guild rotation order (first → last):</p>
                              {bossAssignments
                                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                .map((bg, idx) => {
                                  const guild = guilds.find(g => g.id === bg.guild_id);
                                  return (
                                    <div key={bg.id} className="flex items-center gap-1 bg-[#18181b]/50 rounded px-2 py-1.5">
                                      <span className="text-xs text-[#71717a] w-4">{idx + 1}.</span>
                                      <span className="text-sm text-[#e4e4e7] flex-1">{guild?.name ?? "Unknown"}</span>
                                      <button onClick={() => handleMoveRotationGuild(boss.id, bg.id, "up")} disabled={idx === 0} className="p-0.5 text-[#71717a] hover:text-[#a1a1aa] disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                                      <button onClick={() => handleMoveRotationGuild(boss.id, bg.id, "down")} disabled={idx === bossAssignments.length - 1} className="p-0.5 text-[#71717a] hover:text-[#f87171] disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                                      <button onClick={() => handleRemoveRotationGuild(boss.id, bg.id)} className="p-0.5 text-[#71717a] hover:text-[#f87171]"><X className="w-3 h-3" /></button>
                                    </div>
                                  );
                                })}
                              {savingBossId === boss.id ? (
                                <div className="flex items-center gap-2 text-xs text-[#a1a1aa] py-1">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Adding...
                                </div>
                              ) : (
                                <select
                                  key={`add-${boss.id}-${bossAssignments.length}`}
                                  value=""
                                  onChange={(e) => { if (e.target.value) handleAddRotationGuild(boss.id, e.target.value); }}
                                  className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none focus:border-[#52525b]"
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
                              <p className="text-xs text-[#71717a]">Assign guild per day:</p>
                              <div className="grid grid-cols-7 gap-1">
                                {DAY_LABELS.map((label, dow) => {
                                  const bg = bossAssignments.find(a => a.day_of_week === dow);
                                  const guild = bg ? guilds.find(g => g.id === bg.guild_id) : null;
                                  return (
                                    <div key={dow} className="text-center space-y-1">
                                      <span className="text-xs text-[#71717a] block">{label}</span>
                                      <select
                                        value={guild?.id ?? ""}
                                        onChange={(e) => handleSetScheduleGuild(boss.id, dow, e.target.value || null)}
                                        className={`w-full rounded-lg px-1.5 py-1.5 text-xs outline-none disabled:opacity-50 border ${
                                          guild
                                            ? "bg-[#18181b] border-[#27272a] text-[#d4d4d8]"
                                            : "bg-[#18181b] border-[#27272a] text-[#fafafa]"
                                        } focus:border-[#52525b]`}
                                      >
                                        <option value="">—</option>
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
              );
            })()}
          </section>

          {/* Floating multi-select action bar */}
          {bossMultiMode && selectedBossIds.size > 0 && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-[#09090b] border border-[#27272a] rounded-xl px-5 py-4 shadow-2xl space-y-4 w-[95vw] max-w-2xl">
              {/* Close button */}
              <button
                onClick={() => { clearBossSelection(); setBossMultiMode(false); }}
                disabled={bulkProcessing}
                className="absolute top-3 right-3 p-1 text-[#71717a] hover:text-[#fafafa] transition disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Spinner overlay */}
              {bulkProcessing && (
                <div className="absolute inset-0 bg-[#09090b]/80 rounded-xl flex items-center justify-center gap-2 z-10">
                  <Loader2 className="w-5 h-5 text-[#a1a1aa] animate-spin" />
                  <span className="text-sm text-[#d4d4d8]">Applying...</span>
                </div>
              )}

              {/* Header */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#fafafa] font-medium">{selectedBossIds.size} boss{selectedBossIds.size !== 1 ? "es" : ""} selected</span>
              </div>

              {/* Step 1: Choose mode */}
              {!bulkMode && (
                <div className="space-y-2">
                  <span className="text-xs text-[#a1a1aa] font-medium">Choose assignment mode:</span>
                  <div className="flex gap-2">
                    <button onClick={() => handleBulkSetMode("rotation")} disabled={bulkProcessing} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50">🔄 Rotation</button>
                    <button onClick={() => handleBulkSetMode("daily")} disabled={bulkProcessing} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50">📆 Daily</button>
                    <button onClick={() => handleBulkSetMode("schedule")} disabled={bulkProcessing} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50">📅 Schedule</button>
                    <button onClick={() => handleBulkSetMode("none")} disabled={bulkProcessing} className="py-2.5 px-4 rounded-lg text-sm font-medium bg-[#27272a] text-[#d4d4d8] hover:bg-[#3f3f46] transition disabled:opacity-50">Clear</button>
                  </div>
                </div>
              )}

              {/* Step 2b: Daily */}
              {bulkMode === "daily" && guilds.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#a1a1aa] font-medium">Daily — guilds alternate by day across all selected bosses</span>
                    <button onClick={() => setBulkMode(null)} disabled={bulkProcessing} className="text-xs text-[#a1a1aa] hover:text-[#fafafa] transition disabled:opacity-50">← Change mode</button>
                  </div>
                  <p className="text-xs text-[#71717a]">Guild alternation order (first → last):</p>
                  {bulkDailyAdded.map((gid, idx) => {
                    const guild = guilds.find(g => g.id === gid);
                    return (
                      <div key={`daily-${gid}-${idx}`} className="flex items-center gap-1 bg-[#18181b]/50 rounded px-2 py-1.5">
                        <span className="text-xs text-[#71717a] w-4">{idx + 1}.</span>
                        <span className="text-sm text-[#e4e4e7] flex-1">{guild?.name ?? "Unknown"}</span>
                        <button
                          onClick={() => setBulkDailyAdded(prev => { if (idx === 0) return prev; const n = [...prev]; [n[idx], n[idx-1]] = [n[idx-1], n[idx]]; return n; })}
                          disabled={idx === 0 || bulkProcessing}
                          className="p-0.5 text-[#71717a] hover:text-[#fafafa] disabled:opacity-30"
                        ><ChevronUp className="w-3 h-3" /></button>
                        <button
                          onClick={() => setBulkDailyAdded(prev => { if (idx === prev.length-1) return prev; const n = [...prev]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; return n; })}
                          disabled={idx === bulkDailyAdded.length - 1 || bulkProcessing}
                          className="p-0.5 text-[#71717a] hover:text-[#fafafa] disabled:opacity-30"
                        ><ChevronDown className="w-3 h-3" /></button>
                        <button
                          onClick={() => setBulkDailyAdded(prev => prev.filter((_, i) => i !== idx))}
                          disabled={bulkProcessing}
                          className="p-0.5 text-[#71717a] hover:text-[#f87171] disabled:opacity-50"
                        ><X className="w-3 h-3" /></button>
                      </div>
                    );
                  })}
                  {bulkProcessing ? (
                    <div className="flex items-center gap-2 text-xs text-[#a1a1aa] py-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Adding...
                    </div>
                  ) : (
                    <select
                      key={`bulk-add-daily-${bulkDailyAdded.length}`}
                      value=""
                      onChange={(e) => { if (e.target.value) handleBulkAddDailyGuild(e.target.value); }}
                      className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none focus:border-[#52525b]"
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
                    <span className="text-xs text-[#a1a1aa] font-medium">Rotation — guilds to add to all selected bosses</span>
                    <button onClick={() => setBulkMode(null)} disabled={bulkProcessing} className="text-xs text-[#a1a1aa] hover:text-[#fafafa] transition disabled:opacity-50">← Change mode</button>
                  </div>
                  <p className="text-xs text-[#71717a]">Guild rotation order (first → last):</p>
                  {bulkRotationAdded.map((gid, idx) => {
                    const guild = guilds.find(g => g.id === gid);
                    return (
                      <div key={`${gid}-${idx}`} className="flex items-center gap-1 bg-[#18181b]/50 rounded px-2 py-1.5">
                        <span className="text-xs text-[#71717a] w-4">{idx + 1}.</span>
                        <span className="text-sm text-[#e4e4e7] flex-1">{guild?.name ?? "Unknown"}</span>
                        <button
                          onClick={() => setBulkRotationAdded(prev => { if (idx === 0) return prev; const n = [...prev]; [n[idx], n[idx-1]] = [n[idx-1], n[idx]]; return n; })}
                          disabled={idx === 0 || bulkProcessing}
                          className="p-0.5 text-[#71717a] hover:text-[#fafafa] disabled:opacity-30"
                        ><ChevronUp className="w-3 h-3" /></button>
                        <button
                          onClick={() => setBulkRotationAdded(prev => { if (idx === prev.length-1) return prev; const n = [...prev]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; return n; })}
                          disabled={idx === bulkRotationAdded.length - 1 || bulkProcessing}
                          className="p-0.5 text-[#71717a] hover:text-[#fafafa] disabled:opacity-30"
                        ><ChevronDown className="w-3 h-3" /></button>
                        <button
                          onClick={() => setBulkRotationAdded(prev => prev.filter((_, i) => i !== idx))}
                          disabled={bulkProcessing}
                          className="p-0.5 text-[#71717a] hover:text-[#f87171] disabled:opacity-50"
                        ><X className="w-3 h-3" /></button>
                      </div>
                    );
                  })}
                  {bulkProcessing ? (
                    <div className="flex items-center gap-2 text-xs text-[#a1a1aa] py-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Adding...
                    </div>
                  ) : (
                    <select
                      key={`bulk-add-${bulkRotationAdded.length}`}
                      value=""
                      onChange={(e) => { if (e.target.value) handleBulkAddRotationGuild(e.target.value); }}
                      className="w-full bg-[#18181b] border border-[#27272a] rounded px-2 py-1.5 text-xs text-[#a1a1aa] outline-none focus:border-[#52525b]"
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
                    <span className="text-xs text-[#a1a1aa] font-medium">Schedule — assign guild per day to all selected bosses</span>
                    <button onClick={() => setBulkMode(null)} disabled={bulkProcessing} className="text-xs text-[#a1a1aa] hover:text-[#fafafa] transition disabled:opacity-50">← Change mode</button>
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {DAY_LABELS.map((label, dow) => {
                      const selectedGuildId = bulkScheduleDays[dow];
                      const selectedGuild = selectedGuildId ? guilds.find(g => g.id === selectedGuildId) : null;
                      return (
                        <div key={dow} className="space-y-1">
                          <span className="text-xs text-[#71717a] text-center block">{label}</span>
                          <select
                            value={selectedGuildId ?? ""}
                            disabled={bulkProcessing}
                            onChange={(e) => {
                              const val = e.target.value || null;
                              handleBulkSetSchedule(dow, val);
                            }}
                            className={`w-full rounded-lg px-1.5 py-1.5 text-xs outline-none disabled:opacity-50 border ${
                              selectedGuild
                                ? "bg-[#18181b] border-[#27272a] text-[#d4d4d8]"
                                : "bg-[#18181b] border-[#27272a] text-[#fafafa]"
                            } focus:border-[#52525b]`}
                          >
                            <option value="">—</option>
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

      {/* Activity Guilds Tab */}
      {tab === "activity-guilds" && <ActivityGuildsTab />}

      {/* Boss Points Tab */}
      {tab === "boss-points" && (
        <>
          {/* Point Rules — at the top */}
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-4 mb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> Point Rules
              </h3>
              <button
                onClick={() => setShowAddRule(!showAddRule)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition"
              >
                <Plus className="w-3 h-3" />
                Add Rule
              </button>
            </div>
            <p className="text-xs text-[#71717a]">
              Create time-based multipliers that boost guild points during specific hours (server timezone).
            </p>

            {/* Add Rule Form */}
            {showAddRule && (
              <div className="bg-[#18181b]/50 border border-[#27272a] rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] text-[#71717a] block mb-1">Guild</label>
                    <select
                      value={newRuleGuildId}
                      onChange={e => setNewRuleGuildId(e.target.value)}
                      className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-[#fafafa]"
                    >
                      <option value="">Select guild...</option>
                      {guilds.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#71717a] block mb-1">Start Hour</label>
                    <select
                      value={newRuleStartHour}
                      onChange={e => setNewRuleStartHour(Number(e.target.value))}
                      className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-[#fafafa]"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, "0")}:00</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#71717a] block mb-1">End Hour</label>
                    <select
                      value={newRuleEndHour}
                      onChange={e => setNewRuleEndHour(Number(e.target.value))}
                      className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-[#fafafa]"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{i.toString().padStart(2, "0")}:00</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#71717a] block mb-1">Multiplier</label>
                    <select
                      value={newRuleMultiplier}
                      onChange={e => setNewRuleMultiplier(Number(e.target.value))}
                      className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-2.5 py-1.5 text-xs text-[#fafafa]"
                    >
                      {[1.5, 2, 2.5, 3, 4, 5].map(m => (
                        <option key={m} value={m}>{m}x</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddPointRule}
                    disabled={!newRuleGuildId || savingRule}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] disabled:opacity-50 transition"
                  >
                    {savingRule ? "Saving..." : "Save Rule"}
                  </button>
                  <button
                    onClick={() => setShowAddRule(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-[#a1a1aa] hover:text-[#fafafa] transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Existing Rules */}
            {rulesLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-4 h-4 text-[#71717a] animate-spin" />
              </div>
            ) : pointRules.length === 0 ? (
              <p className="text-xs text-[#52525b]">No point rules yet. Add one above to boost guild points during specific hours.</p>
            ) : (
              <div className="space-y-2">
                {pointRules.map(rule => {
                  const guild = guilds.find(g => g.id === rule.guild_id);
                  const cfg = rule.config;
                  const startLabel = `${String(cfg.start_hour).padStart(2, "0")}:00`;
                  const endLabel = `${String(cfg.end_hour).padStart(2, "0")}:00`;
                  return (
                    <div key={rule.id} className={`flex items-center justify-between bg-[#18181b]/30 rounded-lg px-3 py-2.5 gap-3 ${!rule.enabled ? "opacity-50" : ""}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <label className="flex items-center gap-2 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => handleToggleRule(rule.id, !rule.enabled)}
                            className="w-3.5 h-3.5 rounded border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] focus:ring-[#52525b]/50 cursor-pointer"
                          />
                        </label>
                        <span className="text-xs font-medium text-[#fafafa] truncate">{guild?.name || "Unknown"}</span>
                        <span className="text-[10px] text-[#71717a] shrink-0">
                          {startLabel} – {endLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono text-[#a1a1aa] font-bold">{cfg.multiplier}x</span>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1 rounded text-[#71717a] hover:text-[#f87171] hover:bg-red-900/20 transition"
                          title="Delete rule"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <BossPointsMatrix
            bosses={sortedBosses}
            guilds={guilds}
            allBossGuilds={allBossGuilds}
            bossAssists={bossAssists}
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
              } catch (err: any) {
                toast("error", err?.message ?? "Failed to save points");
              }
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
              } catch (err: any) {
                toast("error", err?.message ?? "Failed to save salary");
              }
              setSavingCell(null);
            }}
            onBatchSalaryChange={async (guildId, bossIds, hasSalary) => {
              try {
                await batchSetGuildSalary(guildId, bossIds, hasSalary);
                const updated = await fetchAllBossGuildsForServer(currentServer!.id);
                setAllBossGuilds(updated);
              } catch (err: any) {
                toast("error", err?.message ?? "Failed to save salary batch");
              }
            }}
            onAssistToggle={async (bossId, ownerGuildId, assistantGuildId) => {
              try {
                const added = await toggleBossAssist(bossId, ownerGuildId, assistantGuildId, currentServer!.id);
                if (added) {
                  setBossAssists(prev => [...prev, { id: "", boss_id: bossId, owner_guild_id: ownerGuildId, assistant_guild_id: assistantGuildId, server_id: currentServer!.id, created_at: new Date().toISOString() } as BossAssist]);
                } else {
                  setBossAssists(prev => prev.filter(a => !(a.boss_id === bossId && a.owner_guild_id === ownerGuildId && a.assistant_guild_id === assistantGuildId)));
                }
              } catch (err: any) {
                toast("error", err?.message ?? "Failed to toggle assist");
              }
            }}
          />

        </>
      )}

      {/* Activity Points Tab */}
      {tab === "activity-points" && (
        <div className="space-y-4">
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-3 sm:p-4 space-y-3">
            <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> Activities ({activities.length})
            </h3>
            {activitiesLoading ? (
              <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 text-[#71717a] animate-spin" /></div>
            ) : (
              <ActivityPointsMatrix
                activities={activities}
                guilds={guilds}
                allActivityGuilds={allActivityGuilds}
                activityAssists={activityAssists}
                savingCell={savingCell}
                onPointsChange={async (activityId, guildId, points) => {
                  const cellKey = `${activityId}-${guildId}`;
                  setSavingCell(cellKey);
                  try {
                    await upsertActivityGuildPoints(activityId, guildId, points, undefined);
                    setAllActivityGuilds(prev => {
                      const existing = prev.find(ag => ag.activity_id === activityId && ag.guild_id === guildId);
                      if (existing) return prev.map(ag => ag.activity_id === activityId && ag.guild_id === guildId ? { ...ag, points } : ag);
                      return [...prev, { id: "", activity_id: activityId, guild_id: guildId, sort_order: null, day_of_week: null, mode: "rotation", points } as ActivityGuild];
                    });
                  } catch (err: any) {
                    toast("error", err?.message ?? "Failed to save activity points");
                  }
                  setSavingCell(null);
                }}
                onSalaryChange={async (activityId, guildId, hasSalary) => {
                  const cellKey = `${activityId}-${guildId}`;
                  setSavingCell(cellKey);
                  try {
                    await upsertActivityGuildPoints(activityId, guildId, undefined, hasSalary);
                    setAllActivityGuilds(prev => {
                      const existing = prev.find(ag => ag.activity_id === activityId && ag.guild_id === guildId);
                      if (existing) return prev.map(ag => ag.activity_id === activityId && ag.guild_id === guildId ? { ...ag, has_salary: hasSalary } : ag);
                      return [...prev, { id: "", activity_id: activityId, guild_id: guildId, sort_order: null, day_of_week: null, mode: "rotation", has_salary: hasSalary } as ActivityGuild];
                    });
                  } catch (err: any) {
                    toast("error", err?.message ?? "Failed to save activity salary");
                  }
                  setSavingCell(null);
                }}
                onAssistToggle={async (activityId, ownerGuildId, assistantGuildId) => {
                  try {
                    const added = await toggleActivityAssist(activityId, ownerGuildId, assistantGuildId, currentServer!.id);
                    if (added) {
                      setActivityAssists(prev => [...prev, { id: "", activity_id: activityId, owner_guild_id: ownerGuildId, assistant_guild_id: assistantGuildId, server_id: currentServer!.id, created_at: new Date().toISOString() } as ActivityAssist]);
                    } else {
                      setActivityAssists(prev => prev.filter(a => !(a.activity_id === activityId && a.owner_guild_id === ownerGuildId && a.assistant_guild_id === assistantGuildId)));
                    }
                  } catch (err: any) {
                    toast("error", err?.message ?? "Failed to toggle assist");
                  }
                }}
              />
            )}
          </section>
        </div>
      )}

      {/* Members Tab */}
      {tab === "members" && (() => {
        const visibleMembers = members.filter(m => !adminUserIds.has(m.user_id));
        return (
        <div className="space-y-4">
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Members ({visibleMembers.length})
            </h3>
            {isOwner && visibleMembers.some(m => m.role === "moderator") && (
              <p className="text-[10px] text-[#52525b] leading-relaxed">
                <Settings className="w-3 h-3 inline mr-1 -mt-0.5" />
                Click a moderator to manage their permissions. Each toggle controls what they can access and modify. Changes save immediately.
              </p>
            )}
            {membersLoading ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-4 h-4 text-[#71717a] animate-spin" />
              </div>
            ) : visibleMembers.length === 0 ? (
              <p className="text-xs text-[#71717a]">No members yet.</p>
            ) : (
              <div className="space-y-1">
                {visibleMembers.map((m) => {
                  const isExpanded = expandedModPerms === m.user_id;
                  const perms = modPermsData[m.user_id] ?? DEFAULT_MODERATOR_PERMISSIONS;
                  return (
                  <div key={m.user_id}>
                    <div
                      className={`flex items-center justify-between px-3 py-2 rounded-lg bg-[#18181b]/30 text-sm group ${m.role === "moderator" && isOwner ? "cursor-pointer hover:bg-[#18181b]/50 transition" : ""}`}
                      onClick={() => m.role === "moderator" && isOwner && handleToggleModPerms(m.user_id)}
                      title={m.role === "moderator" && isOwner ? "Click to manage permissions" : undefined}
                    >
                    <span className="text-[#d4d4d8] text-xs min-w-0 flex items-center gap-1.5">
                      <span className="truncate">{m.email ?? m.user_id}</span>
                      {verificationStatus[m.user_id] !== undefined && (
                        verificationStatus[m.user_id] ? (
                          <span className="text-emerald-400 flex items-center gap-1 shrink-0" title="Email verified">
                            <MailCheck className="w-3 h-3" />
                            <span className="text-[10px] text-emerald-400/70 hidden sm:inline">Verified</span>
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1 shrink-0" title="Email not verified">
                            <MailWarning className="w-3 h-3" />
                            <span className="text-[10px] text-amber-400/70 hidden sm:inline">Not verified</span>
                          </span>
                        )
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {isOwner && m.role === "moderator" && (
                        <span className={`text-[10px] px-2 py-0.5 rounded transition flex items-center gap-1 whitespace-nowrap ${isExpanded ? "bg-[#27272a] text-[#d4d4d8]" : "bg-[#18181b] text-[#52525b] group-hover:text-[#a1a1aa] group-hover:bg-[#27272a]"}`}>
                          {isExpanded ? <ChevronUp className="w-3 h-3 shrink-0" /> : <Settings className="w-3 h-3 shrink-0" />}
                          <span className="hidden sm:inline">{isExpanded ? "Hide" : "Permissions"}</span>
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        m.role === "owner" ? "text-[#a1a1aa] bg-[#18181b]" : "text-[#a1a1aa] bg-[#18181b]"
                      }`}>
                        {m.role}
                      </span>
                      {isOwner && m.role === "moderator" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveMod(m.user_id); }}
                          className="p-1 rounded text-[#71717a] hover:text-[#f87171] hover:bg-red-900/20 transition"
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
                      <div className="border-t border-[#27272a]/50 px-3 py-3 bg-[#09090b]/30 space-y-3">
                        <div className="space-y-1">
                          <span className="text-xs font-medium text-[#fafafa]">Permissions for {m.email ?? "moderator"}</span>
                          <p className="text-[10px] text-[#52525b] leading-relaxed">Toggle what this moderator can access. Changes apply immediately after saving.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {PERMISSION_SECTIONS.map(section => (
                            <div key={section.section} className="space-y-1.5">
                              <span className="text-[10px] font-semibold text-[#71717a] uppercase tracking-wider">{section.section}</span>
                              {section.items.map(({ key, label }) => (
                                <label key={key} className="flex items-center gap-2 cursor-pointer group">
                                  <input
                                    type="checkbox"
                                    checked={perms[key] === true}
                                    onChange={() => handleTogglePermission(m.user_id, key)}
                                    className="rounded border-[#3f3f46] bg-[#18181b] focus:ring-[#52525b]/50 cursor-pointer w-3.5 h-3.5 text-[#a1a1aa]"
                                  />
                                  <span className="group-hover:text-[#d4d4d8] transition text-xs text-[#a1a1aa]">{label}</span>
                                </label>
                              ))}
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => handleSavePermissions(m.user_id)}
                          disabled={savingPerms === m.user_id}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50"
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
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-3 h-3" /> Add Moderator
            </h3>
            <p className="text-sm text-[#a1a1aa]">
              Moderators can manage bosses, configure Discord webhooks, and edit server settings.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={modEmail}
                onChange={(e) => setModEmail(e.target.value)}
                placeholder="user@email.com"
                onKeyDown={(e) => e.key === "Enter" && handleAddMod()}
                className="flex-1 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition"
              />
              <button
                onClick={handleAddMod}
                disabled={addingMod || !modEmail.trim()}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50"
              >
                {addingMod ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                Add
              </button>
            </div>
          </section>
          )}

          {isOwner && (() => {
            const moderators = members.filter((m) => m.role === "moderator" && !adminUserIds.has(m.user_id));
            return (
            <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[#fafafa]">Ownership</h3>

              <div>
                <h4 className="text-xs font-semibold text-[#a1a1aa] flex items-center gap-1 mb-2">
                  <Crown className="w-3 h-3" /> Transfer Ownership
                </h4>
                <p className="text-xs text-[#a1a1aa] mb-2">
                  Transfer ownership to a verified moderator. You'll become a moderator.
                </p>
                {moderators.filter(m => verificationStatus[m.user_id]).length === 0 ? (
                  <p className="text-xs text-[#71717a] italic">No verified moderators to transfer to.</p>
                ) : (
                <div className="flex gap-2">
                  <select
                    value={transferId}
                    onChange={(e) => setTransferId(e.target.value)}
                    className="flex-1 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-[#fafafa] outline-none focus:border-[#52525b] transition"
                  >
                    <option value="">Select a verified moderator...</option>
                    {moderators.map((m) => {
                      const isVerified = verificationStatus[m.user_id];
                      return (
                        <option key={m.user_id} value={m.user_id} disabled={!isVerified}>
                          {m.email ?? m.user_id}{!isVerified ? " (not verified)" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    onClick={handleTransfer}
                    disabled={transferring || !transferId}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50"
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
        );
      })()}

      {/* Integrations Tab — Discord Bot & Notifications */}
      {tab === "integrations" && (
        <div className="space-y-6">
          {/* Connected Servers */}
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider flex items-center gap-2">
              <Swords className="w-4 h-4" /> Linked Discord Servers
            </h3>

            {discordLinks.length === 0 ? (
              <p className="text-xs text-[#71717a] italic">No Discord servers linked yet.</p>
            ) : (
              <div className="space-y-3">
                {discordLinks.map(link => {
                  const isEditingChannels = !!channelValues[link.id];
                  const isEditingThreads = !!threadValues[link.id];
                  return (
                    <div key={link.id} className="bg-[#18181b]/40 border border-[#27272a]/50 rounded-lg overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center gap-3 px-4 py-3 bg-[#18181b]/60">
                        {editingLinkId === link.id ? (
                          <>
                            {/* Edit mode: prefix dropdown */}
                            <select
                              value={editLinkValues.command_prefix}
                              onChange={(e) => setEditLinkValues(prev => ({ ...prev, command_prefix: e.target.value }))}
                              className="text-xs font-bold font-mono text-[#fafafa] bg-[#27272a] px-2 py-1 rounded border-none outline-none cursor-pointer"
                            >
                              {(() => {
                                const allPrefixes = ["!",";","$",".","~","?","%","&","-","+","=",":","/","//","!!","!?","..","|",">","rs!","rs;","rs.","rb!","rb;","boss!","boss;"];
                                const myGuildId = editLinkValues.discord_guild_id.trim();
                                const currentPrefix = editLinkValues.command_prefix;
                                const taken = new Set<string>();
                                if (myGuildId && globalPrefixOwners.has(myGuildId)) {
                                  // Disable prefixes this guild already uses in OTHER servers (but allow current)
                                  const used = globalPrefixOwners.get(myGuildId)!;
                                  used.forEach(p => { if (p !== currentPrefix) taken.add(p); });
                                }
                                return allPrefixes.map(p => (
                                  <option key={p} value={p} disabled={taken.has(p)}>
                                    {p}{taken.has(p) ? " (used)" : ""}
                                  </option>
                                ));
                              })()}
                            </select>
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <input
                                type="text"
                                value={editLinkValues.discord_guild_id}
                                onChange={(e) => setEditLinkValues(prev => ({ ...prev, discord_guild_id: e.target.value }))}
                                placeholder="Discord Server ID"
                                className="w-full bg-[#27272a] rounded px-2.5 py-1 text-sm text-[#e4e4e7] font-mono outline-none focus:ring-1 focus:ring-[#52525b]"
                              />
                              <input
                                type="text"
                                value={editLinkValues.label}
                                onChange={(e) => setEditLinkValues(prev => ({ ...prev, label: e.target.value }))}
                                placeholder="Label (optional)"
                                className="w-full bg-[#27272a] rounded px-2.5 py-1 text-[11px] text-[#e4e4e7] outline-none focus:ring-1 focus:ring-[#52525b]"
                              />
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={async () => {
                                  const vals = editLinkValues;
                                  await supabase.from("discord_configs").update({
                                    discord_guild_id: vals.discord_guild_id.trim(),
                                    label: vals.label.trim() || undefined,
                                    command_prefix: vals.command_prefix,
                                  }).eq("id", link.id);
                                  setDiscordLinks(prev => prev.map(d => d.id === link.id ? { ...d, discord_guild_id: vals.discord_guild_id.trim(), label: vals.label.trim() || undefined, command_prefix: vals.command_prefix } : d));
                                  notifyDiscordUpdated();
                                  setEditingLinkId(null);
                                }}
                                className="text-xs px-2 py-1 rounded bg-green-600 text-[#fafafa] hover:bg-green-500 transition font-medium flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />Save
                              </button>
                              <button onClick={() => setEditingLinkId(null)} className="text-xs px-2 py-1 rounded bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">Cancel</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-bold font-mono text-[#a1a1aa] bg-[#27272a] px-2 py-1 rounded">{link.command_prefix || "!"}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[#fafafa] font-mono truncate">{link.discord_guild_id}</p>
                              {link.label && <p className="text-[11px] text-[#71717a] truncate">{link.label}</p>}
                            </div>
                            <button
                              onClick={() => {
                                setEditingLinkId(link.id);
                                setEditLinkValues({ discord_guild_id: link.discord_guild_id, label: link.label || "", command_prefix: link.command_prefix || "!" });
                              }}
                              className="p-1.5 rounded hover:bg-[#18181b] text-[#a1a1aa] hover:text-[#fafafa] transition"
                              title="Edit link"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { setDiscordToRemove({ id: link.id, label: link.label || link.discord_guild_id }); setDiscordRemoveConfirmLabel(""); }} className="p-1.5 rounded hover:bg-[#18181b] text-[#a1a1aa] hover:text-[#f87171] transition" title="Remove link">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Body */}
                      <div className="p-4 space-y-4">
                        {/* Channels */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-[#a1a1aa] flex items-center gap-1.5">
                              <Bell className="w-3.5 h-3.5" /> Notification & Command Channels
                            </h4>
                            {!isEditingChannels ? (
                              <button onClick={() => setChannelValues(prev => ({ ...prev, [link.id]: { notif: link.notification_channel_id || "", cmd: link.command_channel_id || "", progress: link.progress_channel_id || "" } }))}
                                className="text-xs px-2.5 py-1 rounded bg-[#27272a] text-[#d4d4d8] hover:text-[#fafafa] hover:bg-[#3f3f46] transition font-medium">
                                <Pencil className="w-3 h-3 inline mr-1" />Edit
                              </button>
                            ) : (
                              <div className="flex gap-1">
                                <button onClick={async () => {
                                  const vals = channelValues[link.id]; if (!vals) return;
                                  await supabase.from("discord_configs").update({ notification_channel_id: vals.notif.trim() || undefined, command_channel_id: vals.cmd.trim() || undefined, progress_channel_id: vals.progress?.trim() || undefined }).eq("id", link.id);
                                  setDiscordLinks(prev => prev.map(d => d.id === link.id ? { ...d, notification_channel_id: vals.notif.trim() || undefined, command_channel_id: vals.cmd.trim() || undefined, progress_channel_id: vals.progress?.trim() || undefined } : d));
                                  setChannelValues(prev => { const n = { ...prev }; delete n[link.id]; return n; });
                                }} className="text-xs px-2 py-1 rounded bg-green-600 text-[#fafafa] hover:bg-green-500 transition font-medium flex items-center gap-1">
                                  <Check className="w-3 h-3" />Save
                                </button>
                                <button onClick={() => setChannelValues(prev => { const n = { ...prev }; delete n[link.id]; return n; })}
                                  className="text-xs px-2 py-1 rounded bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">Cancel</button>
                              </div>
                            )}
                          </div>
                          {isEditingChannels ? (
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[11px] text-[#71717a] block mb-1">Alert Channel ID</label>
                                <input type="text" value={channelValues[link.id].notif} onChange={(e) => setChannelValues(prev => ({ ...prev, [link.id]: { ...prev[link.id], notif: e.target.value }}))}
                                  placeholder="e.g. 1510221200259940442"
                                  className="w-full bg-[#27272a] rounded px-2.5 py-1.5 text-xs text-[#e4e4e7] font-mono outline-none focus:ring-1 focus:ring-[#52525b]" />
                              </div>
                              <div>
                                <label className="text-[11px] text-[#71717a] block mb-1">Command Channel ID</label>
                                <input type="text" value={channelValues[link.id].cmd} onChange={(e) => setChannelValues(prev => ({ ...prev, [link.id]: { ...prev[link.id], cmd: e.target.value }}))}
                                  placeholder="e.g. 1507015001091608729"
                                  className="w-full bg-[#27272a] rounded px-2.5 py-1.5 text-xs text-[#e4e4e7] font-mono outline-none focus:ring-1 focus:ring-[#52525b]" />
                              </div>
                              <div>
                                <label className="text-[11px] text-[#71717a] block mb-1">Progress Channel ID</label>
                                <input type="text" value={channelValues[link.id].progress ?? ""} onChange={(e) => setChannelValues(prev => ({ ...prev, [link.id]: { ...prev[link.id], progress: e.target.value }}))}
                                  placeholder="e.g. 1510221200259940442"
                                  className="w-full bg-[#27272a] rounded px-2.5 py-1.5 text-xs text-[#e4e4e7] font-mono outline-none focus:ring-1 focus:ring-[#52525b]" />
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-4 text-xs flex-wrap items-center">
                              <span className="text-[#71717a]">Alerts: {link.notification_channel_id ? <><code className="text-[#d4d4d8] font-mono">{link.notification_channel_id}</code> <button onClick={() => setChannelToClear({ linkId: link.id, field: "notification_channel_id", value: link.notification_channel_id!, label: "Alert Channel" })} className="inline-flex items-center text-[#a1a1aa] hover:text-[#f87171] transition" title="Clear alert channel"><X className="w-3 h-3"/></button></> : <span className="italic text-[#52525b]">not set</span>}</span>
                              <span className="text-[#71717a]">Commands: {link.command_channel_id ? <><code className="text-[#d4d4d8] font-mono">{link.command_channel_id}</code> <button onClick={() => setChannelToClear({ linkId: link.id, field: "command_channel_id", value: link.command_channel_id!, label: "Command Channel" })} className="inline-flex items-center text-[#a1a1aa] hover:text-[#f87171] transition" title="Clear command channel"><X className="w-3 h-3"/></button></> : <span className="italic text-[#52525b]">not set</span>}</span>
                              <span className="text-[#71717a]">Progress: {link.progress_channel_id ? <><code className="text-[#d4d4d8] font-mono">{link.progress_channel_id}</code> <button onClick={() => setChannelToClear({ linkId: link.id, field: "progress_channel_id", value: link.progress_channel_id!, label: "Progress Channel" })} className="inline-flex items-center text-[#a1a1aa] hover:text-[#f87171] transition" title="Clear progress channel"><X className="w-3 h-3"/></button></> : <span className="italic text-[#52525b]">not set</span>}</span>
                            </div>
                          )}
                        </div>

                        {/* Auto-Threads */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-[#a1a1aa] flex items-center gap-1.5">
                              <MessageCircle className="w-3.5 h-3.5" /> Auto-Threads
                            </h4>
                            {!isEditingThreads ? (
                              <button onClick={() => setThreadValues(prev => ({ ...prev, [link.id]: { channelId: link.thread_channel_id || "", guilds: link.thread_guilds || [] } }))}
                                className="text-xs px-2.5 py-1 rounded bg-[#27272a] text-[#d4d4d8] hover:text-[#fafafa] hover:bg-[#3f3f46] transition font-medium">
                                <Pencil className="w-3 h-3 inline mr-1" />Edit
                              </button>
                            ) : (
                              <div className="flex gap-1">
                                <button onClick={async () => {
                                  const vals = threadValues[link.id]; if (!vals) return;
                                  await updateThreadConfig(link.id, vals.channelId.trim() || null, vals.guilds);
                                  setDiscordLinks(prev => prev.map(d => d.id === link.id ? { ...d, thread_channel_id: vals.channelId.trim() || undefined, thread_guilds: vals.guilds } : d));
                                  setThreadValues(prev => { const n = { ...prev }; delete n[link.id]; return n; });
                                  toast("success", "Auto-thread settings saved");
                                }} className="text-xs px-2 py-1 rounded bg-green-600 text-[#fafafa] hover:bg-green-500 transition font-medium flex items-center gap-1">
                                  <Check className="w-3 h-3" />Save
                                </button>
                                <button onClick={() => setThreadValues(prev => { const n = { ...prev }; delete n[link.id]; return n; })}
                                  className="text-xs px-2 py-1 rounded bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition">Cancel</button>
                              </div>
                            )}
                          </div>
                          {isEditingThreads ? (
                            <div className="space-y-3">
                              {guilds.length > 0 && (
                                <div>
                                  <label className="text-[11px] text-[#71717a] block mb-1.5">Guilds that trigger threads</label>
                                  <div className="flex flex-wrap gap-2">
                                    {guilds.map(g => {
                                      const checked = threadValues[link.id].guilds.includes(g.id);
                                      return (
                                        <label key={g.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded cursor-pointer border text-xs font-medium transition ${
                                          checked ? "bg-purple-900/30 border-[#27272a] text-[#d4d4d8]" : "bg-[#18181b] border-[#27272a] text-[#71717a] hover:text-[#d4d4d8]"
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
                                <label className="text-[11px] text-[#71717a] block mb-1">Thread Channel ID</label>
                                <input type="text" value={threadValues[link.id].channelId} onChange={(e) => setThreadValues(prev => ({ ...prev, [link.id]: { ...prev[link.id], channelId: e.target.value } }))}
                                  placeholder="Paste forum or text channel ID"
                                  className="w-full bg-[#27272a] rounded px-2.5 py-1.5 text-xs text-[#e4e4e7] font-mono outline-none focus:ring-1 focus:ring-[#52525b]" />
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-[#71717a]">
                              Threads: {link.thread_channel_id ? (
                                <><code className="text-[#d4d4d8] font-mono">{link.thread_channel_id}</code> <span className="text-[#a1a1aa]">({((link.thread_guilds || []).map(gid => guilds.find(g => g.id === gid)?.name).filter(Boolean).join(", ")) || "no guilds"})</span> <button onClick={() => setChannelToClear({ linkId: link.id, field: "thread_channel_id", value: link.thread_channel_id!, label: "Thread Channel" })} className="inline-flex items-center text-[#a1a1aa] hover:text-[#f87171] transition" title="Clear thread channel"><X className="w-3 h-3"/></button></>
                              ) : (
                                <span className="italic text-[#52525b]">not set</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 pt-1 border-t border-[#27272a]/50">
                          <button onClick={() => {
                            if (editAliasLinkId === link.id) { setEditAliasLinkId(null); return; }
                            setEditAliasLinkId(link.id); setEditAliases((link as any).command_aliases || {});
                          }}
                            className={`text-xs px-2.5 py-1 rounded font-medium flex items-center gap-1.5 transition ${
                              editAliasLinkId === link.id ? "bg-[#fafafa] text-[#09090b]" : "bg-[#18181b] text-[#a1a1aa] hover:bg-[#18181b]"
                            }`}>
                            <Pencil className="w-3 h-3" />{editAliasLinkId === link.id ? "Close Aliases" : "Command Aliases"}
                          </button>
                          <div className="flex items-center gap-1.5 ml-auto">
                            <label className="text-[11px] text-[#71717a]">Ping:</label>
                            <input type="text"
                              value={pingValues[link.id] ?? ((link as any).notification_prefix || "")}
                              onChange={(e) => setPingValues(prev => ({ ...prev, [link.id]: e.target.value }))}
                              placeholder="@everyone"
                              className={`bg-[#27272a] border border-[#3f3f46] px-2 py-1 text-xs text-[#e4e4e7] font-mono outline-none focus:ring-1 focus:ring-[#52525b] transition ${
                                (pingValues[link.id] ?? "") !== ((link as any).notification_prefix || "")
                                  ? "rounded-l w-56" : "rounded w-56"
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
                                className="text-xs px-2 py-1 rounded-r bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition font-medium">Save</button>
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
                          <div className="pt-3 border-t border-[#27272a]/50 animate-slideDown">
                            <div className="space-y-2">
                              {["list","nextspawn","killed","editkilltime","forcespawn","forcespawnall","commands","notifhere","threadhere","cmdhere"].map(cmd => (
                                <div key={cmd} className="flex items-center gap-2">
                                  <span className="text-xs text-[#a1a1aa] w-24 font-mono">{cmd}</span>
                                  <span className="text-xs text-[#52525b]">→</span>
                                  <input type="text" value={editAliases[cmd] || ""} onChange={e => setEditAliases(prev => ({ ...prev, [cmd]: e.target.value }))}
                                    placeholder={cmd}
                                    className="flex-1 bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-xs text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition font-mono" />
                                </div>
                              ))}
                              <button onClick={async () => {
                                const { error } = await supabase.from("discord_configs").update({ command_aliases: editAliases }).eq("id", editAliasLinkId);
                                if (error) { toast("error", error.message); return; }
                                setDiscordLinks(prev => prev.map(d => d.id === editAliasLinkId ? { ...d, command_aliases: editAliases } : d));
                                setEditAliasLinkId(null); toast("success", "Aliases saved!");
                              }} className="px-4 py-2 rounded-lg text-xs font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition flex items-center gap-1.5">
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
            <div className="pt-2 border-t border-[#27272a]">
              <h4 className="text-xs font-semibold text-[#a1a1aa] mb-3 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Link New Discord Server
              </h4>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex gap-2 flex-1 min-w-0">
                <input type="text" value={newDiscordId} onChange={(e) => setNewDiscordId(e.target.value)}
                  placeholder="Discord Server ID" ref={discordIdInputRef}
                  className="flex-1 bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition font-mono min-w-0" />
                <input type="text" value={newDiscordLabel} onChange={(e) => setNewDiscordLabel(e.target.value)}
                  placeholder="Label (optional)"
                  className="w-24 sm:w-36 bg-[#18181b] border border-[#27272a] rounded-lg px-2 sm:px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition" />
                </div>
                <button onClick={handleAddDiscordLink} disabled={savingDiscord || !newDiscordId.trim()}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50">
                  {savingDiscord ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                  Link
                </button>
              </div>
            </div>
          </section>

          {/* Getting Started Guide */}
          <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-wider">Getting Started</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-[#a1a1aa] bg-[#18181b] px-2 py-0.5 rounded">Step 1</span>
                <p className="text-xs text-[#d4d4d8] font-medium">Link your Discord server</p>
                <p className="text-[11px] text-[#71717a] leading-relaxed">
                  Enable <strong>Developer Mode</strong> in Discord (Settings → Advanced). Right-click your server icon → <strong>Copy Server ID</strong>. Paste above and click <strong>Link</strong>.
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-[#a1a1aa] bg-[#18181b] px-2 py-0.5 rounded">Step 2</span>
                <p className="text-xs text-[#d4d4d8] font-medium">Invite the bot</p>
                <p className="text-[11px] text-[#71717a] leading-relaxed">
                  <a href={`https://discord.com/api/oauth2/authorize?client_id=${import.meta.env.VITE_DISCORD_CLIENT_ID || '1508368991272566975'}&permissions=2147485696&scope=bot%20applications.commands`} target="_blank" rel="noopener noreferrer"
                    className="text-[#a1a1aa] hover:text-[#d4d4d8] underline font-medium">Click here to invite RaidScout Bot</a> to your Discord server.
                </p>
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-[#a1a1aa] bg-[#18181b] px-2 py-0.5 rounded">Step 3</span>
                <p className="text-xs text-[#d4d4d8] font-medium">Configure channels</p>
                <p className="text-[11px] text-[#71717a] leading-relaxed">
                  In Discord, type <code className="bg-[#18181b] px-1 rounded text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;notifhere</code> for alerts, <code className="bg-[#18181b] px-1 rounded text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;threadhere</code> for auto-threads, and <code className="bg-[#18181b] px-1 rounded text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;cmdhere</code> to restrict commands.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-[#27272a]">
              <h4 className="text-xs font-semibold text-[#a1a1aa] mb-2">Available Commands</h4>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;nextspawn</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Boss spawns in 24h</span></p>
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;nextspawn &lt;boss&gt;</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Check a specific boss</span></p>
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;nextspawn &lt;guild&gt;</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Spawns for a guild</span></p>
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;killed &lt;boss&gt;</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Record a kill now</span></p>
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;killed &lt;boss&gt; HH:MM</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Kill at custom time</span></p>
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;forcespawn &lt;boss&gt;</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Force a boss to spawn</span></p>
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;forcespawnall</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Spawn all fixed-timer bosses</span></p>
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;list</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Show all boss names</span></p>
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;notifhere</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Set notification channel</span></p>
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;threadhere</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Set auto-thread channel</span></p>
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;cmdhere</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Restrict commands to channel</span></p>
                <p className="text-xs"><code className="text-[#a1a1aa] font-mono text-xs">&lt;prefix&gt;commands</code> <span className="text-[#71717a]">—</span> <span className="text-[#a1a1aa]">Show all commands</span></p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Bosses Tab */}
      {tab === "bosses" && <ServerBossesActivitiesTab mode="bosses" />}

      {/* Activities Tab */}
      {tab === "activities" && <ServerBossesActivitiesTab mode="activities" />}

      {/* Account Tab */}
      {tab === "account" && (
        <div className="space-y-6">
          <ConfirmEmailSection />
          <ChangePasswordSection />
        </div>
      )}

      {/* Danger Tab */}
      {tab === "danger" && isOwner && (
        <section className="bg-[#09090b] border border-red-900/30 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
          <p className="text-sm text-[#a1a1aa]">
            Archive this server. Your data is preserved and can be restored by an admin. You won't see this server anymore.
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-[#18181b] text-red-400 hover:bg-red-900/50 transition border border-[#27272a]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Archive Server
            </button>
          ) : (
            <div className="space-y-3 p-3 rounded-lg bg-red-900/10 border border-red-900/30">
              <p className="text-xs text-red-300 font-medium">
                Type <code className="bg-[#18181b] px-1 rounded text-red-200">{currentServer.name}</code> to confirm:
              </p>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={currentServer.name}
                className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-red-500 transition"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmName(""); }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-[#18181b] text-[#d4d4d8] hover:bg-[#27272a] transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || deleteConfirmName.trim().replace(/\s+/g, " ").toLowerCase() !== currentServer.name.trim().replace(/\s+/g, " ").toLowerCase()}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 text-[#fafafa] hover:bg-red-500 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
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
      {/* Channel clear confirmation */}
      {channelToClear && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-[#fafafa]">Clear {channelToClear.label}</h3>
            <p className="text-xs text-[#a1a1aa]">
              This will remove the {channelToClear.label.toLowerCase()} configuration. The bot will stop using this channel.
              Type <code className="bg-[#09090b] px-1.5 py-0.5 rounded text-red-300 text-[11px]">{channelToClear.value}</code> to confirm:
            </p>
            <input
              type="text"
              value={channelClearConfirm}
              onChange={(e) => setChannelClearConfirm(e.target.value)}
              placeholder={channelToClear.value}
              autoFocus
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-red-500 transition"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setChannelToClear(null); setChannelClearConfirm(""); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-[#09090b] text-[#d4d4d8] hover:bg-[#27272a] transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const { linkId, field } = channelToClear;
                  await supabase.from("discord_configs").update({ [field]: null }).eq("id", linkId);
                  setDiscordLinks(prev => prev.map(d => d.id === linkId ? { ...d, [field]: undefined } : d));
                  setChannelToClear(null);
                  setChannelClearConfirm("");
                  toast("success", `${channelToClear.label} cleared`);
                }}
                disabled={channelClearConfirm.trim() !== channelToClear.value}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 text-[#fafafa] hover:bg-red-500 transition disabled:opacity-50"
              >
                Clear Channel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Discord link removal confirmation */}
      {discordToRemove && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-[#fafafa]">Remove Discord Link</h3>
            <p className="text-xs text-[#a1a1aa]">
              This will disconnect the Discord server and disable all bot commands.
              Type <code className="bg-[#09090b] px-1.5 py-0.5 rounded text-red-300 text-[11px]">{discordToRemove.label}</code> to confirm:
            </p>
            <input
              type="text"
              value={discordRemoveConfirmLabel}
              onChange={(e) => setDiscordRemoveConfirmLabel(e.target.value)}
              placeholder={discordToRemove.label}
              autoFocus
              className="w-full bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-red-500 transition"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setDiscordToRemove(null); setDiscordRemoveConfirmLabel(""); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-[#09090b] text-[#d4d4d8] hover:bg-[#27272a] transition"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleRemoveDiscordLink(discordToRemove.id); setDiscordToRemove(null); setDiscordRemoveConfirmLabel(""); }}
                disabled={discordRemoveConfirmLabel.trim() !== discordToRemove.label}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 text-[#fafafa] hover:bg-red-500 transition disabled:opacity-50"
              >
                Remove Link
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
      </div>
    </div>
    </div>
  );
}

// ── Confirm Email Section ──────────────────────────

function ConfirmEmailSection() {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Handle ?token= in URL — user clicked the email confirmation link
  const [searchParams, setSearchParams] = useSearchParams();
  const urlToken = searchParams.get("token");
  
  useEffect(() => {
    if (!urlToken || !user?.id) return;
    setSending(true);
    supabase.functions.invoke("send-verification", {
      body: { action: "verify", token: urlToken, userId: user.id },
    }).then(({ error }) => {
      if (!error) {
        setConfirmed(true);
        // Refresh session to pick up new email_confirmed_at in JWT
        supabase.auth.refreshSession();
        // Remove token from URL
        searchParams.delete("token");
        setSearchParams(searchParams, { replace: true });
      }
      setSending(false);
    });
  }, [urlToken, user?.id]);

  // With Supabase "Confirm email" OFF, email_confirmed_at is auto-set at sign-up.
  // A user has only truly verified if confirmed_at differs from created_at (≥ 5s gap).
  const [confirmed, setConfirmed] = useState(false);

  const confirmedAt = user?.email_confirmed_at || user?.confirmed_at;
  const createdAt = user?.created_at;
  const isActuallyConfirmed = confirmed || (
    confirmedAt && createdAt
      ? Math.abs(new Date(confirmedAt).getTime() - new Date(createdAt).getTime()) > 10_000
      : false
  );

  const handleResend = async () => {
    if (!user?.email) return;
    setMessage(null);
    setSending(true);
    const { error } = await supabase.functions.invoke("send-verification", {
      body: { email: user.email, userId: user.id },
    });
    setSending(false);
    if (error) {
      setMessage({ type: "error", text: error.message || "Failed to send. Please try again." });
    } else {
      setMessage({ type: "success", text: "Confirmation email sent! Check your inbox and click the link." });
      setCooldown(60);
    }
  };

  return (
    <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-[#fafafa] flex items-center gap-2">
        Email Confirmation
        {isActuallyConfirmed ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
            <MailCheck className="w-3 h-3" /> Confirmed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
            <MailWarning className="w-3 h-3" /> Not Confirmed
          </span>
        )}
      </h3>

      <div className="flex items-center gap-2 text-sm text-[#a1a1aa]">
        <Mail className="w-4 h-4 shrink-0 text-[#52525b]" />
        <span className="truncate">{user?.email || "No email"}</span>
      </div>

      {isActuallyConfirmed ? (
        <p className="text-xs text-[#71717a]">Your email is verified. You'll receive password reset links and security notifications here.</p>
      ) : (
        <>
          <p className="text-xs text-amber-300/80">Your email is not yet confirmed. Some features may be limited until you verify your email address.</p>

          {message && (
            <div className={`text-xs px-3 py-2 rounded-lg ${message.type === "success" ? "bg-emerald-900/20 border border-emerald-800/30 text-emerald-300" : "bg-red-900/20 border border-red-800/30 text-red-300"}`}>
              {message.text}
            </div>
          )}

          <button
            onClick={handleResend}
            disabled={sending || cooldown > 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-40"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : cooldown > 0 ? <Loader2 className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
            {sending ? "Confirming..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Confirm Email"}
          </button>
        </>
      )}
    </section>
  );
}

// ── Change Password Section ──────────────────────────

function ChangePasswordSection() {
  const { changePassword } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChangePassword = async () => {
    setMessage(null);
    if (!oldPassword) return setMessage({ type: "error", text: "Please enter your current password." });
    if (newPassword.length < 6) return setMessage({ type: "error", text: "New password must be at least 6 characters." });
    if (newPassword !== confirmPassword) return setMessage({ type: "error", text: "New passwords do not match." });
    if (oldPassword === newPassword) return setMessage({ type: "error", text: "New password must be different from your current password." });

    setSaving(true);
    const { error } = await changePassword(newPassword);
    setSaving(false);

    if (error) {
      setMessage({ type: "error", text: error });
    } else {
      setMessage({ type: "success", text: "Password changed successfully!" });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-[#09090b] border border-[#27272a] rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[#fafafa]">Change Password</h3>
        <p className="text-xs text-[#71717a]">Update your account password. You'll stay logged in after changing it.</p>

        {message && (
          <div className={`text-xs px-3 py-2 rounded-lg ${message.type === "success" ? "bg-emerald-900/20 border border-emerald-800/30 text-emerald-300" : "bg-red-900/20 border border-red-800/30 text-red-300"}`}>
            {message.text}
          </div>
        )}

        <div className="space-y-2.5">
          <div>
            <label className="text-[11px] font-medium text-[#a1a1aa] block mb-1">Current Password</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#a1a1aa] block mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#a1a1aa] block mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] placeholder-[#71717a] outline-none focus:border-[#52525b] transition"
            />
          </div>
        </div>

        <button
          onClick={handleChangePassword}
          disabled={saving || !oldPassword || !newPassword || !confirmPassword}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
          {saving ? "Changing..." : "Change Password"}
        </button>
      </section>
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
  bossAssists,
  savingCell,
  onPointsChange,
  onSalaryChange,
  onBatchSalaryChange,
  onAssistToggle,
}: {
  bosses: Boss[];
  guilds: Guild[];
  allBossGuilds: BossGuild[];
  bossAssists: BossAssist[];
  savingCell: string | null;
  onPointsChange: (bossId: string, guildId: string, points: number | null) => Promise<void>;
  onSalaryChange: (bossId: string, guildId: string, hasSalary: boolean) => Promise<void>;
  onBatchSalaryChange: (guildId: string, bossIds: string[], hasSalary: boolean) => Promise<void>;
  onAssistToggle: (bossId: string, ownerGuildId: string, assistantGuildId: string) => Promise<void>;
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

  // Build lookup: "bossId|guildId" → BossGuild (merge multiple rows for same key)
  const bgLookup = useMemo(() => {
    const map = new Map<string, BossGuild>();
    for (const bg of allBossGuilds) {
      const key = `${bg.boss_id}|${bg.guild_id}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...bg });
      } else {
        // Merge: prefer the assignment row's id, OR has_salary/points from any row
        if (existing.sort_order === -1 && bg.sort_order !== -1) {
          // bg is the assignment row, existing is salary-only — keep bg's id/sort_order, merge salary/points
          map.set(key, {
            ...bg,
            has_salary: existing.has_salary || bg.has_salary,
            points: bg.points ?? existing.points,
          });
        } else {
          // Merge salary/points from bg into existing
          map.set(key, {
            ...existing,
            has_salary: existing.has_salary || bg.has_salary,
            points: existing.points ?? bg.points,
          });
        }
      }
    }
    return map;
  }, [allBossGuilds]);

  // Build assist lookup: "bossId|ownerGuildId" → Set<assistantGuildId>
  const assistLookup = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const a of bossAssists) {
      const key = `${a.boss_id}|${a.owner_guild_id}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(a.assistant_guild_id);
    }
    return map;
  }, [bossAssists]);

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

  const [search, setSearch] = useState("");

  if (guilds.length === 0) {
    return (
      <div className="text-center py-16">
        <Shield className="w-10 h-10 text-[#3f3f46] mx-auto mb-3" />
        <p className="text-[#71717a]">No guilds created yet.</p>
        <p className="text-[#52525b] text-sm mt-1">Create guilds in the Guilds tab first.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-3 sm:p-4 max-w-full">
      {/* Search + Legend */}
      <div className="flex items-center gap-2 sm:gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-[10px] text-[#71717a] flex-wrap">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Fixed Hours</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" /> Schedule</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> One-time</span>
        </div>
        <div className="flex-1 hidden sm:block" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#52525b]" />
          <input
            type="text"
            placeholder="Search bosses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-32 sm:w-40 bg-[#18181b] border border-[#27272a] rounded pl-7 pr-2 py-1 text-[10px] sm:text-xs text-[#fafafa] placeholder-[#52525b] outline-none focus:border-[#52525b] transition"
          />
        </div>
      </div>
      <div className="overflow-x-auto -mx-3 sm:mx-0">
      <table className="w-full text-[10px] sm:text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-[#09090b] px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[#a1a1aa] font-medium border-b border-r border-[#27272a]/50 z-10 min-w-[120px] sm:min-w-[160px]">
              Boss
            </th>
            {guilds.map(g => (
              <th key={g.id} colSpan={3} className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-center text-[#a1a1aa] font-medium border-b border-[#27272a]/50 border-l border-[#27272a]/30">
                <span className="text-[10px] sm:text-xs">{g.name}</span>
              </th>
            ))}
          </tr>
          <tr>
            <th className="sticky left-0 bg-[#09090b] px-3 py-1 border-r border-[#27272a]/50 z-10" />
            {guilds.map(g => (
              <Fragment key={g.id}>
                <th className="px-2 py-1 text-center text-[10px] text-[#71717a] font-normal border-l border-[#27272a]/30">Pts</th>
                <th className="px-2 py-1 text-center border-l-0">
                  <label className="flex items-center justify-center gap-1 cursor-pointer" title="Check/uncheck all salaries for this guild">
                    <input
                      type="checkbox"
                      checked={guildAllChecked.get(g.id) ?? false}
                      onChange={() => handleCheckAllSalary(g.id)}
                      className="w-3 h-3 rounded border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] focus:ring-[#52525b]/50 cursor-pointer"
                    />
                    <span className="text-[10px] text-[#71717a] font-normal">Salary</span>
                  </label>
                </th>
                <th className="px-2 py-1 text-center text-[10px] text-[#71717a] font-normal border-l border-[#27272a]/30">Ast</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedBosses.filter(boss => !search || boss.name.toLowerCase().includes(search.toLowerCase())).map(boss => (
            <tr key={boss.id} className="group border-b border-[#27272a]/50 hover:bg-[#18181b]/20 transition">
              <td className="sticky left-0 bg-[#09090b] group-hover:bg-[#18181b]/20 px-2 sm:px-3 py-1.5 sm:py-2 text-[#fafafa] font-medium border-r border-[#27272a]/30 z-10 transition">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    boss.spawn_type === "fixed_schedule" ? "bg-violet-400" :
                    boss.spawn_type === "one_time" ? "bg-amber-400" :
                    "bg-emerald-400"
                  }`} />
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
                    <td className="px-1 py-1 text-center border-l border-[#27272a]/30">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => onPointsChange(boss.id, guild.id, Math.max(0, (points ?? 1) - 1))}
                          disabled={isSaving || (points ?? 1) <= 0}
                          className={`p-0.5 rounded transition ${(points ?? 1) <= 0 ? "text-[#3f3f46] cursor-default" : "text-[#71717a] hover:text-[#f87171]"}`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className={`font-mono tabular-nums min-w-[1.5em] text-center ${points != null ? "text-[#a1a1aa]" : "text-[#71717a]"}`}>
                          {isSaving ? <Loader2 className="w-3 h-3 animate-spin inline" /> : (points ?? boss.boss_points ?? 1)}
                        </span>
                        <button
                          onClick={() => onPointsChange(boss.id, guild.id, Math.min(99, (points ?? 1) + 1))}
                          disabled={isSaving || (points ?? 1) >= 99}
                          className={`p-0.5 rounded transition ${(points ?? 1) >= 99 ? "text-[#3f3f46] cursor-default" : "text-[#71717a] hover:text-[#a1a1aa]"}`}
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
                        className="w-3 h-3 rounded border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] focus:ring-[#52525b]/50 cursor-pointer disabled:opacity-50"
                      />
                    </td>
                    {/* Assist cell */}
                    <td className="px-1 py-1 text-center border-l border-[#27272a]/30">
                      {(() => {
                        // Find assists where this guild is the assistant on this boss
                        const myAssists = bossAssists.filter(a => a.boss_id === boss.id && a.assistant_guild_id === guild.id);
                        const ownerIds = myAssists.map(a => a.owner_guild_id);
                        // Show existing assists as small removable tags
                        return (
                          <div className="flex flex-wrap items-center justify-center gap-0.5 min-w-[28px]">
                            {ownerIds.map(oid => {
                              const ownerGuild = guilds.find(g => g.id === oid);
                              return (
                                <span key={oid} className="inline-flex items-center gap-0.5 bg-purple-900/30 border border-[#27272a]/50 rounded px-1 py-0.5 text-[9px] text-[#d4d4d8] leading-none">
                                  {ownerGuild?.name?.slice(0, 6) || "?"}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onAssistToggle(boss.id, oid, guild.id); }}
                                    className="text-[#a1a1aa] hover:text-[#f87171] leading-none"
                                  >×</button>
                                </span>
                              );
                            })}
                            {/* + button to add assist — only show guilds that aren't self and aren't already assisted */}
                            {(() => {
                              const availGuilds = guilds.filter(g => g.id !== guild.id && !ownerIds.includes(g.id));
                              if (availGuilds.length === 0) return null;
                              return (
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) { onAssistToggle(boss.id, e.target.value, guild.id); e.target.value = ""; }}}
                                  className="bg-transparent text-[9px] text-[#71717a] hover:text-[#a1a1aa] cursor-pointer outline-none"
                                >
                                  <option value="">+</option>
                                  {availGuilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="text-[10px] text-[#52525b] mt-2 text-center">
        Points default to server-wide value if not overridden. Salary is per-guild.
      </p>
    </div>
  );
}

// ── Server Activity Log Tab (Owner/Mod Audit) ───────────────

export function ServerActivityLogTab({ serverId, timezone = "UTC" }: { serverId: string; timezone?: string }) {
  // Action types hidden from the owner filter (still appear in log)
  const HIDDEN_ACTIONS = new Set(["boss_toggle", "activity_toggle"]);

  // All visible action types across categories
  const allActions = useMemo(() =>
    AUDIT_ACTION_GROUPS
      .filter(g => !["Admin", "Subscription", "Server"].includes(g.label))
      .flatMap(g => g.actions)
      .filter(a => !HIDDEN_ACTIONS.has(a)),
  []);

  // Load saved filters from localStorage, default to all checked
  const [actionFilters, setActionFilters] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("rs_audit_filters");
      if (saved) {
        const arr = JSON.parse(saved) as string[];
        return new Set(arr.filter(a => allActions.includes(a as any)));
      }
    } catch {}
    return new Set(allActions);
  });

  const [cursor, setCursor] = useState<number | null>(null);
  const [log, setLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(sevenDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [filtersExpanded, setFiltersExpanded] = useState(() => {
    return localStorage.getItem("rs_audit_filters_expanded") !== "false";
  });
  const allLog = useRef<any[]>([]);

  const saveFilters = (filters: Set<string>) => {
    localStorage.setItem("rs_audit_filters", JSON.stringify([...filters]));
    setActionFilters(filters);
  };

  const toggleAction = (action: string) => {
    setActionFilters(prev => {
      const next = new Set(prev);
      if (next.has(action)) next.delete(action); else next.add(action);
      localStorage.setItem("rs_audit_filters", JSON.stringify([...next]));
      return next;
    });
  };

  const clearFilters = () => {
    saveFilters(new Set());
  };

  const checkAll = () => {
    saveFilters(new Set(allActions));
  };

  const formatActionLabel = (action: string): string =>
    action?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? action ?? "";

  const filteredLog = useMemo(() => {
    let result = actionFilters.size === 0 ? log : log.filter(e => actionFilters.has(e.action));
    // Date filter
    if (dateFrom || dateTo) {
      const fromMs = dateFrom ? new Date(dateFrom).getTime() : 0;
      const toMs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : Infinity;
      result = result.filter(e => {
        const ts = new Date(e.created_at).getTime();
        return ts >= fromMs && ts <= toMs;
      });
    }
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => {
        if (formatActionLabel(e.action).toLowerCase().includes(q)) return true;
        const actor = e.actor_email || e.details?.discord_user || "";
        if (actor.toLowerCase().includes(q)) return true;
        // Search all detail values (skip discord_user and internal keys)
        const d = e.details || {};
        for (const v of Object.values(d)) {
          if (v != null && String(v).toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    return result;
  }, [log, actionFilters, searchQuery, dateFrom, dateTo]);

  const actionColor = (action: string): { dot: string; text: string } => {
    if (action.includes("delete") || action.includes("remove")) return { dot: "bg-red-400", text: "text-red-300" };
    if (action.includes("create") || action.includes("add")) return { dot: "bg-emerald-400", text: "text-emerald-300" };
    if (action.includes("transfer") || action.includes("ownership")) return { dot: "bg-violet-400", text: "text-violet-300" };
    if (action.includes("kill")) return { dot: "bg-rose-400", text: "text-rose-300" };
    if (action.includes("finalize")) return { dot: "bg-sky-400", text: "text-sky-300" };
    if (action.includes("extend") || action.includes("subscription")) return { dot: "bg-cyan-400", text: "text-cyan-300" };
    return { dot: "bg-[#71717a]", text: "text-[#a1a1aa]" };
  };

  const formatDetails = (entry: any): string => {
    const d = entry.details || {};
    switch (entry.action) {
      case "boss_kill": return `${d.boss_name || "?"} — ${d.attendees ?? 0} attendees${d.guild ? ` (${d.guild})` : ""}`;
      case "attendance_copy": return `Copied ${d.copied ?? 0} attendees${d.source_boss ? ` from "${d.source_boss}"` : ""}${d.target_boss ? ` to "${d.target_boss}"` : ""}${d.skipped ? ` (${d.skipped} skipped)` : ""}`;
      case "attendance_add": return `${d.member_name || "?"} attended ${d.boss_name || "?"}${d.death_time ? ` (${d.death_time})` : ""}`;
      case "attendance_remove": return `${d.member_name || "?"} removed from ${d.boss_name || "?"}${d.death_time ? ` (${d.death_time})` : ""}`;
      case "member_cp_add": case "member_cp_update": return `${d.player_name || "?"}: ${d.old_cp != null ? Number(d.old_cp).toLocaleString() : "—"} → ${d.new_cp != null ? Number(d.new_cp).toLocaleString() : "?"}`;
      case "member_cp_delete": return `Deleted CP update for ${d.player_name || "?"}`;
      case "member_add": return d.member_name || "—";
      case "member_remove": return d.member_name || "Member removed";
      case "member_note_add": return d.note_preview || "—";
      case "member_note_delete": return `Deleted note`;
      case "member_progress_update": return d.member_name ? `${d.member_name}: progress updated` : "Progress updated";
      case "moderator_add": return d.target_email || "Moderator added";
      case "moderator_remove": return d.target_email || "Moderator removed";
      case "mod_perms_update": return d.target_email || d.target_user_id?.substring(0,8) + "…" || "—";
      case "ownership_transfer": return `Owner changed`;
      case "boss_create": case "boss_update": case "boss_delete": return d.boss_name || d.name || "—";
      case "boss_toggle": return `${d.boss_name || "?"} ${d.enabled ? "enabled" : "disabled"}`;
      case "boss_time_edit": return `${d.boss_name || "?"}: time changed${d.new_time ? ` to ${d.new_time}` : ""}${d.direction ? ` (${d.direction > 0 ? "+" : ""}${d.direction})` : ""}`;
      case "boss_rotation_advance": return `${d.boss_name || "?"}: rotation advanced${d.target_guild ? ` to ${d.target_guild}` : ""}${d.mode ? ` (${d.mode})` : ""}`;
      case "boss_guilds_set": return `Boss guilds updated${d.boss_name ? ` for "${d.boss_name}"` : ""}${d.guild_count ? ` (${d.guild_count} guilds, ${d.mode})` : ""}`;
      case "boss_spawn_set": return `${d.boss_name || "?"}: spawn time set`;
      case "activity_create": case "activity_update": case "activity_delete": return d.activity_name || d.name || "—";
      case "activity_toggle": return `${d.activity_name || "?"} ${d.enabled ? "enabled" : "disabled"}${d.reason ? ` (${d.reason})` : ""}`;
      case "activity_time_edit": return `Activity time edited${d.activity_name ? ` for "${d.activity_name}"` : ""}`;
      case "activity_finalize": case "activity_end_record": return `${d.activity_name || "?"} completed${d.attendees ? ` (${d.attendees} attendees)` : ""}${d.end_time ? ` at ${d.end_time}` : ""}`;
      case "activity_guilds_set": return `Activity guilds updated${d.activity_name ? ` for "${d.activity_name}"` : ""}${d.guild_count ? ` (${d.guild_count} guilds, ${d.mode})` : ""}`;
      case "activity_rotation_advance": return `Activity rotation advanced${d.activity_name ? ` for "${d.activity_name}"` : ""}${d.rotated_to ? ` → ${d.rotated_to}` : ""}`;
      case "gear_equip": return `Gear equipped${d.enhancement ? ` (+${d.enhancement})` : ""}`;
      case "gear_unequip": return `Gear unequipped`;
      case "item_create": case "item_update": case "item_delete": return `${d.item_name || d.name || "?"}${d.type ? ` (${d.type})` : ""}`;
      case "item_distribute": return `${d.item_name || "?"} → ${d.player_name || "?"}${d.quantity ? ` x${d.quantity}` : ""}`;
      case "item_approve": case "item_reject": return d.item_name || "—";
      case "party_create": case "party_delete": return d.party_name || d.name || "—";
      case "party_assign": return `${d.party_name || "?"} assigned to ${d.boss_name || "?"}`;
      case "party_unlink": return `${d.party_name || "?"} unlinked`;
      case "party_member_add": return `${d.member_name || "?"} added to party`;
      case "party_member_remove": return `${d.member_name || "?"} removed from party`;
      case "class_create": case "class_update": case "class_delete": return d.class_name || d.name || "—";
      case "rally_image_delete": return `Deleted screenshot`;
      case "leaderboard_finalize": return `${d.period || "?"}: ${d.rankings ?? 0} players`;
      case "settings_update": {
        const entries = Object.entries(d).filter(([k]) => k !== "discord_user");
        return entries.map(([k,v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ") || "Settings updated";
      }
      case "invite_regenerate": return "Regenerated invite code";
      case "viewer_key_regenerate": return "Regenerated viewer key";
      case "seed_from_game": return `${d.game_name || "?"}: ${d.bosses ?? 0} bosses, ${d.activities ?? 0} activities seeded`;
      case "force_spawn": return `${d.boss_name || `${d.boss_count ?? 0} bosses`} force-spawned`;
      case "subscription_extend": return `+${d.days ?? 30} days`;
      case "game_create": case "game_update": case "game_delete": return d.game_name || "—";
      case "server_create": case "server_delete": case "server_restore": return d.server_name || "—";
      default: return Object.entries(d).filter(([k]) => k !== "discord_user").slice(0, 2).map(([k,v]) => `${k}: ${v}`).join(", ") || "—";
    }
  };

  const fetchLog = async (reset: boolean) => {
    if (reset) {
      setLoading(true);
      setCursor(null);
      setFetchError(null);
    }
    try {
      const result = await fetchAuditLog(100, serverId, reset ? null : cursor, null);
      if (reset) {
        allLog.current = result;
        setLog(result);
        setHasMore(result.length >= 100);
      } else {
        allLog.current = [...allLog.current, ...result];
        setLog(prev => [...prev, ...result]);
        setHasMore(result.length >= 100);
      }
    } catch (err: any) {
      console.error("[audit] fetchLog error:", err?.message || err);
      setFetchError(err?.message || "Failed to load activity log");
    }
    finally { setLoading(false); setLoadingMore(false); }
  };

  useEffect(() => { fetchLog(true); }, [serverId]);

  const loadMore = async () => {
    if (loadingMore || log.length === 0) return;
    const last = log[log.length - 1];
    const newCursor = last?.id;
    if (!newCursor) return;
    setCursor(newCursor);
    setLoadingMore(true);
    try {
      const result = await fetchAuditLog(100, serverId, newCursor, null);
      allLog.current = [...allLog.current, ...result];
      setLog(prev => [...prev, ...result]);
      setHasMore(result.length >= 100);
    } catch (err: any) {
      console.error("[audit] loadMore error:", err?.message || err);
    }
    finally { setLoadingMore(false); }
  };

  const formatTime = (iso: string, showTime = true) => {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-US", { timeZone: timezone, month: "2-digit", day: "2-digit", year: "numeric" });
    if (!showTime) return date;
    return `${date} ${d.toLocaleTimeString("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div className="space-y-3">
      {/* Search + date filter toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-[#0d0d11] border border-[#1e1e2a] rounded-lg px-2.5 py-1.5 flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-[#52525b] shrink-0" />
          <input
            type="text"
            placeholder="Search events..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-[#fafafa] outline-none flex-1 placeholder:text-[#52525b]"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-3 h-3" /></button>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-[#52525b]">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-[#0d0d11] border border-[#1e1e2a] rounded px-2 py-1 text-[#fafafa] outline-none focus:border-[#52525b] w-28" />
          <span>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-[#0d0d11] border border-[#1e1e2a] rounded px-2 py-1 text-[#fafafa] outline-none focus:border-[#52525b] w-28" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-[#52525b] hover:text-[#fafafa]"><X className="w-3 h-3" /></button>
          )}
        </div>
        <span className="text-xs text-[#52525b] shrink-0">{filteredLog.length} event{filteredLog.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Action filter — collapsible checkboxes */}
      <div className="text-[10px]">
        <div className="flex items-center gap-2 mb-1">
          <button onClick={() => setFiltersExpanded(prev => { const next = !prev; localStorage.setItem("rs_audit_filters_expanded", String(next)); return next; })}
            className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#1e1e2a] text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#3f3f46] transition">
            <Eye className="w-3 h-3" />
            <span className="text-xs font-medium">{filtersExpanded ? "Hide Filters" : "Show Filters"}</span>
            <ChevronDown className={`w-3 h-3 transition ${filtersExpanded ? "rotate-180" : ""}`} />
          </button>
          {actionFilters.size < allActions.length ? (
            <button onClick={checkAll} className="px-2 py-1 rounded border border-violet-500/30 text-[11px] text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 transition">
              Check All ({allActions.length - actionFilters.size})
            </button>
          ) : (
            <button onClick={clearFilters} className="px-2 py-1 rounded border border-[#3f3f46] text-[11px] text-[#71717a] hover:text-[#fafafa] hover:border-[#52525b] transition">
              Clear Filters
            </button>
          )}
        </div>
        {filtersExpanded && (
          <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        {AUDIT_ACTION_GROUPS.filter(g => !["Admin", "Subscription", "Server"].includes(g.label)).map(g => {
          const actions = g.actions.filter(a => !HIDDEN_ACTIONS.has(a));
          if (actions.length === 0) return null;
          return (
          <div key={g.label} className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[#52525b] font-semibold shrink-0">{g.label}</span>
            {actions.map(a => (
              <button key={a} onClick={() => toggleAction(a)}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded border transition ${actionFilters.has(a) ? "border-violet-500/50 text-violet-300 bg-violet-500/10" : "border-[#1e1e2a] text-[#71717a] hover:border-[#3f3f46] hover:text-[#a1a1aa]"}`}>
                <span className={`shrink-0 w-3 h-3 rounded border flex items-center justify-center ${actionFilters.has(a) ? "bg-violet-500 border-violet-500" : "border-[#3f3f46]"}`}>
                  {actionFilters.has(a) && <Check className="w-2 h-2 text-white" />}
                </span>
                <span className="whitespace-nowrap">{formatActionLabel(a)}</span>
              </button>
            ))}
          </div>
          );
        })}
        </div>
        )}
      </div>

      {loading && log.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-[#71717a] animate-spin" /></div>
      ) : fetchError ? (
        <p className="text-red-400 text-sm text-center py-12">{fetchError}</p>
      ) : filteredLog.length === 0 ? (
        <p className="text-[#71717a] text-sm text-center py-12">{log.length > 0 ? "No events match the selected filters." : "No activity recorded yet."}</p>
      ) : (
        <div className="border border-[#1e1e2a] rounded-xl overflow-hidden">
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 border-b border-[#1e1e2a] bg-[#0d0d11]/50 text-[10px] font-semibold text-[#71717a] uppercase tracking-wider">
            <div className="col-span-3">Event</div>
            <div className="col-span-4">Details</div>
            <div className="col-span-2">Actor</div>
            <div className="col-span-3">Timestamp</div>
          </div>
          {filteredLog.map((entry: any) => {
            const { dot, text: txt } = actionColor(entry.action);
            const isViewer = !!entry.viewer_key;
            const actor = isViewer ? `Viewer` : (entry.actor_email || entry.details?.discord_user || "—");
            return (
              <div key={entry.id} className="border-b border-[#1e1e2a]/50 last:border-b-0 hover:bg-[#0d0d11]/20 transition">
                <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2.5 items-center">
                  <div className="col-span-3 flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dot}`} />
                    <span className={`text-xs font-medium truncate ${txt}`}>{formatActionLabel(entry.action)}</span>
                  </div>
                  <div className="col-span-4 min-w-0">
                    <span className="text-[11px] text-[#d4d4d8] truncate block">{formatDetails(entry)}</span>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <span className="text-[10px] text-[#71717a] truncate block">{actor}</span>
                  </div>
                  <div className="col-span-3 min-w-0">
                    <span className="text-[10px] text-[#71717a] font-mono">{formatTime(entry.created_at)}</span>
                  </div>
                </div>
                {/* Mobile card */}
                <div className="sm:hidden px-3 py-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dot}`} />
                    <span className={`text-xs font-medium ${txt}`}>{formatActionLabel(entry.action)}</span>
                    {isViewer && <span className="text-[9px] text-[#52525b] ml-auto">viewer</span>}
                  </div>
                  <div className="text-[11px] text-[#d4d4d8]">{formatDetails(entry)}</div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#52525b]">{actor}</span>
                    <span className="text-[#71717a] font-mono">{formatTime(entry.created_at, false)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {hasMore && (
            <button onClick={loadMore} disabled={loadingMore}
              className="w-full px-4 py-2 text-xs text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#0d0d11]/50 transition disabled:opacity-40">
              {loadingMore ? <Loader2 className="w-4 h-4 mx-auto animate-spin" /> : "Load More"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
