import { Search, Filter } from "lucide-react";
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
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search..."
          className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition text-sm"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-slate-500 shrink-0" />

        {/* Type filter */}
        <button
          onClick={() => onFilterTypeChange("all")}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
            filterType === "all"
              ? "bg-slate-700 text-white"
              : "bg-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          All
        </button>
        <button
          onClick={() =>
            onFilterTypeChange(filterType === "fixed_hours" ? "all" : "fixed_hours")
          }
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1 ${
            filterType === "fixed_hours"
              ? "bg-orange-900/40 text-orange-400 border border-orange-800"
              : "bg-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          Timer
        </button>
        <button
          onClick={() =>
            onFilterTypeChange(filterType === "fixed_schedule" ? "all" : "fixed_schedule")
          }
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1 ${
            filterType === "fixed_schedule"
              ? "bg-blue-900/40 text-blue-400 border border-blue-800"
              : "bg-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          Schedule
        </button>
        <button
          onClick={() =>
            onFilterTypeChange(filterType === "activities" ? "all" : "activities")
          }
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition flex items-center gap-1 ${
            filterType === "activities"
              ? "bg-cyan-900/40 text-cyan-400 border border-cyan-800"
              : "bg-slate-800 text-slate-400 hover:text-slate-200"
          }`}
        >
          Activities
        </button>

        {/* Divider */}
        <span className="w-px h-4 bg-slate-700" />

        {/* Window filter */}
        {FILTER_WINDOWS.map((h) => (
          <button
            key={h}
            onClick={() => onFilterWindowChange(filterWindow === h ? null : h)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
              filterWindow === h
                ? "bg-red-900/40 text-red-400 border border-red-800"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {h}h
          </button>
        ))}
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
    </div>
  );
}
