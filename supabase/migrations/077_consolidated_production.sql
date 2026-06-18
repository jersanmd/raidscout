-- Consolidated Production Schema

-- Generated: 2026-06-18T10:24:23.370Z

-- Tables: 50, Indexes: 52, Functions: 112, Policies: 139



-- ── Extensions ──

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";



-- ── Tables ──

CREATE TABLE IF NOT EXISTS "public"."death_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boss_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "death_time" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rally_image_url" "text",
    "is_final" boolean DEFAULT false NOT NULL,
    "server_id" "uuid",
    "owner_guild_id" "uuid",
    "is_initial_spawn" boolean DEFAULT false,
    "display_owner_guild_id" "uuid",
    "party_leader_id" "uuid",
    "party_leaders" "jsonb",
    "scan_results" "jsonb"
);

CREATE TABLE IF NOT EXISTS "public"."items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid",
    "name" "text" NOT NULL,
    "image_url" "text",
    "description" "text",
    "rarity" "text" DEFAULT 'common'::"text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "game" "text",
    "created_by_username" "text",
    "category_id" "uuid",
    "status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    CONSTRAINT "items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."attendance_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "death_record_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "server_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "name" "text" NOT NULL,
    "schedule_type" "text" NOT NULL,
    "schedule" "jsonb",
    "duration_minutes" integer,
    "points_per_participant" integer DEFAULT 1 NOT NULL,
    "party_size" integer,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "is_custom" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "image_url" "text",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "activities_schedule_type_check" CHECK (("schedule_type" = ANY (ARRAY['fixed_hours'::"text", 'fixed_schedule'::"text", 'one_time'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."activity_parties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_instance_id" "uuid" NOT NULL,
    "party_number" integer NOT NULL,
    "member_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "server_id" "uuid",
    "guild_id" "uuid",
    "combat_power" integer,
    "class" "text",
    "discord_user_id" "text",
    "public_slug" "text" DEFAULT "substr"("md5"((("random"())::"text" || ("gen_random_uuid"())::"text")), 1, 12) NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "cp_updated_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "public"."activity_assists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "owner_guild_id" "uuid" NOT NULL,
    "assistant_guild_id" "uuid" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."activity_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_instance_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "present" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."activity_guilds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "guild_id" "uuid" NOT NULL,
    "sort_order" integer,
    "day_of_week" integer,
    "mode" "text" DEFAULT 'rotation'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "points" integer,
    "has_salary" boolean DEFAULT false,
    CONSTRAINT "activity_guilds_mode_check" CHECK (("mode" = ANY (ARRAY['rotation'::"text", 'daily'::"text", 'schedule'::"text", 'all'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."activity_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rally_images" "text"[] DEFAULT '{}'::"text"[],
    "party_leaders" "jsonb" DEFAULT '{}'::"jsonb",
    "scan_results" "jsonb"
);

CREATE TABLE IF NOT EXISTS "public"."activity_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "schedule_type" "text" NOT NULL,
    "schedule" "jsonb",
    "duration_minutes" integer,
    "points_per_participant" integer DEFAULT 1 NOT NULL,
    "party_size" integer,
    "category" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    CONSTRAINT "activity_templates_schedule_type_check" CHECK (("schedule_type" = ANY (ARRAY['recurring'::"text", 'one_time'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" bigint NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "target_type" "text",
    "target_id" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "server_id" "uuid",
    "viewer_key" "text"
);

CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "server_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."boss_assists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boss_id" "uuid" NOT NULL,
    "owner_guild_id" "uuid" NOT NULL,
    "assistant_guild_id" "uuid" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."boss_guilds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boss_id" "uuid" NOT NULL,
    "guild_id" "uuid" NOT NULL,
    "sort_order" integer,
    "day_of_week" integer,
    "mode" "text" DEFAULT 'rotation'::"text",
    "has_salary" boolean DEFAULT false,
    "points" integer,
    CONSTRAINT "boss_guilds_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "boss_guilds_mode_check" CHECK (("mode" = ANY (ARRAY['rotation'::"text", 'schedule'::"text", 'daily'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."boss_spawn_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "boss_id" "uuid" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "death_time" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."boss_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "spawn_type" "text" NOT NULL,
    "respawn_hours" integer,
    "schedule" "jsonb",
    "is_recurring" boolean DEFAULT true NOT NULL,
    "category" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "points" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "boss_templates_spawn_type_check" CHECK (("spawn_type" = ANY (ARRAY['fixed_hours'::"text", 'fixed_schedule'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."bosses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "spawn_type" "text" NOT NULL,
    "respawn_hours" integer,
    "schedule" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_id" "uuid",
    "is_recurring" boolean DEFAULT true NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "category" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "is_custom" boolean DEFAULT false NOT NULL,
    "points" integer DEFAULT 1 NOT NULL,
    "server_id" "uuid",
    "boss_points" integer DEFAULT 1,
    "rotation_counter" integer DEFAULT 1,
    "rotation_adjustment" integer,
    "has_salary" boolean DEFAULT false NOT NULL,
    "image_url" "text",
    "party_leader_id" "uuid",
    "deleted_at" timestamp with time zone,
    CONSTRAINT "bosses_spawn_type_check" CHECK (("spawn_type" = ANY (ARRAY['fixed_hours'::"text", 'fixed_schedule'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."cp_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "player_name" "text" NOT NULL,
    "old_cp" integer,
    "new_cp" integer NOT NULL,
    "screenshot_url" "text",
    "discord_user_id" "text",
    "discord_username" "text",
    "discord_message_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "cp_updates_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."discord_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "discord_guild_id" "text" NOT NULL,
    "raidscout_server_id" "uuid" NOT NULL,
    "label" "text",
    "webhook_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "command_aliases" "jsonb" DEFAULT '{}'::"jsonb",
    "command_channel_id" "text",
    "command_prefix" "text",
    "notification_channel_id" "text",
    "thread_channel_id" "text",
    "thread_guilds" "text"[] DEFAULT '{}'::"text"[],
    "notification_prefix" "text",
    "progress_channel_id" "text"
);

CREATE TABLE IF NOT EXISTS "public"."distributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "player_name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "distributed_by" "uuid" NOT NULL,
    "distributed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "distributions_quantity_check" CHECK (("quantity" > 0))
);

CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "icon_url" "text",
    "supported_spawn_types" "jsonb" DEFAULT '["fixed_hours", "fixed_schedule"]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_visible" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."gear_catalog" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "guild_id" "uuid" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "rarity" "text" DEFAULT 'common'::"text" NOT NULL,
    "image_url" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "gear_catalog_rarity_check" CHECK (("rarity" = ANY (ARRAY['common'::"text", 'uncommon'::"text", 'rare'::"text", 'epic'::"text", 'legendary'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."gear_slot_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slot_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."gear_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game" "text" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."gear_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "name" "text" DEFAULT 'Default'::"text" NOT NULL,
    "slots" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."gear_upgrade_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "slot_id" "text" NOT NULL,
    "old_item_id" "uuid",
    "new_item_id" "uuid",
    "old_enhancement" integer,
    "new_enhancement" integer,
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."guilds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."item_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game" "text" NOT NULL,
    "name" "text" NOT NULL,
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."item_collection_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "collection_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."item_collection_manual_ownership" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "collection_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "player_name" "text" NOT NULL,
    "owned" boolean DEFAULT true NOT NULL,
    "set_by" "text",
    "set_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."item_collections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."item_rarities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game" "text" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#71717a'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."leaderboard_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid",
    "finalized_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "period_start" timestamp with time zone,
    "period" "text" NOT NULL,
    "rankings" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leaderboard_snapshots_period_check" CHECK ((("period" = ANY (ARRAY['all_time'::"text", 'weekly'::"text", 'monthly'::"text"])) OR ("period" ~~ 'weekly:%'::"text")))
);

CREATE TABLE IF NOT EXISTS "public"."member_classes" (
    "server_id" "uuid" NOT NULL,
    "classes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."member_gear" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "slot_id" "text" NOT NULL,
    "catalog_item_id" "uuid",
    "enhancement_level" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."member_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."moderator_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "can_manage_bosses" boolean DEFAULT false NOT NULL,
    "can_manage_members" boolean DEFAULT false NOT NULL,
    "can_manage_guilds" boolean DEFAULT false NOT NULL,
    "can_manage_activities" boolean DEFAULT false NOT NULL,
    "can_manage_points" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_access_settings" boolean DEFAULT false NOT NULL,
    "can_record_death" boolean DEFAULT false NOT NULL,
    "can_manage_spawns" boolean DEFAULT false NOT NULL,
    "can_manage_integrations" boolean DEFAULT false NOT NULL,
    "can_manage_server_content" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "server_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);

CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "paypal_order_id" "text",
    "amount" numeric(10,2) DEFAULT 9.99 NOT NULL,
    "days_added" integer DEFAULT 30 NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "payer_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'refunded'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."point_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "member_id" "uuid" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "points" integer NOT NULL,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "adjusted_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."point_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "guild_id" "uuid",
    "rule_type" "text" DEFAULT 'time_multiplier'::"text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."server_classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" DEFAULT 'Sword'::"text" NOT NULL,
    "color" "text" DEFAULT '#a1a1aa'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."server_members" (
    "server_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'moderator'::"text" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "server_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."servers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invite_code" "text",
    "discord_webhook_url" "text",
    "viewer_key" "uuid" DEFAULT "gen_random_uuid"(),
    "timezone" "text" DEFAULT 'Asia/Manila'::"text",
    "notification_prefix" "text" DEFAULT '@everyone'::"text",
    "viewer_can_edit" boolean DEFAULT false NOT NULL,
    "viewer_can_mark_died" boolean DEFAULT false NOT NULL,
    "game_id" "uuid",
    "deleted_at" timestamp with time zone,
    "game" "text",
    "trial_ends_at" timestamp with time zone,
    "subscription_ends_at" timestamp with time zone,
    "paypal_subscription_id" "text"
);

CREATE TABLE IF NOT EXISTS "public"."spawn_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "boss_id" "uuid" NOT NULL,
    "event" "text" NOT NULL,
    "spawn_timestamp" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activity_id" "uuid",
    CONSTRAINT "spawn_notifications_event_check" CHECK (("event" = ANY (ARRAY['boss_spawning'::"text", 'boss_spawned'::"text"]))),
    CONSTRAINT "spawn_notifs_one_target" CHECK (((("boss_id" IS NOT NULL) AND ("activity_id" IS NULL)) OR (("boss_id" IS NULL) AND ("activity_id" IS NOT NULL))))
);

CREATE TABLE IF NOT EXISTS "public"."static_parties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "server_id" "uuid" NOT NULL,
    "guild_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "boss_id" "uuid",
    "activity_id" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."static_party_members" (
    "party_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."test_cron_status" (
    "id" integer DEFAULT 1 NOT NULL,
    "last_run" timestamp with time zone,
    "active" boolean DEFAULT true,
    CONSTRAINT "test_cron_status_id_check" CHECK (("id" = 1))
);

CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_roles_role_check" CHECK (("role" = 'admin'::"text"))
);



-- ── Alter Tables ──

ALTER TABLE ONLY "public"."admin_audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."admin_audit_log_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."activity_assists"
    ADD CONSTRAINT "activity_assists_activity_id_owner_guild_id_assistant_guild_key" UNIQUE ("activity_id", "owner_guild_id", "assistant_guild_id");

ALTER TABLE ONLY "public"."activity_attendance"
    ADD CONSTRAINT "activity_attendance_activity_instance_id_member_id_key" UNIQUE ("activity_instance_id", "member_id");

ALTER TABLE ONLY "public"."activity_guilds"
    ADD CONSTRAINT "activity_guilds_activity_id_guild_id_key" UNIQUE ("activity_id", "guild_id");

ALTER TABLE ONLY "public"."activity_parties"
    ADD CONSTRAINT "activity_parties_activity_instance_id_party_number_key" UNIQUE ("activity_instance_id", "party_number");

ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_key_server_id_key" UNIQUE ("key", "server_id");

ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_server_id_key_unique" UNIQUE ("server_id", "key");

ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_death_record_id_member_id_key" UNIQUE ("death_record_id", "member_id");

ALTER TABLE ONLY "public"."boss_guilds"
    ADD CONSTRAINT "boss_guilds_boss_id_guild_id_day_key" UNIQUE ("boss_id", "guild_id", "day_of_week");

ALTER TABLE ONLY "public"."boss_spawn_overrides"
    ADD CONSTRAINT "boss_spawn_overrides_boss_id_server_id_key" UNIQUE ("boss_id", "server_id");

ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_slug_key" UNIQUE ("slug");

ALTER TABLE ONLY "public"."gear_slot_categories"
    ADD CONSTRAINT "gear_slot_categories_slot_id_category_id_key" UNIQUE ("slot_id", "category_id");

ALTER TABLE ONLY "public"."gear_slots"
    ADD CONSTRAINT "gear_slots_game_name_key" UNIQUE ("game", "name");

ALTER TABLE ONLY "public"."gear_templates"
    ADD CONSTRAINT "gear_templates_server_id_name_key" UNIQUE ("server_id", "name");

ALTER TABLE ONLY "public"."guilds"
    ADD CONSTRAINT "guilds_name_server_id_key" UNIQUE ("name", "server_id");

ALTER TABLE ONLY "public"."item_collection_items"
    ADD CONSTRAINT "item_collection_items_collection_id_item_id_key" UNIQUE ("collection_id", "item_id");

ALTER TABLE ONLY "public"."item_collection_manual_ownership"
    ADD CONSTRAINT "item_collection_manual_owners_collection_id_item_id_player__key" UNIQUE ("collection_id", "item_id", "player_name");

ALTER TABLE ONLY "public"."item_rarities"
    ADD CONSTRAINT "item_rarities_game_name_key" UNIQUE ("game", "name");

ALTER TABLE ONLY "public"."member_gear"
    ADD CONSTRAINT "member_gear_member_id_slot_id_key" UNIQUE ("member_id", "slot_id");

ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_public_slug_key" UNIQUE ("public_slug");

ALTER TABLE ONLY "public"."server_classes"
    ADD CONSTRAINT "server_classes_server_id_name_key" UNIQUE ("server_id", "name");

ALTER TABLE ONLY "public"."static_party_members"
    ADD CONSTRAINT "static_party_members_member_id_key" UNIQUE ("member_id");

ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."activity_templates"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."activity_assists"
    ADD CONSTRAINT "activity_assists_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."activity_assists"
    ADD CONSTRAINT "activity_assists_assistant_guild_id_fkey" FOREIGN KEY ("assistant_guild_id") REFERENCES "public"."guilds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."activity_assists"
    ADD CONSTRAINT "activity_assists_owner_guild_id_fkey" FOREIGN KEY ("owner_guild_id") REFERENCES "public"."guilds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."activity_assists"
    ADD CONSTRAINT "activity_assists_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."activity_attendance"
    ADD CONSTRAINT "activity_attendance_activity_instance_id_fkey" FOREIGN KEY ("activity_instance_id") REFERENCES "public"."activity_instances"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."activity_attendance"
    ADD CONSTRAINT "activity_attendance_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."activity_guilds"
    ADD CONSTRAINT "activity_guilds_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."activity_guilds"
    ADD CONSTRAINT "activity_guilds_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."activity_instances"
    ADD CONSTRAINT "activity_instances_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."activity_parties"
    ADD CONSTRAINT "activity_parties_activity_instance_id_fkey" FOREIGN KEY ("activity_instance_id") REFERENCES "public"."activity_instances"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."activity_templates"
    ADD CONSTRAINT "activity_templates_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_death_record_id_fkey" FOREIGN KEY ("death_record_id") REFERENCES "public"."death_records"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."attendance_records"
    ADD CONSTRAINT "attendance_records_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."boss_assists"
    ADD CONSTRAINT "boss_assists_assistant_guild_id_fkey" FOREIGN KEY ("assistant_guild_id") REFERENCES "public"."guilds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."boss_assists"
    ADD CONSTRAINT "boss_assists_boss_id_fkey" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."boss_assists"
    ADD CONSTRAINT "boss_assists_owner_guild_id_fkey" FOREIGN KEY ("owner_guild_id") REFERENCES "public"."guilds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."boss_assists"
    ADD CONSTRAINT "boss_assists_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."boss_guilds"
    ADD CONSTRAINT "boss_guilds_boss_id_fkey" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."boss_guilds"
    ADD CONSTRAINT "boss_guilds_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."boss_spawn_overrides"
    ADD CONSTRAINT "boss_spawn_overrides_boss_id_fkey" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."boss_spawn_overrides"
    ADD CONSTRAINT "boss_spawn_overrides_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."boss_templates"
    ADD CONSTRAINT "boss_templates_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."bosses"
    ADD CONSTRAINT "bosses_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."bosses"
    ADD CONSTRAINT "bosses_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."boss_templates"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."cp_updates"
    ADD CONSTRAINT "cp_updates_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."cp_updates"
    ADD CONSTRAINT "cp_updates_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."cp_updates"
    ADD CONSTRAINT "cp_updates_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."cp_updates"
    ADD CONSTRAINT "cp_updates_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."death_records"
    ADD CONSTRAINT "death_records_boss_id_fkey" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."death_records"
    ADD CONSTRAINT "death_records_display_owner_guild_id_fkey" FOREIGN KEY ("display_owner_guild_id") REFERENCES "public"."guilds"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."death_records"
    ADD CONSTRAINT "death_records_owner_guild_id_fkey" FOREIGN KEY ("owner_guild_id") REFERENCES "public"."guilds"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."death_records"
    ADD CONSTRAINT "death_records_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."death_records"
    ADD CONSTRAINT "death_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."discord_configs"
    ADD CONSTRAINT "discord_configs_raidscout_server_id_fkey" FOREIGN KEY ("raidscout_server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."distributions"
    ADD CONSTRAINT "distributions_distributed_by_fkey" FOREIGN KEY ("distributed_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."distributions"
    ADD CONSTRAINT "distributions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."distributions"
    ADD CONSTRAINT "distributions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."distributions"
    ADD CONSTRAINT "distributions_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."gear_catalog"
    ADD CONSTRAINT "gear_catalog_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."gear_catalog"
    ADD CONSTRAINT "gear_catalog_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."gear_catalog"
    ADD CONSTRAINT "gear_catalog_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."gear_slot_categories"
    ADD CONSTRAINT "gear_slot_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."gear_slot_categories"
    ADD CONSTRAINT "gear_slot_categories_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "public"."gear_slots"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."gear_templates"
    ADD CONSTRAINT "gear_templates_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."gear_upgrade_history"
    ADD CONSTRAINT "gear_upgrade_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."gear_upgrade_history"
    ADD CONSTRAINT "gear_upgrade_history_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."gear_upgrade_history"
    ADD CONSTRAINT "gear_upgrade_history_new_item_id_fkey" FOREIGN KEY ("new_item_id") REFERENCES "public"."items"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."gear_upgrade_history"
    ADD CONSTRAINT "gear_upgrade_history_old_item_id_fkey" FOREIGN KEY ("old_item_id") REFERENCES "public"."items"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."guilds"
    ADD CONSTRAINT "guilds_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."item_categories"
    ADD CONSTRAINT "item_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."item_categories"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."item_collection_items"
    ADD CONSTRAINT "item_collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."item_collections"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."item_collection_items"
    ADD CONSTRAINT "item_collection_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."item_collection_manual_ownership"
    ADD CONSTRAINT "item_collection_manual_ownership_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."item_collections"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."item_collections"
    ADD CONSTRAINT "item_collections_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."leaderboard_snapshots"
    ADD CONSTRAINT "leaderboard_snapshots_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id");

ALTER TABLE ONLY "public"."member_classes"
    ADD CONSTRAINT "member_classes_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."member_gear"
    ADD CONSTRAINT "member_gear_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."items"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."member_gear"
    ADD CONSTRAINT "member_gear_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."member_gear"
    ADD CONSTRAINT "member_gear_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."member_notes"
    ADD CONSTRAINT "member_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."member_notes"
    ADD CONSTRAINT "member_notes_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."member_notes"
    ADD CONSTRAINT "member_notes_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."moderator_permissions"
    ADD CONSTRAINT "moderator_permissions_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."moderator_permissions"
    ADD CONSTRAINT "moderator_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."point_adjustments"
    ADD CONSTRAINT "point_adjustments_adjusted_by_fkey" FOREIGN KEY ("adjusted_by") REFERENCES "auth"."users"("id");

ALTER TABLE ONLY "public"."point_adjustments"
    ADD CONSTRAINT "point_adjustments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."point_adjustments"
    ADD CONSTRAINT "point_adjustments_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."point_rules"
    ADD CONSTRAINT "point_rules_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."point_rules"
    ADD CONSTRAINT "point_rules_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."server_classes"
    ADD CONSTRAINT "server_classes_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."server_members"
    ADD CONSTRAINT "server_members_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."server_members"
    ADD CONSTRAINT "server_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."spawn_notifications"
    ADD CONSTRAINT "spawn_notifications_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."spawn_notifications"
    ADD CONSTRAINT "spawn_notifications_boss_id_fkey" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."spawn_notifications"
    ADD CONSTRAINT "spawn_notifications_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."static_parties"
    ADD CONSTRAINT "static_parties_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."static_parties"
    ADD CONSTRAINT "static_parties_boss_id_fkey" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."static_parties"
    ADD CONSTRAINT "static_parties_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."static_parties"
    ADD CONSTRAINT "static_parties_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."static_party_members"
    ADD CONSTRAINT "static_party_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."static_party_members"
    ADD CONSTRAINT "static_party_members_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "public"."static_parties"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_assists" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_attendance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_guilds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_instances" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_parties" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."activity_templates" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."attendance_records" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."boss_assists" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."boss_guilds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."boss_spawn_overrides" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."boss_templates" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."bosses" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."cp_updates" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."death_records" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."discord_configs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."distributions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."gear_catalog" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."gear_slot_categories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."gear_slots" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."gear_templates" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."gear_upgrade_history" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."guilds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."item_categories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."item_collection_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."item_collection_manual_ownership" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."item_collections" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."item_rarities" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."leaderboard_snapshots" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."member_classes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."member_gear" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."member_notes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."members" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."moderator_permissions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."point_adjustments" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."point_rules" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."server_classes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."server_members" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."servers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."spawn_notifications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."static_parties" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."static_party_members" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."test_cron_status" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;



-- ── Indexes ──

CREATE INDEX "activity_assists_activity_idx" ON "public"."activity_assists" USING "btree" ("activity_id");

CREATE INDEX "activity_assists_server_idx" ON "public"."activity_assists" USING "btree" ("server_id");

CREATE INDEX "activity_guilds_activity_idx" ON "public"."activity_guilds" USING "btree" ("activity_id");

CREATE INDEX "activity_guilds_guild_idx" ON "public"."activity_guilds" USING "btree" ("guild_id");

CREATE UNIQUE INDEX "app_settings_pkey" ON "public"."app_settings" USING "btree" ("key", COALESCE("server_id", '00000000-0000-0000-0000-000000000000'::"uuid"));

CREATE INDEX "attendance_death_record_idx" ON "public"."attendance_records" USING "btree" ("death_record_id");

CREATE INDEX "attendance_member_idx" ON "public"."attendance_records" USING "btree" ("member_id");

CREATE INDEX "attendance_records_server_idx" ON "public"."attendance_records" USING "btree" ("server_id");

CREATE INDEX "boss_guilds_boss_idx" ON "public"."boss_guilds" USING "btree" ("boss_id");

CREATE INDEX "boss_guilds_guild_idx" ON "public"."boss_guilds" USING "btree" ("guild_id");

CREATE INDEX "boss_spawn_overrides_server_idx" ON "public"."boss_spawn_overrides" USING "btree" ("server_id");

CREATE INDEX "bosses_server_id_idx" ON "public"."bosses" USING "btree" ("server_id");

CREATE INDEX "bosses_spawn_type_idx" ON "public"."bosses" USING "btree" ("spawn_type");

CREATE INDEX "death_records_boss_id_idx" ON "public"."death_records" USING "btree" ("boss_id");

CREATE INDEX "death_records_server_id_idx" ON "public"."death_records" USING "btree" ("server_id");

CREATE INDEX "death_records_user_boss_idx" ON "public"."death_records" USING "btree" ("user_id", "boss_id");

CREATE INDEX "death_records_user_id_idx" ON "public"."death_records" USING "btree" ("user_id");

CREATE INDEX "guilds_server_idx" ON "public"."guilds" USING "btree" ("server_id");

CREATE INDEX "idx_collection_items_sort" ON "public"."item_collection_items" USING "btree" ("collection_id", "sort_order");

CREATE INDEX "idx_cp_updates_member" ON "public"."cp_updates" USING "btree" ("member_id", "submitted_at" DESC);

CREATE INDEX "idx_cp_updates_status" ON "public"."cp_updates" USING "btree" ("status", "server_id");

CREATE INDEX "idx_distributions_item" ON "public"."distributions" USING "btree" ("item_id", "distributed_at" DESC);

CREATE INDEX "idx_distributions_member" ON "public"."distributions" USING "btree" ("member_id", "distributed_at" DESC);

CREATE INDEX "idx_gear_history_member" ON "public"."gear_upgrade_history" USING "btree" ("member_id", "created_at" DESC);

CREATE INDEX "idx_item_categories_game" ON "public"."item_categories" USING "btree" ("game");

CREATE UNIQUE INDEX "idx_item_categories_game_name_null_parent" ON "public"."item_categories" USING "btree" ("game", "name") WHERE ("parent_id" IS NULL);

CREATE UNIQUE INDEX "idx_item_categories_game_parent_name" ON "public"."item_categories" USING "btree" ("game", "parent_id", "name") WHERE ("parent_id" IS NOT NULL);

CREATE INDEX "idx_item_rarities_game" ON "public"."item_rarities" USING "btree" ("game");

CREATE UNIQUE INDEX "idx_items_game_name" ON "public"."items" USING "btree" ("game", "name") WHERE ("game" IS NOT NULL);

CREATE INDEX "idx_items_server" ON "public"."items" USING "btree" ("server_id", "name");

CREATE INDEX "idx_items_status_game" ON "public"."items" USING "btree" ("status", "game");

CREATE INDEX "idx_leaderboard_snapshots_server" ON "public"."leaderboard_snapshots" USING "btree" ("server_id");

CREATE INDEX "idx_manual_ownership_collection" ON "public"."item_collection_manual_ownership" USING "btree" ("collection_id");

CREATE INDEX "idx_member_gear_member" ON "public"."member_gear" USING "btree" ("member_id");

CREATE INDEX "idx_member_notes_member" ON "public"."member_notes" USING "btree" ("member_id", "created_at" DESC);

CREATE INDEX "idx_members_active" ON "public"."members" USING "btree" ("server_id", "is_active");

CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "read", "created_at" DESC);

CREATE INDEX "idx_servers_deleted_at" ON "public"."servers" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);

CREATE UNIQUE INDEX "idx_spawn_notifs_activity" ON "public"."spawn_notifications" USING "btree" ("server_id", "activity_id", "event", "spawn_timestamp") WHERE ("activity_id" IS NOT NULL);

CREATE UNIQUE INDEX "idx_spawn_notifs_boss" ON "public"."spawn_notifications" USING "btree" ("server_id", "boss_id", "event", "spawn_timestamp") WHERE ("boss_id" IS NOT NULL);

CREATE INDEX "idx_spawn_notifs_created_at" ON "public"."spawn_notifications" USING "btree" ("created_at");

CREATE INDEX "idx_static_parties_server" ON "public"."static_parties" USING "btree" ("server_id");

CREATE UNIQUE INDEX "idx_static_parties_unique" ON "public"."static_parties" USING "btree" ("server_id", COALESCE("guild_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "name", COALESCE("boss_id", '00000000-0000-0000-0000-000000000000'::"uuid"), COALESCE("activity_id", '00000000-0000-0000-0000-000000000000'::"uuid"));

CREATE INDEX "idx_static_party_members_member" ON "public"."static_party_members" USING "btree" ("member_id");

CREATE INDEX "leaderboard_snapshots_finalized_idx" ON "public"."leaderboard_snapshots" USING "btree" ("finalized_at" DESC);

CREATE INDEX "leaderboard_snapshots_period_idx" ON "public"."leaderboard_snapshots" USING "btree" ("period");

CREATE INDEX "members_guild_id_idx" ON "public"."members" USING "btree" ("guild_id");

CREATE INDEX "members_name_idx" ON "public"."members" USING "btree" ("name");

CREATE UNIQUE INDEX "members_name_server_idx" ON "public"."members" USING "btree" ("name", "server_id");

CREATE INDEX "members_server_id_idx" ON "public"."members" USING "btree" ("server_id");

CREATE INDEX "point_adjustments_server_idx" ON "public"."point_adjustments" USING "btree" ("server_id");

CREATE INDEX "servers_owner_idx" ON "public"."servers" USING "btree" ("owner_id");



-- ── Functions ──

CREATE OR REPLACE FUNCTION "public"."add_member_to_party"("p_party_id" "uuid", "p_member_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Remove from any other party first (exclusive)
  DELETE FROM public.static_party_members WHERE member_id = p_member_id;
  -- Add to target party
  INSERT INTO public.static_party_members (party_id, member_id)
  VALUES (p_party_id, p_member_id);
END; $$;

CREATE OR REPLACE FUNCTION "public"."adjust_boss_rotation"("p_boss_id" "uuid", "p_direction" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_new_adjustment INTEGER;
  v_server_id UUID;
  v_user_id UUID;
BEGIN
  -- Get the server for this boss
  SELECT server_id INTO v_server_id FROM public.bosses WHERE id = p_boss_id;
  IF v_server_id IS NULL THEN
    RAISE EXCEPTION 'Boss not found';
  END IF;
  -- Allow owner, moderator, or viewer (with valid key) ?????? same as other write ops
  v_user_id := auth.uid();
  -- Update the rotation adjustment
  UPDATE public.bosses 
  SET rotation_adjustment = rotation_adjustment + p_direction
  WHERE id = p_boss_id
  RETURNING rotation_adjustment INTO v_new_adjustment;
  RETURN v_new_adjustment;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."adjust_member_points"("p_member_id" "uuid", "p_server_id" "uuid", "p_points" integer, "p_reason" "text" DEFAULT ''::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_adjustment_id UUID;
BEGIN
  -- Only moderators and owners of this server
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = p_server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Only server moderators/owners can adjust points';
  END IF;
  IF p_points = 0 THEN
    RAISE EXCEPTION 'Points adjustment must be non-zero';
  END IF;
  INSERT INTO public.point_adjustments (member_id, server_id, points, reason, adjusted_by)
  VALUES (p_member_id, p_server_id, p_points, p_reason, auth.uid())
  RETURNING id INTO v_adjustment_id;
  RETURN v_adjustment_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."admin_forcespawn_all"("p_server_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_count INT := 0;
  v_boss RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  FOR v_boss IN
    SELECT id, respawn_hours
    FROM public.bosses
    WHERE server_id = p_server_id
      AND is_enabled IS NOT FALSE
      AND deleted_at IS NULL
      AND spawn_type = 'fixed_hours'
  LOOP
    -- Delete existing override
    DELETE FROM public.boss_spawn_overrides
    WHERE boss_id = v_boss.id AND server_id = p_server_id;
    -- Insert new override (set death_time to respawn_hours ago = boss appears spawned)
    INSERT INTO public.boss_spawn_overrides (server_id, boss_id, death_time)
    VALUES (p_server_id, v_boss.id, v_now - (COALESCE(v_boss.respawn_hours, 24) || ' hours')::INTERVAL);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."advance_boss_rotation"("p_boss_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_mode TEXT;
  v_counter INTEGER;
BEGIN
  -- Check if boss has any rotation-mode guild assignments
  SELECT bg.mode INTO v_mode
  FROM public.boss_guilds bg
  WHERE bg.boss_id = p_boss_id AND bg.mode = 'rotation'
  LIMIT 1;
  IF v_mode IS NULL THEN
    -- Not a rotation-mode boss — do nothing, just return current counter
    SELECT COALESCE(rotation_counter, 1) INTO v_counter
    FROM public.bosses WHERE id = p_boss_id;
    RETURN v_counter;
  END IF;
  -- Increment counter for rotation-mode boss
  UPDATE public.bosses
  SET rotation_counter = COALESCE(rotation_counter, 1) + 1
  WHERE id = p_boss_id
  RETURNING rotation_counter INTO v_counter;
  RETURN v_counter;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."approve_item"("p_item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve items';
  END IF;
  UPDATE public.items
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  WHERE id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."assign_party_to_boss"("p_party_id" "uuid", "p_boss_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.static_parties
  SET boss_id = p_boss_id, activity_id = NULL
  WHERE id = p_party_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."audit_death_record_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  boss_name TEXT;
BEGIN
  -- Skip trigger logging for viewer inserts (logged explicitly in viewer RPC)
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT name INTO boss_name FROM bosses WHERE id = NEW.boss_id;
  PERFORM log_server_action(
    NEW.server_id,
    'record_death',
    'boss',
    NEW.boss_id::text,
    jsonb_build_object(
      'boss_name', boss_name,
      'death_time', NEW.death_time
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."audit_member_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Members table doesn't have user_id; check if auth.uid() is available
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM log_server_action(
    NEW.server_id,
    'add_member',
    'member',
    NEW.id::text,
    jsonb_build_object('name', NEW.name)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."audit_server_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM log_admin_action('delete_server', 'server', OLD.id::text,
    jsonb_build_object('name', OLD.name, 'owner_id', OLD.owner_id));
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."audit_server_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  changes JSONB := '{}';
BEGIN
  IF OLD.discord_webhook_url IS DISTINCT FROM NEW.discord_webhook_url THEN
    changes := changes || jsonb_build_object('webhook', CASE WHEN NEW.discord_webhook_url IS NOT NULL AND NEW.discord_webhook_url != '' THEN 'set' ELSE 'removed' END);
  END IF;
  IF OLD.timezone IS DISTINCT FROM NEW.timezone THEN
    changes := changes || jsonb_build_object('timezone', NEW.timezone);
  END IF;
  IF OLD.notification_prefix IS DISTINCT FROM NEW.notification_prefix THEN
    changes := changes || jsonb_build_object('notification_prefix', NEW.notification_prefix);
  END IF;
  IF OLD.viewer_can_edit IS DISTINCT FROM NEW.viewer_can_edit THEN
    changes := changes || jsonb_build_object('viewer_can_edit', NEW.viewer_can_edit);
  END IF;
  IF OLD.viewer_can_mark_died IS DISTINCT FROM NEW.viewer_can_mark_died THEN
    changes := changes || jsonb_build_object('viewer_can_mark_died', NEW.viewer_can_mark_died);
  END IF;
  IF changes != '{}' THEN
    PERFORM log_server_action(
      NEW.id,
      'update_settings',
      'server',
      NEW.id::text,
      changes
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."audit_user_roles_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_admin_action('set_role', 'user', NEW.user_id::text,
      jsonb_build_object('role', NEW.role));
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_admin_action('set_role', 'user', NEW.user_id::text,
      jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role));
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_admin_action('delete_role', 'user', OLD.user_id::text,
      jsonb_build_object('old_role', OLD.role));
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."auto_kill_test_servers"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  srv RECORD;
  boss RECORD;
  last_death RECORD;
  kill_time TIMESTAMPTZ;
  death_id UUID;
  member_count INT;
  attendees INT;
  picked INT[];
  total_kills INT := 0;
BEGIN
  FOR srv IN
    SELECT id, name FROM public.servers
    WHERE deleted_at IS NULL AND LOWER(name) LIKE '%test%'
  LOOP
    FOR boss IN
      SELECT id, name, spawn_type, respawn_hours, schedule
      FROM public.bosses
      WHERE server_id = srv.id AND is_enabled = true
    LOOP
      SELECT death_time INTO last_death
      FROM public.death_records
      WHERE boss_id = boss.id AND server_id = srv.id
        AND (is_initial_spawn IS NULL OR is_initial_spawn = false)
      ORDER BY death_time DESC LIMIT 1;
      IF boss.spawn_type = 'fixed_hours' THEN
        IF last_death.death_time IS NULL THEN
          kill_time := NOW() - (random() * boss.respawn_hours * 3600) * INTERVAL '1 second';
        ELSE
          kill_time := last_death.death_time + (boss.respawn_hours * 3600) * INTERVAL '1 second';
          IF kill_time > NOW() THEN CONTINUE; END IF;
          kill_time := kill_time + (random() * 7200) * INTERVAL '1 second';
          IF kill_time > NOW() THEN kill_time := NOW(); END IF;
        END IF;
      ELSIF boss.spawn_type = 'fixed_schedule' AND boss.schedule IS NOT NULL THEN
        kill_time := NULL;
        DECLARE
          slot JSONB;
          check_date DATE;
          slot_ts TIMESTAMPTZ;
        BEGIN
          FOR slot IN SELECT * FROM jsonb_array_elements(boss.schedule::jsonb) LOOP
            FOR d IN 0..6 LOOP
              check_date := (CURRENT_DATE - d)::DATE;
              IF EXTRACT(DOW FROM check_date) = (slot->>'day')::INT THEN
                slot_ts := (check_date || ' ' || (slot->>'time'))::TIMESTAMPTZ AT TIME ZONE 'UTC';
                IF slot_ts <= NOW() AND (kill_time IS NULL OR slot_ts > kill_time) THEN
                  kill_time := slot_ts;
                END IF;
              END IF;
            END LOOP;
          END LOOP;
        END;
        IF kill_time IS NULL THEN CONTINUE; END IF;
        IF last_death.death_time IS NOT NULL AND last_death.death_time >= kill_time THEN
          CONTINUE;
        END IF;
        kill_time := kill_time + (random() * 14400) * INTERVAL '1 second';
        IF kill_time > NOW() THEN kill_time := NOW(); END IF;
      ELSE
        CONTINUE;
      END IF;
      INSERT INTO public.death_records (boss_id, server_id, death_time)
      VALUES (boss.id, srv.id, kill_time)
      RETURNING id INTO death_id;
      SELECT COUNT(*) INTO member_count FROM public.members WHERE server_id = srv.id;
      IF member_count > 0 THEN
        attendees := GREATEST(1, FLOOR(member_count * (0.3 + random() * 0.5))::INT);
        picked := ARRAY(
          SELECT id FROM public.members WHERE server_id = srv.id ORDER BY random() LIMIT attendees
        );
        INSERT INTO public.attendance_records (death_record_id, member_id, server_id)
        SELECT death_id, id, srv.id FROM public.members
        WHERE id = ANY(picked) AND server_id = srv.id;
      END IF;
      total_kills := total_kills + 1;
    END LOOP;
  END LOOP;
  RETURN 'Killed ' || total_kills || ' bosses across test servers';
END;
$$;

CREATE OR REPLACE FUNCTION "public"."batch_set_guild_salary"("p_guild_id" "uuid", "p_boss_ids" "text", "p_has_salary" boolean) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  boss_arr uuid[];
  updated_count integer;
  inserted_count integer;
BEGIN
  boss_arr := p_boss_ids::uuid[];
  UPDATE boss_guilds
  SET has_salary = p_has_salary
  WHERE guild_id = p_guild_id
    AND boss_id = ANY(boss_arr);
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  INSERT INTO boss_guilds (boss_id, guild_id, has_salary, mode)
  SELECT bid, p_guild_id, p_has_salary, 'rotation'
  FROM unnest(boss_arr) AS bid
  WHERE NOT EXISTS (
    SELECT 1 FROM boss_guilds
    WHERE boss_id = bid AND guild_id = p_guild_id
  );
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN updated_count + inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."bulk_mark_bosses_alive"("p_server_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  boss_record RECORD;
  marked integer := 0;
BEGIN
  FOR boss_record IN
    SELECT b.id, b.respawn_hours
    FROM public.bosses b
    WHERE b.server_id = p_server_id
      AND b.spawn_type = 'fixed_hours'
      AND b.respawn_hours IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.death_records dr
        WHERE dr.boss_id = b.id AND dr.server_id = p_server_id
      )
  LOOP
    -- Delete any existing override
    DELETE FROM public.boss_spawn_overrides
    WHERE boss_id = boss_record.id AND server_id = p_server_id;
    -- Insert override so the boss appears alive
    INSERT INTO public.boss_spawn_overrides (boss_id, server_id, death_time)
    VALUES (
      boss_record.id,
      p_server_id,
      now() - (boss_record.respawn_hours || ' hours')::interval
    );
    marked := marked + 1;
  END LOOP;
  RETURN marked;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."can_access_server"("s_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM server_members sm
    WHERE sm.server_id = s_id AND sm.user_id = auth.uid()
  ) OR is_admin();
$$;

CREATE OR REPLACE FUNCTION "public"."can_kill_boss"("p_server_id" "uuid", "p_boss_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_boss RECORD;
  v_latest RECORD;
  v_now TIMESTAMPTZ := now();
  v_timezone TEXT;
  v_server_now TIMESTAMPTZ;
  v_next_spawn TIMESTAMPTZ;
  v_alive_until TIMESTAMPTZ;
  v_slot_day INT;
  v_slot_time TEXT;
  v_slot_mins INT;
  v_current_day INT;
  v_current_mins INT;
  v_best_day INT := -1;
  v_best_mins INT := -1;
  v_best_time TEXT;
  v_slot_entry JSONB;
  v_slot_ts TIMESTAMPTZ;
  v_raw_alive TIMESTAMPTZ;
  v_respawn_hours INT;
BEGIN
  -- Get server timezone
  SELECT s.timezone INTO v_timezone FROM public.servers s WHERE s.id = p_server_id;
  v_server_now := v_now AT TIME ZONE COALESCE(v_timezone, 'UTC');
  -- Get boss info
  SELECT * INTO v_boss FROM public.bosses
  WHERE id = p_boss_id AND server_id = p_server_id;
  IF v_boss IS NULL THEN
    RETURN jsonb_build_object('can_kill', false, 'reason', 'Boss not found');
  END IF;
  -- Get latest death
  SELECT death_time INTO v_latest FROM public.death_records
  WHERE boss_id = p_boss_id AND server_id = p_server_id
  ORDER BY death_time DESC LIMIT 1;
  -- One-time boss: completed if already killed
  IF v_boss.is_recurring = false AND v_latest.death_time IS NOT NULL THEN
    RETURN jsonb_build_object('can_kill', false, 'reason', 'Already completed (one-time)');
  END IF;
  -- ── Fixed Hours ──
  IF v_boss.spawn_type = 'fixed_hours' THEN
    IF v_boss.respawn_hours IS NULL THEN
      RETURN jsonb_build_object('can_kill', false, 'reason', 'No respawn hours configured');
    END IF;
    IF v_latest.death_time IS NULL THEN
      -- No death yet: check utc_start from schedule
      IF v_boss.schedule IS NOT NULL AND jsonb_typeof(v_boss.schedule) = 'object' AND v_boss.schedule ? 'utc_start' THEN
        v_next_spawn := (v_boss.schedule->>'utc_start')::TIMESTAMPTZ;
        IF v_now >= v_next_spawn THEN
          RETURN jsonb_build_object('can_kill', true, 'boss_name', v_boss.name);
        END IF;
      END IF;
      RETURN jsonb_build_object('can_kill', false, 'reason', 'Not yet spawned (no death record)');
    END IF;
    v_next_spawn := v_latest.death_time + (v_boss.respawn_hours || ' hours')::INTERVAL;
    IF v_now >= v_next_spawn THEN
      RETURN jsonb_build_object('can_kill', true, 'boss_name', v_boss.name);
    END IF;
    RETURN jsonb_build_object('can_kill', false, 'reason', 'Still on cooldown',
      'next_spawn', to_char(v_next_spawn, 'YYYY-MM-DD HH24:MI:SS TZ'));
  END IF;
  -- ── Fixed Schedule ──
  IF v_boss.spawn_type = 'fixed_schedule' THEN
    IF v_boss.schedule IS NULL OR jsonb_array_length(v_boss.schedule) = 0 THEN
      RETURN jsonb_build_object('can_kill', false, 'reason', 'No schedule configured');
    END IF;
    -- Get current day & time in server timezone
    v_current_day := extract(DOW FROM v_server_now)::INT; -- 0=Sun
    v_current_mins := extract(HOUR FROM v_server_now)::INT * 60 + extract(MINUTE FROM v_server_now)::INT;
    -- Find the most recent schedule slot
    FOR v_slot_entry IN SELECT * FROM jsonb_array_elements(v_boss.schedule)
    LOOP
      v_slot_day := (v_slot_entry->>'day')::INT;
      v_slot_time := v_slot_entry->>'time';
      v_slot_mins := (split_part(v_slot_time, ':', 1)::INT * 60 + split_part(v_slot_time, ':', 2)::INT);
      -- Slot is "past" if earlier today or on a previous day this week
      IF (v_slot_day = v_current_day AND v_slot_mins <= v_current_mins)
         OR (v_slot_day < v_current_day) THEN
        IF v_slot_day > v_best_day OR (v_slot_day = v_best_day AND v_slot_mins > v_best_mins) THEN
          v_best_day := v_slot_day;
          v_best_mins := v_slot_mins;
          v_best_time := v_slot_time;
        END IF;
      END IF;
    END LOOP;
    -- If no past slot today, check last slot of previous week
    IF v_best_day = -1 THEN
      FOR v_slot_entry IN SELECT * FROM jsonb_array_elements(v_boss.schedule)
      LOOP
        v_slot_day := (v_slot_entry->>'day')::INT;
        v_slot_mins := (split_part(v_slot_entry->>'time', ':', 1)::INT * 60 + split_part(v_slot_entry->>'time', ':', 2)::INT);
        IF (v_slot_day * 1440 + v_slot_mins) > (v_best_day * 1440 + v_best_mins) THEN
          v_best_day := v_slot_day;
          v_best_mins := v_slot_mins;
          v_best_time := v_slot_entry->>'time';
        END IF;
      END LOOP;
      -- Build timestamp for last week's slot
      v_slot_ts := date_trunc('day', v_server_now)
        + ((v_current_day - v_best_day + 7) % 7 || ' days')::INTERVAL * -1
        + (split_part(v_best_time, ':', 1)::INT || ' hours')::INTERVAL
        + (split_part(v_best_time, ':', 2)::INT || ' minutes')::INTERVAL;
      -- Only use last week's slot if it was within 48 hours (prevent week-long alive windows)
      IF extract(EPOCH FROM v_server_now - v_slot_ts) > 172800 THEN
        -- No valid recent slot — just return next spawn
        RETURN jsonb_build_object('can_kill', false, 'reason', 'No recent schedule slot within 48h');
      END IF;
    ELSE
      -- Build timestamp for today's slot
      v_slot_ts := date_trunc('day', v_server_now)
        + (split_part(v_best_time, ':', 1)::INT || ' hours')::INTERVAL
        + (split_part(v_best_time, ':', 2)::INT || ' minutes')::INTERVAL;
    END IF;
    -- If there's a death record, check if it was killed AFTER the most recent slot
    IF v_latest.death_time IS NOT NULL THEN
      IF v_latest.death_time >= v_slot_ts THEN
        -- Already killed in this window
        RETURN jsonb_build_object('can_kill', false, 'reason', 'Already killed in current window');
      END IF;
    END IF;
    -- No death this window — boss is alive
    RETURN jsonb_build_object('can_kill', true, 'boss_name', v_boss.name);
  END IF;
  RETURN jsonb_build_object('can_kill', false, 'reason', 'Unknown spawn type');
END;
$$;

CREATE OR REPLACE FUNCTION "public"."check_and_announce_spawns"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  srv RECORD;
  boss RECORD;
  next_spawn TIMESTAMPTZ;
  mins_left INT;
  notify_msg TEXT;
  req_id BIGINT;
  body JSONB;
BEGIN
  -- Clean up old notifications for spawns that have passed
  DELETE FROM discord_notifications WHERE spawn_time < NOW();
  -- Loop through all servers that have a Discord webhook configured
  FOR srv IN
    SELECT id, discord_webhook_url
    FROM servers
    WHERE discord_webhook_url IS NOT NULL
      AND discord_webhook_url != ''
  LOOP
    -- For each boss in this server with fixed_hours spawn type
    FOR boss IN
      SELECT b.id, b.name, b.respawn_hours,
             (SELECT MAX(dr.death_time)
              FROM death_records dr
              WHERE dr.boss_id = b.id
                AND dr.server_id = srv.id) AS last_death
      FROM bosses b
      WHERE b.server_id = srv.id
        AND b.spawn_type = 'fixed_hours'
        AND b.respawn_hours IS NOT NULL
    LOOP
      -- Skip bosses that have never been killed
      IF boss.last_death IS NULL THEN
        CONTINUE;
      END IF;
      next_spawn := boss.last_death + (boss.respawn_hours * INTERVAL '1 hour');
      mins_left := EXTRACT(EPOCH FROM (next_spawn - NOW()))::INT / 60;
      -- Only notify if spawning in the next 5 minutes
      IF mins_left < 0 OR mins_left > 5 THEN
        CONTINUE;
      END IF;
      -- Skip if we already notified for this boss's current spawn cycle on this server
      IF EXISTS (
        SELECT 1 FROM discord_notifications
        WHERE boss_id = boss.id
          AND server_id = srv.id
      ) THEN
        CONTINUE;
      END IF;
      notify_msg := '@everyone ?????????????? **' || boss.name || '** spawning in ' ||
        mins_left || ' min at ' || to_char(next_spawn, 'HH12:MI AM') || '!';
      body := jsonb_build_object(
        'content', notify_msg,
        'username', 'RaidScout'
      );
      -- Send the Discord webhook via pg_net
      SELECT net.http_post(
        url := srv.discord_webhook_url,
        body := body,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 5000
      ) INTO req_id;
      -- Record that we sent this notification
      INSERT INTO discord_notifications (boss_id, spawn_time, server_id)
      VALUES (boss.id, next_spawn, srv.id)
      ON CONFLICT (boss_id, spawn_time, server_id) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."check_impending_spawns"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  srv RECORD;
  boss RECORD;
  next_spawn TIMESTAMPTZ;
  mins_left INT;
  body JSONB;
  req_id BIGINT;
  tz TEXT;
BEGIN
  FOR srv IN
    SELECT id, name, discord_webhook_url, COALESCE(timezone, 'Asia/Manila') AS timezone
    FROM servers
    WHERE discord_webhook_url IS NOT NULL AND discord_webhook_url != ''
  LOOP
    tz := srv.timezone;
    FOR boss IN
      SELECT b.id, b.name, b.respawn_hours,
        (SELECT MAX(dr.death_time) FROM death_records dr WHERE dr.boss_id = b.id) AS last_death
      FROM bosses b
      WHERE b.server_id = srv.id
        AND b.spawn_type = 'fixed_hours'
        AND b.respawn_hours IS NOT NULL
    LOOP
      IF boss.last_death IS NULL THEN CONTINUE; END IF;
      next_spawn := boss.last_death + (boss.respawn_hours * INTERVAL '1 hour');
      -- Compare in server's local timezone
      mins_left := EXTRACT(EPOCH FROM (next_spawn AT TIME ZONE tz - (now() AT TIME ZONE tz)))::INT / 60;
      IF mins_left < 0 OR mins_left > 5 THEN CONTINUE; END IF;
      IF EXISTS (
        SELECT 1 FROM spawn_notifications
        WHERE server_id = srv.id AND boss_id = boss.id AND spawn_time = next_spawn
      ) THEN CONTINUE; END IF;
      body := jsonb_build_object(
        'server_id', srv.id,
        'event', 'boss_spawned',
        'boss_name', boss.name,
        'spawn_time', to_char(next_spawn AT TIME ZONE tz, 'HH12:MI AM')
      );
      SELECT net.http_post(
        url := 'https://oeugehqgpodzhagomeex.supabase.co/functions/v1/discord-notify',
        body := body,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 5000
      ) INTO req_id;
      INSERT INTO spawn_notifications (server_id, boss_id, spawn_time)
      VALUES (srv.id, boss.id, next_spawn);
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."create_custom_activity"("p_server_id" "uuid", "p_name" "text", "p_schedule_type" "text", "p_schedule" "jsonb" DEFAULT NULL::"jsonb", "p_points_per_participant" integer DEFAULT 1, "p_party_size" integer DEFAULT NULL::integer, "p_category" "text" DEFAULT NULL::"text", "p_tags" "text"[] DEFAULT '{}'::"text"[], "p_image_url" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, points_per_participant, party_size, is_enabled, is_custom, category, tags, image_url)
  VALUES (p_server_id, NULL, p_name, p_schedule_type, p_schedule, p_points_per_participant, p_party_size, true, true, p_category, p_tags, p_image_url)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."create_custom_activity"("p_server_id" "uuid", "p_name" "text", "p_schedule_type" "text", "p_schedule" "jsonb" DEFAULT NULL::"jsonb", "p_points_per_participant" integer DEFAULT 1, "p_duration_minutes" integer DEFAULT NULL::integer, "p_party_size" integer DEFAULT NULL::integer, "p_category" "text" DEFAULT NULL::"text", "p_tags" "text"[] DEFAULT '{}'::"text"[], "p_image_url" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.activities (
    server_id, name, schedule_type, schedule,
    points_per_participant, duration_minutes, party_size,
    category, tags, image_url, is_custom, is_enabled
  )
  VALUES (
    p_server_id, p_name, p_schedule_type, p_schedule,
    p_points_per_participant, p_duration_minutes, p_party_size,
    p_category, p_tags, p_image_url, true, true
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."create_custom_boss"("p_server_id" "uuid", "p_name" "text", "p_spawn_type" "text", "p_respawn_hours" integer DEFAULT NULL::integer, "p_schedule" "jsonb" DEFAULT NULL::"jsonb", "p_is_recurring" boolean DEFAULT true, "p_boss_points" integer DEFAULT 1, "p_category" "text" DEFAULT NULL::"text", "p_tags" "text"[] DEFAULT '{}'::"text"[], "p_image_url" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE v_id UUID; v_pts INTEGER;
BEGIN
  v_pts := COALESCE(p_boss_points, 1);
  INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_recurring, is_enabled, is_custom, boss_points, points, category, tags, image_url)
  VALUES (p_server_id, NULL, p_name, p_spawn_type, p_respawn_hours, p_schedule, p_is_recurring, true, true, v_pts, v_pts, p_category, p_tags, p_image_url)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."create_moderator_permissions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.role = 'moderator' THEN
    INSERT INTO public.moderator_permissions (server_id, user_id)
    VALUES (NEW.server_id, NEW.user_id)
    ON CONFLICT (server_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."create_server_with_bosses"("p_name" "text", "p_game_id" "uuid", "p_seed" boolean DEFAULT true, "p_guild_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_server_id UUID;
  v_user_id UUID;
  v_count INTEGER;
  v_guild_id UUID;
  v_guild_count INTEGER;
BEGIN
  v_user_id := auth.uid();
  INSERT INTO public.servers (name, owner_id, game_id)
  VALUES (p_name, v_user_id, p_game_id)
  RETURNING id INTO v_server_id;
  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (v_server_id, v_user_id, 'owner');
  IF p_guild_name IS NOT NULL AND p_guild_name != '' THEN
    INSERT INTO public.guilds (name, server_id)
    VALUES (p_guild_name, v_server_id);
  END IF;
  IF p_seed THEN
    -- Try templates first
    INSERT INTO public.bosses (server_id, template_id, name, spawn_type, respawn_hours, schedule, is_enabled, is_custom, boss_points, points)
    SELECT v_server_id, bt.id, bt.name, bt.spawn_type, bt.respawn_hours, bt.schedule, true, false, COALESCE(bt.points, 1), COALESCE(bt.points, 1)
    FROM public.boss_templates bt
    WHERE bt.game_id = p_game_id OR p_game_id IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    -- Fallback to hardcoded defaults if templates yielded 0
    IF v_count = 0 THEN
      PERFORM public.seed_bosses_for_server(v_server_id);
    END IF;
    INSERT INTO public.activities (server_id, template_id, name, schedule_type, schedule, duration_minutes, points_per_participant, party_size, is_enabled, is_custom)
    SELECT v_server_id, at.id, at.name, at.schedule_type, at.schedule, at.duration_minutes, at.points_per_participant, at.party_size, true, false
    FROM public.activity_templates at
    WHERE at.game_id = p_game_id OR p_game_id IS NULL;
  END IF;
  -- ── Auto-assign single guild to all bosses & activities ──
  SELECT COUNT(*) INTO v_guild_count FROM public.guilds WHERE server_id = v_server_id;
  IF v_guild_count = 1 THEN
    SELECT id INTO v_guild_id FROM public.guilds WHERE server_id = v_server_id LIMIT 1;
    -- Assign all bosses to this guild with rotation mode
    INSERT INTO public.boss_guilds (boss_id, guild_id, sort_order, mode)
    SELECT b.id, v_guild_id, 1, 'rotation'
    FROM public.bosses b
    WHERE b.server_id = v_server_id
    ON CONFLICT DO NOTHING;
    -- Assign all activities to this guild with rotation mode
    INSERT INTO public.activity_guilds (activity_id, guild_id, sort_order, mode)
    SELECT a.id, v_guild_id, 1, 'rotation'
    FROM public.activities a
    WHERE a.server_id = v_server_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_server_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."create_static_party"("p_server_id" "uuid", "p_name" "text", "p_guild_id" "uuid" DEFAULT NULL::"uuid", "p_boss_id" "uuid" DEFAULT NULL::"uuid", "p_activity_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.static_parties (server_id, guild_id, name, boss_id, activity_id)
  VALUES (p_server_id, p_guild_id, p_name, p_boss_id, p_activity_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."delete_static_party"("p_party_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM public.static_parties WHERE id = p_party_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."edit_death_record_time"("p_death_record_id" "uuid", "p_new_death_time" timestamp with time zone) RETURNS SETOF "public"."death_records"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Allow authenticated users and viewers to edit
  UPDATE public.death_records 
  SET death_time = p_new_death_time
  WHERE id = p_death_record_id;
  RETURN QUERY SELECT * FROM public.death_records WHERE id = p_death_record_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."extend_server_subscription"("p_server_id" "uuid", "p_days" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_sub_end timestamptz;
  v_trial_end timestamptz;
  v_base timestamptz;
  v_owner_id uuid;
  v_is_admin boolean;
BEGIN
  -- Auth check: allow service_role (edge functions), server owner, or admin
  IF auth.role() != 'service_role' THEN
    SELECT owner_id INTO v_owner_id FROM public.servers WHERE id = p_server_id;
    SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') INTO v_is_admin;
    IF auth.uid() != v_owner_id AND NOT v_is_admin THEN
      RAISE EXCEPTION 'Not authorized to extend subscription for this server';
    END IF;
  END IF;
  SELECT subscription_ends_at, trial_ends_at
  INTO v_sub_end, v_trial_end
  FROM public.servers
  WHERE id = p_server_id;
  -- Determine the base date to extend from
  IF v_sub_end IS NOT NULL AND v_sub_end > now() THEN
    v_base := v_sub_end;          -- Active subscription: stack
  ELSIF v_trial_end IS NOT NULL AND v_trial_end > now() THEN
    v_base := v_trial_end;        -- Active trial: start from trial end
  ELSE
    v_base := now();              -- Neither active: start now
  END IF;
  UPDATE public.servers
  SET subscription_ends_at = v_base + (p_days || ' days')::interval
  WHERE id = p_server_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."fetch_activity_attendance"("p_activity_instance_id" "uuid") RETURNS TABLE("id" "uuid", "member_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT aa.id, aa.member_id
  FROM public.activity_attendance aa
  WHERE aa.activity_instance_id = p_activity_instance_id
    AND aa.present = true;
$$;

CREATE OR REPLACE FUNCTION "public"."fetch_pending_items"("p_game" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."items"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT * FROM public.items
  WHERE status = 'pending'
    AND (p_game IS NULL OR game = p_game)
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION "public"."fetch_point_adjustments"("p_server_id" "uuid", "p_member_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "member_id" "uuid", "member_name" "text", "points" integer, "reason" "text", "adjusted_by_name" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    pa.id,
    pa.member_id,
    m.name AS member_name,
    pa.points,
    pa.reason,
    COALESCE(ur.raw_user_meta_data->>'name', ur.email, 'Unknown') AS adjusted_by_name,
    pa.created_at
  FROM public.point_adjustments pa
  JOIN public.members m ON m.id = pa.member_id
  LEFT JOIN auth.users ur ON ur.id = pa.adjusted_by
  WHERE pa.server_id = p_server_id
    AND (p_member_id IS NULL OR pa.member_id = p_member_id)
  ORDER BY pa.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION "public"."fetch_static_parties"("p_server_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "guild_id" "uuid", "guild_name" "text", "boss_id" "uuid", "boss_name" "text", "activity_id" "uuid", "activity_name" "text", "member_ids" "uuid"[], "member_names" "text"[])
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT
    sp.id, sp.name, sp.guild_id,
    g.name AS guild_name,
    sp.boss_id,
    b.name AS boss_name,
    sp.activity_id,
    a.name AS activity_name,
    COALESCE(array_agg(spm.member_id) FILTER (WHERE spm.member_id IS NOT NULL), '{}') AS member_ids,
    COALESCE(array_agg(m.name) FILTER (WHERE m.name IS NOT NULL), '{}') AS member_names
  FROM public.static_parties sp
  LEFT JOIN public.guilds g ON g.id = sp.guild_id
  LEFT JOIN public.bosses b ON b.id = sp.boss_id
  LEFT JOIN public.activities a ON a.id = sp.activity_id
  LEFT JOIN public.static_party_members spm ON spm.party_id = sp.id
  LEFT JOIN public.members m ON m.id = spm.member_id
  WHERE sp.server_id = p_server_id
  GROUP BY sp.id, sp.name, sp.guild_id, g.name, sp.boss_id, b.name, sp.activity_id, a.name
  ORDER BY sp.name;
$$;

CREATE OR REPLACE FUNCTION "public"."finalize_weekly_leaderboard"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  reset_at_val TIMESTAMPTZ;
  this_monday TIMESTAMPTZ;
  last_monday TIMESTAMPTZ;
  rankings JSONB;
BEGIN
  SELECT value::TIMESTAMPTZ INTO reset_at_val FROM app_settings WHERE key = 'leaderboard_reset_at';
  this_monday := date_trunc('week', NOW());
  IF reset_at_val >= this_monday THEN RETURN; END IF;
  last_monday := this_monday - INTERVAL '7 days';
  SELECT jsonb_agg(ranked ORDER BY points DESC)
  INTO rankings
  FROM (
    SELECT m.id AS "memberId", m.name AS "memberName", COUNT(ar.id)::int AS points
    FROM members m
    LEFT JOIN attendance_records ar ON ar.member_id = m.id
    WHERE ar.created_at >= COALESCE(reset_at_val, last_monday) OR ar.id IS NULL
    GROUP BY m.id, m.name
  ) ranked;
  INSERT INTO leaderboard_snapshots (finalized_at, period_start, period, rankings)
  VALUES (NOW(), COALESCE(reset_at_val, last_monday), 'weekly', COALESCE(rankings, '[]'::JSONB));
  UPDATE app_settings SET value = this_monday::TEXT, updated_at = NOW()
  WHERE key = 'leaderboard_reset_at';
END;
$$;

CREATE OR REPLACE FUNCTION "public"."find_next_daily_slot"("p_last_time" timestamp with time zone, "p_time_str" "text") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  hh INTEGER;
  mm INTEGER;
  result TIMESTAMPTZ;
BEGIN
  hh := split_part(p_time_str, ':', 1)::INTEGER;
  mm := split_part(p_time_str, ':', 2)::INTEGER;
  -- Next day at the specified time
  result := date_trunc('day', p_last_time) + INTERVAL '1 day' + (hh || ' hours')::INTERVAL + (mm || ' minutes')::INTERVAL;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_admin_user_ids"() RETURNS TABLE("user_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin';
$$;

CREATE OR REPLACE FUNCTION "public"."get_all_admin_roles"() RETURNS TABLE("user_id" "uuid", "role" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT sm.user_id, sm.role
  FROM public.server_members sm
  WHERE sm.role IN ('owner', 'moderator');
$$;

CREATE OR REPLACE FUNCTION "public"."get_all_servers_with_counts"() RETURNS TABLE("id" "uuid", "name" "text", "owner_id" "uuid", "created_at" timestamp with time zone, "member_count" bigint, "raid_member_count" bigint, "game_name" "text", "game_icon_url" "text", "subscription_ends_at" timestamp with time zone, "trial_ends_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT 
    s.id,
    s.name,
    s.owner_id,
    s.created_at,
    (SELECT COUNT(*) FROM public.server_members sm WHERE sm.server_id = s.id) AS member_count,
    (SELECT COUNT(*) FROM public.members m WHERE m.server_id = s.id) AS raid_member_count,
    g.name AS game_name,
    g.icon_url AS game_icon_url,
    s.subscription_ends_at,
    s.trial_ends_at
  FROM public.servers s
  LEFT JOIN public.games g ON g.id = s.game_id
  WHERE s.deleted_at IS NULL
  ORDER BY s.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION "public"."get_all_users"() RETURNS TABLE("user_id" "uuid", "email" "text", "email_confirmed_at" timestamp with time zone, "role" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    au.id AS user_id,
    au.email::text,
    au.email_confirmed_at,
    COALESCE(ur.role, 'member') AS role,
    au.created_at
  FROM auth.users au
  LEFT JOIN public.user_roles ur ON ur.user_id = au.id
  ORDER BY au.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_analytics"("since" "text", "s_id" "uuid" DEFAULT NULL::"uuid", "guild_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result JSONB;
  death_filter TEXT := '';
BEGIN
  IF guild_id IS NOT NULL THEN
    death_filter := format(
      'AND dr.id IN (SELECT DISTINCT ar.death_record_id FROM public.attendance_records ar JOIN public.members m ON m.id = ar.member_id WHERE m.guild_id = %L)',
      guild_id
    );
  END IF;
  EXECUTE format('
    WITH filtered_deaths AS (
      SELECT dr.id, dr.death_time, dr.boss_id
      FROM public.death_records dr
      WHERE dr.death_time >= %L::timestamptz
        AND (%L::uuid IS NULL OR dr.server_id = %L::uuid)
        %s
    ),
    stats AS (
      SELECT
        COUNT(fd.id) AS total_kills,
        COUNT(ar.id) AS total_attendance,
        COUNT(DISTINCT ar.member_id) AS active_members
      FROM filtered_deaths fd
      LEFT JOIN public.attendance_records ar ON ar.death_record_id = fd.id
    ),
    kills_by_week AS (
      SELECT
        to_char(date_trunc(''week'', fd.death_time), ''Mon DD'') AS week_label,
        COUNT(*)::int AS count
      FROM filtered_deaths fd
      GROUP BY date_trunc(''week'', fd.death_time)
      ORDER BY date_trunc(''week'', fd.death_time) DESC
      LIMIT 12
    ),
    top_bosses AS (
      SELECT b.name, COUNT(*)::int AS kills
      FROM filtered_deaths fd
      JOIN public.bosses b ON b.id = fd.boss_id
      GROUP BY b.name
      ORDER BY kills DESC
      LIMIT 10
    ),
    top_hunters AS (
      SELECT m.name, COUNT(*)::int AS attended
      FROM filtered_deaths fd
      JOIN public.attendance_records ar ON ar.death_record_id = fd.id
      JOIN public.members m ON m.id = ar.member_id
      GROUP BY m.name
      ORDER BY attended DESC
      LIMIT 50
    ),
    kills_by_day AS (
      SELECT
        trim(to_char(fd.death_time, ''Day'')) AS day,
        COUNT(*)::int AS count
      FROM filtered_deaths fd
      GROUP BY date_part(''dow'', fd.death_time), to_char(fd.death_time, ''Day'')
      ORDER BY date_part(''dow'', fd.death_time)
    )
    SELECT jsonb_build_object(
      ''total_kills'', COALESCE((SELECT total_kills FROM stats), 0),
      ''total_attendance'', COALESCE((SELECT total_attendance FROM stats), 0),
      ''active_members'', COALESCE((SELECT active_members FROM stats), 0),
      ''kills_by_week'', COALESCE((SELECT jsonb_agg(row_to_json(kills_by_week.*)) FROM kills_by_week), ''[]''::jsonb),
      ''top_bosses'', COALESCE((SELECT jsonb_agg(row_to_json(top_bosses.*)) FROM top_bosses), ''[]''::jsonb),
      ''top_hunters'', COALESCE((SELECT jsonb_agg(row_to_json(top_hunters.*)) FROM top_hunters), ''[]''::jsonb),
      ''kills_by_day'', COALESCE((SELECT jsonb_agg(row_to_json(kills_by_day.*)) FROM kills_by_day), ''[]''::jsonb)
    )
  ', since, s_id, s_id, death_filter) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_boss_owner_guild"("b_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  kill_count INT;
  guild_count INT;
  next_guild UUID;
  spawn_dow INT;
  last_owner UUID;
  last_order INT;
  max_order INT;
  last_death TIMESTAMPTZ;
  spawn_time TIMESTAMPTZ;
  respawn_h INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM boss_guilds WHERE boss_id = b_id) THEN
    RETURN NULL;
  END IF;
  -- Schedule mode: guild based on boss's SPAWN day of week
  IF EXISTS (SELECT 1 FROM boss_guilds WHERE boss_id = b_id AND mode = 'schedule') THEN
    SELECT b.respawn_hours, dr.death_time INTO respawn_h, last_death
    FROM bosses b
    LEFT JOIN LATERAL (
      SELECT death_time FROM death_records
      WHERE boss_id = b.id ORDER BY death_time DESC LIMIT 1
    ) dr ON true
    WHERE b.id = b_id;
    IF last_death IS NULL THEN
      spawn_time := now();
    ELSE
      spawn_time := last_death + (COALESCE(respawn_h, 0) * INTERVAL '1 hour');
    END IF;
    spawn_dow := EXTRACT(DOW FROM spawn_time)::INT;
    SELECT guild_id INTO next_guild
    FROM boss_guilds
    WHERE boss_id = b_id AND day_of_week = spawn_dow
    LIMIT 1;
    RETURN next_guild;
  END IF;
  -- Daily mode: advance guild only when spawn crosses into a new day
  IF EXISTS (SELECT 1 FROM boss_guilds WHERE boss_id = b_id AND mode = 'daily') THEN
    SELECT dr.death_time, dr.owner_guild_id INTO last_death, last_owner
    FROM death_records dr WHERE dr.boss_id = b_id
    ORDER BY dr.death_time DESC LIMIT 1;
    IF last_owner IS NULL THEN
      SELECT guild_id INTO next_guild
      FROM boss_guilds WHERE boss_id = b_id AND mode = 'daily'
      ORDER BY sort_order LIMIT 1;
      RETURN next_guild;
    END IF;
    SELECT b.respawn_hours INTO respawn_h FROM bosses b WHERE b.id = b_id;
    spawn_time := last_death + (COALESCE(respawn_h, 0) * INTERVAL '1 hour');
    IF last_death::DATE = spawn_time::DATE THEN
      RETURN last_owner;
    END IF;
    SELECT sort_order INTO last_order
    FROM boss_guilds
    WHERE boss_id = b_id AND guild_id = last_owner AND mode = 'daily'
    ORDER BY sort_order DESC LIMIT 1;
    SELECT MAX(sort_order) INTO max_order
    FROM boss_guilds WHERE boss_id = b_id AND mode = 'daily';
    SELECT guild_id INTO next_guild
    FROM boss_guilds
    WHERE boss_id = b_id AND mode = 'daily' AND sort_order = (last_order % max_order) + 1;
    RETURN next_guild;
  END IF;
  -- Rotation mode: advance by number of kills
  SELECT COUNT(*) INTO kill_count FROM death_records WHERE boss_id = b_id;
  SELECT COUNT(*) INTO guild_count FROM boss_guilds WHERE boss_id = b_id AND sort_order IS NOT NULL;
  SELECT guild_id INTO next_guild
  FROM boss_guilds
  WHERE boss_id = b_id AND sort_order IS NOT NULL
  ORDER BY sort_order
  LIMIT 1 OFFSET (kill_count % guild_count);
  RETURN next_guild;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_cron_test_status"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  status_row record;
  result json;
BEGIN
  SELECT last_run, active INTO status_row FROM public.test_cron_status WHERE id = 1;
  SELECT json_build_object(
    'active', COALESCE(status_row.active, false),
    'last_run', COALESCE(to_char(status_row.last_run AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY HH24:MI:SS'), 'Never'),
    'servers', COALESCE((
      SELECT json_agg(srv) FROM (
        SELECT s.name, COUNT(dr.id)::int as kills
        FROM public.servers s
        LEFT JOIN public.death_records dr ON dr.server_id = s.id
        WHERE s.deleted_at IS NULL AND lower(s.name) LIKE '%test%'
        GROUP BY s.id, s.name
        ORDER BY kills DESC
      ) srv
    ), '[]'::json),
    'total_kills', COALESCE((
      SELECT COUNT(*)::int FROM public.death_records dr
      JOIN public.servers s ON s.id = dr.server_id
      WHERE s.deleted_at IS NULL AND lower(s.name) LIKE '%test%'
    ), 0)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_database_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  SELECT jsonb_build_object(
    'db_size', pg_size_pretty(pg_database_size(current_database())),
    'table_stats', (
      SELECT jsonb_agg(jsonb_build_object(
        'table_name', relname,
        'row_estimate', n_live_tup,
        'size', pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)),
        'size_bytes', pg_total_relation_size(schemaname || '.' || relname)
      ) ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC)
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
    ),
    'active_connections', (
      SELECT count(*) FROM pg_stat_activity WHERE state = 'active'
    ),
    'total_connections', (
      SELECT count(*) FROM pg_stat_activity
    ),
    'cache_hit_ratio', (
      SELECT round(
        sum(heap_blks_hit) * 100.0 / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 1
      ) FROM pg_statio_user_tables
    ),
    'timestamp', now()
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_gear_summary"("p_server_id" "uuid") RETURNS TABLE("member_id" "uuid", "gear_score" integer, "slots_filled" integer, "total_slots" integer, "completion_pct" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH template AS (
    SELECT slots
    FROM public.gear_templates
    WHERE server_id = p_server_id
    ORDER BY created_at ASC
    LIMIT 1
  ),
  slot_count AS (
    SELECT COALESCE(SUM((jsonb_array_length(cat->'slots'))::int), 0) AS total
    FROM template t,
    jsonb_array_elements(t.slots) cat
  ),
  gear_data AS (
    SELECT
      mg.member_id,
      COUNT(*)::int AS slots_filled,
      COALESCE(SUM(
        CASE WHEN i.rarity = 'legendary' THEN 10
             WHEN i.rarity = 'epic' THEN 5
             WHEN i.rarity = 'rare' THEN 3
             WHEN i.rarity = 'uncommon' THEN 2
             ELSE 1
        END + mg.enhancement_level
      ), 0)::int AS gear_score
    FROM public.member_gear mg
    JOIN public.members m ON m.id = mg.member_id
    LEFT JOIN public.items i ON i.id = mg.catalog_item_id
    WHERE m.server_id = p_server_id
    GROUP BY mg.member_id
  )
  SELECT
    m.id AS member_id,
    COALESCE(gd.gear_score, 0) AS gear_score,
    COALESCE(gd.slots_filled, 0) AS slots_filled,
    sc.total AS total_slots,
    CASE WHEN sc.total > 0
      THEN ROUND(COALESCE(gd.slots_filled, 0)::numeric / sc.total * 100, 1)
      ELSE 0
    END AS completion_pct
  FROM public.members m
  CROSS JOIN slot_count sc
  LEFT JOIN gear_data gd ON gd.member_id = m.id
  WHERE m.server_id = p_server_id;
$$;

CREATE OR REPLACE FUNCTION "public"."get_item_distribution_stats"("p_server_id" "uuid") RETURNS TABLE("item_id" "uuid", "item_name" "text", "total_quantity" bigint, "recipient_count" bigint, "last_distributed" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.item_id,
    i.name AS item_name,
    SUM(d.quantity)::BIGINT AS total_quantity,
    COUNT(DISTINCT d.member_id)::BIGINT AS recipient_count,
    MAX(d.distributed_at) AS last_distributed
  FROM public.distributions d
  JOIN public.items i ON i.id = d.item_id
  WHERE d.server_id = p_server_id
  GROUP BY d.item_id, i.name
  ORDER BY total_quantity DESC;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_latest_deaths"("p_server_id" "uuid") RETURNS TABLE("id" "uuid", "boss_id" "uuid", "user_id" "uuid", "death_time" timestamp with time zone, "rally_image_url" "text", "created_at" timestamp with time zone, "server_id" "uuid", "owner_guild_id" "uuid", "display_owner_guild_id" "uuid", "is_initial_spawn" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    dr.id, dr.boss_id, dr.user_id, dr.death_time,
    dr.rally_image_url, dr.created_at, dr.server_id,
    dr.owner_guild_id, dr.display_owner_guild_id,
    dr.is_initial_spawn
  FROM public.death_records dr
  WHERE dr.server_id = p_server_id
    AND dr.death_time >= now() - interval '14 days'
    AND (dr.is_initial_spawn IS NULL OR dr.is_initial_spawn = false)
  ORDER BY dr.death_time DESC;
$$;

CREATE OR REPLACE FUNCTION "public"."get_leaderboard"("p_server_id" "uuid", "p_since" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_until" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("member_id" "uuid", "member_name" "text", "boss_points" bigint, "activity_points" bigint, "total_points" bigint, "boss_kills" bigint, "activities_attended" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_guild_resets jsonb;
  v_tz text;
BEGIN
  -- Get server timezone
  SELECT COALESCE(s.timezone, 'UTC') INTO v_tz FROM public.servers s WHERE s.id = p_server_id;
  -- Fetch all guild-specific reset dates
  SELECT COALESCE(jsonb_object_agg(
    g.id::text, s.value
  ), '{}'::jsonb) INTO v_guild_resets
  FROM public.app_settings s
  JOIN public.guilds g ON g.server_id = s.server_id
    AND s.key = 'leaderboard_reset_at:' || g.name
  WHERE s.server_id = p_server_id;
  RETURN QUERY
  WITH boss_scores AS (
    SELECT
      m.id AS mid,
      m.name AS mname,
      COALESCE(SUM(
        COALESCE(bg.points, b.boss_points, 0) * COALESCE(
          (SELECT MAX((pr.config->>'multiplier')::numeric)
           FROM public.point_rules pr
           WHERE pr.guild_id = m.guild_id
             AND pr.rule_type = 'time_multiplier'
             AND pr.enabled = true
             AND (
               ((pr.config->>'start_hour')::int <= (pr.config->>'end_hour')::int
                AND EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) >= (pr.config->>'start_hour')::int
                AND EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) < (pr.config->>'end_hour')::int)
               OR
               ((pr.config->>'start_hour')::int > (pr.config->>'end_hour')::int
                AND (EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) >= (pr.config->>'start_hour')::int
                     OR EXTRACT(HOUR FROM dr.death_time AT TIME ZONE v_tz) < (pr.config->>'end_hour')::int))
             )
          ), 1)
      ), 0) AS bp,
      COUNT(DISTINCT dr.id) AS bk
    FROM public.members m
    LEFT JOIN public.attendance_records ar ON ar.member_id = m.id
    LEFT JOIN public.death_records dr ON dr.id = ar.death_record_id
      AND dr.server_id = p_server_id
      AND (p_since IS NULL OR dr.death_time >= p_since)
      AND (p_until IS NULL OR dr.death_time <= p_until)
      AND (p_since IS NOT NULL OR ar.created_at >= COALESCE(
        (v_guild_resets->>m.guild_id::text)::timestamptz,
        '1970-01-01T00:00:00Z'::timestamptz
      ))
    LEFT JOIN public.bosses b ON b.id = dr.boss_id
    LEFT JOIN (
      SELECT DISTINCT ON (boss_id, guild_id) boss_id, guild_id, points
      FROM public.boss_guilds
      WHERE points IS NOT NULL
      ORDER BY boss_id, guild_id, points DESC
    ) bg ON bg.boss_id = b.id AND bg.guild_id = m.guild_id
    WHERE m.server_id = p_server_id
    GROUP BY m.id, m.name
  ),
  activity_scores AS (
    SELECT
      m.id AS mid,
      COALESCE(SUM(a.points_per_participant), 0) AS ap,
      COUNT(DISTINCT aa.activity_instance_id) AS aa_count
    FROM public.members m
    LEFT JOIN public.activity_attendance aa ON aa.member_id = m.id AND aa.present = true
    LEFT JOIN public.activity_instances ai ON ai.id = aa.activity_instance_id
      AND (p_since IS NULL OR ai.end_time >= p_since)
      AND (p_until IS NULL OR ai.end_time <= p_until)
    LEFT JOIN public.activities a ON a.id = ai.activity_id AND a.server_id = p_server_id
    WHERE m.server_id = p_server_id
    GROUP BY m.id
  ),
  point_adjustments AS (
    SELECT
      pa.member_id AS mid,
      COALESCE(SUM(pa.points), 0) AS adj_pts
    FROM public.point_adjustments pa
    LEFT JOIN public.members m ON m.id = pa.member_id
    WHERE pa.server_id = p_server_id
      AND (p_since IS NULL OR pa.created_at >= p_since)
      AND (p_since IS NOT NULL OR pa.created_at >= COALESCE(
        (v_guild_resets->>m.guild_id::text)::timestamptz,
        '1970-01-01T00:00:00Z'::timestamptz
      ))
    GROUP BY pa.member_id
  )
  SELECT
    bs.mid,
    bs.mname,
    bs.bp::bigint,
    COALESCE(ascores.ap, 0)::bigint,
    (bs.bp + COALESCE(ascores.ap, 0) + COALESCE(pa.adj_pts, 0))::bigint,
    bs.bk::bigint,
    COALESCE(ascores.aa_count, 0)::bigint
  FROM boss_scores bs
  LEFT JOIN activity_scores ascores ON ascores.mid = bs.mid
  LEFT JOIN point_adjustments pa ON pa.mid = bs.mid
  ORDER BY (bs.bp + COALESCE(ascores.ap, 0) + COALESCE(pa.adj_pts, 0)) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_member_classes"("p_server_id" "uuid") RETURNS "text"[]
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    ARRAY(SELECT jsonb_array_elements_text((value::jsonb)->'classes')),
    ARRAY[]::TEXT[]
  ) FROM public.app_settings
  WHERE server_id = p_server_id AND key = 'member_classes';
$$;

CREATE OR REPLACE FUNCTION "public"."get_member_cp_growth"("p_member_id" "uuid", "p_days" integer DEFAULT 7) RETURNS TABLE("growth" integer, "first_cp" integer, "latest_cp" integer, "update_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH latest AS (
    SELECT new_cp FROM public.cp_updates
    WHERE member_id = p_member_id AND status = 'approved'
    ORDER BY submitted_at DESC LIMIT 1
  ),
  baseline AS (
    SELECT new_cp FROM public.cp_updates
    WHERE member_id = p_member_id AND status = 'approved'
      AND submitted_at <= (NOW() - (p_days || ' days')::INTERVAL)
    ORDER BY submitted_at DESC LIMIT 1
  ),
  cnt AS (
    SELECT COUNT(*)::BIGINT FROM public.cp_updates
    WHERE member_id = p_member_id AND status = 'approved'
      AND submitted_at >= (NOW() - (p_days || ' days')::INTERVAL)
  )
  SELECT
    COALESCE((SELECT new_cp FROM latest), 0) - COALESCE((SELECT new_cp FROM baseline), (SELECT new_cp FROM latest), 0),
    (SELECT new_cp FROM baseline),
    (SELECT new_cp FROM latest),
    (SELECT * FROM cnt);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_member_scores"("p_server_id" "uuid") RETURNS TABLE("member_id" "uuid", "score" integer, "cp_growth_30d" integer, "cp_updated_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH latest_cp AS (
    SELECT DISTINCT ON (member_id)
      member_id,
      new_cp,
      submitted_at
    FROM public.cp_updates
    WHERE server_id = p_server_id
    ORDER BY member_id, submitted_at DESC
  ),
  cp_30d_growth AS (
    SELECT
      member_id,
      MAX(new_cp) - MIN(new_cp) AS growth
    FROM public.cp_updates
    WHERE server_id = p_server_id
      AND submitted_at >= NOW() - INTERVAL '30 days'
    GROUP BY member_id
  )
  SELECT
    m.id AS member_id,
    COALESCE(
      CASE
        WHEN COALESCE((lc.new_cp - m.combat_power), 0) > 0 THEN 100
        WHEN (lc.submitted_at IS NULL OR lc.submitted_at < NOW() - INTERVAL '14 days') THEN
          CASE WHEN m.combat_power IS NOT NULL THEN
            GREATEST(0, 100 - EXTRACT(DAY FROM NOW() - COALESCE(lc.submitted_at, m.created_at))::int)
          ELSE 0 END
        ELSE 100
      END,
      0
    )::int AS score,
    COALESCE(g.growth, 0)::int AS cp_growth_30d,
    lc.submitted_at AS cp_updated_at
  FROM public.members m
  LEFT JOIN latest_cp lc ON lc.member_id = m.id
  LEFT JOIN cp_30d_growth g ON g.member_id = m.id
  WHERE m.server_id = p_server_id;
$$;

CREATE OR REPLACE FUNCTION "public"."get_member_verification"("p_server_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "is_verified" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT sm.user_id, au.email,
    CASE WHEN au.email_confirmed_at IS NOT NULL
      AND ABS(EXTRACT(EPOCH FROM (au.email_confirmed_at - au.created_at))) > 5
    THEN true ELSE false END
  FROM public.server_members sm
  JOIN auth.users au ON au.id = sm.user_id
  WHERE sm.server_id = p_server_id;
$$;

CREATE OR REPLACE FUNCTION "public"."get_plan_usage"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_db_size_bytes BIGINT;
  v_db_size TEXT;
  v_cache_ratio NUMERIC;
  v_active_conns INT;
  v_idle_conns INT;
  v_total_conns INT;
  v_max_conns INT;
  v_auth_users INT;
  v_active_users_30d INT;
  v_storage_bytes BIGINT;
  v_storage_pretty TEXT;
  v_storage_objects INT;
  v_total_rows BIGINT;
  v_table_count INT;
BEGIN
  -- Database size
  SELECT pg_database_size(current_database()) INTO v_db_size_bytes;
  v_db_size := pg_size_pretty(v_db_size_bytes);
  -- Cache hit ratio
  SELECT ROUND((sum(heap_blks_hit)::numeric / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)) * 100, 1)
    INTO v_cache_ratio FROM pg_statio_user_tables;
  -- Connections
  SELECT count(*) INTO v_active_conns FROM pg_stat_activity WHERE state = 'active';
  SELECT count(*) INTO v_idle_conns FROM pg_stat_activity WHERE state = 'idle';
  SELECT count(*) INTO v_total_conns FROM pg_stat_activity;
  SELECT setting::int INTO v_max_conns FROM pg_settings WHERE name = 'max_connections';
  -- Auth users
  BEGIN
    SELECT count(*) INTO v_auth_users FROM auth.users;
    SELECT count(*) INTO v_active_users_30d
      FROM auth.users WHERE last_sign_in_at > now() - interval '30 days';
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    v_auth_users := 0;
    v_active_users_30d := 0;
  END;
  -- Storage (from storage schema — file size is in metadata JSON)
  BEGIN
    SELECT COALESCE(sum(COALESCE((o.metadata->>'size')::bigint, 0)), 0)
      INTO v_storage_bytes FROM storage.objects o;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    v_storage_bytes := 0;
  END;
  v_storage_pretty := pg_size_pretty(COALESCE(v_storage_bytes, 0));
  BEGIN
    SELECT count(*) INTO v_storage_objects FROM storage.objects;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    v_storage_objects := 0;
  END;
  -- Total rows across all user tables
  SELECT COALESCE(sum(n_live_tup), 0) INTO v_total_rows FROM pg_stat_user_tables;
  SELECT count(*) INTO v_table_count FROM pg_stat_user_tables;
  RETURN jsonb_build_object(
    'db_size', v_db_size,
    'db_size_bytes', v_db_size_bytes,
    'cache_hit_ratio', v_cache_ratio,
    'active_connections', v_active_conns,
    'idle_connections', v_idle_conns,
    'total_connections', v_total_conns,
    'max_connections', v_max_conns,
    'auth_users', v_auth_users,
    'active_auth_users_30d', v_active_users_30d,
    'storage_size_bytes', v_storage_bytes,
    'storage_size_pretty', v_storage_pretty,
    'storage_objects', v_storage_objects,
    'total_rows', v_total_rows,
    'table_count', v_table_count,
    'timestamp', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_point_multiplier"("p_guild_id" "uuid", "p_kill_time" timestamp with time zone, "p_server_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_multiplier NUMERIC := 1.0;
  v_rule RECORD;
  v_tz TEXT;
  v_local_hour INTEGER;
BEGIN
  -- Get server timezone
  SELECT COALESCE(timezone, 'Asia/Manila') INTO v_tz FROM servers WHERE id = p_server_id;
  -- Convert kill time to server local hour
  SELECT EXTRACT(HOUR FROM (p_kill_time AT TIME ZONE v_tz))::INTEGER INTO v_local_hour;
  -- Find highest matching multiplier rule
  FOR v_rule IN
    SELECT config FROM point_rules
    WHERE guild_id = p_guild_id
      AND server_id = p_server_id
      AND rule_type = 'time_multiplier'
      AND enabled = true
    ORDER BY (config->>'multiplier')::NUMERIC DESC
  LOOP
    DECLARE
      start_h INTEGER := (v_rule.config->>'start_hour')::INTEGER;
      end_h INTEGER := (v_rule.config->>'end_hour')::INTEGER;
      mult NUMERIC := (v_rule.config->>'multiplier')::NUMERIC;
    BEGIN
      -- Handle overnight ranges (e.g., 22-06)
      IF start_h <= end_h THEN
        IF v_local_hour >= start_h AND v_local_hour < end_h THEN
          v_multiplier := GREATEST(v_multiplier, mult);
        END IF;
      ELSE
        IF v_local_hour >= start_h OR v_local_hour < end_h THEN
          v_multiplier := GREATEST(v_multiplier, mult);
        END IF;
      END IF;
    END;
  END LOOP;
  RETURN v_multiplier;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_public_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'guilds', (SELECT COUNT(*) FROM public.guilds g JOIN public.servers s ON s.id = g.server_id WHERE s.deleted_at IS NULL),
    'kills', (SELECT COUNT(*) FROM public.death_records dr JOIN public.servers s ON s.id = dr.server_id WHERE s.deleted_at IS NULL),
    'players', (SELECT COUNT(*) FROM public.members m JOIN public.servers s ON s.id = m.server_id WHERE s.deleted_at IS NULL),
    'servers', (SELECT COUNT(*) FROM public.servers WHERE deleted_at IS NULL)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_server_by_viewer_key"("v_key" "text") RETURNS TABLE("id" "uuid", "name" "text", "viewer_can_edit" boolean, "viewer_can_mark_died" boolean, "discord_webhook_url" "text", "timezone" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
    SELECT s.id, s.name, s.viewer_can_edit, s.viewer_can_mark_died, s.discord_webhook_url, s.timezone
    FROM public.servers s
    WHERE s.viewer_key = v_key::uuid
      AND s.deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_server_members"("s_id" "uuid") RETURNS TABLE("user_id" "uuid", "role" "text", "email" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT sm.user_id, sm.role::text, au.email::text
  FROM server_members sm
  JOIN auth.users au ON au.id = sm.user_id
  WHERE sm.server_id = s_id
  AND can_access_server(s_id);
$$;

CREATE OR REPLACE FUNCTION "public"."get_server_stats"("p_server_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  SELECT jsonb_build_object(
    'member_count', (SELECT COUNT(*) FROM public.server_members WHERE server_id = p_server_id),
    'boss_count', (SELECT COUNT(*) FROM public.bosses WHERE server_id = p_server_id),
    'death_count', (SELECT COUNT(*) FROM public.death_records WHERE server_id = p_server_id),
    'has_webhook', (SELECT discord_webhook_url IS NOT NULL AND discord_webhook_url != '' FROM public.servers WHERE id = p_server_id),
    'guild_members', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT COALESCE(g.name, 'No Guild') AS guild, COUNT(m.id) AS count
        FROM public.guilds g
        LEFT JOIN public.members m ON m.guild_id = g.id AND m.server_id = p_server_id
        WHERE g.server_id = p_server_id
        GROUP BY g.name
        UNION ALL
        SELECT 'No Guild', COUNT(*) FROM public.members 
        WHERE server_id = p_server_id AND guild_id IS NULL
        ORDER BY guild
      ) t
    ),
    'total_raid_members', (SELECT COUNT(*) FROM public.members WHERE server_id = p_server_id)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_server_viewer_key"("s_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_key text;
BEGIN
  SELECT viewer_key::text INTO v_key FROM public.servers WHERE id = s_id;
  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_top_cp_growth"("p_server_id" "uuid", "p_days" integer DEFAULT 30, "p_limit" integer DEFAULT 10) RETURNS TABLE("member_id" "uuid", "player_name" "text", "growth" bigint, "current_cp" integer, "update_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH latest_cps AS (
    SELECT DISTINCT ON (cu.member_id)
      cu.member_id,
      cu.player_name,
      cu.new_cp AS current_cp
    FROM public.cp_updates cu
    WHERE cu.server_id = p_server_id AND cu.status = 'approved'
    ORDER BY cu.member_id, cu.submitted_at DESC
  ),
  growth AS (
    SELECT
      cu.member_id,
      cu.player_name,
      MAX(cu.new_cp) - MIN(cu.new_cp) AS growth,
      COUNT(*)::BIGINT AS update_count
    FROM public.cp_updates cu
    WHERE cu.server_id = p_server_id
      AND cu.status = 'approved'
      AND cu.submitted_at >= (NOW() - (p_days || ' days')::INTERVAL)
    GROUP BY cu.member_id, cu.player_name
  )
  SELECT
    g.member_id,
    g.player_name,
    g.growth,
    lc.current_cp,
    g.update_count
  FROM growth g
  LEFT JOIN latest_cps lc ON lc.member_id = g.member_id
  WHERE g.growth > 0
  ORDER BY g.growth DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_top_recipients"("p_server_id" "uuid", "p_limit" integer DEFAULT 10) RETURNS TABLE("member_id" "uuid", "player_name" "text", "total_items" bigint, "unique_items" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.member_id,
    d.player_name,
    SUM(d.quantity)::BIGINT AS total_items,
    COUNT(DISTINCT d.item_id)::BIGINT AS unique_items
  FROM public.distributions d
  WHERE d.server_id = p_server_id
  GROUP BY d.member_id, d.player_name
  ORDER BY total_items DESC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("user_email" "text") RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select id from auth.users where email = user_email limit 1;
$$;

CREATE OR REPLACE FUNCTION "public"."get_user_servers"("user_id_input" "uuid") RETURNS TABLE("server_id" "uuid", "server_name" "text", "role" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS server_id,
    s.name AS server_name,
    sm.role,
    s.created_at
  FROM public.server_members sm
  JOIN public.servers s ON s.id = sm.server_id
  WHERE sm.user_id = user_id_input
  ORDER BY s.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."is_member_of_server"("sid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Platform admins have full access to all servers
  IF public.is_admin() THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = sid AND user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."is_owner_of_server"("sid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = sid AND user_id = auth.uid() AND role = 'owner'
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."is_server_owner"("s_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM server_members sm
    WHERE sm.server_id = s_id AND sm.user_id = auth.uid() AND sm.role = 'owner'
  ) OR is_admin();
$$;

CREATE OR REPLACE FUNCTION "public"."join_server_by_invite"("invite" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  srv servers%ROWTYPE;
BEGIN
  SELECT * INTO srv FROM servers WHERE invite_code = invite;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid invite code');
  END IF;
  -- Check not already a member
  IF EXISTS (SELECT 1 FROM server_members WHERE server_id = srv.id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Already a member of this server');
  END IF;
  -- Add as moderator
  INSERT INTO server_members (server_id, user_id, role) VALUES (srv.id, auth.uid(), 'moderator');
  RETURN jsonb_build_object('id', srv.id, 'name', srv.name, 'role', 'moderator');
END;
$$;

CREATE OR REPLACE FUNCTION "public"."log_admin_action"("p_action" "text", "p_target_type" "text" DEFAULT NULL::"text", "p_target_id" "text" DEFAULT NULL::"text", "p_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), p_action, p_target_type, p_target_id, p_details);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."log_server_action"("p_server_id" "uuid", "p_action" "text", "p_target_type" "text" DEFAULT NULL::"text", "p_target_id" "text" DEFAULT NULL::"text", "p_details" "jsonb" DEFAULT '{}'::"jsonb", "p_viewer_key" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO admin_audit_log (actor_id, server_id, viewer_key, action, target_type, target_id, details)
  VALUES (
    CASE WHEN auth.uid() IS NOT NULL THEN auth.uid() ELSE NULL END,
    p_server_id,
    p_viewer_key,
    p_action,
    p_target_type,
    p_target_id,
    p_details
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."make_bosses_alive"("s_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  boss_record RECORD;
BEGIN
  IF NOT public.can_access_server(s_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  FOR boss_record IN
    SELECT b.id, b.respawn_hours
    FROM public.bosses b
    WHERE b.server_id = s_id AND b.spawn_type = 'fixed_hours' AND b.respawn_hours IS NOT NULL
  LOOP
    -- Delete any existing override for this boss
    DELETE FROM public.boss_spawn_overrides
    WHERE boss_id = boss_record.id AND server_id = s_id;
    -- Insert override so the boss appears alive now
    INSERT INTO public.boss_spawn_overrides (boss_id, server_id, death_time)
    VALUES (
      boss_record.id,
      s_id,
      now() - (boss_record.respawn_hours || ' hours')::interval
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."mark_activity_attendance"("p_activity_instance_id" "uuid", "p_member_id" "uuid", "p_present" boolean DEFAULT true) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_present THEN
    INSERT INTO public.activity_attendance (activity_instance_id, member_id, present)
    VALUES (p_activity_instance_id, p_member_id, true)
    ON CONFLICT (activity_instance_id, member_id)
    DO UPDATE SET present = true;
  ELSE
    DELETE FROM public.activity_attendance
    WHERE activity_instance_id = p_activity_instance_id
      AND member_id = p_member_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."regenerate_invite_code"("s_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_code TEXT;
BEGIN
  -- Only server owner can regenerate
  IF NOT EXISTS (
    SELECT 1 FROM server_members 
    WHERE server_id = s_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the server owner can regenerate the invite code';
  END IF;
  new_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
  UPDATE servers SET invite_code = new_code WHERE id = s_id;
  RETURN new_code;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."regenerate_viewer_key"("s_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_key UUID;
BEGIN
  -- Only server owner can regenerate
  IF NOT EXISTS (
    SELECT 1 FROM server_members 
    WHERE server_id = s_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only the server owner can regenerate the viewer key';
  END IF;
  new_key := gen_random_uuid();
  UPDATE servers SET viewer_key = new_key WHERE id = s_id;
  RETURN new_key;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."reject_item"("p_item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can reject items';
  END IF;
  UPDATE public.items
  SET status = 'rejected',
      approved_by = auth.uid(),
      approved_at = now()
  WHERE id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."remove_member_from_party"("p_member_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM public.static_party_members WHERE member_id = p_member_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."restore_server"("p_server_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.servers SET deleted_at = NULL WHERE id = p_server_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."run_test_cron"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  srv record;
  boss record;
  last_death timestamptz;
  spawn_time timestamptz;
  kill_time timestamptz;
  death_id uuid;
  member record;
  guild_ids uuid[];
  picked_guild_id uuid;
  total_kills int := 0;
BEGIN
  -- Mark as running
  UPDATE public.test_cron_status SET last_run = now(), active = true WHERE id = 1;
  FOR srv IN
    SELECT id, name FROM public.servers
    WHERE deleted_at IS NULL AND lower(name) LIKE '%test%'
  LOOP
    guild_ids := ARRAY(
      SELECT id FROM public.guilds WHERE server_id = srv.id ORDER BY name
    );
    FOR boss IN
      SELECT * FROM public.bosses
      WHERE server_id = srv.id AND is_enabled = true AND deleted_at IS NULL AND spawn_type = 'fixed_hours'
    LOOP
      SELECT death_time INTO last_death
      FROM public.death_records
      WHERE boss_id = boss.id AND server_id = srv.id
      ORDER BY death_time DESC LIMIT 1;
      IF last_death IS NOT NULL THEN
        spawn_time := last_death + (COALESCE(boss.respawn_hours, 24) || ' hours')::interval;
      ELSE
        spawn_time := now() - (COALESCE(boss.respawn_hours, 24) || ' hours')::interval;
      END IF;
      IF spawn_time <= now() THEN
        kill_time := spawn_time + (random() * extract(epoch from (now() - spawn_time)) || ' seconds')::interval;
        IF kill_time > now() THEN kill_time := now(); END IF;
        IF array_length(guild_ids, 1) > 0 THEN
          picked_guild_id := guild_ids[1 + floor(random() * array_length(guild_ids, 1))];
          INSERT INTO public.death_records (boss_id, server_id, death_time, owner_guild_id)
          VALUES (boss.id, srv.id, kill_time, picked_guild_id)
          RETURNING id INTO death_id;
        ELSE
          INSERT INTO public.death_records (boss_id, server_id, death_time)
          VALUES (boss.id, srv.id, kill_time)
          RETURNING id INTO death_id;
        END IF;
        FOR member IN
          SELECT id FROM public.members WHERE server_id = srv.id
          ORDER BY random() LIMIT (3 + floor(random() * 6))
        LOOP
          INSERT INTO public.attendance_records (death_record_id, member_id, server_id)
          VALUES (death_id, member.id, srv.id)
          ON CONFLICT (death_record_id, member_id) DO NOTHING;
        END LOOP;
        UPDATE public.bosses
        SET rotation_counter = COALESCE(rotation_counter, 0) + 1
        WHERE id = boss.id;
        total_kills := total_kills + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN 'Simulated ' || total_kills || ' kills';
END;
$$;

CREATE OR REPLACE FUNCTION "public"."search_items_by_game"("p_game" "text", "p_query" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "name" "text", "game" "text", "image_url" "text", "description" "text", "rarity" "text", "created_by_username" "text", "created_at" timestamp with time zone, "server_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    i.id,
    i.name,
    i.game,
    i.image_url,
    i.description,
    i.rarity,
    i.created_by_username,
    i.created_at,
    (SELECT COUNT(DISTINCT d.server_id) FROM public.distributions d WHERE d.item_id = i.id) AS server_count
  FROM public.items i
  WHERE i.game = p_game
    AND (p_query IS NULL OR i.name ILIKE '%' || p_query || '%')
  ORDER BY i.name;
$$;

CREATE OR REPLACE FUNCTION "public"."set_activity_parties"("p_activity_instance_id" "uuid", "p_parties" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Delete existing parties for this instance
  DELETE FROM public.activity_parties WHERE activity_instance_id = p_activity_instance_id;
  -- Insert new parties
  FOR i IN 0..jsonb_array_length(p_parties) - 1 LOOP
    INSERT INTO public.activity_parties (activity_instance_id, party_number, member_ids)
    VALUES (
      p_activity_instance_id,
      (p_parties->i->>'party_number')::INTEGER,
      (SELECT array_agg(v::UUID) FROM jsonb_array_elements_text(p_parties->i->'member_ids') v)
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_activity_party_leaders"("p_activity_instance_id" "uuid", "p_leaders" "jsonb") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  UPDATE public.activity_instances
  SET party_leaders = p_leaders
  WHERE id = p_activity_instance_id;
$$;

CREATE OR REPLACE FUNCTION "public"."set_activity_rally_images"("p_activity_instance_id" "uuid", "p_images" "text"[]) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  UPDATE public.activity_instances
  SET rally_images = p_images
  WHERE id = p_activity_instance_id;
$$;

CREATE OR REPLACE FUNCTION "public"."set_boss_points"("p_boss_id" "uuid", "p_points" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_server_id UUID;
BEGIN
  SELECT server_id INTO v_server_id FROM public.bosses WHERE id = p_boss_id;
  IF v_server_id IS NULL THEN
    RAISE EXCEPTION 'Boss not found';
  END IF;
  -- Only moderators and owners of this server
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = v_server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Only server moderators/owners can set boss points';
  END IF;
  IF p_points < 0 THEN
    RAISE EXCEPTION 'Boss points cannot be negative';
  END IF;
  UPDATE public.bosses SET boss_points = p_points, updated_at = now()
  WHERE id = p_boss_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_boss_rotation"("p_boss_id" "uuid", "p_index" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_counter INTEGER;
BEGIN
  UPDATE public.bosses
  SET rotation_counter = GREATEST(p_index, 1)
  WHERE id = p_boss_id
  RETURNING rotation_counter INTO v_counter;
  RETURN v_counter;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_boss_salary"("p_boss_id" "uuid", "p_has_salary" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.bosses SET has_salary = p_has_salary WHERE id = p_boss_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."set_death_display_guild"("p_death_record_id" "uuid", "p_guild_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.death_records
  SET display_owner_guild_id = p_guild_id
  WHERE id = p_death_record_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_member_classes"("p_server_id" "uuid", "p_classes" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM public.app_settings WHERE server_id = p_server_id AND key = 'member_classes';
  INSERT INTO public.app_settings (server_id, key, value)
  VALUES (p_server_id, 'member_classes', jsonb_build_object('classes', p_classes));
END; $$;

CREATE OR REPLACE FUNCTION "public"."set_notification_prefix"("p_server_id" "uuid", "p_prefix" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = p_server_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Only server moderators/owners can set notification prefix';
  END IF;
  UPDATE public.servers SET notification_prefix = p_prefix WHERE id = p_server_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_server_webhook"("s_id" "uuid", "webhook_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.servers WHERE id = s_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.server_members WHERE server_id = s_id AND user_id = auth.uid() AND role = 'moderator'
  ) THEN
    UPDATE public.servers SET discord_webhook_url = set_server_webhook.webhook_url WHERE id = s_id;
  ELSE
    RAISE EXCEPTION 'Only server owners and moderators can configure the webhook';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."soft_delete_boss"("p_boss_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.bosses SET is_enabled = false, deleted_at = now() WHERE id = p_boss_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."sync_activity_template"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.activities
  SET name = NEW.name,
      schedule_type = NEW.schedule_type,
      schedule = NEW.schedule,
      duration_minutes = NEW.duration_minutes,
      points_per_participant = NEW.points_per_participant,
      party_size = NEW.party_size,
      category = NEW.category,
      tags = NEW.tags
  WHERE template_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."sync_boss_template"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.bosses
  SET name = NEW.name,
      spawn_type = NEW.spawn_type,
      respawn_hours = NEW.respawn_hours,
      schedule = NEW.schedule,
      is_recurring = NEW.is_recurring,
      category = NEW.category,
      tags = NEW.tags,
      points = NEW.points
  WHERE template_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."toggle_activity_enabled"("p_activity_id" "uuid", "p_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.activities SET is_enabled = p_enabled WHERE id = p_activity_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."toggle_boss_enabled"("p_boss_id" "uuid", "p_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.bosses SET is_enabled = p_enabled WHERE id = p_boss_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."toggle_viewer_can_edit"("p_server_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_new_val BOOLEAN;
BEGIN
  UPDATE public.servers
  SET viewer_can_edit = NOT COALESCE(viewer_can_edit, false)
  WHERE id = p_server_id
  RETURNING viewer_can_edit INTO v_new_val;
  RETURN v_new_val;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."toggle_viewer_can_mark_died"("p_server_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_new_val BOOLEAN;
BEGIN
  UPDATE public.servers
  SET viewer_can_mark_died = NOT COALESCE(viewer_can_mark_died, false)
  WHERE id = p_server_id
  RETURNING viewer_can_mark_died INTO v_new_val;
  RETURN v_new_val;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."transfer_server_ownership"("s_id" "uuid", "new_owner_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  old_owner_id UUID;
  server_name TEXT;
BEGIN
  -- Get current owner and name before change
  SELECT owner_id, name INTO old_owner_id, server_name FROM servers WHERE id = s_id;
  -- Verify caller is the current owner
  IF old_owner_id IS NULL OR old_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the server owner can transfer ownership';
  END IF;
  -- Verify new owner is a moderator of this server
  IF NOT EXISTS (SELECT 1 FROM server_members WHERE server_id = s_id AND user_id = new_owner_id AND role = 'moderator') THEN
    RAISE EXCEPTION 'New owner must be a moderator of this server';
  END IF;
  -- Transfer ownership
  UPDATE servers SET owner_id = new_owner_id WHERE id = s_id;
  -- Demote old owner to moderator
  UPDATE server_members SET role = 'moderator' WHERE server_id = s_id AND user_id = auth.uid();
  -- Promote new owner
  INSERT INTO server_members (server_id, user_id, role)
  VALUES (s_id, new_owner_id, 'owner')
  ON CONFLICT (server_id, user_id) DO UPDATE SET role = 'owner';
  -- Audit log
  PERFORM log_admin_action('transfer_ownership', 'server', s_id::text,
    jsonb_build_object(
      'server_name', server_name,
      'old_owner', old_owner_id,
      'new_owner', new_owner_id
    ));
END;
$$;

CREATE OR REPLACE FUNCTION "public"."unlink_party"("p_party_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.static_parties
  SET boss_id = NULL, activity_id = NULL
  WHERE id = p_party_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."update_custom_activity"("p_activity_id" "uuid", "p_name" "text", "p_schedule_type" "text", "p_schedule" "jsonb", "p_duration_minutes" integer, "p_points_per_participant" integer, "p_party_size" integer, "p_category" "text", "p_tags" "text"[], "p_image_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.activities SET
    name = p_name, schedule_type = p_schedule_type,
    schedule = p_schedule, duration_minutes = p_duration_minutes,
    points_per_participant = p_points_per_participant,
    party_size = p_party_size, category = p_category,
    tags = p_tags, image_url = p_image_url
  WHERE id = p_activity_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."update_custom_boss"("p_boss_id" "uuid", "p_name" "text", "p_spawn_type" "text", "p_respawn_hours" numeric, "p_schedule" "jsonb", "p_is_recurring" boolean, "p_boss_points" integer, "p_category" "text", "p_tags" "text"[], "p_image_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.bosses SET
    name = p_name, spawn_type = p_spawn_type,
    respawn_hours = p_respawn_hours, schedule = p_schedule,
    is_recurring = p_is_recurring, boss_points = p_boss_points,
    category = p_category, tags = p_tags,
    image_url = p_image_url
  WHERE id = p_boss_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."update_member_stats"("p_member_id" "uuid", "p_combat_power" integer, "p_class" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.members SET combat_power = p_combat_power, class = p_class WHERE id = p_member_id;
END; $$;

CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."upsert_boss_guild_points"("p_boss_id" "uuid", "p_guild_id" "uuid", "p_points" integer DEFAULT NULL::integer, "p_has_salary" boolean DEFAULT NULL::boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_count INT;
BEGIN
  -- Verify caller is a member of the boss's server (owner, moderator, or regular member)
  IF NOT EXISTS (
    SELECT 1 FROM public.bosses b
    JOIN public.server_members sm ON sm.server_id = b.server_id
    WHERE b.id = p_boss_id AND sm.user_id = auth.uid()
  ) THEN
    -- Also allow platform admins
    IF NOT coalesce(public.is_admin(), false) THEN
      RAISE EXCEPTION 'You are not a member of the server that owns this boss';
    END IF;
  END IF;
  -- Check if any rows exist for this boss+guild
  SELECT COUNT(*) INTO v_count FROM public.boss_guilds
  WHERE boss_id = p_boss_id AND guild_id = p_guild_id;
  IF v_count > 0 THEN
    -- Update ALL existing rows for this boss+guild
    UPDATE public.boss_guilds SET
      points = COALESCE(p_points, points),
      has_salary = COALESCE(p_has_salary, has_salary)
    WHERE boss_id = p_boss_id AND guild_id = p_guild_id;
  ELSE
    -- Insert a points/salary-only row (not a guild assignment)
    INSERT INTO public.boss_guilds (boss_id, guild_id, sort_order, day_of_week, mode, points, has_salary)
    VALUES (p_boss_id, p_guild_id, -1, NULL, 'rotation', p_points, COALESCE(p_has_salary, false));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."upsert_moderator_permissions"("p_server_id" "uuid", "p_user_id" "uuid", "p_can_access_settings" boolean DEFAULT false, "p_can_manage_guilds" boolean DEFAULT false, "p_can_record_death" boolean DEFAULT false, "p_can_manage_spawns" boolean DEFAULT false, "p_can_manage_members" boolean DEFAULT false, "p_can_manage_points" boolean DEFAULT false, "p_can_manage_integrations" boolean DEFAULT false, "p_can_manage_server_content" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.server_members sm
    WHERE sm.server_id = p_server_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'owner'
  ) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only server owners can manage moderator permissions';
  END IF;
  INSERT INTO public.moderator_permissions (
    server_id, user_id,
    can_access_settings, can_manage_guilds, can_record_death,
    can_manage_spawns, can_manage_members, can_manage_points,
    can_manage_integrations, can_manage_server_content
  ) VALUES (
    p_server_id, p_user_id,
    p_can_access_settings, p_can_manage_guilds, p_can_record_death,
    p_can_manage_spawns, p_can_manage_members, p_can_manage_points,
    p_can_manage_integrations, p_can_manage_server_content
  )
  ON CONFLICT (server_id, user_id) DO UPDATE SET
    can_access_settings = EXCLUDED.can_access_settings,
    can_manage_guilds = EXCLUDED.can_manage_guilds,
    can_record_death = EXCLUDED.can_record_death,
    can_manage_spawns = EXCLUDED.can_manage_spawns,
    can_manage_members = EXCLUDED.can_manage_members,
    can_manage_points = EXCLUDED.can_manage_points,
    can_manage_integrations = EXCLUDED.can_manage_integrations,
    can_manage_server_content = EXCLUDED.can_manage_server_content;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."upsert_moderator_permissions"("p_server_id" "uuid", "p_user_id" "uuid", "p_can_access_settings" boolean DEFAULT false, "p_can_manage_guilds" boolean DEFAULT false, "p_can_manage_viewer_key" boolean DEFAULT false, "p_can_change_timezone" boolean DEFAULT false, "p_can_manage_boss_guilds" boolean DEFAULT false, "p_can_manage_moderators" boolean DEFAULT false, "p_can_access_integrations" boolean DEFAULT false, "p_can_edit_participants" boolean DEFAULT false, "p_can_export_attendance" boolean DEFAULT false, "p_can_manage_raid_members" boolean DEFAULT false, "p_can_adjust_points" boolean DEFAULT false, "p_can_record_death" boolean DEFAULT false, "p_can_edit_death_records" boolean DEFAULT false, "p_can_set_spawn" boolean DEFAULT false, "p_can_rotate_guilds" boolean DEFAULT false, "p_can_announce_discord" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Verify caller is owner or admin
  IF NOT (
    EXISTS (SELECT 1 FROM public.server_members sm WHERE sm.server_id = p_server_id AND sm.user_id = auth.uid() AND sm.role = 'owner')
    OR coalesce(public.is_admin(), false)
  ) THEN
    RAISE EXCEPTION 'Only server owners and platform admins can update moderator permissions';
  END IF;
  -- Check if row exists; update or insert accordingly (avoids ON CONFLICT issues)
  IF EXISTS (SELECT 1 FROM public.moderator_permissions WHERE server_id = p_server_id AND user_id = p_user_id) THEN
    UPDATE public.moderator_permissions SET
      can_access_settings = p_can_access_settings,
      can_manage_guilds = p_can_manage_guilds,
      can_manage_viewer_key = p_can_manage_viewer_key,
      can_change_timezone = p_can_change_timezone,
      can_manage_boss_guilds = p_can_manage_boss_guilds,
      can_manage_moderators = p_can_manage_moderators,
      can_access_integrations = p_can_access_integrations,
      can_edit_participants = p_can_edit_participants,
      can_export_attendance = p_can_export_attendance,
      can_manage_raid_members = p_can_manage_raid_members,
      can_adjust_points = p_can_adjust_points,
      can_record_death = p_can_record_death,
      can_edit_death_records = p_can_edit_death_records,
      can_set_spawn = p_can_set_spawn,
      can_rotate_guilds = p_can_rotate_guilds,
      can_announce_discord = p_can_announce_discord
    WHERE server_id = p_server_id AND user_id = p_user_id;
  ELSE
    INSERT INTO public.moderator_permissions (
      server_id, user_id,
      can_access_settings, can_manage_guilds, can_manage_viewer_key,
      can_change_timezone, can_manage_boss_guilds, can_manage_moderators,
      can_access_integrations, can_edit_participants, can_export_attendance,
      can_manage_raid_members, can_adjust_points, can_record_death,
      can_edit_death_records, can_set_spawn, can_rotate_guilds,
      can_announce_discord
    )
    VALUES (
      p_server_id, p_user_id,
      p_can_access_settings, p_can_manage_guilds, p_can_manage_viewer_key,
      p_can_change_timezone, p_can_manage_boss_guilds, p_can_manage_moderators,
      p_can_access_integrations, p_can_edit_participants, p_can_export_attendance,
      p_can_manage_raid_members, p_can_adjust_points, p_can_record_death,
      p_can_edit_death_records, p_can_set_spawn, p_can_rotate_guilds,
      p_can_announce_discord
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."viewer_add_attendance"("p_death_record_id" "uuid", "p_member_id" "uuid", "p_viewer_key" "text") RETURNS SETOF "public"."attendance_records"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the death record's server
  select server_id into v_server_id from death_records where id = p_death_record_id;
  if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
  end if;
  return query
    insert into attendance_records (death_record_id, member_id, server_id)
    values (p_death_record_id, p_member_id, v_server_id)
    on conflict (death_record_id, member_id) do nothing
    returning *;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."viewer_delete_death_record"("p_death_record_id" "uuid", "p_viewer_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the death record's server
  select server_id into v_server_id from death_records where id = p_death_record_id;
  if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
  end if;
  delete from death_records where id = p_death_record_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."viewer_get_activities"("v_server_id" "uuid", "v_key" "text") RETURNS SETOF "public"."activities"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
  END IF;
  RETURN QUERY SELECT * FROM public.activities WHERE server_id = v_server_id AND is_enabled = true ORDER BY name;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."viewer_get_activity_instances"("v_server_id" "uuid", "v_key" "text") RETURNS TABLE("id" "uuid", "activity_id" "uuid", "start_time" timestamp with time zone, "end_time" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
  END IF;
  RETURN QUERY
  SELECT ai.id, ai.activity_id, ai.start_time, ai.end_time, ai.created_at
  FROM public.activity_instances ai
  JOIN public.activities a ON a.id = ai.activity_id
  WHERE a.server_id = v_server_id
  ORDER BY ai.start_time DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."viewer_get_activity_parties"("v_instance_id" "uuid", "v_key" "text") RETURNS SETOF "public"."activity_parties"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_server_id UUID;
BEGIN
  SELECT a.server_id INTO v_server_id
  FROM public.activity_instances ai
  JOIN public.activities a ON a.id = ai.activity_id
  WHERE ai.id = v_instance_id;
  IF NOT EXISTS (SELECT 1 FROM public.servers WHERE id = v_server_id AND viewer_key = v_key::UUID) THEN
    RAISE EXCEPTION 'Invalid viewer key';
  END IF;
  RETURN QUERY SELECT * FROM public.activity_parties WHERE activity_instance_id = v_instance_id ORDER BY party_number;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."viewer_insert_death_record"("p_boss_id" "uuid", "p_death_time" timestamp with time zone, "p_server_id" "uuid", "p_viewer_key" "text", "p_owner_guild_id" "uuid" DEFAULT NULL::"uuid") RETURNS SETOF "public"."death_records"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key
  select id into v_server_id from servers where invite_code = p_viewer_key;
  if v_server_id is null or v_server_id <> p_server_id then
    raise exception 'Invalid viewer key';
  end if;
  return query
    insert into death_records (boss_id, user_id, death_time, server_id, owner_guild_id)
    values (p_boss_id, auth.uid(), p_death_time, p_server_id, p_owner_guild_id)
    returning *;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."viewer_remove_attendance"("p_attendance_id" "uuid", "p_viewer_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_server_id uuid;
begin
  -- Validate viewer key against the attendance record's server
  select dr.server_id into v_server_id
  from attendance_records ar
  join death_records dr on dr.id = ar.death_record_id
  where ar.id = p_attendance_id;
  if not exists (select 1 from servers where invite_code = p_viewer_key and id = v_server_id) then
    raise exception 'Invalid viewer key';
  end if;
  delete from attendance_records where id = p_attendance_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."viewer_upsert_member"("p_name" "text", "p_server_id" "uuid", "p_viewer_key" "text") RETURNS SETOF "public"."members"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_server_id uuid;
  v_member_id uuid;
begin
  -- Validate viewer key
  select id into v_server_id from servers where invite_code = p_viewer_key;
  if v_server_id is null or v_server_id <> p_server_id then
    raise exception 'Invalid viewer key';
  end if;
  -- Upsert member
  select id into v_member_id from members where name = p_name;
  if v_member_id is null then
    return query insert into members (name) values (p_name) returning *;
  else
    return query select * from members where id = v_member_id;
  end if;
end;
$$;



-- ── Policies ──

CREATE POLICY "Admins can manage activity templates" ON "public"."activity_templates" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

CREATE POLICY "Admins can manage all activity_guilds" ON "public"."activity_guilds" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));

CREATE POLICY "Admins can manage boss templates" ON "public"."boss_templates" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

CREATE POLICY "Admins can manage catalog items" ON "public"."items" USING ((("server_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK ((("server_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Admins can manage games" ON "public"."games" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());

CREATE POLICY "Admins can manage gear slot categories" ON "public"."gear_slot_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));

CREATE POLICY "Admins can manage gear slots" ON "public"."gear_slots" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));

CREATE POLICY "Admins can manage item categories" ON "public"."item_categories" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));

CREATE POLICY "Admins can manage item rarities" ON "public"."item_rarities" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));

CREATE POLICY "Admins can read all activities" ON "public"."activities" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));

CREATE POLICY "Admins can read audit log" ON "public"."admin_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))));

CREATE POLICY "Anon can read viewer servers" ON "public"."servers" FOR SELECT USING (("viewer_key" IS NOT NULL));

CREATE POLICY "Anon users can read activities" ON "public"."activities" FOR SELECT USING (true);

CREATE POLICY "Anon users can read activity_instances" ON "public"."activity_instances" FOR SELECT USING (true);

CREATE POLICY "Anon users can read attendance" ON "public"."attendance_records" FOR SELECT USING (true);

CREATE POLICY "Anon users can read bosses" ON "public"."bosses" FOR SELECT USING (true);

CREATE POLICY "Anon users can read overrides" ON "public"."boss_spawn_overrides" FOR SELECT USING (true);

CREATE POLICY "Anyone can read activity templates" ON "public"."activity_templates" FOR SELECT USING (true);

CREATE POLICY "Anyone can read app settings" ON "public"."app_settings" FOR SELECT USING (true);

CREATE POLICY "Anyone can read boss templates" ON "public"."boss_templates" FOR SELECT USING (true);

CREATE POLICY "Anyone can read bosses" ON "public"."bosses" FOR SELECT USING (true);

CREATE POLICY "Anyone can read cp_updates" ON "public"."cp_updates" FOR SELECT USING (true);

CREATE POLICY "Anyone can read death records" ON "public"."death_records" FOR SELECT USING (true);

CREATE POLICY "Anyone can read distributions" ON "public"."distributions" FOR SELECT USING (true);

CREATE POLICY "Anyone can read games" ON "public"."games" FOR SELECT USING (true);

CREATE POLICY "Anyone can read gear slot categories" ON "public"."gear_slot_categories" FOR SELECT USING (true);

CREATE POLICY "Anyone can read gear slots" ON "public"."gear_slots" FOR SELECT USING (true);

CREATE POLICY "Anyone can read guilds" ON "public"."guilds" FOR SELECT USING (true);

CREATE POLICY "Anyone can read item categories" ON "public"."item_categories" FOR SELECT USING (true);

CREATE POLICY "Anyone can read item rarities" ON "public"."item_rarities" FOR SELECT USING (true);

CREATE POLICY "Anyone can read items" ON "public"."items" FOR SELECT USING (true);

CREATE POLICY "Anyone can read member_notes" ON "public"."member_notes" FOR SELECT USING (true);

CREATE POLICY "Anyone can read members" ON "public"."members" FOR SELECT USING (true);

CREATE POLICY "Anyone can read server_classes" ON "public"."server_classes" FOR SELECT USING (true);

CREATE POLICY "Anyone can read servers" ON "public"."servers" FOR SELECT USING (true);

CREATE POLICY "Authenticated can read test_cron_status" ON "public"."test_cron_status" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Authenticated users can create servers" ON "public"."servers" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Authenticated users can delete attendance" ON "public"."attendance_records" FOR DELETE TO "authenticated" USING (true);

CREATE POLICY "Authenticated users can delete death records" ON "public"."death_records" FOR DELETE TO "authenticated" USING (true);

CREATE POLICY "Authenticated users can delete members" ON "public"."members" FOR DELETE TO "authenticated" USING (true);

CREATE POLICY "Authenticated users can insert attendance" ON "public"."attendance_records" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Authenticated users can insert audit entries" ON "public"."admin_audit_log" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Authenticated users can insert members" ON "public"."members" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Authenticated users can insert snapshots" ON "public"."leaderboard_snapshots" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Authenticated users can manage discord_configs" ON "public"."discord_configs" TO "authenticated" USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read attendance" ON "public"."attendance_records" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Authenticated users can read death records" ON "public"."death_records" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Authenticated users can read server names" ON "public"."servers" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Authenticated users can read snapshots" ON "public"."leaderboard_snapshots" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "Authenticated users can update members" ON "public"."members" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);

CREATE POLICY "Members can insert items" ON "public"."items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "items"."server_id") AND ("sm"."user_id" = "auth"."uid"())))));

CREATE POLICY "Members can read server or game items" ON "public"."items" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "items"."server_id") AND ("sm"."user_id" = "auth"."uid"())))) OR (("game" IS NOT NULL) AND ("status" = 'approved'::"text")) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Moderator can read own permissions" ON "public"."moderator_permissions" FOR SELECT USING (("user_id" = "auth"."uid"()));

CREATE POLICY "Moderators can delete app settings" ON "public"."app_settings" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "app_settings"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Moderators can insert gear history" ON "public"."gear_upgrade_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."members" "m"
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "m"."server_id")))
  WHERE (("m"."id" = "gear_upgrade_history"."member_id") AND ("sm"."user_id" = "auth"."uid"())))));

CREATE POLICY "Moderators can manage classes" ON "public"."member_classes" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "member_classes"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "member_classes"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Moderators can manage gear catalog" ON "public"."gear_catalog" USING ((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "gear_catalog"."server_id") AND ("sm"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "gear_catalog"."server_id") AND ("sm"."user_id" = "auth"."uid"())))));

CREATE POLICY "Moderators can manage gear templates" ON "public"."gear_templates" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "gear_templates"."server_id") AND ("sm"."user_id" = "auth"."uid"())))) OR ( SELECT ((("current_setting"('request.jwt.claims'::"text", true))::"jsonb" ->> 'role'::"text") = 'service_role'::"text")))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "gear_templates"."server_id") AND ("sm"."user_id" = "auth"."uid"())))) OR ( SELECT ((("current_setting"('request.jwt.claims'::"text", true))::"jsonb" ->> 'role'::"text") = 'service_role'::"text"))));

CREATE POLICY "Moderators can manage items" ON "public"."items" USING ((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "items"."server_id") AND ("sm"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "items"."server_id") AND ("sm"."user_id" = "auth"."uid"())))));

CREATE POLICY "Moderators can manage member gear" ON "public"."member_gear" USING ((EXISTS ( SELECT 1
   FROM ("public"."members" "m"
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "m"."server_id")))
  WHERE (("m"."id" = "member_gear"."member_id") AND ("sm"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."members" "m"
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "m"."server_id")))
  WHERE (("m"."id" = "member_gear"."member_id") AND ("sm"."user_id" = "auth"."uid"())))));

CREATE POLICY "Moderators can manage server_classes" ON "public"."server_classes" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "server_classes"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "server_classes"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Moderators can update app settings" ON "public"."app_settings" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "app_settings"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Moderators can write app settings" ON "public"."app_settings" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "app_settings"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Moderators manage classes" ON "public"."server_classes" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "server_classes"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "server_classes"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Owner can manage permissions" ON "public"."moderator_permissions" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "moderator_permissions"."server_id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = 'owner'::"text")))) OR COALESCE("public"."is_admin"(), false))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "moderator_permissions"."server_id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = 'owner'::"text")))) OR COALESCE("public"."is_admin"(), false)));

CREATE POLICY "Owners and moderators can manage activity attendance" ON "public"."activity_attendance" USING (((EXISTS ( SELECT 1
   FROM (("public"."activity_instances" "ai"
     JOIN "public"."activities" "a" ON (("a"."id" = "ai"."activity_id")))
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "a"."server_id")))
  WHERE (("ai"."id" = "activity_attendance"."activity_instance_id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR "public"."is_admin"())) WITH CHECK (((EXISTS ( SELECT 1
   FROM (("public"."activity_instances" "ai"
     JOIN "public"."activities" "a" ON (("a"."id" = "ai"."activity_id")))
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "a"."server_id")))
  WHERE (("ai"."id" = "activity_attendance"."activity_instance_id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR "public"."is_admin"()));

CREATE POLICY "Owners can manage members" ON "public"."server_members" USING ((EXISTS ( SELECT 1
   FROM "public"."servers"
  WHERE (("servers"."id" = "server_members"."server_id") AND ("servers"."owner_id" = "auth"."uid"())))));

CREATE POLICY "Server members can delete boss assists" ON "public"."boss_assists" FOR DELETE USING ("public"."is_member_of_server"("server_id"));

CREATE POLICY "Server members can insert boss assists" ON "public"."boss_assists" FOR INSERT WITH CHECK ("public"."is_member_of_server"("server_id"));

CREATE POLICY "Server members can manage activity instances" ON "public"."activity_instances" USING (((EXISTS ( SELECT 1
   FROM ("public"."activities" "a"
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "a"."server_id")))
  WHERE (("a"."id" = "activity_instances"."activity_id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR COALESCE("public"."is_admin"(), false))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."activities" "a"
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "a"."server_id")))
  WHERE (("a"."id" = "activity_instances"."activity_id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR COALESCE("public"."is_admin"(), false)));

CREATE POLICY "Server members can manage app settings" ON "public"."app_settings" USING ("public"."is_member_of_server"("server_id")) WITH CHECK ("public"."is_member_of_server"("server_id"));

CREATE POLICY "Server members can read activities" ON "public"."activities" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "activities"."server_id") AND ("server_members"."user_id" = "auth"."uid"())))));

CREATE POLICY "Server members can read activity attendance" ON "public"."activity_attendance" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (("public"."activity_instances" "ai"
     JOIN "public"."activities" "a" ON (("a"."id" = "ai"."activity_id")))
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "a"."server_id")))
  WHERE (("ai"."id" = "activity_attendance"."activity_instance_id") AND ("sm"."user_id" = "auth"."uid"())))) OR "public"."is_admin"()));

CREATE POLICY "Server members can read activity_assists" ON "public"."activity_assists" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "activity_assists"."server_id") AND ("server_members"."user_id" = "auth"."uid"())))));

CREATE POLICY "Server members can read activity_guilds" ON "public"."activity_guilds" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."activities"
  WHERE (("activities"."id" = "activity_guilds"."activity_id") AND (EXISTS ( SELECT 1
           FROM "public"."server_members"
          WHERE (("server_members"."server_id" = "activities"."server_id") AND ("server_members"."user_id" = "auth"."uid"()))))))));

CREATE POLICY "Server members can read adjustments" ON "public"."point_adjustments" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "point_adjustments"."server_id") AND ("server_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server members can read boss assists" ON "public"."boss_assists" FOR SELECT USING ("public"."is_member_of_server"("server_id"));

CREATE POLICY "Server members can read boss guilds" ON "public"."boss_guilds" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."bosses" "b"
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "b"."server_id")))
  WHERE (("b"."id" = "boss_guilds"."boss_id") AND ("sm"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server members can read classes" ON "public"."member_classes" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "member_classes"."server_id") AND ("server_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server members can read cp_updates" ON "public"."cp_updates" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "cp_updates"."server_id") AND ("server_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server members can read death records" ON "public"."death_records" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "death_records"."server_id") AND ("sm"."user_id" = "auth"."uid"())))) OR ("auth"."uid"() = "user_id")));

CREATE POLICY "Server members can read distributions" ON "public"."distributions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "distributions"."server_id") AND ("server_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server members can read member_notes" ON "public"."member_notes" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "member_notes"."server_id") AND ("server_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server members can read memberships" ON "public"."server_members" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server members can read overrides" ON "public"."boss_spawn_overrides" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "boss_spawn_overrides"."server_id") AND ("server_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server members can read party members" ON "public"."static_party_members" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."static_parties" "sp"
     JOIN "public"."server_members" "sm" ON ((("sm"."server_id" = "sp"."server_id") AND ("sm"."user_id" = "auth"."uid"()))))
  WHERE ("sp"."id" = "static_party_members"."party_id"))) OR "public"."is_admin"()));

CREATE POLICY "Server members can read point rules" ON "public"."point_rules" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "point_rules"."server_id") AND ("server_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server members can read static parties" ON "public"."static_parties" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "static_parties"."server_id") AND ("server_members"."user_id" = "auth"."uid"())))) OR "public"."is_admin"()));

CREATE POLICY "Server members can update death records" ON "public"."death_records" FOR UPDATE USING ("public"."is_member_of_server"("server_id")) WITH CHECK ("public"."is_member_of_server"("server_id"));

CREATE POLICY "Server members can view gear catalog" ON "public"."gear_catalog" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "gear_catalog"."server_id") AND ("sm"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."servers" "s"
  WHERE (("s"."id" = "gear_catalog"."server_id") AND ("s"."viewer_key" IS NOT NULL))))));

CREATE POLICY "Server members can view gear history" ON "public"."gear_upgrade_history" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."members" "m"
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "m"."server_id")))
  WHERE (("m"."id" = "gear_upgrade_history"."member_id") AND ("sm"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."members" "m"
     JOIN "public"."servers" "s" ON (("s"."id" = "m"."server_id")))
  WHERE (("m"."id" = "gear_upgrade_history"."member_id") AND ("s"."viewer_key" IS NOT NULL))))));

CREATE POLICY "Server members can view gear templates" ON "public"."gear_templates" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "gear_templates"."server_id") AND ("sm"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."servers" "s"
  WHERE (("s"."id" = "gear_templates"."server_id") AND ("s"."viewer_key" IS NOT NULL))))));

CREATE POLICY "Server members can view member gear" ON "public"."member_gear" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."members" "m"
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "m"."server_id")))
  WHERE (("m"."id" = "member_gear"."member_id") AND ("sm"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."members" "m"
     JOIN "public"."servers" "s" ON (("s"."id" = "m"."server_id")))
  WHERE (("m"."id" = "member_gear"."member_id") AND ("s"."viewer_key" IS NOT NULL))))));

CREATE POLICY "Server members read classes" ON "public"."server_classes" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "server_classes"."server_id") AND ("server_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can delete cp_updates" ON "public"."cp_updates" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "cp_updates"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can insert cp_updates" ON "public"."cp_updates" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "cp_updates"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can manage activities" ON "public"."activities" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "activities"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR COALESCE("public"."is_admin"(), false))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "activities"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR COALESCE("public"."is_admin"(), false)));

CREATE POLICY "Server moderators can manage activity_assists" ON "public"."activity_assists" USING ((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "activity_assists"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))));

CREATE POLICY "Server moderators can manage activity_guilds" ON "public"."activity_guilds" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."activities" "a"
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "a"."server_id")))
  WHERE (("a"."id" = "activity_guilds"."activity_id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))));

CREATE POLICY "Server moderators can manage adjustments" ON "public"."point_adjustments" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "point_adjustments"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "point_adjustments"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can manage app settings" ON "public"."app_settings" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "app_settings"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "app_settings"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can manage boss guilds" ON "public"."boss_guilds" USING (((EXISTS ( SELECT 1
   FROM ("public"."bosses" "b"
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "b"."server_id")))
  WHERE (("b"."id" = "boss_guilds"."boss_id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."bosses" "b"
     JOIN "public"."server_members" "sm" ON (("sm"."server_id" = "b"."server_id")))
  WHERE (("b"."id" = "boss_guilds"."boss_id") AND ("sm"."user_id" = "auth"."uid"()) AND ("sm"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can manage classes" ON "public"."member_classes" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "member_classes"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can manage distributions" ON "public"."distributions" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "distributions"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "distributions"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can manage guilds" ON "public"."guilds" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "guilds"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "guilds"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can manage items" ON "public"."items" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "items"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "items"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can manage member_notes" ON "public"."member_notes" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "member_notes"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "member_notes"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can manage overrides" ON "public"."boss_spawn_overrides" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "boss_spawn_overrides"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "boss_spawn_overrides"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can manage point rules" ON "public"."point_rules" USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "point_rules"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "point_rules"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server moderators can update cp_updates" ON "public"."cp_updates" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "cp_updates"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "cp_updates"."server_id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = ANY (ARRAY['owner'::"text", 'moderator'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server owners can delete their server" ON "public"."servers" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "servers"."id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = 'owner'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server owners can manage memberships" ON "public"."server_members" USING (((EXISTS ( SELECT 1
   FROM "public"."servers"
  WHERE (("servers"."id" = "server_members"."server_id") AND ("servers"."owner_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text")))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."servers"
  WHERE (("servers"."id" = "server_members"."server_id") AND ("servers"."owner_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server owners can update their server" ON "public"."servers" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."server_members"
  WHERE (("server_members"."server_id" = "servers"."id") AND ("server_members"."user_id" = "auth"."uid"()) AND ("server_members"."role" = 'owner'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));

CREATE POLICY "Server owners can view payments" ON "public"."payments" FOR SELECT USING ((("auth"."uid"() IN ( SELECT "s"."owner_id"
   FROM "public"."servers" "s"
  WHERE ("s"."id" = "payments"."server_id"))) OR ("auth"."uid"() IN ( SELECT "sm"."user_id"
   FROM "public"."server_members" "sm"
  WHERE (("sm"."server_id" = "payments"."server_id") AND ("sm"."role" = 'owner'::"text"))))));

CREATE POLICY "Service can insert notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can insert payments" ON "public"."payments" FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can read discord_configs" ON "public"."discord_configs" FOR SELECT TO "authenticated", "anon" USING (true);

CREATE POLICY "Users can insert their own death records" ON "public"."death_records" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));

CREATE POLICY "Users can join servers" ON "public"."server_members" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));

CREATE POLICY "Users can manage discord_configs" ON "public"."discord_configs" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));

CREATE POLICY "Users can read own memberships" ON "public"."server_members" FOR SELECT USING (("user_id" = "auth"."uid"()));

CREATE POLICY "Users can read own role" ON "public"."user_roles" FOR SELECT USING (("user_id" = "auth"."uid"()));

CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update their own death records" ON "public"."death_records" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Viewers can read items" ON "public"."items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."servers" "s"
  WHERE (("s"."id" = "items"."server_id") AND ("s"."viewer_key" IS NOT NULL)))));

CREATE POLICY "Viewers can read members" ON "public"."members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."servers" "s"
  WHERE (("s"."id" = "members"."server_id") AND ("s"."viewer_key" IS NOT NULL)))));

CREATE POLICY "collection_items_delete" ON "public"."item_collection_items" FOR DELETE USING (("collection_id" IN ( SELECT "item_collections"."id"
   FROM "public"."item_collections"
  WHERE ("item_collections"."server_id" IN ( SELECT "servers"."id"
           FROM "public"."servers")))));

CREATE POLICY "collection_items_insert" ON "public"."item_collection_items" FOR INSERT WITH CHECK (("collection_id" IN ( SELECT "item_collections"."id"
   FROM "public"."item_collections"
  WHERE ("item_collections"."server_id" IN ( SELECT "servers"."id"
           FROM "public"."servers")))));

CREATE POLICY "collection_items_select" ON "public"."item_collection_items" FOR SELECT USING (("collection_id" IN ( SELECT "item_collections"."id"
   FROM "public"."item_collections"
  WHERE ("item_collections"."server_id" IN ( SELECT "servers"."id"
           FROM "public"."servers")))));

CREATE POLICY "collection_items_update" ON "public"."item_collection_items" FOR UPDATE USING (("collection_id" IN ( SELECT "item_collections"."id"
   FROM "public"."item_collections"
  WHERE ("item_collections"."server_id" IN ( SELECT "servers"."id"
           FROM "public"."servers")))));

CREATE POLICY "collections_server_delete" ON "public"."item_collections" FOR DELETE USING (("server_id" IN ( SELECT "servers"."id"
   FROM "public"."servers")));

CREATE POLICY "collections_server_insert" ON "public"."item_collections" FOR INSERT WITH CHECK (("server_id" IN ( SELECT "servers"."id"
   FROM "public"."servers")));

CREATE POLICY "collections_server_select" ON "public"."item_collections" FOR SELECT USING (("server_id" IN ( SELECT "servers"."id"
   FROM "public"."servers")));

CREATE POLICY "collections_server_update" ON "public"."item_collections" FOR UPDATE USING (("server_id" IN ( SELECT "servers"."id"
   FROM "public"."servers")));

CREATE POLICY "manual_ownership_delete" ON "public"."item_collection_manual_ownership" FOR DELETE USING (("collection_id" IN ( SELECT "item_collections"."id"
   FROM "public"."item_collections"
  WHERE ("item_collections"."server_id" IN ( SELECT "servers"."id"
           FROM "public"."servers")))));

CREATE POLICY "manual_ownership_insert" ON "public"."item_collection_manual_ownership" FOR INSERT WITH CHECK (("collection_id" IN ( SELECT "item_collections"."id"
   FROM "public"."item_collections"
  WHERE ("item_collections"."server_id" IN ( SELECT "servers"."id"
           FROM "public"."servers")))));

CREATE POLICY "manual_ownership_select" ON "public"."item_collection_manual_ownership" FOR SELECT USING (("collection_id" IN ( SELECT "item_collections"."id"
   FROM "public"."item_collections"
  WHERE ("item_collections"."server_id" IN ( SELECT "servers"."id"
           FROM "public"."servers")))));

CREATE POLICY "manual_ownership_update" ON "public"."item_collection_manual_ownership" FOR UPDATE USING (("collection_id" IN ( SELECT "item_collections"."id"
   FROM "public"."item_collections"
  WHERE ("item_collections"."server_id" IN ( SELECT "servers"."id"
           FROM "public"."servers")))));



-- ── Triggers ──
