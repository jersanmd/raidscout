import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMembers } from "@/hooks/useMembers";
import { useAuth } from "@/contexts/AuthContext";
import { updateMemberName, deleteMember, upsertMember, isSupabaseConfigured, fetchGuilds, setMemberGuild } from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import type { Guild } from "@/types";
import { Users, Plus, Pencil, Trash2, Loader2, X, Check, UserPlus, CheckCircle, AlertTriangle, Image, Upload, Copy, Shield } from "lucide-react";
import type { Member } from "@/types";
import { guildColor } from "@/lib/constants";

export function MembersView() {
  const { user } = useAuth();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();
  const { data: members = [], isLoading } = useMembers();

  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Guilds
  const [guilds, setGuilds] = useState<Guild[]>([]);

  useEffect(() => {
    fetchGuilds(serverId).then(setGuilds).catch(() => setGuilds([]));
  }, [serverId]);

  // Bulk add
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkNames, setBulkNames] = useState("");
  const [bulkAdding, setBulkAdding] = useState(false);

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
      await upsertMember(name);
      setAddName("");
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
    for (const name of newNames) {
      try {
        await upsertMember(name);
        added++;
      } catch { /* skip failures */ }
    }
    setBulkAdding(false);
    setShowBulkModal(false);
    setBulkNames("");
    invalidate();
    showToast("success", `${added} member${added !== 1 ? "s" : ""} added`);
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
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Members</h2>
            <p className="text-sm text-slate-400">
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-xs font-medium hover:bg-slate-700 hover:text-white transition"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy All
          </button>
        )}
      </div>

      {/* Toast notification */}
      {toast && <ToastMessage toast={toast} onDismiss={() => setToast(null)} />}

      {/* Add member */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          placeholder="Member name..."
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
        />
        <button
          type="submit"
          disabled={adding || !addName.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition"
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
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-700 transition"
        >
          <Upload className="w-4 h-4" />
          Bulk
        </button>
      </form>

      {/* Member list */}
      {members.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-10 h-10 text-slate-700 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No members yet</p>
        </div>
      ) : (
        (() => {
          // Group members by guild
          const grouped = new Map<string, { guild: Guild | null; members: Member[] }>();
          for (const m of sortedMembers) {
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
        <div className="space-y-4">
          {groups.map(group => {
            const c = group.guild ? guildColor(group.guild.name) : null;
            return (
              <div key={group.guild?.id ?? "noguild"}>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  {group.guild && c ? (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${c.bg} ${c.text} ${c.border}`}>
                      <Shield className="w-3 h-3" />
                      {group.guild.name}
                    </span>
                  ) : (
                    <span className="text-slate-500">No Guild</span>
                  )}
                  <span className="text-slate-600 font-normal normal-case text-[11px]">
                    {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                  </span>
                </h3>
                <div className="space-y-1">
                  {group.members.map(member => (
            <div
              key={member.id}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-slate-900/50 border border-slate-800/50 group"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-900/20 text-blue-400 font-bold text-sm shrink-0">
                {member.name.charAt(0).toUpperCase()}
              </div>

              {editingId === member.id ? (
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleEdit(member.id)}
                    autoFocus
                    className="flex-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button onClick={() => handleEdit(member.id)} disabled={saving} className="p-1 text-emerald-400 hover:text-emerald-300 transition"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:text-white transition"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <span className="flex-1 text-white text-sm font-medium">{member.name}</span>
              )}

              {editingId !== member.id && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => startEdit(member)} className="p-1.5 text-slate-500 hover:text-white transition rounded" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setDeleteId(member.id)} className="p-1.5 text-slate-500 hover:text-red-400 transition rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}

              {editingId !== member.id && guilds.length > 0 && (
                <select
                  value={member.guild_id ?? ""}
                  onChange={async (e) => {
                    const gid = e.target.value || null;
                    try { await setMemberGuild(member.id, gid); invalidate(); } catch {}
                  }}
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-400 outline-none focus:border-blue-500 transition max-w-[120px] truncate"
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

      {/* Bulk add modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setShowBulkModal(false); setBulkNames(""); }} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-400" />
                Bulk Add Members
              </h2>
              <button onClick={() => { setShowBulkModal(false); setBulkNames(""); }} className="text-slate-400 hover:text-white transition p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4 flex-1">
              <p className="text-slate-400 text-xs">
                Paste names from a screenshot — one per line, or comma-separated.
                Members already in the list will be skipped.
              </p>
              <textarea
                value={bulkNames}
                onChange={(e) => setBulkNames(e.target.value)}
                placeholder={"Astro\nShadowKing\nLunaStar"}
                rows={6}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm resize-none"
              />

              {/* Preview */}
              {parsedNames.length > 0 && (
                <div className="space-y-2">
                  {alreadyExisting.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                        Already in ranks ({alreadyExisting.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {alreadyExisting.map((name) => (
                          <span key={name} className="px-2 py-0.5 rounded-md bg-emerald-900/20 border border-emerald-800/30 text-emerald-400 text-xs">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {newNames.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                        <UserPlus className="w-3 h-3 text-blue-400" />
                        New members ({newNames.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {newNames.map((name) => (
                          <span key={name} className="px-2 py-0.5 rounded-md bg-blue-900/20 border border-blue-800/30 text-blue-400 text-xs">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {newNames.length === 0 && alreadyExisting.length > 0 && (
                    <p className="text-amber-400 text-xs">All names already exist — nothing to add.</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 p-4 border-t border-slate-800 shrink-0">
              <button
                onClick={() => { setShowBulkModal(false); setBulkNames(""); }}
                className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAdd}
                disabled={bulkAdding || newNames.length === 0}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-1.5 transition"
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
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xs shadow-2xl p-4 space-y-4">
            <p className="text-white text-sm text-center">
              Delete{" "}
              <span className="font-bold">{members.find((m) => m.id === deleteId)?.name}</span>?
              This will also remove their attendance records.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm flex items-center justify-center gap-1.5"
              >
                {deleting ? (
                  <span className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
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
            ? "bg-emerald-900/90 border-emerald-700 text-emerald-200"
            : "bg-red-900/90 border-red-700 text-red-200"
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
