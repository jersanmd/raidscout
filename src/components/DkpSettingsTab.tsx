import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerId, useServer } from "@/contexts/ServerContext";
import { useToast } from "@/contexts/ToastContext";
import { useHasPermission } from "@/contexts/ServerContext";
import { getDkpConfig, saveDkpConfig, writeAuditEntry, AuditAction, type DkpConfig } from "@/lib/supabase";
import { Coins, Loader2, Save, AlertTriangle } from "lucide-react";

export function DkpSettingsTab() {
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { currentServer } = useServer();
  const canManageDkp = currentServer?.role === "owner" || useHasPermission("can_manage_dkp");
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!canManageDkp) {
    return <div className="p-6 text-center"><p className="text-xs text-[#71717a]">Only the server owner can manage DKP settings.</p></div>;
  }

  const { data: config, isLoading } = useQuery({
    queryKey: ["dkp_config", serverId],
    queryFn: () => getDkpConfig(serverId!),
    enabled: !!serverId,
  });

  const [enabled, setEnabled] = useState(false);
  const [multiplier, setMultiplier] = useState(1.0);
  const [hideFromPlayers, setHideFromPlayers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setMultiplier(config.dkp_multiplier);
      setHideFromPlayers(config.hide_from_players ?? false);
    }
  }, [config]);

  const handleSave = async () => {
    if (!serverId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveDkpConfig(serverId, {
        enabled,
        dkp_multiplier: multiplier,
        hide_from_players: hideFromPlayers,
      });
      queryClient.invalidateQueries({ queryKey: ["dkp_config", serverId] });
      writeAuditEntry({
        action: AuditAction.DKP_CONFIG_UPDATE,
        server_id: serverId,
        details: { enabled, dkp_multiplier: multiplier, hide_from_players: hideFromPlayers },
      });
      toast("success", "DKP settings saved.");
      setSaveError(null);
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save. Only owners and moderators can update DKP settings.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[#52525b] animate-spin" /></div>;
  }

  const hasChanges = config && (
    enabled !== config.enabled ||
    multiplier !== config.dkp_multiplier ||
    hideFromPlayers !== (config.hide_from_players ?? false)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Coins className="w-5 h-5 text-amber-400" />
        <h3 className="text-lg font-bold text-[#fafafa]">DKP Settings</h3>
      </div>

      {/* Enable/Disable */}
      <section className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[#fafafa]">Enable DKP</p>
            <p className="text-xs text-[#71717a] mt-0.5">Members earn DKP from boss kills. DKP can be spent on item bidding.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="sr-only peer" />
            <div className="w-9 h-5 bg-[#3f3f46] rounded-full peer-checked:bg-[#52525b] transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-[#a1a1aa] after:rounded-full after:transition peer-checked:after:translate-x-4 peer-checked:after:bg-[#fafafa]" />
          </label>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-[#27272a]">
          <div>
            <p className="text-sm font-semibold text-[#fafafa]">Hide DKP from players</p>
            <p className="text-xs text-[#71717a] mt-0.5">When enabled, only staff can see DKP leaderboards, auctions, and history.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={hideFromPlayers} onChange={e => setHideFromPlayers(e.target.checked)} className="sr-only peer" />
            <div className="w-9 h-5 bg-[#3f3f46] rounded-full peer-checked:bg-[#52525b] transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-[#a1a1aa] after:rounded-full after:transition peer-checked:after:translate-x-4 peer-checked:after:bg-[#fafafa]" />
          </label>
        </div>
      </section>

      {/* DKP Multiplier */}
      <section className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 space-y-3">
        <p className="text-sm font-semibold text-[#fafafa]">DKP Multiplier</p>
        <p className="text-xs text-[#71717a]">DKP awarded = boss points × multiplier. 1.0 = same as leaderboard points.</p>
        <select
          value={multiplier}
          onChange={e => setMultiplier(parseFloat(e.target.value))}
          className="bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#52525b]"
        >
          <option value={0.5}>0.5x (half points)</option>
          <option value={1.0}>1.0x (same as points)</option>
          <option value={1.5}>1.5x</option>
          <option value={2.0}>2.0x (double points)</option>
        </select>
      </section>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${hasChanges ? "bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7]" : "bg-[#27272a] text-[#71717a]"}`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save DKP Settings
        </button>
      </div>

      {/* Save error */}
      {saveError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {saveError}
        </div>
      )}
    </div>
  );
}
