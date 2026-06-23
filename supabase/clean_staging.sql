-- Clean all data from staging tables for re-import
-- Run this in the Staging Supabase SQL Editor
-- WARNING: This deletes ALL data from these tables!

BEGIN;

-- Truncate in reverse dependency order with CASCADE handles FK chains
TRUNCATE TABLE
  public.admin_audit_log,
  public.attendance_records,
  public.boss_spawn_overrides,
  public.boss_guilds,
  public.cp_updates,
  public.death_records,
  public.distributions,
  public.gear_upgrade_history,
  public.item_collection_items,
  public.item_collection_manual_ownership,
  public.member_gear,
  public.moderator_permissions,
  public.notifications,
  public.point_adjustments,
  public.server_classes,
  public.static_party_members,
  public.static_parties,
  public.server_members,
  public.bosses,
  public.guilds,
  public.members,
  public.servers
CASCADE;

COMMIT;
