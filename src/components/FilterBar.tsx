import { Search, Filter, Clock, Calendar, Activity, Hourglass, Shield } from "lucide-react";
import { FILTER_WINDOWS } from "@/lib/constants";
import type { Guild } from "@/types";

interface FilterBarProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  filterType: string;
  onFilterTypeChange: (type: string) => void;
  filterWindow: number | null;
  onFilterWindowChange: (hours: number | null) => void;
  filterGuild?: string;
  onFilterGuildChange?: (guild: string) => void;
  guilds?: Guild[];
  extra?: React.ReactNode;
}

export function FilterBar({
  searchText,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterWindow,
  onFilterWindowChange,
  filterGuild,
  onFilterGuildChange,
  guilds,
  extra,
}: FilterBarProps) {
  return (
    <div className="space-y-3">
      {/* Search — obsidian input with cyan focus glow */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717a]" />
        <input
          type="text"
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search bosses & activities..."
          className="w-full pl-10 pr-4 py-2.5 bg-[#18181b] border border-[#27272a] rounded-xl text-[#fafafa] placeholder-[#52525b] text-sm outline-none focus:border-[#52525b] focus:ring-1 focus:ring-[#27272a] transition-all duration-200"
        />
      </div>

      {/* Filter chips — neon accent active states */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#71717a] shrink-0" />

        {/* Type filter */}
        <button
          onClick={() => onFilterTypeChange("all")}
          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 ${
            filterType === "all"
              ? "bg-[#27272a] text-[#fafafa] border border-[#3f3f46]"
              : "bg-[#18181b] text-[#71717a] border border-[#27272a] hover:text-[#d4d4d8] hover:border-[#27272a]"
          }`}
        >
          All
        </button>
        <button
          onClick={() =>
            onFilterTypeChange(filterType === "fixed_hours" ? "all" : "fixed_hours")
          }
          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 flex items-center gap-1 ${
            filterType === "fixed_hours"
              ? "bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46] "
              : "bg-[#18181b] text-[#71717a] border border-[#27272a] hover:text-[#d4d4d8] hover:border-[#27272a]"
          }`}
        >
          <Hourglass className="w-3 h-3" /> Timer
        </button>
        <button
          onClick={() =>
            onFilterTypeChange(filterType === "fixed_schedule" ? "all" : "fixed_schedule")
          }
          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 flex items-center gap-1 ${
            filterType === "fixed_schedule"
              ? "bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46] "
              : "bg-[#18181b] text-[#71717a] border border-[#27272a] hover:text-[#d4d4d8] hover:border-[#27272a]"
          }`}
        >
          <Calendar className="w-3 h-3" /> Schedule
        </button>
        <button
          onClick={() =>
            onFilterTypeChange(filterType === "activities" ? "all" : "activities")
          }
          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 flex items-center gap-1 ${
            filterType === "activities"
              ? "bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46] "
              : "bg-[#18181b] text-[#71717a] border border-[#27272a] hover:text-[#d4d4d8] hover:border-[#27272a]"
          }`}
        >
          <Activity className="w-3 h-3" /> Activities
        </button>

        {/* Divider */}
        <span className="w-px h-5 bg-[#27272a] hidden sm:block" />

        {/* Window filter — red glow for urgency */}
        <span className="w-px h-5 bg-[#27272a] sm:hidden" />
        {FILTER_WINDOWS.map((h) => (
          <button
            key={h}
            onClick={() => onFilterWindowChange(filterWindow === h ? null : h)}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 flex items-center gap-1 ${
              filterWindow === h
                ? "bg-[#18181b] text-[#a1a1aa] border border-[#3f3f46] "
                : "bg-[#18181b] text-[#71717a] border border-[#27272a] hover:text-[#d4d4d8] hover:border-[#27272a]"
            }`}
          >
            <Clock className="w-3 h-3" />{h}h
          </button>
        ))}
        {/* Guild filter */}
        {guilds && guilds.length > 0 && onFilterGuildChange && (
          <>
            <span className="w-px h-5 bg-[#27272a]" />
            <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#71717a] shrink-0" />
            <select
              value={filterGuild ?? "all"}
              onChange={(e) => onFilterGuildChange(e.target.value)}
              className="bg-[#18181b] border border-[#27272a] rounded-lg px-2 py-1 sm:px-2.5 sm:py-1.5 text-[10px] sm:text-xs text-[#d4d4d8] outline-none focus:border-[#52525b] cursor-pointer max-w-[120px] sm:max-w-none"
            >
              <option value="all">All Guilds</option>
              {guilds.map((g) => (
                <option key={g.id} value={g.name}>{g.name}</option>
              ))}
            </select>
          </>
        )}
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
    </div>
  );
}
