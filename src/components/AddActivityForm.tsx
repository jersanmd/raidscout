import { useState, useRef } from "react";
import { Loader2, Plus, Save, X, Image } from "lucide-react";
import { localSlotToUtc, type ScheduleSlot } from "@/lib/scheduleTimezone";
import { toUtcTime } from "@/lib/activityCalculator";
import { createActivityTemplate, uploadActivityImage, createCustomActivity } from "@/lib/supabase";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACTIVITY_CATEGORIES = ["Guild War", "Siege", "Arena", "Dungeon Run", "World Event", "Farming", "Trading", "Crafting"];
const ACTIVITY_TAGS = ["pvp", "pve", "guild", "solo", "party", "weekly", "daily", "competitive", "casual", "scheduled"];

interface Props {
  gameId: string;
  gameSlug: string;
  serverId?: string;
  timezone?: string;
  onCreated: () => void;
  onCancel: () => void;
  /** Called with the new activity ID after creation (for chaining guild assignment etc.) */
  onCreatedWithId?: (activityId: string) => Promise<void>;
  /** When true, hides the internal submit button — parent provides its own */
  hideSubmitButton?: boolean;
  /** Ref to the form element for external submission */
  formRef?: React.RefObject<HTMLFormElement | null>;
}

export function AddActivityForm({ gameId, gameSlug, serverId, timezone, onCreated, onCancel, onCreatedWithId, hideSubmitButton, formRef: externalFormRef }: Props) {
  const internalFormRef = useRef<HTMLFormElement>(null);
  const formRef = externalFormRef || internalFormRef;
  const isServerMode = !!serverId;
  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState("fixed_hours");
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const [startDate, setStartDate] = useState(todayStr);
  const isToday = startDate === todayStr;
  const nowHour = parseInt(new Date().toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }));
  const nowMin = parseInt(new Date().toLocaleTimeString("en-GB", { timeZone: tz, minute: "2-digit", hour12: false }));
  // Default start time: next valid time (current hour+1 if today, 0 otherwise)
  const defaultHour = isToday ? (nowHour + 1) % 24 : 0;
  const defaultMin = isToday && defaultHour === nowHour + 1 ? nowMin : 0;
  const [startHours, setStartHours] = useState(String(defaultHour));
  const [startMinutes, setStartMinutes] = useState(String(defaultMin));
  const [recurHours, setRecurHours] = useState("2");
  const [recurMinutes, setRecurMinutes] = useState("0");
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
        try { imageUrl = await uploadActivityImage(gameSlug || "custom", name.trim(), imageFile); }
        catch (err) { console.error("Activity image upload failed:", err); }
      }
      if (isServerMode && serverId) {
        const sched = scheduleType === "fixed_schedule" && scheduleSlots.length > 0
          ? scheduleSlots.map(s => localSlotToUtc(s.day, s.time, tz))
          : (scheduleType === "fixed_hours" || scheduleType === "one_time")
            ? { time: `${startHours.padStart(2, "0")}:${startMinutes.padStart(2, "0")}`, start_date: startDate, utc_start: toUtcTime(startDate, `${startHours.padStart(2, "0")}:${startMinutes.padStart(2, "0")}`, tz) }
            : null;
        const result = await createCustomActivity(serverId, {
          name: name.trim(),
          schedule_type: scheduleType,
          schedule: sched,
          duration_minutes: scheduleType === "fixed_hours" ? (parseInt(recurHours) || 0) * 60 + (parseInt(recurMinutes) || 0) : null,
          points_per_participant: isNaN(Number(pointsPerParticipant)) ? 1 : Number(pointsPerParticipant),
          party_size: partySize ? Number(partySize) : null,
          category: category || null, tags,
          image_url: imageUrl || null,
        });
        if (onCreatedWithId) {
          await onCreatedWithId(result.id);
        }
      } else {
      await createActivityTemplate({
        game_id: gameId,
        name: name.trim(),
        schedule_type: scheduleType,
        schedule: scheduleType === "fixed_schedule" && scheduleSlots.length > 0
          ? scheduleSlots.map(s => localSlotToUtc(s.day, s.time, tz))
          : (scheduleType === "fixed_hours" || scheduleType === "one_time")
            ? { time: `${startHours.padStart(2, "0")}:${startMinutes.padStart(2, "0")}`, start_date: startDate, utc_start: toUtcTime(startDate, `${startHours.padStart(2, "0")}:${startMinutes.padStart(2, "0")}`, tz) }
            : undefined,
        duration_minutes: scheduleType === "fixed_hours" ? (parseInt(recurHours) || 0) * 60 + (parseInt(recurMinutes) || 0) : null,
        points_per_participant: isNaN(Number(pointsPerParticipant)) ? 1 : Number(pointsPerParticipant),
        party_size: partySize ? Number(partySize) : null,
        category: category || null,
        tags,
        image_url: imageUrl,
      });
      }
      onCreated();
    } catch (err: any) {
      console.error("Activity creation failed:", err?.message || err?.code || err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="bg-[#18181b] border border-[#27272a] rounded-lg p-3 mb-2 space-y-2">
      <div className="flex items-center justify-between">
        {isServerMode ? <span className="text-sm font-medium text-[#fafafa]">New Custom Activity</span> : <span className="text-sm font-medium text-[#fafafa]">New Activity Template</span>}
        <button type="button" onClick={onCancel} className="text-[#71717a] hover:text-[#fafafa]"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
        </div>
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Schedule Type</label>
          <select value={scheduleType} onChange={e => { setScheduleType(e.target.value); setScheduleSlots([]); }} className="w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
            <option value="fixed_hours">Fixed Hours</option>
            <option value="fixed_schedule">Fixed Schedule</option>
            <option value="one_time">One Time</option>
          </select>
        </div>
        {(scheduleType === "fixed_hours" || scheduleType === "one_time") && (
          <>
          <div>
            <label className="block text-xs text-[#71717a] mb-0.5">Start Date</label>
            <input type="date" min={todayStr} value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b] [color-scheme:dark]" />
          </div>
          <div>
            <label className="block text-xs text-[#71717a] mb-0.5">Start Time</label>
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
          {scheduleType === "fixed_hours" && (
            <div>
              <label className="block text-xs text-[#71717a] mb-0.5">Recurs every</label>
              <div className="flex items-center gap-1">
                <input type="number" min="0" max="168" value={recurHours} onChange={e => setRecurHours(e.target.value)} className="w-16 px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
                <span className="text-xs text-[#71717a]">h</span>
                <select value={recurMinutes} onChange={e => setRecurMinutes(e.target.value)} className="w-16 px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
                  {Array.from({ length: 60 }, (_, i) => i).map(m => <option key={m} value={m}>{m}m</option>)}
                </select>
              </div>
            </div>
          )}
          </>
        )}
        {scheduleType === "fixed_schedule" && (
          <div className="col-span-2">
            <label className="block text-xs text-[#71717a] mb-1">Weekly Schedule <span className="text-[#52525b] ml-1">(your local time — saved as UTC)</span></label>
            <div className="space-y-1.5">
              {scheduleSlots.map((slot, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select value={slot.day} onChange={e => {
                    const updated = [...scheduleSlots];
                    updated[i] = { ...updated[i], day: Number(e.target.value) };
                    setScheduleSlots(updated);
                  }} className="w-16 px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
                    {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                  </select>
                  <input type="time" value={slot.time} onChange={e => {
                    const updated = [...scheduleSlots];
                    updated[i] = { ...updated[i], time: e.target.value };
                    setScheduleSlots(updated);
                  }} className="w-28 px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
                  <button onClick={() => setScheduleSlots(scheduleSlots.filter((_, j) => j !== i))} className="text-[#71717a] hover:text-[#f87171] transition"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setScheduleSlots([...scheduleSlots, { day: 0, time: "21:00" }])} className="flex items-center gap-1 text-xs text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a] px-3 py-2 rounded transition">
                <Plus className="w-4 h-4" /> Add time slot
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Party Size</label>
          <input value={partySize} onChange={e => setPartySize(e.target.value)} placeholder="e.g. 5" type="number" className="w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
        </div>
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Points per Participant</label>
          <input value={pointsPerParticipant} onChange={e => setPointsPerParticipant(e.target.value === "" ? 0 : Number(e.target.value))} type="number" className="w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]" />
        </div>
        <div>
          <label className="block text-xs text-[#71717a] mb-0.5">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-2.5 py-2 bg-[#09090b] border border-[#3f3f46] rounded text-sm text-[#fafafa] focus:outline-none focus:ring-1 focus:ring-[#52525b]">
            <option value="">None</option>
            {ACTIVITY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-[#71717a] mb-1">Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_TAGS.map(t => (
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
        <label className="block text-xs text-[#71717a] mb-1">Activity Image</label>
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
      <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b] transition disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</> : <><Save className="w-3.5 h-3.5" /> Add Activity</>}
      </button>
      )}
    </form>
  );
}
