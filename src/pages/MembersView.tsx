import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useMembers } from "@/hooks/useMembers";
import { useAuth } from "@/contexts/AuthContext";
import { updateMemberName, deleteMember, upsertMember, isSupabaseConfigured, fetchGuilds, setMemberGuild, bulkAddMembers, supabase, fetchStaticParties, createParty, deleteParty, addMemberToParty, removeMemberFromParty, type StaticParty } from "@/lib/supabase";
import { useServerId, useHasPermission } from "@/contexts/ServerContext";
import type { Guild } from "@/types";
import { Users, Plus, Pencil, Trash2, Loader2, X, Check, UserPlus, CheckCircle, AlertTriangle, Image, Upload, Copy, Shield, Search } from "lucide-react";
import type { Member } from "@/types";
import { guildColor } from "@/lib/constants";

export function MembersView() {
  const { user } = useAuth();
  const serverId = useServerId();
  const canManageRaidMembers = useHasPermission("can_manage_members");
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();
  const { data: members = [], isLoading } = useMembers();

  const [searchParams] = useSearchParams();

  // Highlight member input when navigated from banner
  const memberInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (highlight === "add-member" && memberInputRef.current) {
      setTimeout(() => {
        memberInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        memberInputRef.current?.classList.add("animate-highlight-input");
        memberInputRef.current?.focus();
      }, 200);
      // Remove the highlight param from URL without reload
      const params = new URLSearchParams(searchParams);
      params.delete("highlight");
      window.history.replaceState(null, "", `?${params.toString()}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [addName, setAddName] = useState("");
  const [addCombatPower, setAddCombatPower] = useState("");
  const [addClass, setAddClass] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Guilds
  const [guilds, setGuilds] = useState<Guild[]>([]);

  // Classes — managed per server
  const [classes, setClasses] = useState<string[]>([]);
  const [newClassName, setNewClassName] = useState("");

  // Static parties
  const [parties, setParties] = useState<StaticParty[]>([]);
  const [newPartyName, setNewPartyName] = useState("");
  const [newPartyGuild, setNewPartyGuild] = useState("");
  const [membersTab, setMembersTab] = useState<"members" | "parties">("members");

  const refreshParties = () => {
    if (serverId) fetchStaticParties(serverId).then(setParties).catch(() => {});
  };

  const handleCreateParty = async () => {
    const name = newPartyName.trim();
    if (!name) return;
    try {
      await createParty(name, newPartyGuild || null);
      setNewPartyName("");
      setNewPartyGuild("");
      refreshParties();
    } catch {}
  };

  useEffect(() => {
    fetchGuilds(serverId).then(setGuilds).catch(() => setGuilds([]));
    if (serverId) {
      supabase.rpc("get_member_classes", { p_server_id: serverId })
        .then(({ data }) => { if (data) setClasses(data as string[]); })
        .catch(() => setClasses([]));
      fetchStaticParties(serverId).then(setParties).catch(() => setParties([]));
    }
  }, [serverId]);

  const handleAddClass = async () => {
    const name = newClassName.trim();
    if (!name || classes.includes(name)) return;
    const updated = [...classes, name];
    setClasses(updated);
    setNewClassName("");
    if (serverId) {
      await supabase.rpc("set_member_classes", { p_server_id: serverId, p_classes: updated });
    }
  };

  const handleRemoveClass = async (name: string) => {
    const updated = classes.filter(c => c !== name);
    setClasses(updated);
    if (serverId) {
      await supabase.rpc("set_member_classes", { p_server_id: serverId, p_classes: updated });
    }
  };

  // Guild selection for add / bulk
  const [addGuild, setAddGuild] = useState<string>("");

  // Bulk add
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkNames, setBulkNames] = useState("");
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkGuild, setBulkGuild] = useState<string>("");
  const [searchText, setSearchText] = useState("");

  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
  }, []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["members"] });

  // Sort members by guild, then by name
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const ga = guilds.find(g => g.id === a.guild_id)?.name ?? "zzz";
      const gb = guilds.find(g => g.id === b.guild_id)?.name ?? "zzz";
      if (ga !== gb) return ga.localeCompare(gb);
      return a.name.localeCompare(b.name);
    });
  }, [members, guilds]);

  // Filter by search text
  const filteredMembers = useMemo(() => {
    if (!searchText.trim()) return sortedMembers;
    const q = searchText.toLowerCase();
    return sortedMembers.filter(m => m.name.toLowerCase().includes(q));
  }, [sortedMembers, searchText]);

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name) return;

    // Prevent duplicates (case-insensitive)
    if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      showToast("error", `"${name}" already exists`);
      return;
    }

    setAdding(true);
    try {
      await upsertMember(name, addGuild || null, addCombatPower ? Number(addCombatPower) : null, addClass || null);
      setAddName("");
      setAddCombatPower("");
      setAddClass("");
      invalidate();
      showToast("success", `"${name}" added`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAdding(false);
    }
  };

  // Parse bulk names: deduplicate, split by newline
  const parsedNames = bulkNames
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  const existingNames = new Set(members.map((m) => m.name.toLowerCase()));
  const newNames = [...new Set(parsedNames.map((n) => n.toLowerCase()))]
    .filter((n) => !existingNames.has(n))
    .map((n) => parsedNames.find((p) => p.toLowerCase() === n)!);
  const alreadyExisting = [...new Set(parsedNames.map((n) => n.toLowerCase()))]
    .filter((n) => existingNames.has(n))
    .map((n) => parsedNames.find((p) => p.toLowerCase() === n)!);

  const handleBulkAdd = async () => {
    if (newNames.length === 0) return;
    setBulkAdding(true);
    let added = 0;
    try {
      added = await bulkAddMembers(newNames, bulkGuild || null);
    } catch { /* keep 0 */ }
    setBulkAdding(false);
    setShowBulkModal(false);
    setBulkNames("");
    setBulkGuild("");
    invalidate();
    const guildLabel = bulkGuild ? guilds.find(g => g.id === bulkGuild)?.name : "";
    showToast("success", `${added} member${added !== 1 ? "s" : ""} added${guildLabel ? ` to "${guildLabel}"` : ""}`);
  };

  const handleEdit = async (id: string) => {
    const name = editName.trim();
    const oldName = members.find((m) => m.id === id)?.name;
    if (!name || name === oldName) {
      setEditingId(null);
      return;
    }

    // Prevent renaming to an existing name
    if (members.some((m) => m.id !== id && m.name.toLowerCase() === name.toLowerCase())) {
      showToast("error", `"${name}" already exists`);
      return;
    }
    setSaving(true);
    try {
      await updateMemberName(id, name);
      setEditingId(null);
      invalidate();
      showToast("success", `"${oldName}" → "${name}"`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to update member");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const memberName = members.find((m) => m.id === id)?.name ?? "";
    setDeleting(true);
    try {
      await deleteMember(id);
      setDeleteId(null);
      invalidate();
      showToast("success", `"${memberName}" removed`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to delete member");
    } finally {
      setDeleting(false);
    }
  };

  const startEdit = (member: Member) => {
    setEditingId(member.id);
    setEditName(member.name);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#18181b] border border-[#27272a]">
            <Users className="w-5 h-5 text-[#fafafa]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#fafafa]">Members</h2>
            <p className="text-sm text-[#a1a1aa]">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {members.length > 0 && (
          <button
            onClick={() => {
              const names = members.map(m => m.name).join(", ");
              navigator.clipboard.writeText(names);
              setToast({ type: "success", message: `${members.length} names copied!` });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs font-medium hover:bg-[#27272a] hover:text-[#fafafa] transition"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy All
          </button>
        )}
      </div>

      {/* Toast notification */}
      {toast && <ToastMessage toast={toast} onDismiss={() => setToast(null)} />}

      {/* Add member */}
      {canManageRaidMembers && (
      <>
      <form
        onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
        className="flex flex-col sm:flex-row gap-2"
      >
        <input
          type="text"
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          placeholder="Member name..."
          ref={memberInputRef}
          className="flex-1 min-w-0 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] placeholder-[#71717a] focus:outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition text-sm"
        />
        <input
          type="number"
          value={addCombatPower}
          onChange={(e) => setAddCombatPower(e.target.value)}
          placeholder="Combat Power"
          className="w-28 px-2 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] placeholder-[#71717a] text-sm focus:outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition"
        />
        {classes.length > 0 && (
          <select
            value={addClass}
            onChange={(e) => setAddClass(e.target.value)}
            className="px-2 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa] outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition max-w-[100px] truncate"
          >
            <option value="">No class</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {guilds.length > 0 && (
          <select
            value={addGuild}
            onChange={(e) => setAddGuild(e.target.value)}
            className="px-2 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa] outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition max-w-[100px] truncate"
          >
            <option value="">No guild</option>
            {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <button
          type="submit"
          disabled={adding || !addName.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#fafafa] text-[#09090b] text-sm font-medium hover:bg-[#e4e4e7] disabled:opacity-50 transition"
        >
          {adding ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          Add
        </button>
        <button
          type="button"
          onClick={() => setShowBulkModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-[#d4d4d8] text-sm font-medium hover:bg-[#27272a] transition"
        >
          <Upload className="w-4 h-4" />
          Bulk
        </button>
      </form>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[#27272a] pb-2">
        <button
          onClick={() => setMembersTab("members")}
          className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition ${
            membersTab === "members"
              ? "bg-[#18181b] text-[#fafafa] border border-[#27272a] border-b-transparent"
              : "text-[#71717a] hover:text-[#d4d4d8]"
          }`}
        >
          <Users className="w-3.5 h-3.5 inline mr-1" />
          Members
        </button>
        <button
          onClick={() => setMembersTab("parties")}
          className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition ${
            membersTab === "parties"
              ? "bg-[#18181b] text-[#fafafa] border border-[#27272a] border-b-transparent"
              : "text-[#71717a] hover:text-[#d4d4d8]"
          }`}
        >
          <Shield className="w-3.5 h-3.5 inline mr-1" />
          Parties {parties.length > 0 && `(${parties.length})`}
        </button>
      </div>

      {membersTab === "members" ? (
      <>
      {/* Class management */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] sm:text-xs text-[#71717a] mr-1">Classes:</span>
        {classes.map(c => (
          <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-[#27272a] text-[#d4d4d8] border border-[#3f3f46]">
            {c}
            <button onClick={() => handleRemoveClass(c)} className="text-[#71717a] hover:text-[#f87171]"><X className="w-3 h-3" /></button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddClass())}
            placeholder="Add class..."
            className="w-24 px-2 py-1 bg-[#18181b] border border-[#27272a] rounded text-xs text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"
          />
          <button onClick={handleAddClass} disabled={!newClassName.trim()} className="p-1 text-[#a1a1aa] hover:text-[#fafafa] disabled:opacity-30"><Plus className="w-3 h-3" /></button>
        </div>
      </div>
      </>
      )}

      {/* Parties Tab */}
      {membersTab === "parties" && canManageRaidMembers && (
      <div className="space-y-3">
        {/* Create party */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newPartyName}
            onChange={(e) => setNewPartyName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateParty()}
            placeholder="New party name..."
            className="flex-1 px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder-[#71717a] focus:outline-none focus:border-[#52525b]"
          />
          {guilds.length > 0 && (
            <select
              value={newPartyGuild}
              onChange={(e) => setNewPartyGuild(e.target.value)}
              className="px-2 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#a1a1aa] outline-none focus:border-[#52525b] max-w-[120px]"
            >
              <option value="">Server-wide</option>
              {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <button
            onClick={handleCreateParty}
            disabled={!newPartyName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] disabled:opacity-50 transition"
          >
            Create
          </button>
        </div>

        {/* Party list */}
        {parties.length === 0 ? (
          <p className="text-sm text-[#71717a] text-center py-8">No parties yet. Create one to quick-select members for attendance.</p>
        ) : (
          <div className="space-y-3">
            {parties.map(p => (
              <div key={p.id} className="p-3 rounded-lg bg-[#18181b]/50 border border-[#27272a]/50">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm text-[#fafafa] font-medium">{p.name}</span>
                    {p.guild_name && (
                      <span className="text-xs text-[#71717a] ml-1.5">({p.guild_name})</span>
                    )}
                    <span className="text-xs text-[#52525b] ml-2">{p.member_ids.length} members</span>
                  </div>
                  <button
                    onClick={async () => { await deleteParty(p.id); refreshParties(); }}
                    className="p-1 text-[#71717a] hover:text-[#f87171] transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Members in this party */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {p.member_ids.map((mid, i) => {
                    const member = members.find(m => m.id === mid);
                    return (
                      <span key={mid} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-[#09090b] border border-[#27272a] text-[#d4d4d8]">
                        {member?.name ?? p.member_names[i] ?? mid.slice(0, 8)}
                        <button
                          onClick={async () => { await removeMemberFromParty(mid); refreshParties(); }}
                          className="text-[#71717a] hover:text-[#f87171]"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>

                {/* Add member dropdown */}
                <select
                  value=""
                  onChange={async (e) => {
                    if (e.target.value) {
                      await addMemberToParty(p.id, e.target.value);
                      refreshParties();
                    }
                  }}
                  className="w-full px-2 py-1.5 bg-[#09090b] border border-[#27272a] rounded text-xs text-[#a1a1aa] outline-none focus:border-[#52525b]"
                >
                  <option value="">+ Add member...</option>
                  {members
                    .filter(m => !p.member_ids.includes(m.id) && (!p.guild_id || m.guild_id === p.guild_id))
                    .map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Search (Members tab only) */}
      {membersTab === "members" && members.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search members..."
            className="w-full pl-10 pr-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] text-sm placeholder-[#71717a] focus:outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition"
          />
          {searchText && (
            <button onClick={() => setSearchText("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-[#fafafa]">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Member list */}
      {membersTab === "members" && (
        members.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-10 h-10 text-[#3f3f46] mx-auto mb-2" />
          <p className="text-[#71717a] text-sm">No members yet</p>
        </div>
      ) : (
        (() => {
          // Group members by guild
          const grouped = new Map<string, { guild: Guild | null; members: Member[] }>();
          for (const m of filteredMembers) {
            const guild = guilds.find(g => g.id === m.guild_id) ?? null;
            const key = guild?.id ?? "__noguild__";
            if (!grouped.has(key)) grouped.set(key, { guild, members: [] });
            grouped.get(key)!.members.push(m);
          }
          // Sort groups: guilds alphabetically, "No Guild" last
          const groups = [...grouped.values()].sort((a, b) => {
            if (!a.guild) return 1;
            if (!b.guild) return -1;
            return a.guild.name.localeCompare(b.guild.name);
          });

          return (
        <div className="flex flex-wrap justify-center gap-4">
          {groups.map(group => {
            const c = group.guild ? guildColor(group.guild.name) : null;
            return (
              <div key={group.guild?.id ?? "noguild"} className="w-full lg:w-96">
                <h3 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  {group.guild && c ? (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${c.bg} ${c.text} ${c.border}`}>
                      <Shield className="w-3 h-3" />
                      {group.guild.name}
                    </span>
                  ) : (
                    <span className="text-[#71717a]">No Guild</span>
                  )}
                  <span className="text-[#52525b] font-normal normal-case text-[11px]">
                    {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                  </span>
                </h3>
                <div className="space-y-1">
                  {group.members.map(member => (
            <div
              key={member.id}
              className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 rounded-lg bg-[#09090b]/50 border border-[#27272a]/50 group"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#18181b] text-[#a1a1aa] font-bold text-sm shrink-0">
                {member.name.charAt(0).toUpperCase()}
              </div>

              {editingId === member.id ? (
                <div className="flex-1 min-w-0 flex gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleEdit(member.id)}
                    autoFocus
                    className="flex-1 px-2 py-1 bg-[#18181b] border border-[#3f3f46] rounded text-[#fafafa] text-sm focus:outline-none focus:ring-1 focus:ring-[#52525b]"
                  />
                  <button onClick={() => handleEdit(member.id)} disabled={saving} className="p-1 text-[#a1a1aa] hover:text-[#fafafa] transition"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingId(null)} className="p-1 text-[#a1a1aa] hover:text-[#fafafa] transition"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <span className="flex-1 min-w-0 text-[#fafafa] text-sm font-medium truncate">{member.name}</span>
              )}

              {/* Combat Power & Class — wrap on mobile */}
              {editingId !== member.id && (
                <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs shrink-0">
                  <input
                    type="number"
                    defaultValue={member.combat_power ?? ""}
                    placeholder="CP"
                    onBlur={async (e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      if (val === (member.combat_power ?? null)) return;
                      try {
                        await supabase.rpc("update_member_stats", { p_member_id: member.id, p_combat_power: val, p_class: member.class ?? null });
                        invalidate();
                      } catch {}
                    }}
                    className="w-20 px-1.5 py-1 bg-[#18181b] border border-[#27272a] rounded text-xs text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"
                  />
                  {classes.length > 0 && (
                    <select
                      value={member.class ?? ""}
                      onChange={async (e) => {
                        const cls = e.target.value || null;
                        try {
                          await supabase.rpc("update_member_stats", { p_member_id: member.id, p_combat_power: member.combat_power ?? null, p_class: cls });
                          invalidate();
                        } catch {}
                      }}
                      className="bg-[#18181b] border border-[#27272a] rounded px-1.5 py-1 text-xs text-[#a1a1aa] outline-none focus:border-[#52525b] max-w-[90px] truncate"
                    >
                      <option value="">—</option>
                      {classes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
              )}

              {editingId !== member.id && canManageRaidMembers && (
                <div className="flex items-center gap-0.5 sm:opacity-0 group-hover:opacity-100 transition shrink-0">
                  <button onClick={() => startEdit(member)} className="p-1.5 text-[#71717a] hover:text-[#fafafa] transition rounded" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setDeleteId(member.id)} className="p-1.5 text-[#71717a] hover:text-red-400 transition rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}

              {editingId !== member.id && guilds.length > 0 && (
                <select
                  value={member.guild_id ?? ""}
                  onChange={async (e) => {
                    const gid = e.target.value || null;
                    try { await setMemberGuild(member.id, gid); invalidate(); } catch {}
                  }}
                  className="bg-[#18181b] border border-[#27272a] rounded px-1.5 py-1 text-[10px] sm:text-xs text-[#a1a1aa] outline-none focus:border-[#52525b] transition max-w-[100px] truncate shrink-0"
                >
                  <option value="">No guild</option>
                  {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
            </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
          );
        })()
      )}
      )}

      {/* Bulk add modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowBulkModal(false); setBulkNames(""); }} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[#27272a] shrink-0">
              <h2 className="text-lg font-bold text-[#fafafa] flex items-center gap-2">
                <Upload className="w-5 h-5 text-[#a1a1aa]" />
                Bulk Add Members
              </h2>
              <button onClick={() => { setShowBulkModal(false); setBulkNames(""); }} className="text-[#a1a1aa] hover:text-[#fafafa] transition p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4 flex-1">
              <p className="text-[#a1a1aa] text-xs">
                Paste names from a screenshot — one per line, or comma-separated.
                Members already in the list will be skipped.
              </p>
              {guilds.length > 0 && (
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-[#71717a] shrink-0" />
                  <select
                    value={bulkGuild}
                    onChange={(e) => setBulkGuild(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#d4d4d8] outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition"
                  >
                    <option value="">No guild (assign later)</option>
                    {guilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}
              <textarea
                value={bulkNames}
                onChange={(e) => setBulkNames(e.target.value)}
                placeholder={"Astro\nShadowKing\nLunaStar"}
                rows={6}
                className="w-full px-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-[#fafafa] placeholder-[#71717a] focus:outline-none focus:ring-2 focus:ring-[#52525b] focus:border-transparent transition text-sm resize-none"
              />

              {/* Preview */}
              {parsedNames.length > 0 && (
                <div className="space-y-2">
                  {alreadyExisting.length > 0 && (
                    <div>
                      <p className="text-xs text-[#71717a] mb-1 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-[#a1a1aa]" />
                        Already in ranks ({alreadyExisting.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {alreadyExisting.map((name) => (
                          <span key={name} className="px-2 py-0.5 rounded-md bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {newNames.length > 0 && (
                    <div>
                      <p className="text-xs text-[#71717a] mb-1 flex items-center gap-1">
                        <UserPlus className="w-3 h-3 text-[#a1a1aa]" />
                        New members ({newNames.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {newNames.map((name) => (
                          <span key={name} className="px-2 py-0.5 rounded-md bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {newNames.length === 0 && alreadyExisting.length > 0 && (
                    <p className="text-[#71717a] text-xs">All names already exist — nothing to add.</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 p-4 border-t border-[#27272a] shrink-0">
              <button
                onClick={() => { setShowBulkModal(false); setBulkNames(""); }}
                className="flex-1 py-2 rounded-lg bg-[#18181b] text-[#d4d4d8] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAdd}
                disabled={bulkAdding || newNames.length === 0}
                className="flex-1 py-2 rounded-lg bg-[#fafafa] text-[#09090b] text-sm font-medium hover:bg-[#e4e4e7] disabled:opacity-50 flex items-center justify-center gap-1.5 transition"
              >
                {bulkAdding ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : null}
                Add {newNames.length > 0 ? newNames.length : ""} Member{newNames.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteId(null)} />
          <div className="relative bg-[#09090b] border border-[#27272a] rounded-xl w-full max-w-xs shadow-2xl p-4 space-y-4">
            <p className="text-[#fafafa] text-sm text-center">
              Delete{" "}
              <span className="font-bold">{members.find((m) => m.id === deleteId)?.name}</span>?
              This will also remove their attendance records.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-[#18181b] text-[#d4d4d8] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-[#f87171] text-sm flex items-center justify-center gap-1.5"
              >
                {deleting ? (
                  <span className="w-4 h-4 border-2 border-[#3f3f46] border-t-[#fafafa] rounded-full animate-spin" />
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Auto-dismissing toast notification */
function ToastMessage({
  toast,
  onDismiss,
}: {
  toast: { type: "success" | "error"; message: string };
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const isSuccess = toast.type === "success";

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border ${
          isSuccess
            ? "bg-[#09090b] border-[#27272a] text-[#fafafa]"
            : "bg-[#09090b] border-[#27272a] text-[#fafafa]"
        }`}
      >
        {isSuccess ? (
          <CheckCircle className="w-5 h-5 shrink-0" />
        ) : (
          <AlertTriangle className="w-5 h-5 shrink-0" />
        )}
        <span className="text-sm font-medium">{toast.message}</span>
        <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100 transition">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
