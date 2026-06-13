import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMemberProfile, fetchCpUpdates, addMemberNote, deleteMemberNote, isSupabaseConfigured } from "@/lib/supabase";
import { useServerId } from "@/contexts/ServerContext";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import type { MemberNote, CpUpdate } from "@/types";
import {
  ArrowLeft, TrendingUp, Clock, ScrollText, Package, Plus, Trash2, Loader2,
  User, Image, ExternalLink, MessageSquare, CheckCircle, XCircle, Clock4,
} from "lucide-react";

export function MemberProfileView() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const configured = isSupabaseConfigured();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["memberProfile", memberId],
    queryFn: () => fetchMemberProfile(memberId!),
    enabled: !!memberId && configured,
  });

  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [selectedUpdate, setSelectedUpdate] = useState<CpUpdate | null>(null);
  useEscapeKey(() => setSelectedUpdate(null), !!selectedUpdate);

  const addNoteMutation = useMutation({
    mutationFn: (note: string) => addMemberNote({ server_id: serverId!, member_id: memberId!, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memberProfile", memberId] });
      setNewNote("");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => deleteMemberNote(noteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memberProfile", memberId] }),
  });

  const handleAddNote = async () => {
    if (!newNote.trim() || addingNote) return;
    setAddingNote(true);
    try {
      await addNoteMutation.mutateAsync(newNote.trim());
    } finally {
      setAddingNote(false);
    }
  };

  const formatCp = (cp: number | null | undefined) =>
    cp != null ? cp.toLocaleString() : "—";

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const timeAgo = (d: string | null) => {
    if (!d) return "Never";
    const ms = Date.now() - new Date(d).getTime();
    const days = Math.floor(ms / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return formatDate(d);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#71717a] animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20">
        <p className="text-[#71717a]">Member not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-[#a1a1aa] hover:text-[#fafafa] text-sm">
          ← Go back
        </button>
      </div>
    );
  }

  const approvedUpdates = profile.cp_history.filter(u => u.status === "approved");

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-6">
      {/* Back button */}
      <button onClick={() => navigate("/members")} className="flex items-center gap-1.5 text-[#a1a1aa] hover:text-[#fafafa] text-sm transition">
        <ArrowLeft className="w-4 h-4" />
        Back to Members
      </button>

      {/* Profile Header */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-[#27272a] flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-[#a1a1aa]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-[#fafafa] truncate">{profile.name}</h1>
            {profile.discord_user_id && (
              <p className="text-sm text-[#71717a] flex items-center gap-1 mt-0.5">
                <MessageSquare className="w-3 h-3" />
                Discord linked
              </p>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="bg-[#09090b] rounded-lg p-3">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Current CP</p>
            <p className="text-lg font-bold text-[#fafafa] mt-0.5">{formatCp(profile.current_cp)}</p>
          </div>
          <div className="bg-[#09090b] rounded-lg p-3">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">7 Day Growth</p>
            <p className={`text-lg font-bold mt-0.5 ${(profile.cp_growth_7d ?? 0) > 0 ? "text-green-400" : "text-[#a1a1aa]"}`}>
              {profile.cp_growth_7d != null ? `+${profile.cp_growth_7d.toLocaleString()}` : "—"}
            </p>
          </div>
          <div className="bg-[#09090b] rounded-lg p-3">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">30 Day Growth</p>
            <p className={`text-lg font-bold mt-0.5 ${(profile.cp_growth_30d ?? 0) > 0 ? "text-green-400" : "text-[#a1a1aa]"}`}>
              {profile.cp_growth_30d != null ? `+${profile.cp_growth_30d.toLocaleString()}` : "—"}
            </p>
          </div>
          <div className="bg-[#09090b] rounded-lg p-3">
            <p className="text-[10px] text-[#71717a] uppercase tracking-wider">Items Received</p>
            <p className="text-lg font-bold text-[#fafafa] mt-0.5">{profile.loot_count}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CP History */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-[#a1a1aa]" />
            <h2 className="text-sm font-semibold text-[#fafafa]">CP History</h2>
            <span className="text-[10px] text-[#52525b] ml-auto">{approvedUpdates.length} updates</span>
          </div>

          {profile.cp_history.length === 0 ? (
            <p className="text-sm text-[#52525b] py-4 text-center">No CP updates yet.</p>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {profile.cp_history.map((update) => (
                <button
                  key={update.id}
                  onClick={() => setSelectedUpdate(update)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#27272a] transition text-left group"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    update.status === "approved" ? "bg-green-500" :
                    update.status === "rejected" ? "bg-red-500" : "bg-yellow-500"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[#fafafa] truncate">{formatCp(update.new_cp)}</span>
                      {update.old_cp != null && (
                        <span className={`text-[10px] ${update.new_cp > update.old_cp ? "text-green-400" : "text-red-400"}`}>
                          {update.new_cp >= update.old_cp ? "+" : ""}{(update.new_cp - update.old_cp).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#52525b]">{formatDate(update.submitted_at)}</p>
                  </div>
                  {update.screenshot_url && (
                    <Image className="w-3.5 h-3.5 text-[#52525b] opacity-0 group-hover:opacity-100 transition" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <ScrollText className="w-4 h-4 text-[#a1a1aa]" />
            <h2 className="text-sm font-semibold text-[#fafafa]">Moderator Notes</h2>
          </div>

          {/* Add note */}
          <div className="flex gap-2 mb-3">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
              placeholder="Add a note..."
              className="flex-1 px-3 py-1.5 bg-[#09090b] border border-[#27272a] rounded-lg text-sm text-[#fafafa] placeholder:text-[#52525b] focus:outline-none focus:border-[#52525b]"
            />
            <button
              onClick={handleAddNote}
              disabled={!newNote.trim() || addingNote}
              className="px-3 py-1.5 bg-[#27272a] text-[#fafafa] rounded-lg text-sm hover:bg-[#3f3f46] transition disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {profile.notes.length === 0 ? (
            <p className="text-sm text-[#52525b] py-4 text-center">No notes yet.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {profile.notes.map((note) => (
                <div key={note.id} className="bg-[#09090b] rounded-lg p-3 group">
                  <p className="text-sm text-[#d4d4d8]">{note.note}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-[#52525b]">{formatDate(note.created_at)}</span>
                    <button
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                      className="opacity-0 group-hover:opacity-100 text-[#52525b] hover:text-red-400 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CP Update Detail Modal */}
      {selectedUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedUpdate(null)}>
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-3 h-3 rounded-full ${
                selectedUpdate.status === "approved" ? "bg-green-500" :
                selectedUpdate.status === "rejected" ? "bg-red-500" : "bg-yellow-500"
              }`} />
              <span className="text-sm font-semibold capitalize text-[#fafafa]">{selectedUpdate.status}</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#71717a]">CP</span>
                <span className="text-[#fafafa] font-mono">{formatCp(selectedUpdate.new_cp)}</span>
              </div>
              {selectedUpdate.old_cp != null && (
                <div className="flex justify-between">
                  <span className="text-[#71717a]">Previous</span>
                  <span className="text-[#a1a1aa] font-mono">{formatCp(selectedUpdate.old_cp)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#71717a]">Submitted</span>
                <span className="text-[#a1a1aa]">{formatDate(selectedUpdate.submitted_at)}</span>
              </div>
              {selectedUpdate.discord_username && (
                <div className="flex justify-between">
                  <span className="text-[#71717a]">By</span>
                  <span className="text-[#a1a1aa]">@{selectedUpdate.discord_username}</span>
                </div>
              )}
            </div>
            {selectedUpdate.screenshot_url && (
              <a href={selectedUpdate.screenshot_url} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center gap-1.5 text-sm text-[#a1a1aa] hover:text-[#fafafa] transition">
                <ExternalLink className="w-3.5 h-3.5" />
                View Screenshot
              </a>
            )}
            <button onClick={() => setSelectedUpdate(null)} className="mt-4 w-full py-2 bg-[#27272a] rounded-lg text-sm text-[#fafafa] hover:bg-[#3f3f46] transition">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
