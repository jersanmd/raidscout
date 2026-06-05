// ── Barrel file — re-exports all API modules ────────────────
// This preserves backward compatibility: all imports from "@/lib/supabase" still work.

// Client (must come first — used by all other modules)
export {
  supabase,
  isSupabaseConfigured,
  setCurrentServerId,
  getCurrentServerId,
  setCurrentViewerKey,
  getCurrentViewerKey,
} from "./api/client";

// Servers & moderation
export {
  createServer,
  updateServerName,
  deleteServer,
  restoreServer,
  transferServerOwnership,
  transferServerOwnershipByEmail,
  addServerModerator,
  addServerModeratorById,
  removeServerModerator,
  fetchServerMembers,
  fetchModeratorPermissions,
  updateModeratorPermissions,
  toggleViewerCanEdit,
  toggleViewerCanMarkDied,
  DEFAULT_MODERATOR_PERMISSIONS,
} from "./api/servers";
export type { ServerMember, ModeratorPermissions } from "./api/servers";

// Games & image uploads
export {
  fetchGames,
  createGame,
  updateGame,
  deleteGame,
  uploadGameIcon,
  deleteGameIcon,
  uploadBossImage,
  uploadActivityImage,
} from "./api/games";

// Templates
export {
  fetchBossTemplates,
  fetchActivityTemplates,
  createBossTemplate,
  updateBossTemplate,
  deleteBossTemplate,
  createActivityTemplate,
  updateActivityTemplate,
  deleteActivityTemplate,
} from "./api/templates";

// Bosses & boss-guild assignments
export {
  fetchBosses,
  setBossPoints,
  setBossSalary,
  setBossRotation,
  advanceBossRotation,
  adjustBossRotation,
  fetchAllBossesForServer,
  fetchAllActivitiesForServer,
  createCustomBoss,
  createCustomActivity,
  updateCustomBoss,
  updateCustomActivity,
  toggleBossEnabled,
  toggleActivityEnabled,
  finishActivity,
  setBossSpawnTime,
  fetchSpawnOverrides,
  markAllUnknownAlive,
  fetchBossGuilds,
  fetchAllBossGuildsForServer,
  setBossGuilds,
  upsertBossGuildPoints,
  batchSetGuildSalary,
  getBossOwnerGuild,
} from "./api/bosses";

// Deaths
export {
  fetchDeathRecords,
  insertDeathRecord,
  deleteDeathRecord,
  editDeathTime,
  setDeathDisplayGuild,
} from "./api/deaths";

// Realtime
export {
  subscribeToDeathRecords,
  subscribeToBosses,
  subscribeToServerSettings,
  subscribeToSpawnAlerts,
  cleanupChannel,
} from "./api/realtime";

// Members
export {
  fetchMembers,
  upsertMember,
  bulkAddMembers,
  updateMemberName,
  deleteMember,
} from "./api/members";

// Guilds
export {
  fetchGuilds,
  createGuild,
  updateGuildName,
  deleteGuild,
  setMemberGuild,
  fetchBossAssists,
  toggleBossAssist,
} from "./api/guilds";

// Attendance
export {
  fetchAttendanceForDeath,
  addAttendance,
  removeAttendance,
  clearAllData,
} from "./api/attendance";

// Leaderboard
export {
  fetchLeaderboardResetAt,
  fetchLeaderboard,
  fetchLeaderboardByPeriod,
  resetGuildPoints,
  adjustMemberPoints,
  fetchPointAdjustments,
  fetchMemberKills,
  saveLeaderboardSnapshot,
  fetchLeaderboardSnapshots,
  fetchSnapshotById,
} from "./api/leaderboard";
export type { MemberBossKill } from "./api/leaderboard";

// Analytics
export { fetchAnalytics } from "./api/analytics";
export type { AnalyticsData } from "./api/analytics";

// History
export { fetchHistoryFromSupabase } from "./api/history";

// Discord
export {
  notifyDiscord,
  updateThreadConfig,
  announceSpawns,
} from "./api/discord";
export type { SpawnAnnounceBoss } from "./api/discord";

// Points
export {
  fetchPointRules,
  createPointRule,
  updatePointRule,
  deletePointRule,
  getPointMultiplier,
} from "./api/points";

// Activities
export {
  setActivityParties,
  markActivityAttendance,
  finalizeActivity,
} from "./api/activities";

// Storage
export {
  uploadRallyImage,
  addRallyImageToDeath,
  removeRallyImageFromDeath,
  fetchDeathRallyImages,
} from "./api/storage";

// Admin
export {
  fetchAllServers,
  fetchAllUsers,
  fetchAuditLog,
  fetchServerStats,
  fetchDatabaseStats,
  fetchPlanUsage,
  fetchCronStatus,
} from "./api/admin";

// Activity guilds
export {
  fetchActivityGuilds,
  fetchAllActivityGuildsForServer,
  setActivityGuilds,
  advanceActivityRotation,
  upsertActivityGuildPoints,
  fetchActivityAssists,
  toggleActivityAssist,
} from "./api/activityGuilds";
