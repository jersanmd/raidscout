import { Search, Filter, Clock, Calendar, Activity, Hourglass } from "lucide-react";
import { FILTER_WINDOWS } from "@/lib/constants";

interface FilterBarProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  filterType: string;
  onFilterTypeChange: (type: string) => void;
  filterWindow: number | null;
  onFilterWindowChange: (hours: number | null) => void;
  extra?: React.ReactNode;
}

export function FilterBar({
  searchText,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterWindow,
  onFilterWindowChange,
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
          placeholder="Search bosses..."
          className="w-full pl-10 pr-4 py-2.5 bg-[#18181b] border border-[#27272a] rounded-xl text-[#fafafa] placeholder-[#52525b] text-sm outline-none focus:border-[#52525b] focus:ring-1 focus:ring-[#27272a] transition-all duration-200"
        />
      </div>

      {/* Filter chips — neon accent active states */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-[#71717a] shrink-0" />

        {/* Type filter */}
        <button
          onClick={() => onFilterTypeChange("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
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
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
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
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
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
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
            filterType === "activities"
              ? "bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46] "
              : "bg-[#18181b] text-[#71717a] border border-[#27272a] hover:text-[#d4d4d8] hover:border-[#27272a]"
          }`}
        >
          <Activity className="w-3 h-3" /> Activities
        </button>

        {/* Divider */}
        <span className="w-px h-5 bg-[#27272a]" />

        {/* Window filter — red glow for urgency */}
        {FILTER_WINDOWS.map((h) => (
          <button
            key={h}
            onClick={() => onFilterWindowChange(filterWindow === h ? null : h)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1 ${
              filterWindow === h
                ? "bg-[#18181b] text-[#a1a1aa] border border-[#3f3f46] "
                : "bg-[#18181b] text-[#71717a] border border-[#27272a] hover:text-[#d4d4d8] hover:border-[#27272a]"
            }`}
          >
            <Clock className="w-3 h-3" />{h}h
          </button>
        ))}
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
    </div>
  );
}
