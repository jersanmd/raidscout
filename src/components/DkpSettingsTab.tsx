import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerId } from "@/contexts/ServerContext";
import { useToast } from "@/contexts/ToastContext";
import { getDkpConfig, saveDkpConfig, writeAuditEntry, AuditAction, type DkpConfig } from "@/lib/supabase";
import { Coins, Loader2, Save, AlertTriangle } from "lucide-react";

export function DkpSettingsTab() {
  const serverId = useServerId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ["dkp_config", serverId],
    queryFn: () => getDkpConfig(serverId!),
    enabled: !!serverId,
  });

  const [enabled, setEnabled] = useState(false);
  const [multiplier, setMultiplier] = useState(1.0);
  const [bidDuration, setBidDuration] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setMultiplier(config.dkp_multiplier);
      setBidDuration(config.bid_duration_minutes);
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
        bid_duration_minutes: bidDuration,
      });
      queryClient.invalidateQueries({ queryKey: ["dkp_config", serverId] });
      writeAuditEntry({
        action: AuditAction.DKP_CONFIG_UPDATE,
        server_id: serverId,
        details: {
          enabled,
          dkp_multiplier: multiplier,
          bid_duration_minutes: bidDuration,
        },
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Coins className="w-5 h-5 text-amber-400" />
        <h3 className="text-lg font-bold text-[#fafafa]">DKP Settings</h3>
      </div>

      {/* Enable/Disable */}
      <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[#fafafa]">Enable DKP</p>
            <p className="text-xs text-[#71717a] mt-0.5">Members earn DKP from boss kills. DKP can be spent on item bidding.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="sr-only peer" />
            <div className="w-9 h-5 bg-[#27272a] rounded-full peer-checked:bg-amber-500/50 transition after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-[#a1a1aa] after:rounded-full after:transition peer-checked:after:translate-x-4 peer-checked:after:bg-amber-300" />
          </label>
        </div>
      </div>

      {/* DKP Multiplier */}
      <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 space-y-3">
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
      </div>

      {/* Bid Duration */}
      <div className="bg-[#0d0d11] border border-[#1e1e2a] rounded-xl p-5 space-y-3">
        <p className="text-sm font-semibold text-[#fafafa]">Default Bid Duration</p>
        <p className="text-xs text-[#71717a]">How long auctions stay open before officers must resolve them.</p>
        <select
          value={bidDuration}
          onChange={e => setBidDuration(parseInt(e.target.value))}
          className="bg-[#18181b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#52525b]"
        >
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>1 hour</option>
          <option value={120}>2 hours</option>
          <option value={360}>6 hours</option>
          <option value={1440}>24 hours</option>
        </select>
      </div>

      {/* Save */}
      {saveError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {saveError}
        </div>
      )}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#fafafa] text-[#09090b] hover:bg-[#e4e4e7] transition disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save DKP Settings
      </button>
    </div>
  );
}
