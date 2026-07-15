import { useState, useRef } from "react";
import { Loader2, Plus, Save, X, Image } from "lucide-react";
import { localSlotToUtc, type ScheduleSlot } from "@/lib/scheduleTimezone";
import { toUtcTime } from "@/lib/activityCalculator";
import { createBossTemplate, uploadBossImage, createCustomBoss } from "@/lib/supabase";
import { useUserTimezone } from "@/hooks/useUserTimezone";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BOSS_CATEGORIES = ["World Boss", "Dungeon Boss", "Raid Boss", "Field Boss", "Event Boss"];
const BOSS_TAGS = ["world", "field", "dungeon", "raid", "pvp", "weekly", "daily", "elite", "mini", "guild", "solo", "party"];

interface Props {
  gameId?: string;
  gameSlug?: string;
  serverId?: string;
  onCreated: () => void;
  onCancel: () => void;
  /** Called with the new boss ID after creation (for chaining guild assignment etc.) */
  onCreatedWithId?: (bossId: string) => Promise<void>;
  /** When true, hides the internal submit button — parent provides its own */
  hideSubmitButton?: boolean;
  /** Ref to the form element for external submission */
  formRef?: React.RefObject<HTMLFormElement | null>;
}

export function AddBossForm({ gameId, gameSlug, serverId, onCreated, onCancel, onCreatedWithId, hideSubmitButton, formRef: externalFormRef }: Props) {
  const internalFormRef = useRef<HTMLFormElement>(null);
  const formRef = externalFormRef || internalFormRef;
  const isServerMode = !!serverId;
  const { timezone: userTz } = useUserTimezone();
  const tz = userTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const [name, setName] = useState("");
  const [spawnType, setSpawnType] = useState("fixed_hours");
  const [respawnHours, setRespawnHours] = useState("");
  // Start date/time for fixed_hours (stored as UTC, displayed in user TZ)
  const [startDate, setStartDate] = useState(todayStr);
  const isToday = startDate === todayStr;
  const nowHour = parseInt(new Date().toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }));
  const nowMin = parseInt(new Date().toLocaleTimeString("en-GB", { timeZone: tz, minute: "2-digit", hour12: false }));
  const defaultHour = isToday ? (nowHour + 1) % 24 : 0;
  const defaultMin = isToday && defaultHour === nowHour + 1 ? nowMin : 0;
  const [startHours, setStartHours] = useState(String(defaultHour));
  const [startMinutes, setStartMinutes] = useState(String(defaultMin));
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
        try { imageUrl = await uploadBossImage(gameSlug || "custom", name.trim(), imageFile); }
        catch (err) { console.error("Boss image upload failed:", err); }
      }
      if (isServerMode && serverId) {
        const schedule = spawnType === "fixed_schedule" && scheduleSlots.length > 0
          ? scheduleSlots.map(s => localSlotToUtc(s.day, s.time, userTz))
          : spawnType === "fixed_hours"
            ? { time: `${startHours.padStart(2, "0")}:${startMinutes.padStart(2, "0")}`, start_date: startDate, utc_start: toUtcTime(startDate, `${startHours.padStart(2, "0")}:${startMinutes.padStart(2, "0")}`, tz) }
            : null;
        const result = await createCustomBoss(serverId, {
          name: name.trim(), spawn_type: spawnType,
          respawn_hours: respawnHours ? Number(respawnHours) : null,
          schedule, is_recurring: true,
          boss_points: isNaN(Number(points)) ? 1 : Number(points),
          category: category === "__custom__" ? customCategory || null : category || null,
          tags,
          image_url: imageUrl || null,
        });
        if (onCreatedWithId) {
          await onCreatedWithId(result.id);
        }
      } else {
      await createBossTemplate({
        game_id: gameId!,
        name: name.trim(),
        spawn_type: spawnType,
        respawn_hours: respawnHours ? Number(respawnHours) : null,
        schedule: spawnType === "fixed_schedule" && scheduleSlots.length > 0
          ? scheduleSlots.map(s => localSlotToUtc(s.day, s.time, userTz))
          : spawnType === "fixed_hours"
            ? { time: `${startHours.padStart(2, "0")}:${startMinutes.padStart(2, "0")}`, start_date: startDate, utc_start: toUtcTime(startDate, `${startHours.padStart(2, "0")}:${startMinutes.padStart(2, "0")}`, tz) }
            : null,
        is_recurring: true,
        points: isNaN(Number(points)) ? 1 : Number(points),
        category: category === "__custom__" ? customCategory || null : category || null,
        tags,
      });
      }
      onCreated();
    } catch (err: any) {
      console.error("Boss creation failed:", err?.message || err?.code || err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="bg-[#18181b] border border-[#27272a] rounded-lg p-3 mb-2 space-y-2">
      <div className="flex items-center justify-between">
        {isServerMode ? <span className="text-xs font-medium text-[#fafafa]">New Custom Boss</span> : <span className="text-xs font-medium text-[#fafafa]">New Boss Template</span>}
        <button type="button" onClick={onCancel} className="text-[#71717a] hover:text-[#fafafa]"><X className="w-3 h-3" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="w-full px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
        </div>
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Spawn Type</label>
          <select value={spawnType} onChange={e => { setSpawnType(e.target.value); setScheduleSlots([]); }} className="w-full px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
            <option value="fixed_hours">Fixed Hours</option>
            <option value="fixed_schedule">Fixed Schedule</option>
          </select>
        </div>
        {spawnType === "fixed_hours" && (
          <>
          <div>
            <label className="block text-xs text-[#71717a] mb-0.5">Start Date</label>
            <input type="date" min={todayStr} value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b] [color-scheme:dark]" />
          </div>
          <div>
            <label className="block text-xs text-[#71717a] mb-0.5">Start Time <span className="text-[#52525b] ml-1">(your local time — saved as UTC)</span></label>
            <div className="flex items-center gap-1">
              <select value={startHours} onChange={e => setStartHours(e.target.value)} className="w-20 px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
                {Array.from({ length: 24 }, (_, i) => i)
                  .filter(h => !isToday || h >= nowHour)
                  .map(h => <option key={h} value={h}>{String(h).padStart(2,"0")}h</option>)}
              </select>
              <select value={startMinutes} onChange={e => setStartMinutes(e.target.value)} className="w-16 px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
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
                <select
                  value={respawnHours ? Math.floor(Number(respawnHours)) : ""}
                  onChange={e => {
                    const h = Number(e.target.value) || 0;
                    const m = respawnHours ? Math.round((Number(respawnHours) % 1) * 60) : 0;
                    setRespawnHours(String(h + m / 60));
                  }}
                  className="w-20 px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
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
                  className="w-16 px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
                  {Array.from({ length: 60 }, (_, i) => i).map(m => <option key={m} value={m}>{m}m</option>)}
                </select>
              </div>
              <span className="text-xs text-[#52525b]">
                {respawnHours ? `${Math.floor(Number(respawnHours))}h ${Math.round((Number(respawnHours) % 1) * 60)}m` : "—"}
              </span>
            </div>
          </div>
          </>
        )}
        {spawnType === "fixed_schedule" && (
          <div className="col-span-2">
            <label className="block text-xs text-[#71717a] mb-1">Weekly Schedule <span className="text-[#52525b] ml-1">(your local time — saved as UTC)</span></label>
            <div className="space-y-1.5">
              {scheduleSlots.map((slot, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select value={slot.day} onChange={e => {
                    const updated = [...scheduleSlots];
                    updated[i] = { ...updated[i], day: Number(e.target.value) };
                    setScheduleSlots(updated);
                  }} className="w-16 px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
                    {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                  </select>
                  <input type="time" value={slot.time} onChange={e => {
                    const updated = [...scheduleSlots];
                    updated[i] = { ...updated[i], time: e.target.value };
                    setScheduleSlots(updated);
                  }} className="w-28 px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
                  <button onClick={() => setScheduleSlots(scheduleSlots.filter((_, j) => j !== i))} className="text-[#71717a] hover:text-[#f87171] transition"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setScheduleSlots([...scheduleSlots, { day: 0, time: "21:00" }])} className="flex items-center gap-1 text-xs text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] px-3 py-2 rounded transition">
                <Plus className="w-4 h-4" /> Add spawn time
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
            <option value="">None</option>
            {BOSS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__custom__">Other...</option>
          </select>
          {category === "__custom__" && (
            <input value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Type custom category..." className="mt-1 w-full px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
          )}
        </div>
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Points</label>
          <input value={points} onChange={e => setPoints(e.target.value === "" ? 0 : Number(e.target.value))} type="number" className="w-full px-2.5 py-2 bg-[#18181b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
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
      <div>
        <label className="block text-xs text-[#a1a1aa] mb-1">Boss Image</label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#27272a] hover:bg-[#3f3f46] text-[#d4d4d8] cursor-pointer transition">
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
              <img src={imagePreview} alt="Preview" className="w-8 h-8 rounded object-cover border border-[#3f3f46]" />
              <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#3f3f46] text-[#fafafa] flex items-center justify-center hover:bg-[#52525b] transition">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>
      </div>
      {!hideSubmitButton && (
      <button type="submit" disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</> : <><Save className="w-3 h-3" /> Add</>}
      </button>
      )}
    </form>
  );
}
