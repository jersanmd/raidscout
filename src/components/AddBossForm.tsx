import { useState } from "react";
import { Loader2, Plus, Save, X, Image } from "lucide-react";
import { localSlotToUtc, type ScheduleSlot } from "@/lib/scheduleTimezone";
import { createBossTemplate, uploadBossImage } from "@/lib/supabase";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BOSS_CATEGORIES = ["World Boss", "Dungeon Boss", "Raid Boss", "Field Boss", "Event Boss"];
const BOSS_TAGS = ["world", "field", "dungeon", "raid", "pvp", "weekly", "daily", "elite", "mini", "guild", "solo", "party"];

interface Props {
  gameId: string;
  gameSlug: string;
  onCreated: () => void;
  onCancel: () => void;
}

export function AddBossForm({ gameId, gameSlug, onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [spawnType, setSpawnType] = useState("fixed_hours");
  const [respawnHours, setRespawnHours] = useState("");
  const [points, setPoints] = useState(1);
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
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
        try { imageUrl = await uploadBossImage(gameSlug, name.trim(), imageFile); }
        catch { /* ignore */ }
      }
      await createBossTemplate({
        game_id: gameId,
        name: name.trim(),
        spawn_type: spawnType,
        respawn_hours: respawnHours ? Number(respawnHours) : null,
        schedule: spawnType === "fixed_schedule" && scheduleSlots.length > 0
          ? scheduleSlots.map(s => localSlotToUtc(s.day, s.time))
          : null,
        is_recurring: true,
        points: isNaN(Number(points)) ? 1 : Number(points),
        category: category === "__custom__" ? customCategory || null : category || null,
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
        <span className="text-xs font-medium text-white">New Boss Template</span>
        <button type="button" onClick={onCancel} className="text-slate-500 hover:text-white"><X className="w-3 h-3" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Spawn Type</label>
          <select value={spawnType} onChange={e => { setSpawnType(e.target.value); setScheduleSlots([]); }} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
            <option value="fixed_hours">Fixed Hours</option>
            <option value="fixed_schedule">Fixed Schedule</option>
          </select>
        </div>
        {spawnType === "fixed_hours" && (
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Respawn Time</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <select
                  value={respawnHours ? Math.floor(Number(respawnHours)) : ""}
                  onChange={e => {
                    const h = Number(e.target.value) || 0;
                    const m = respawnHours ? Math.round((Number(respawnHours) % 1) * 60) : 0;
                    setRespawnHours(String(h + m / 60));
                  }}
                  className="w-20 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                  <option value="">h</option>
                  {Array.from({ length: 200 }, (_, i) => i).map(h => <option key={h} value={h}>{h}h</option>)}
                </select>
                <select
                  value={respawnHours ? Math.round((Number(respawnHours) % 1) * 60) : 0}
                  onChange={e => {
                    const m = Number(e.target.value) || 0;
                    const h = respawnHours ? Math.floor(Number(respawnHours)) : 0;
                    setRespawnHours(String(h + m / 60));
                  }}
                  className="w-16 px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
                  {[0, 15, 30, 45].map(m => <option key={m} value={m}>{m}m</option>)}
                </select>
              </div>
              <span className="text-xs text-slate-600">
                {respawnHours ? `${Math.floor(Number(respawnHours))}h ${Math.round((Number(respawnHours) % 1) * 60)}m` : "—"}
              </span>
            </div>
          </div>
        )}
        {spawnType === "fixed_schedule" && (
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
                <Plus className="w-3 h-3" /> Add spawn time
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
            <option value="">None</option>
            {BOSS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__custom__">Other...</option>
          </select>
          {category === "__custom__" && (
            <input value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Type custom category..." className="mt-1 w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-purple-500" />
          )}
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-0.5">Points</label>
          <input value={points} onChange={e => setPoints(e.target.value === "" ? 0 : Number(e.target.value))} type="number" className="w-full px-2.5 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-slate-500 mb-1">Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {BOSS_TAGS.map(t => (
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
        <label className="block text-xs text-slate-400 mb-1">Boss Image</label>
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
      <button type="submit" disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-purple-600 hover:bg-purple-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</> : <><Save className="w-3 h-3" /> Add</>}
      </button>
    </form>
  );
}
