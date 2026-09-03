// ── Shared Activity Log detail formatter ────────────────────
//
// Both audit views used to carry their own copy of this switch. AdminPanelView's
// was a fork that stopped being maintained: it labelled 86 actions to
// ServerSettingsView's 119, so ~35 actions rendered as raw key-value dumps for
// super-admins while reading correctly for server owners. This is the complete
// version, imported by both, so a new action can never be labelled in one view
// and not the other.
//
// timeZone is the only thing the two views differ on: server settings renders in
// the server's timezone, the super-admin panel in UTC.

export function formatAuditDetails(entry: any, timeZone: string = "UTC"): string {
  const d = entry.details || {};
  // Game taxonomy/template entries carry their entity in details.kind ("rarity",
  // "gear slot", "boss"…), which reads better sentence-initial.
  const cap = (s?: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "Item");
  const fmtTime = (iso: string) => {
    try { return new Date(iso).toLocaleString("en-US", { timeZone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };
  switch (entry.action) {
    case "boss_kill": return `${d.boss_name || "?"} — ${d.attendees ?? 0} attendees${d.guild ? ` (${d.guild})` : ""}`;
    case "attendance_copy": return `Copied ${d.copied ?? 0} attendees from ${d.from_boss || "?"}${d.from_time ? ` (${d.from_time})` : ""} → ${d.to_boss || "?"}${d.to_time ? ` (${d.to_time})` : ""}${d.skipped ? ` (${d.skipped} skipped)` : ""}`;
    case "attendance_add": return `${d.member_name || "?"} attended ${d.boss_name || "?"}${d.death_time ? ` (${fmtTime(d.death_time)})` : ""}`;
    case "attendance_remove": return `${d.member_name || "?"} removed from ${d.boss_name || "?"}${d.death_time ? ` (${fmtTime(d.death_time)})` : ""}`;
    case "member_cp_add": case "member_cp_update": return `${d.player_name || "?"}: ${d.old_cp != null ? Number(d.old_cp).toLocaleString() : "—"} → ${d.new_cp != null ? Number(d.new_cp).toLocaleString() : "?"}${d.discord_username ? ` · Discord: ${d.discord_username}` : ""}${d.date ? ` · ${new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`;
    case "member_cp_delete": return `Deleted CP update for ${d.player_name || "?"}`;
    case "member_cp_reminder": return `CP update reminder sent to Discord`;
    case "member_add": return `${d.member_name || "—"}${d.class ? ` · ${d.class}` : ""}${d.cp ? ` · ${d.cp} CP` : ""}${d.guild_name ? ` · ${d.guild_name}` : ""}`;
    case "member_remove": return d.member_name || "Member removed";
    case "member_claim_accept": return `Claim accepted: ${d.requested_name || "?"}${d.user_email ? ` (${d.user_email})` : ""}`;
    case "member_unlink": return `Unlinked from user: ${d.member_name || "?"}`;
    case "member_claim_decline": return `Claim declined: ${d.requested_name || "?"}${d.user_email ? ` (${d.user_email})` : ""}${d.reason ? ` — ${d.reason}` : ""}`;
    case "member_class_set": return `${d.member_name || "?"}: class set to ${d.class || "none"}`;
    case "member_active_toggle": return `${d.member_name || "?"} marked ${d.is_active ? "active" : "inactive"}`;
    case "member_guild_change": return `${d.member_name || "?"}: guild changed from ${d.old_guild || "?"} to ${d.new_guild || "?"}`;
    case "member_name_edit": return `"${d.old_name || "?"}" renamed to "${d.new_name || "?"}"`;
    case "member_bulk_add": return `${d.count ?? 0} members added${d.guild_name ? ` to ${d.guild_name}` : ""}${d.names ? `: ${(d.names as string[]).slice(0, 5).join(", ")}${(d.names as string[]).length > 5 ? ` +${(d.names as string[]).length - 5} more` : ""}` : ""}`;
    case "member_note_add": return d.note_preview || "—";
    case "member_note_delete": return `Deleted note`;
    case "moderator_add": return d.target_email || "Moderator added";
    case "moderator_remove": return d.target_email || "Moderator removed";
    case "mod_perms_update": return d.target_email || d.target_user_id?.substring(0,8) + "…" || "—";
    case "ownership_transfer": return `Owner changed`;
    case "boss_create": case "boss_update": return `${d.boss_name || d.name || "—"}${d.spawn_type ? ` · ${d.spawn_type}` : ""}${d.respawn_hours ? ` · ${d.respawn_hours}h` : ""}${d.points != null ? ` · ${d.points}pts` : ""}${d.changes ? ` · ${d.changes}` : ""}`;
    case "boss_delete": return d.boss_name || d.name || "—";
    case "boss_toggle": return `${d.boss_name || "?"} ${d.enabled ? "enabled" : "disabled"}`;
    case "boss_time_edit": return `${d.boss_name || d.activity_name || "?"}: ${d.old_time && d.new_time ? `${d.old_time} → ${d.new_time}` : d.new_time ? `changed to ${d.new_time}` : "time changed"}${d.direction ? ` (${d.direction > 0 ? "+" : ""}${d.direction})` : ""}`;
    case "boss_rotation_advance": return `${d.boss_name || "?"}: rotation advanced${d.target_guild ? ` to ${d.target_guild}` : ""}${d.mode ? ` (${d.mode})` : ""}`;
    case "boss_guilds_set": return `Boss guilds updated${d.boss_name ? ` for "${d.boss_name}"` : ""}${d.guild_count ? ` (${d.guild_count} guilds, ${d.mode})` : ""}`;
    case "boss_spawn_set": return `${d.boss_name || "?"}: spawn set to ${d.spawn_date || "?"}`;
    case "activity_create": case "activity_update": return `${d.activity_name || d.name || "—"}${d.schedule_type ? ` · ${d.schedule_type}` : ""}${d.points != null ? ` · ${d.points}pts` : ""}${d.party_size ? ` · ${d.party_size}p` : ""}${d.changes ? ` · ${d.changes}` : ""}`;
    case "activity_delete": return d.activity_name || d.name || "—";
    case "activity_toggle": return `${d.activity_name || "?"} ${d.enabled ? "enabled" : "disabled"}${d.reason ? ` (${d.reason})` : ""}`;
    case "activity_time_edit": return `Activity time edited${d.activity_name ? ` for "${d.activity_name}"` : ""}`;
    case "activity_finalize": case "activity_end_record": return `${d.activity_name || "?"} completed${d.attendees ? ` (${d.attendees} attendees)` : ""}${d.attendee_names ? `: ${d.attendee_names}` : ""}${d.end_time ? ` at ${d.end_time}` : ""}`;
    case "activity_guilds_set": return `Activity guilds updated${d.activity_name ? ` for "${d.activity_name}"` : ""}${d.guild_count ? ` (${d.guild_count} guilds, ${d.mode})` : ""}`;
    case "activity_rotation_advance": return `Activity rotation advanced${d.activity_name ? ` for "${d.activity_name}"` : ""}${d.rotated_to ? ` → ${d.rotated_to}` : ""}`;
    case "boss_guild_points_edit": return `${d.boss_name || "?"} · ${d.guild_name || "?"}: points → ${d.points ?? "—"}`;
    case "boss_guild_salary_edit": return `${d.boss_name || "?"} · ${d.guild_name || "?"}: salary ${d.has_salary ? "ON" : "OFF"}`;
    case "boss_guild_salary_batch": return `${d.guild_name || "?"}: salary ${d.has_salary ? "ON" : "OFF"} for ${d.boss_count ?? 0} bosses`;
    case "boss_assist_toggle": return `${d.boss_name || "?"}: ${d.assistant_guild || "?"} ${d.added ? "added as" : "removed from"} assist${d.owner_guild ? ` (owner: ${d.owner_guild})` : ""}`;
    case "activity_guild_points_edit": return `${d.activity_name || "?"} · ${d.guild_name || "?"}: points → ${d.points ?? "—"}`;
    case "activity_guild_salary_edit": return `${d.activity_name || "?"} · ${d.guild_name || "?"}: salary ${d.has_salary ? "ON" : "OFF"}`;
    case "activity_assist_toggle": return `${d.activity_name || "?"}: ${d.assistant_guild || "?"} ${d.added ? "added as" : "removed from"} assist${d.owner_guild ? ` (owner: ${d.owner_guild})` : ""}`;
    case "guild_create": return `Guild "${d.guild_name || "?"}" created`;
    case "guild_update": return `Guild "${d.old_name || "?"}" → "${d.guild_name || "?"}"`;
    case "guild_delete": return `Guild "${d.guild_name || "?"}" deleted`;
    case "gear_equip": return d.changes ? `${d.member_name || "?"} · ${(d.changes as string[]).join(" · ")}` : `${d.member_name || "?"} equipped ${d.item_name || "?"}${d.enhancement ? ` (+${d.enhancement})` : ""}`;
    case "item_create": return `${d.item_name || d.name || "?"}${d.rarity ? ` · ${d.rarity}` : ""}${d.category ? ` · ${d.category}` : ""}${d.game ? ` · ${d.game}` : ""}${d.description ? ` · ${d.description}` : ""}${d.has_image !== undefined ? (d.has_image ? " · with image" : " · no image") : ""}`;
    case "item_update": case "item_delete": return d.item_name || d.name || "—";
    case "item_distribute": return `${d.item_name || "?"} → ${d.player_name || "?"}${d.quantity ? ` x${d.quantity}` : ""}${d.reason ? ` · ${d.reason}` : ""}`;
    case "item_distribute_delete": return `Distribution deleted: ${d.item_name || "?"} → ${d.player_name || "?"}${d.quantity ? ` x${d.quantity}` : ""}`;
    case "item_approve": case "item_reject": return d.item_name || "—";
    case "collection_create": return `${d.collection_name || "?"} created`;
    case "collection_delete": return `${d.collection_name || "?"} deleted`;
    case "collection_item_add": return `${d.item_name || "?"} added to ${d.collection_name || "collection"}`;
    case "collection_item_remove": return `${d.item_name || "?"} removed from ${d.collection_name || "collection"}`;
    case "collection_ownership_set": return `${d.player_name || "?"} ${d.owned ? "obtained" : "lost"} ${d.item_name || "?"}${d.collection_name ? ` in ${d.collection_name}` : ""}`;
    case "collection_ownership_remove": return `${d.player_name || "?"} ownership override removed for ${d.item_name || "?"}${d.collection_name ? ` in ${d.collection_name}` : ""}`;
    case "party_create": return `${d.party_name || d.name || "—"}${d.guild_name ? ` · ${d.guild_name}` : ""}${d.member_count ? ` · ${d.member_count} members` : ""}${d.boss_name && d.boss_name !== "—" ? ` · ${d.boss_name}` : ""}`;
    case "party_delete": return d.party_name || "Party deleted";
    case "party_assign": return `${d.party_name || "?"}${d.guild_name ? ` (${d.guild_name})` : ""} assigned to ${d.boss_name || d.activity_name || "?"}`;
    case "party_unlink": return `${d.party_name || "?"}${d.guild_name ? ` (${d.guild_name})` : ""} unlinked from ${d.boss_name || "?"}`;
    case "party_member_add": return `${d.member_name || "?"} added to ${d.party_name || "party"}`;
    case "party_member_remove": return `${d.member_name || "?"} removed from ${d.party_name || "party"}`;
    case "party_leaders_set": return `Party leaders set for ${d.boss_name || "?"}: ${d.leaders || "—"}`;
    case "looted_by_set": return `Looted by set for ${d.boss_name || "?"}: ${d.looted_by || "—"}`;
    case "class_create": return `${d.class_name || d.name || "?"} created${d.icon ? ` · icon: ${d.icon}` : ""}${d.color ? ` · color: ${d.color}` : ""}`;
    case "class_delete": return `${d.class_name || d.name || "?"} deleted`;
    case "rally_image_delete": return `Deleted screenshot`;
    case "leaderboard_finalize": return `${d.period || "?"}: ${d.rankings ?? 0} players · ${d.from || "?"} → ${d.to || "?"}`;
    case "leaderboard_reset": return `${d.unfinalized ? "Undo finalization" : "Finalized"}${d.guild ? ` (${d.guild})` : ""}${d.period ? ` · ${d.period.replace("weekly:", "Weekly ")}` : ""} · ${d.from ? new Date(d.from).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?"} → ${d.to ? new Date(d.to).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "?"}`;
    case "leaderboard_adjust_points": return `${d.member_name ? d.member_name + ": " : ""}${d.points != null ? (d.points > 0 ? "+" : "") + d.points + " pts" : "?"}${d.reason ? ` — ${d.reason}` : ""}`;
    case "leaderboard_reset_guild": return `${d.guild_name || "?"} guild points reset: ${d.deleted_attendance ?? 0} attendance, ${d.deleted_adjustments ?? 0} adjustments`;
    case "point_rule_create": case "point_rule_update": return `Point rule for ${d.guild_name || "?"}: ${d.enabled !== undefined ? (d.enabled ? "enabled" : "disabled") : `${d.multiplier ?? "?"}x · ${d.start_hour ?? "?"}:00–${d.end_hour ?? "?"}:00`}`;
    case "point_rule_delete": return `Point rule for ${d.guild_name || "?"} deleted`;
    case "death_guild_set": return `${d.boss_name || "?"}: owner guild changed from ${d.old_guild || "?"} to ${d.new_guild || "?"}${d.death_time ? ` · ${fmtTime(d.death_time)}` : ""}`;
    case "death_guild_clear": return `${d.boss_name || "?"}: display guild cleared`;
    case "death_time_edit": return `${d.boss_name || "?"}: spawn set to ${d.new_time ? fmtTime(d.new_time) : (d.formatted_time || "?")}`;
    case "settings_update": {
      const entries = Object.entries(d).filter(([k]) => k !== "discord_user");
      return entries.map(([k,v]) => `${k.replace(/_/g, " ")}: ${v}`).join(", ") || "Settings updated";
    }
    case "viewer_edit_toggle": return `Viewer can edit spawns: ${d.enabled ? "ON" : "OFF"}`;
    case "viewer_mark_died_toggle": return `Viewer can mark died: ${d.enabled ? "ON" : "OFF"}`;
    case "invite_regenerate": return "Regenerated invite code";
    case "viewer_key_regenerate": return "Regenerated viewer key";
    case "seed_from_game": return `${d.game_name || "?"}: ${d.bosses ?? 0} bosses, ${d.activities ?? 0} activities seeded`;
    case "force_spawn": return `${d.boss_name || d.activity_name || `${d.boss_count ?? 0} bosses`} force-spawned`;
    case "subscription_extend": return `+${d.days ?? 30} days`;
    case "dkp_config_update": return `DKP settings: ${d.enabled !== undefined ? (d.enabled ? "enabled" : "disabled") : ""}${d.dkp_multiplier != null ? ` · ${d.dkp_multiplier}x` : ""}${d.bid_duration_minutes != null ? ` · ${d.bid_duration_minutes}min bids` : ""}`;
    case "dkp_adjust": return `${d.member_name || "?"}: ${d.amount != null ? (d.amount > 0 ? "+" : "") + d.amount + " DKP" : "?"}${d.reason ? ` — ${d.reason}` : ""}`;
    case "dkp_bid_placed": return `${d.member_name || "?"}: bid ${d.bid_amount ?? "?"} DKP on ${d.item_name || "?"}`;
    case "dkp_bid_cancelled": return `${d.member_name || "?"}: cancelled bid on ${d.item_name || "?"} (+${d.bid_amount ?? "?"} DKP refunded)`;
    case "dkp_bid_won": return `${d.member_name || "?"}: won ${d.item_name || "?"} for ${d.bid_amount ?? "?"} DKP`;
    case "dkp_item_marked": return `${d.item_name || "?"}: marked for bid · ${d.dkp_cost ?? "?"} DKP`;
    case "game_create": case "game_update": case "game_delete": return d.game_name || "—";
    case "game_taxonomy_create": return `${cap(d.kind)} "${d.name || "?"}" created${d.game ? ` · ${d.game}` : ""}`;
    case "game_taxonomy_update": return `${cap(d.kind)} ${d.old_name && d.old_name !== d.name ? `"${d.old_name}" → "${d.name || "?"}"` : `"${d.name || "?"}" updated`}${d.game ? ` · ${d.game}` : ""}`;
    case "game_taxonomy_delete": return `${cap(d.kind)} "${d.name || "?"}" deleted${d.game ? ` · ${d.game}` : ""}`;
    case "game_template_create": return `${cap(d.kind)} template "${d.name || "?"}" created`;
    case "game_template_update": return `${cap(d.kind)} template ${d.old_name && d.old_name !== d.name ? `"${d.old_name}" → "${d.name || "?"}"` : `"${d.name || "?"}" updated`}`;
    case "game_template_delete": return `${cap(d.kind)} template "${d.name || "?"}" deleted`;
    case "server_create": case "server_delete": case "server_restore": return d.server_name || "—";
    case "discord_link_add": return `Linked Discord server ${d.discord_guild_id || "?"}${d.label ? ` ("${d.label}")` : ""} · prefix "${d.prefix || "!"}"`;
    case "discord_link_remove": return `Unlinked Discord server ${d.discord_guild_id || "?"}`;
    case "discord_channels_set": return `Channels updated${d.alert ? ` · alert: ${d.alert}` : ""}${d.command ? ` · command: ${d.command}` : ""}${d.progress ? ` · progress: ${d.progress}` : ""}`;
    case "discord_channel_clear": return `Cleared ${d.field || "?"} channel${d.value ? ` (was: ${d.value})` : ""}`;
    case "discord_threads_set": return `Auto-threads configured${d.channel ? ` · channel: ${d.channel}` : ""}${d.guild_count ? ` · ${d.guild_count} guilds` : ""}`;
    case "discord_aliases_set": {
      if (d.changes && typeof d.changes === "object") {
        const entries = Object.entries(d.changes as Record<string, { old: string; new: string }>);
        if (entries.length === 0) return "No alias changes";
        return entries.map(([cmd, c]) => `${cmd}: "${c.old}" → "${c.new}"`).join(" · ");
      }
      return `${d.count ?? 0} aliases updated`;
    }
    case "discord_ping_set": return `Notification ping set to "${d.ping || "(default)"}"`;
    // dkp_item_distributed has 1,082 rows in production and had no label in
    // either view, so every one of them rendered as a raw key dump.
    case "dkp_item_distributed": return `${d.item_name || "?"} → ${d.recipient_name || d.winner_name || "?"}${d.quantity ? ` x${d.quantity}` : ""}${d.winning_bid != null ? ` · ${d.winning_bid} DKP` : ""}`;
    case "dkp_auction_deleted": return `Auction deleted${d.item_name ? `: ${d.item_name}` : ""}${d.bid_count != null ? ` (${d.bid_count} bids)` : ""}`;
    case "maintenance_on": return `Maintenance mode ON${d.message ? ` — ${d.message}` : ""}`;
    case "maintenance_off": return "Maintenance mode OFF";
    case "rally_image_add": return `Rally screenshot added${d.boss_name ? ` to ${d.boss_name}` : ""}`;
    case "rally_scan_save": return `Rally scan saved${d.boss_name ? ` for ${d.boss_name}` : ""}${d.detected != null ? ` · ${d.detected} names detected` : ""}`;
    default: return Object.entries(d).filter(([k]) => k !== "discord_user").slice(0, 2).map(([k,v]) => `${k}: ${v}`).join(", ") || "—";
  }
}
