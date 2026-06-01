import { useState } from "react";
import { Loader2, Plus, Save, X, Image } from "lucide-react";
import { localSlotToUtc, type ScheduleSlot } from "@/lib/scheduleTimezone";
import { createActivityTemplate, uploadActivityImage } from "@/lib/supabase";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACTIVITY_CATEGORIES = ["Guild War", "Siege", "Arena", "Dungeon Run", "World Event", "Farming", "Trading", "Crafting"];
const ACTIVITY_TAGS = ["pvp", "pve", "guild", "solo", "party", "weekly", "daily", "competitive", "casual", "scheduled"];

interface Props {
  gameId: string;
  gameSlug: string;
  onCreated: () => void;
  onCancel: () => void;
}

export function AddActivityForm({ gameId, gameSlug, onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState("fixed_hours");
  const [startHours, setStartHours] = useState("0");
  const [startMinutes, setStartMinutes] = useState("0");
  const [pointsPerParticipant, setPointsPerParticipant] = useState(1);
  const [partySize, setPartySize] = useState("5");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        try { imageUrl = await uploadActivityImage(gameSlug, name.trim(), imageFile); }
        catch { /* ignore */ }
      }
      await createActivityTemplate({
        game_id: gameId,
        name: name.trim(),
        schedule_type: scheduleType === "fixed_schedule" ? "recurring" : "one_time",
        schedule: scheduleType === "fixed_schedule" && scheduleSlots.length > 0
          ? scheduleSlots.map(s => localSlotToUtc(s.day, s.time))
          : scheduleType === "fixed_hours"
            ? `${startHours.padStart(2, "0")}:${startMinutes.padStart(2, "0")}`
            : undefined,
        points_per_participant: isNaN(Number(pointsPerParticipant)) ? 1 : Number(pointsPerParticipant),
        party_size: partySize ? Number(partySize) : null,
        category: category || null,
        tags,
        image_url: imageUrl,
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 mb-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">New Activity Template</span>
        <button type="button" onClick={onCancel} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Schedule Type</label>
          <select value={scheduleType} onChange={e => { setScheduleType(e.target.value); setScheduleSlots([]); }} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
            <option value="fixed_hours">Fixed Hours</option>
            <option value="fixed_schedule">Fixed Schedule</option>
          </select>
        </div>
        {scheduleType === "fixed_hours" && (
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Start Time</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <select value={startHours} onChange={e => setStartHours(e.target.value)} className="w-20 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                  {Array.from({ length: 24 }, (_, i) => i).map(h => <option key={h} value={h}>{h}h</option>)}
                </select>
                <select value={startMinutes} onChange={e => setStartMinutes(e.target.value)} className="w-16 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                  {[0, 15, 30, 45].map(m => <option key={m} value={m}>{m}m</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
        {scheduleType === "fixed_schedule" && (
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Weekly Schedule <span className="text-slate-600 ml-1">(your local time — saved as UTC)</span></label>
            <div className="space-y-1.5">
              {scheduleSlots.map((slot, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select value={slot.day} onChange={e => {
                    const updated = [...scheduleSlots];
                    updated[i] = { ...updated[i], day: Number(e.target.value) };
                    setScheduleSlots(updated);
                  }} className="w-16 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                    {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                  </select>
                  <input type="time" value={slot.time} onChange={e => {
                    const updated = [...scheduleSlots];
                    updated[i] = { ...updated[i], time: e.target.value };
                    setScheduleSlots(updated);
                  }} className="w-28 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
                  <button onClick={() => setScheduleSlots(scheduleSlots.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400 transition"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setScheduleSlots([...scheduleSlots, { day: 0, time: "21:00" }])} className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition">
                <Plus className="w-3 h-3" /> Add time slot
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Party Size</label>
          <input value={partySize} onChange={e => setPartySize(e.target.value)} placeholder="e.g. 5" type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Points per Participant</label>
          <input value={pointsPerParticipant} onChange={e => setPointsPerParticipant(e.target.value === "" ? 0 : Number(e.target.value))} type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
            <option value="">None</option>
            {ACTIVITY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
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
      <div>
        <label className="block text-xs text-slate-500 mb-1">Activity Image</label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 cursor-pointer transition">
            <Image className="w-3.5 h-3.5" /> Choose Image
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={e => {
                const file = e.target.files?.[0] || null;
                setImageFile(file);
                setImagePreview(file ? URL.createObjectURL(file) : null);
              }}
              className="hidden" />
          </label>
          {imagePreview && (
            <div className="relative">
              <img src={imagePreview} alt="Preview" className="w-8 h-8 rounded object-cover border border-slate-600" />
              <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-400 transition">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>
      </div>
      <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Add Activity</>}
      </button>
    </form>
  );
}
