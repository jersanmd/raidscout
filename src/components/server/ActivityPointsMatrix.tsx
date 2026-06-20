import { useState, useMemo, Fragment } from "react";
import type { Activity, Guild, ActivityGuild, ActivityAssist } from "@/types";
import { Loader2, Minus, Plus, Search } from "lucide-react";

export function ActivityPointsMatrix({
  activities,
  guilds,
  allActivityGuilds,
  activityAssists,
  savingCell,
  onPointsChange,
  onSalaryChange,
  onAssistToggle,
}: {
  activities: Activity[];
  guilds: Guild[];
  allActivityGuilds: ActivityGuild[];
  activityAssists: ActivityAssist[];
  savingCell: string | null;
  onPointsChange: (activityId: string, guildId: string, points: number | null) => Promise<void>;
  onSalaryChange: (activityId: string, guildId: string, hasSalary: boolean) => Promise<void>;
  onAssistToggle: (activityId: string, ownerGuildId: string, assistantGuildId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const bgLookup = useMemo(() => {
    const map = new Map<string, ActivityGuild>();
    for (const ag of allActivityGuilds) {
      map.set(`${ag.activity_id}|${ag.guild_id}`, ag);
    }
    return map;
  }, [allActivityGuilds]);

  const enabledActivities = activities.filter(a => a.is_enabled);
  const filteredActivities = search.trim()
    ? enabledActivities.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : enabledActivities;

  if (guilds.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[#71717a] text-xs">No guilds created yet.</p>
      </div>
    );
  }

  if (enabledActivities.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[#52525b] text-xs">No activities in this server.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-3 sm:mx-0">
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
          <input
            type="text"
            placeholder="Search activities..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-[#18181b] border border-[#27272a] rounded-lg text-xs text-[#fafafa] placeholder-[#52525b] focus:outline-none focus:border-[#52525b]"
          />
        </div>
      </div>
        <table className="w-full text-[10px] sm:text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[#18181b] px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[#a1a1aa] font-medium border-b border-r border-[#27272a]/50 z-10 min-w-[120px] sm:min-w-[160px]">
                Activity
              </th>
              {guilds.map(g => (
                <th key={g.id} colSpan={3} className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-center text-[#a1a1aa] font-medium border-b border-[#27272a]/50 border-l border-[#27272a]/30">
                  <span className="text-[10px] sm:text-xs">{g.name}</span>
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 bg-[#18181b] px-3 py-1 border-r border-[#27272a]/50 z-10" />
              {guilds.map(g => (
                <Fragment key={g.id}>
                  <th className="px-2 py-1 text-center text-[10px] text-[#71717a] font-normal border-l border-[#27272a]/30">Pts</th>
                  <th className="px-2 py-1 text-center text-[10px] text-[#71717a] font-normal border-l border-[#27272a]/30">Sal</th>
                  <th className="px-2 py-1 text-center text-[10px] text-[#71717a] font-normal border-l border-[#27272a]/30">Ast</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredActivities.map(activity => (
              <tr key={activity.id} className="group border-b border-[#27272a]/50 hover:bg-[#18181b]/20 transition">
                <td className="sticky left-0 bg-[#18181b] group-hover:bg-[#18181b]/20 px-2 sm:px-3 py-1.5 sm:py-2 text-[#fafafa] font-medium border-r border-[#27272a]/30 z-10 transition">
                  {activity.name}
                </td>
                {guilds.map(guild => {
                  const key = `${activity.id}|${guild.id}`;
                  const ag = bgLookup.get(key);
                  const points = ag?.points ?? activity.points_per_participant ?? 1;
                  const hasSalary = ag?.has_salary ?? false;
                  const isSaving = savingCell === `${activity.id}-${guild.id}`;

                  return (
                    <Fragment key={guild.id}>
                      <td className="px-1 py-1 text-center border-l border-[#27272a]/30">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={() => onPointsChange(activity.id, guild.id, Math.max(0, points - 1))}
                            disabled={isSaving || points <= 0}
                            className={`p-0.5 rounded transition ${points <= 0 ? "text-[#3f3f46] cursor-default" : "text-[#71717a] hover:text-[#f87171]"}`}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono tabular-nums min-w-[1.5em] text-center text-[#a1a1aa]">
                            {isSaving ? <Loader2 className="w-3 h-3 animate-spin inline" /> : points}
                          </span>
                          <button
                            onClick={() => onPointsChange(activity.id, guild.id, Math.min(99, points + 1))}
                            disabled={isSaving || points >= 99}
                            className={`p-0.5 rounded transition ${points >= 99 ? "text-[#3f3f46] cursor-default" : "text-[#71717a] hover:text-[#a1a1aa]"}`}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-1 py-1 text-center border-l border-[#27272a]/30">
                        <input
                          type="checkbox"
                          checked={hasSalary}
                          disabled={isSaving}
                          onChange={() => onSalaryChange(activity.id, guild.id, !hasSalary)}
                          className="w-3 h-3 rounded border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] focus:ring-[#52525b]/50 cursor-pointer disabled:opacity-50"
                        />
                      </td>
                      <td className="px-1 py-1 text-center border-l border-[#27272a]/30">
                        {(() => {
                          const myAssists = activityAssists.filter(a => a.activity_id === activity.id && a.assistant_guild_id === guild.id);
                          const ownerIds = myAssists.map(a => a.owner_guild_id);
                          return (
                            <div className="flex flex-wrap items-center justify-center gap-0.5 min-w-[28px]">
                              {ownerIds.map(oid => {
                                const ownerGuild = guilds.find(g => g.id === oid);
                                return (
                                  <span key={oid} className="inline-flex items-center gap-0.5 bg-purple-900/30 border border-[#27272a]/50 rounded px-1 py-0.5 text-[9px] text-[#d4d4d8] leading-none">
                                    {ownerGuild?.name?.slice(0, 6) || "?"}
                                    <button onClick={(e) => { e.stopPropagation(); onAssistToggle(activity.id, oid, guild.id); }} className="text-[#a1a1aa] hover:text-[#f87171] leading-none">×</button>
                                  </span>
                                );
                              })}
                              {(() => {
                                const availGuilds = guilds.filter(g => g.id !== guild.id && !ownerIds.includes(g.id));
                                if (availGuilds.length === 0) return null;
                                return (
                                  <select
                                    value=""
                                    onChange={(e) => { if (e.target.value) { onAssistToggle(activity.id, e.target.value, guild.id); e.target.value = ""; }}}
                                    className="bg-transparent text-[9px] text-[#71717a] hover:text-[#a1a1aa] cursor-pointer outline-none"
                                  >
                                    <option value="">+</option>
                                    {availGuilds.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                  </select>
                                );
                              })()}
                            </div>
                          );
                        })()}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
}
