import { useState } from "react";
import { Loader2, Plus, Save, X, Image } from "lucide-react";
import { localSlotToUtc, utcSlotToLocal, type ScheduleSlot } from "@/lib/scheduleTimezone";
import { toUtcTime } from "@/lib/activityCalculator";
import { updateBossTemplate, uploadBossImage, updateCustomBoss } from "@/lib/supabase";
import { useUserTimezone } from "@/hooks/useUserTimezone";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BOSS_CATEGORIES = ["World Boss", "Dungeon Boss", "Raid Boss", "Field Boss", "Event Boss"];
const BOSS_TAGS = ["world", "field", "dungeon", "raid", "pvp", "weekly", "daily", "elite", "mini", "guild", "solo", "party"];

interface BossData {
  id: string;
  name: string;
  spawn_type: string;
  respawn_hours?: number | null;
  schedule?: any;
  is_recurring?: boolean;
  points: number;
  category?: string | null;
  tags?: string[];
  image_url?: string | null;
}

interface Props {
  boss: BossData;
  gameSlug: string;
  serverId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function EditBossForm({ boss, gameSlug, serverId, onSaved, onCancel }: Props) {
  const isServerMode = !!serverId;
  const { timezone: userTz } = useUserTimezone();
  const tz = userTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [name, setName] = useState(boss.name);
  const [spawnType, setSpawnType] = useState(boss.spawn_type);
  const [respawnHours, setRespawnHours] = useState<number | null>(boss.respawn_hours ?? null);
  const [points, setPoints] = useState(boss.points);
  const [category, setCategory] = useState(boss.category || "");
  const [tags, setTags] = useState<string[]>(boss.tags ?? []);
  // Convert stored UTC schedule → local for display in the form
  const [schedule, setSchedule] = useState<any>(() => {
    if (boss.schedule && Array.isArray(boss.schedule)) {
      return boss.schedule.map((s: ScheduleSlot) => utcSlotToLocal(s.day, s.time, tz));
    }
    return boss.schedule ?? null;
  });

  // Parse start date/time for fixed_hours (convert UTC → local)
  const parsedTime = typeof boss.schedule === "object" && boss.schedule?.time
    ? boss.schedule.time
    : typeof boss.schedule === "object" && boss.schedule?.utc_start
      ? new Date(boss.schedule.utc_start).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
      : "00:00";
  const parsedDate = typeof boss.schedule === "object" && boss.schedule?.start_date
    ? boss.schedule.start_date
    : typeof boss.schedule === "object" && boss.schedule?.utc_start
      ? new Date(boss.schedule.utc_start).toLocaleDateString("en-CA", { timeZone: tz })
      : new Date().toLocaleDateString("en-CA", { timeZone: tz });

  const [startHours, setStartHours] = useState(parsedTime.split(":")[0]);
  const [startMinutes, setStartMinutes] = useState(parsedTime.split(":")[1]);
  const [startDate, setStartDate] = useState(parsedDate);
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const isToday = startDate === todayStr;
  const nowHour = parseInt(new Date().toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }));
  const nowMin = parseInt(new Date().toLocaleTimeString("en-GB", { timeZone: tz, minute: "2-digit", hour12: false }));
  const [imageUrl, setImageUrl] = useState<string | null>(boss.image_url ?? null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      let processedSchedule = schedule;
      if (spawnType === "fixed_schedule" && Array.isArray(schedule) && schedule.length > 0) {
        processedSchedule = schedule.map((s: ScheduleSlot) => localSlotToUtc(s.day, s.time, tz));
      } else if (spawnType === "fixed_hours") {
        processedSchedule = {
          time: `${String(startHours).padStart(2, "0")}:${String(startMinutes).padStart(2, "0")}`,
          start_date: startDate,
          utc_start: toUtcTime(startDate, `${String(startHours).padStart(2, "0")}:${String(startMinutes).padStart(2, "0")}`, tz),
        };
      }

      const payload: Record<string, any> = {
        name: name.trim(),
        spawn_type: spawnType,
        respawn_hours: respawnHours,
        schedule: processedSchedule ?? null,
        is_recurring: true,
        ...(isServerMode ? { boss_points: isNaN(Number(points)) ? 1 : Number(points) } : { points: isNaN(Number(points)) ? 1 : Number(points) }),
        category: category || null,
        tags,
      };
      if (imageUrl !== null) payload.image_url = imageUrl;

      if (isServerMode) {
        await updateCustomBoss(boss.id, payload);
      } else {
        await updateBossTemplate(boss.id, payload);
      }
      onSaved();
    } catch (err: any) {
      console.error("Boss update failed:", err?.message || err?.code || err);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      const url = await uploadBossImage(gameSlug, name || "boss", file);
      setImageUrl(url);
    } catch { /* ignore */ }
  };

  return (
    <div className="border-t border-[#27272a] px-3 py-3 space-y-2 bg-[#18181b]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#fafafa]">Edit: {boss.name}</span>
        <button onClick={onCancel} className="text-[#71717a] hover:text-[#fafafa]"><X className="w-3 h-3" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
        </div>
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Spawn Type</label>
          <select value={spawnType} onChange={e => setSpawnType(e.target.value)} className="w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
            <option value="fixed_hours">Fixed Hours</option>
            <option value="fixed_schedule">Fixed Schedule</option>
          </select>
        </div>
        {spawnType === "fixed_hours" && (
          <>
          <div>
            <label className="block text-xs text-[#71717a] mb-0.5">Start Date</label>
            <input type="date" min={todayStr} value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b] [color-scheme:dark]" />
          </div>
          <div>
            <label className="block text-xs text-[#71717a] mb-0.5">Start Time <span className="text-[#52525b] ml-1">(your local time — saved as UTC)</span></label>
            <div className="flex items-center gap-1">
              <select value={startHours} onChange={e => setStartHours(e.target.value)} className="w-20 px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
                {Array.from({ length: 24 }, (_, i) => i)
                  .filter(h => !isToday || h >= nowHour)
                  .map(h => <option key={h} value={h}>{String(h).padStart(2,"0")}h</option>)}
              </select>
              <select value={startMinutes} onChange={e => setStartMinutes(e.target.value)} className="w-16 px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
                {Array.from({ length: 60 }, (_, i) => i)
                  .filter(m => !isToday || Number(startHours) > nowHour || m >= nowMin)
                  .map(m => <option key={m} value={m}>{String(m).padStart(2,"0")}m</option>)}
              </select>
            </div>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-[#71717a] mb-1">Respawn Time</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <select value={respawnHours != null ? Math.floor(respawnHours) : ""}
                  onChange={e => {
                    const h = Number(e.target.value) || 0;
                    const m = respawnHours != null ? Math.round((respawnHours % 1) * 60) : 0;
                    setRespawnHours(h + m / 60);
                  }}
                  className="w-20 px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
                  <option value="">h</option>
                  {Array.from({ length: 200 }, (_, i) => i).map(h => <option key={h} value={h}>{h}h</option>)}
                </select>
                <select value={respawnHours != null ? Math.round((respawnHours % 1) * 60) : 0}
                  onChange={e => {
                    const m = Number(e.target.value) || 0;
                    const h = respawnHours != null ? Math.floor(respawnHours) : 0;
                    setRespawnHours(h + m / 60);
                  }}
                  className="w-16 px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
                  {Array.from({ length: 60 }, (_, i) => i).map(m => <option key={m} value={m}>{m}m</option>)}
                </select>
              </div>
              <span className="text-xs text-[#52525b]">
                {respawnHours != null ? `${Math.floor(respawnHours)}h ${Math.round((respawnHours % 1) * 60)}m` : "—"}
              </span>
            </div>
          </div>
          </>
        )}
        {spawnType === "fixed_schedule" && (
          <div className="col-span-2">
            <label className="block text-xs text-[#71717a] mb-1">Weekly Schedule <span className="text-[#52525b] ml-1">(your local time — saved as UTC)</span></label>
            <div className="space-y-1.5">
              {(Array.isArray(schedule) ? schedule : []).map((slot: ScheduleSlot, i: number) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select value={slot.day} onChange={e => {
                    const updated = [...(Array.isArray(schedule) ? schedule : [])];
                    updated[i] = { ...updated[i], day: Number(e.target.value) };
                    setSchedule(updated);
                  }} className="w-16 px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
                    {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                  </select>
                  <input type="time" value={slot.time} onChange={e => {
                    const updated = [...(Array.isArray(schedule) ? schedule : [])];
                    updated[i] = { ...updated[i], time: e.target.value };
                    setSchedule(updated);
                  }} className="w-28 px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
                  <button onClick={() => {
                    setSchedule((Array.isArray(schedule) ? schedule : []).filter((_, j) => j !== i));
                  }} className="text-[#71717a] hover:text-[#f87171] transition"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setSchedule([...(Array.isArray(schedule) ? schedule : []), { day: 0, time: "21:00" }])} className="flex items-center gap-1 text-xs text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] px-3 py-2 rounded transition">
                <Plus className="w-4 h-4" /> Add spawn time
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Category</label>
          {(() => {
            const isCustom = category && !BOSS_CATEGORIES.includes(category);
            return (
              <>
                <select value={isCustom ? "__custom__" : category} onChange={e => setCategory(e.target.value === "__custom__" ? "" : e.target.value)} className="w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
                  <option value="">None</option>
                  {BOSS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">Other...</option>
                </select>
                {(isCustom || category === "") && (
                  <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Type custom category..." className="mt-1 w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
                )}
              </>
            );
          })()}
        </div>
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Points</label>
          <input value={points} onChange={e => setPoints(e.target.value === "" ? 0 : Number(e.target.value))} type="number" className="w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-[#71717a] mb-1">Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {BOSS_TAGS.map(t => (
              <label key={t} className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition ${tags.includes(t) ? "bg-[#18181b] text-[#d4d4d8] border-[#27272a]" : "bg-[#18181b] text-[#71717a] border border-[#27272a] hover:text-[#d4d4d8]"}`}>
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
        <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-[#d4d4d8] cursor-pointer transition">
          <Image className="w-3.5 h-3.5" /> {imageUrl ? "Replace Image" : "Add Image"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={e => { const file = e.target.files?.[0]; if (file) handleImageUpload(file); }}
            className="hidden" />
        </label>
        {imageUrl && (
          <div className="relative">
            <img src={imageUrl} alt="Boss" className="w-8 h-8 rounded object-cover border border-[#3f3f46]" />
            <button onClick={() => setImageUrl(null)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#3f3f46] text-[#fafafa] flex items-center justify-center hover:bg-[#52525b] transition">
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>
      <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</> : <><Save className="w-3 h-3" /> Save</>}
      </button>
    </div>
  );
}
