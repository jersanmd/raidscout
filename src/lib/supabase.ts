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
  fetchVisibleGames,
  createGame,
  updateGame,
  deleteGame,
  uploadGameIcon,
  deleteGameIcon,
  uploadBossImage,
  uploadActivityImage,
  uploadItemImage,
  fetchItemCatalog,
  fetchItemCatalogPaginated,
  fetchPendingItems,
  fetchApprovedCommunityItems,
  approveItem,
  rejectItem,
  createItemCatalogItem,
  deleteItemCatalogItem,
  updateItemCatalogItem,
  uploadItemCatalogImage,
  fetchItemCategories,
  createItemCategory,
  deleteItemCategory,
  updateItemCategory,
  fetchItemRarities,
  createItemRarity,
  deleteItemRarity,
  updateItemRarity,
  fetchGearSlots,
  createGearSlot,
  deleteGearSlot,
  updateGearSlot,
  fetchGearSlotCategories,
  assignGearSlotCategory,
  removeGearSlotCategory,
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
  recordActivityEnd,
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
  subscribeToActivityInstances,
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

// Static Parties
export {
  fetchStaticParties,
  createParty,
  deleteParty,
  addMemberToParty,
  removeMemberFromParty,
  assignPartyToBoss,
  assignPartyToActivity,
  unlinkParty,
} from "./api/parties";
export type { StaticParty } from "./api/parties";

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
  copyAttendanceToDeath,
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
  fetchMemberActivityHistory,
  saveLeaderboardSnapshot,
  deleteLeaderboardSnapshot,
  fetchLeaderboardSnapshots,
  fetchSnapshotById,
} from "./api/leaderboard";
export type { MemberBossKill, MemberActivityAttendance } from "./api/leaderboard";

// Analytics
export { fetchAnalytics } from "./api/analytics";
export type { AnalyticsData } from "./api/analytics";

// History
export { fetchHistoryFromSupabase } from "./api/history";

// Discord
export {
  notifyDiscord,
  sendCpReminder,
  createProgressThread,
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
  fetchActivityAttendance,
  markActivityAttendance,
  finalizeActivity,
  fetchActivityInstance,
  setActivityRallyImages,
  setActivityPartyLeaders,
} from "./api/activities";

// Storage
export {
  uploadRallyImage,
  addRallyImageToDeath,
  removeRallyImageFromDeath,
  fetchDeathRallyImages,
  saveDeathScanResults,
  fetchDeathScanResults,
  saveActivityScanResults,
  fetchActivityScanResults,
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

// Audit log
export {
  AuditAction,
  AUDIT_ACTION_GROUPS,
  writeAuditEntry,
  fetchAuditLog as fetchAuditLogPaginated,
} from "./api/audit";
export type { AuditEntry } from "./api/audit";

// Member claims
export {
  submitClaimRequest,
  getPendingClaims,
  getMyClaims,
  reviewClaimRequest,
  markClaimRead,
  unlinkMember,
} from "./api/claims";
export type { ClaimRequest, PendingClaim } from "./api/claims";

// DKP
export {
  awardDkpOnKill,
  adjustMemberDkp,
  getMemberDkp,
  getServerDkpRankings,
  getMemberDkpHistory,
  markItemForBid,
  unmarkItemFromBid,
  placeBid,
  cancelBid,
  getItemBids,
  resolveAuction,
  autoResolveAuction,
  getActiveBids,
  getActiveAuctions,
  getPastAuctions,
  deletePastAuction,
  toggleItemDistributed,
  getDkpConfig,
  saveDkpConfig,
} from "./api/dkp";
export type {
  DkpBalance,
  DkpTransaction,
  DkpRanking,
  DkpBid,
  ItemBid,
  DkpConfig,
  ActiveAuction,
  PastAuction,
} from "./api/dkp";

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

// Member Management & Inventory
export {
  fetchCpUpdates,
  fetchMemberCpHistory,
  fetchPendingCpUpdates,
  submitCpUpdate,
  updateCpStatus,
  addBackdatedCpUpdate,
  editCpUpdate,
  deleteCpUpdate,
  fetchMemberNotes,
  addMemberNote,
  deleteMemberNote,
  fetchMemberProfile,
  fetchItems,
  fetchItemsPaginated,
  searchItemsByGame,
  createItem,
  deleteItem,
  updateItem,
  fetchDistributions,
  createDistribution,
  deleteDistribution,
  fetchTopCpGrowth,
  fetchItemDistributionStats,
  fetchTopRecipients,
} from "./api/memberManagement";

// Item Collections
export {
  fetchCollections,
  createCollection,
  deleteCollection,
  fetchCollectionItems,
  addItemToCollection,
  removeItemFromCollection,
  reorderCollectionItem,
  fetchServerDistributions,
  fetchAllCollectionItemsForServer,
  fetchManualOwnership,
  setManualOwnership,
  removeManualOwnership,
} from "./api/collections";
export type { ItemCollection, ItemCollectionItem } from "./api/collections";
