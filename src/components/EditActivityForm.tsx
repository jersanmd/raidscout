import { useState } from "react";
import { Loader2, Plus, Save, X, Image } from "lucide-react";
import { localSlotToUtc, type ScheduleSlot } from "@/lib/scheduleTimezone";
import { updateActivityTemplate, uploadActivityImage } from "@/lib/supabase";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACTIVITY_CATEGORIES = ["Guild War", "Siege", "Arena", "Dungeon Run", "World Event", "Farming", "Trading", "Crafting"];
const ACTIVITY_TAGS = ["pvp", "pve", "guild", "solo", "party", "weekly", "daily", "competitive", "casual", "scheduled"];

interface ActivityData {
  id: string;
  name: string;
  schedule_type: string;
  schedule?: any;
  duration_minutes?: number | null;
  points_per_participant: number;
  party_size?: number | null;
  category?: string | null;
  tags?: string[];
  image_url?: string | null;
}

interface Props {
  activity: ActivityData;
  gameSlug: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function EditActivityForm({ activity, gameSlug, onSaved, onCancel }: Props) {
  const [name, setName] = useState(activity.name);
  const [scheduleType, setScheduleType] = useState(activity.schedule_type);
  const [schedule, setSchedule] = useState<any>(activity.schedule ?? null);
  const [pointsPerParticipant, setPointsPerParticipant] = useState(activity.points_per_participant);
  const [partySize, setPartySize] = useState<number | null>(activity.party_size ?? null);
  const [category, setCategory] = useState(activity.category || "");
  const [tags, setTags] = useState<string[]>(activity.tags ?? []);
  const [imageUrl, setImageUrl] = useState<string | null>(activity.image_url ?? null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      let processedSchedule = schedule;
      if (scheduleType === "fixed_schedule" && Array.isArray(schedule) && schedule.length > 0) {
        processedSchedule = schedule.map((s: ScheduleSlot) => localSlotToUtc(s.day, s.time));
      }

      const payload: Record<string, any> = {
        name: name.trim(),
        schedule_type: scheduleType === "fixed_schedule" ? "recurring" : "one_time",
        schedule: processedSchedule ?? null,
        points_per_participant: isNaN(Number(pointsPerParticipant)) ? 1 : Number(pointsPerParticipant),
        party_size: partySize,
        category: category || null,
        tags,
      };
      if (imageUrl !== null) payload.image_url = imageUrl;

      await updateActivityTemplate(activity.id, payload);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      const url = await uploadActivityImage(gameSlug, name || "activity", file);
      setImageUrl(url);
    } catch { /* ignore */ }
  };

  return (
    <div className="border-t border-slate-700/50 px-3 py-3 space-y-2 bg-slate-900/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white">Edit: {activity.name}</span>
        <button onClick={onCancel} className="text-slate-500 hover:text-white"><X className="w-3 h-3" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Schedule Type</label>
          <select value={scheduleType} onChange={e => setScheduleType(e.target.value)} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
            <option value="fixed_hours">Fixed Hours</option>
            <option value="fixed_schedule">Fixed Schedule</option>
          </select>
        </div>
        {scheduleType === "fixed_hours" && (
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Start Time</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {(() => {
                  const startStr = typeof schedule === "string" ? schedule : "00:00";
                  const [h, m] = startStr.split(":").map(Number);
                  return (
                    <>
                      <select value={h || 0} onChange={e => setSchedule(`${e.target.value}:${m || 0}`.replace(/:\d+$/, s => s.padStart(2, "0").padStart(3, ":0")))} className="w-20 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                        {Array.from({ length: 24 }, (_, i) => i).map(h => <option key={h} value={h}>{h}h</option>)}
                      </select>
                      <select value={m || 0} onChange={e => setSchedule(`${h || 0}:${e.target.value}`)} className="w-16 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                        {[0, 15, 30, 45].map(m => <option key={m} value={m}>{m}m</option>)}
                      </select>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
        {scheduleType === "fixed_schedule" && (
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Weekly Schedule <span className="text-slate-600 ml-1">(your local time — saved as UTC)</span></label>
            <div className="space-y-1.5">
              {(Array.isArray(schedule) ? schedule : []).map((slot: ScheduleSlot, i: number) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select value={slot.day} onChange={e => {
                    const updated = [...(Array.isArray(schedule) ? schedule : [])];
                    updated[i] = { ...updated[i], day: Number(e.target.value) };
                    setSchedule(updated);
                  }} className="w-16 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                    {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                  </select>
                  <input type="time" value={slot.time} onChange={e => {
                    const updated = [...(Array.isArray(schedule) ? schedule : [])];
                    updated[i] = { ...updated[i], time: e.target.value };
                    setSchedule(updated);
                  }} className="w-28 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                  <button onClick={() => {
                    setSchedule((Array.isArray(schedule) ? schedule : []).filter((_, j) => j !== i));
                  }} className="text-slate-500 hover:text-red-400 transition"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setSchedule([...(Array.isArray(schedule) ? schedule : []), { day: 0, time: "21:00" }])} className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition">
                <Plus className="w-3 h-3" /> Add time slot
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Party Size</label>
          <input value={partySize ?? ""} onChange={e => setPartySize(e.target.value ? Number(e.target.value) : null)} type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Points per Participant</label>
          <input value={pointsPerParticipant} onChange={e => setPointsPerParticipant(e.target.value === "" ? 0 : Number(e.target.value))} type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Category</label>
          {(() => {
            const isCustom = category && !ACTIVITY_CATEGORIES.includes(category);
            return (
              <>
                <select value={isCustom ? "__custom__" : category} onChange={e => setCategory(e.target.value === "__custom__" ? "" : e.target.value)} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                  <option value="">None</option>
                  {ACTIVITY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">Other...</option>
                </select>
                {(isCustom || category === "") && (
                  <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Type custom category..." className="mt-1 w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                )}
              </>
            );
          })()}
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-slate-500 mb-1">Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_TAGS.map(t => (
              <label key={t} className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition ${tags.includes(t) ? "bg-purple-600/30 text-purple-300 border border-purple-500/50" : "bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300"}`}>
                <input type="checkbox" checked={tags.includes(t)}
                  onChange={e => setTags(e.target.checked ? [...tags, t] : tags.filter(x => x !== t))}
                  className="sr-only" />
                {t}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer transition">
          <Image className="w-3.5 h-3.5" /> {imageUrl ? "Replace Image" : "Add Image"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={e => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); }}
            className="hidden" />
        </label>
        {imageUrl && (
          <div className="relative">
            <img src={imageUrl} alt="Activity" className="w-8 h-8 rounded object-cover border border-slate-600" />
            <button onClick={() => setImageUrl(null)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-400 transition">
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>
      <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Save</>}
      </button>
    </div>
  );
}
