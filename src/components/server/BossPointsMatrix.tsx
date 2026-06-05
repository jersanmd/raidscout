import { useState, useMemo, Fragment } from "react";
import type { Boss, Guild, BossGuild, BossAssist } from "@/types";
import { Loader2, Minus, Plus, Search, Shield } from "lucide-react";

const BOSS_PRIORITY_LIST = [
  "Venatus", "Viorent", "Ego", "Clemantis", "Livera", "Araneo", "Undomiel",
  "Saphirus", "Neutro", "Lady Dalia", "General Aquleus", "Thymele", "Amentis",
  "Baron", "Milavy", "Wannitas", "Metus", "Duplican", "Shuliar", "Ringor",
  "Roderick", "Gareth", "Titore", "Larba", "Catena", "Auraq", "Secreta",
  "Ordo", "Asta", "Supore", "Chaiflock", "Benji", "Libitina", "Rakajeth",
  "Icaruthia", "Motti", "Nevaeh", "Tumier", "Lucus",
];

export function BossPointsMatrix({
  bosses,
  guilds,
  allBossGuilds,
  bossAssists,
  savingCell,
  onPointsChange,
  onSalaryChange,
  onBatchSalaryChange,
  onAssistToggle,
}: {
  bosses: Boss[];
  guilds: Guild[];
  allBossGuilds: BossGuild[];
  bossAssists: BossAssist[];
  savingCell: string | null;
  onPointsChange: (bossId: string, guildId: string, points: number | null) => Promise<void>;
  onSalaryChange: (bossId: string, guildId: string, hasSalary: boolean) => Promise<void>;
  onBatchSalaryChange: (guildId: string, bossIds: string[], hasSalary: boolean) => Promise<void>;
  onAssistToggle: (bossId: string, ownerGuildId: string, assistantGuildId: string) => Promise<void>;
}) {
  const sortedBosses = useMemo(() => {
    return [...bosses].sort((a, b) => {
      const ia = BOSS_PRIORITY_LIST.indexOf(a.name);
      const ib = BOSS_PRIORITY_LIST.indexOf(b.name);
      if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [bosses]);

  const bgLookup = useMemo(() => {
    const map = new Map<string, BossGuild>();
    for (const bg of allBossGuilds) {
      map.set(`${bg.boss_id}|${bg.guild_id}`, bg);
    }
    return map;
  }, [allBossGuilds]);

  const guildAllChecked = useMemo(() => {
    const result = new Map<string, boolean>();
    for (const guild of guilds) {
      const allChecked = sortedBosses.every(boss => {
        const bg = bgLookup.get(`${boss.id}|${guild.id}`);
        return bg?.has_salary === true;
      });
      result.set(guild.id, allChecked);
    }
    return result;
  }, [guilds, sortedBosses, bgLookup]);

  const handleCheckAllSalary = async (guildId: string) => {
    const currentlyAll = guildAllChecked.get(guildId) ?? false;
    const target = !currentlyAll;
    const bossIds = sortedBosses.map(b => b.id);
    try {
      await onBatchSalaryChange(guildId, bossIds, target);
    } catch (err: any) {
      console.error("Check-all salary failed:", err?.message ?? err);
    }
  };

  const [search, setSearch] = useState("");

  if (guilds.length === 0) {
    return (
      <div className="text-center py-16">
        <Shield className="w-10 h-10 text-[#3f3f46] mx-auto mb-3" />
        <p className="text-[#71717a]">No guilds created yet.</p>
        <p className="text-[#52525b] text-sm mt-1">Create guilds in the Guilds tab first.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#09090b] border border-[#27272a] rounded-xl p-3 sm:p-4 max-w-full">
      <div className="flex items-center gap-2 sm:gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-[10px] text-[#71717a] flex-wrap">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Fixed Hours</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" /> Schedule</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> One-time</span>
        </div>
        <div className="flex-1 hidden sm:block" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#52525b]" />
          <input
            type="text"
            placeholder="Search bosses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-32 sm:w-40 bg-[#18181b] border border-[#27272a] rounded pl-7 pr-2 py-1 text-[10px] sm:text-xs text-[#fafafa] placeholder-[#52525b] outline-none focus:border-[#52525b] transition"
          />
        </div>
      </div>
      <div className="overflow-x-auto -mx-3 sm:mx-0">
      <table className="w-full text-[10px] sm:text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-[#09090b] px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[#a1a1aa] font-medium border-b border-r border-[#27272a]/50 z-10 min-w-[120px] sm:min-w-[160px]">
              Boss
            </th>
            {guilds.map(g => (
              <th key={g.id} colSpan={3} className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-center text-[#a1a1aa] font-medium border-b border-[#27272a]/50 border-l border-[#27272a]/30">
                <span className="text-[10px] sm:text-xs">{g.name}</span>
              </th>
            ))}
          </tr>
          <tr>
            <th className="sticky left-0 bg-[#09090b] px-3 py-1 border-r border-[#27272a]/50 z-10" />
            {guilds.map(g => (
              <Fragment key={g.id}>
                <th className="px-2 py-1 text-center text-[10px] text-[#71717a] font-normal border-l border-[#27272a]/30">Pts</th>
                <th className="px-2 py-1 text-center border-l-0">
                  <label className="flex items-center justify-center gap-1 cursor-pointer" title="Check/uncheck all salaries for this guild">
                    <input
                      type="checkbox"
                      checked={guildAllChecked.get(g.id) ?? false}
                      onChange={() => handleCheckAllSalary(g.id)}
                      className="w-3 h-3 rounded border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] focus:ring-[#52525b]/50 cursor-pointer"
                    />
                    <span className="text-[10px] text-[#71717a] font-normal">Salary</span>
                  </label>
                </th>
                <th className="px-2 py-1 text-center text-[10px] text-[#71717a] font-normal border-l border-[#27272a]/30">Ast</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedBosses.filter(boss => !search || boss.name.toLowerCase().includes(search.toLowerCase())).map(boss => (
            <tr key={boss.id} className="group border-b border-[#27272a]/50 hover:bg-[#18181b]/20 transition">
              <td className="sticky left-0 bg-[#09090b] group-hover:bg-[#18181b]/20 px-2 sm:px-3 py-1.5 sm:py-2 text-[#fafafa] font-medium border-r border-[#27272a]/30 z-10 transition">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    boss.spawn_type === "fixed_schedule" ? "bg-violet-400" :
                    boss.spawn_type === "one_time" ? "bg-amber-400" :
                    "bg-emerald-400"
                  }`} />
                  {boss.name}
                </div>
              </td>
              {guilds.map(guild => {
                const key = `${boss.id}|${guild.id}`;
                const bg = bgLookup.get(key);
                const points = bg?.points ?? null;
                const hasSalary = bg?.has_salary ?? false;
                const isSaving = savingCell === `${boss.id}-${guild.id}`;

                return (
                  <Fragment key={guild.id}>
                    <td className="px-1 py-1 text-center border-l border-[#27272a]/30">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => onPointsChange(boss.id, guild.id, Math.max(0, (points ?? 1) - 1))}
                          disabled={isSaving || (points ?? 1) <= 0}
                          className={`p-0.5 rounded transition ${(points ?? 1) <= 0 ? "text-[#3f3f46] cursor-default" : "text-[#71717a] hover:text-[#f87171]"}`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className={`font-mono tabular-nums min-w-[1.5em] text-center ${points != null ? "text-[#a1a1aa]" : "text-[#71717a]"}`}>
                          {isSaving ? <Loader2 className="w-3 h-3 animate-spin inline" /> : (points ?? boss.boss_points ?? 1)}
                        </span>
                        <button
                          onClick={() => onPointsChange(boss.id, guild.id, Math.min(99, (points ?? 1) + 1))}
                          disabled={isSaving || (points ?? 1) >= 99}
                          className={`p-0.5 rounded transition ${(points ?? 1) >= 99 ? "text-[#3f3f46] cursor-default" : "text-[#71717a] hover:text-[#a1a1aa]"}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={hasSalary}
                        disabled={isSaving}
                        onChange={() => onSalaryChange(boss.id, guild.id, !hasSalary)}
                        className="w-3 h-3 rounded border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] focus:ring-[#52525b]/50 cursor-pointer disabled:opacity-50"
                      />
                    </td>
                    <td className="px-1 py-1 text-center border-l border-[#27272a]/30">
                      {(() => {
                        const myAssists = bossAssists.filter(a => a.boss_id === boss.id && a.assistant_guild_id === guild.id);
                        const ownerIds = myAssists.map(a => a.owner_guild_id);
                        return (
                          <div className="flex flex-wrap items-center justify-center gap-0.5 min-w-[28px]">
                            {ownerIds.map(oid => {
                              const ownerGuild = guilds.find(g => g.id === oid);
                              return (
                                <span key={oid} className="inline-flex items-center gap-0.5 bg-purple-900/30 border border-[#27272a]/50 rounded px-1 py-0.5 text-[9px] text-[#d4d4d8] leading-none">
                                  {ownerGuild?.name?.slice(0, 6) || "?"}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); onAssistToggle(boss.id, oid, guild.id); }}
                                    className="text-[#a1a1aa] hover:text-[#f87171] leading-none"
                                  >×</button>
                                </span>
                              );
                            })}
                            {(() => {
                              const availGuilds = guilds.filter(g => g.id !== guild.id && !ownerIds.includes(g.id));
                              if (availGuilds.length === 0) return null;
                              return (
                                <select
                                  value=""
                                  onChange={(e) => { if (e.target.value) { onAssistToggle(boss.id, e.target.value, guild.id); e.target.value = ""; }}}
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
      <p className="text-[10px] text-[#52525b] mt-2 text-center">
        Points default to server-wide value if not overridden. Salary is per-guild.
      </p>
    </div>
  );
}
