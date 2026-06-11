import { Check, Sparkles, AlertCircle, UserCheck } from "lucide-react";

interface RallyImageOverlayProps {
  src: string;
  alt: string;
  /** Names of participants already checked in the attendance list */
  attendingNames?: string[];
  exactMatches?: string[];
  fuzzyMatches?: Map<string, { id: string; name: string }>;
  unmatched?: string[];
  alreadyAttended?: string[];
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Renders a rally image with a bar of name badges below it.
 * In ParticipantModal: shows who's already checked as attending.
 * In DeathRecordModal: shows AI-detected names with match status.
 */
export function RallyImageOverlay({
  src,
  alt,
  attendingNames = [],
  exactMatches = [],
  fuzzyMatches = new Map(),
  unmatched = [],
  alreadyAttended = [],
  className = "",
  onClick,
}: RallyImageOverlayProps) {
  const hasAnyResults =
    attendingNames.length > 0 ||
    exactMatches.length > 0 ||
    fuzzyMatches.size > 0 ||
    unmatched.length > 0 ||
    alreadyAttended.length > 0;

  if (!hasAnyResults) {
    return <img src={src} alt={alt} className={className} onClick={onClick} />;
  }

  return (
    <div className="flex flex-col items-center" onClick={onClick}>
      <img src={src} alt={alt} className={className} />

      {/* Name badge bar — below the image, never blocking content */}
      <div className="w-full p-3 bg-black/80 rounded-b-lg">
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {/* Attending (checked) — green ✓ */}
          {attendingNames.map((name) => (
            <span
              key={`attending-${name}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-emerald-900/80 text-emerald-200 border border-emerald-700/50"
            >
              <Check className="w-2.5 h-2.5 shrink-0" />
              {name}
            </span>
          ))}

          {/* AI: exact matches — green ✓ */}
          {exactMatches.map((name) => (
            <span
              key={`exact-${name}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-emerald-900/80 text-emerald-200 border border-emerald-700/50"
              title={`Matched & checked: ${name}`}
            >
              <Check className="w-2.5 h-2.5 shrink-0" />
              {name}
            </span>
          ))}

          {/* AI: fuzzy matches — amber ✓ */}
          {[...fuzzyMatches.entries()].map(([detected, member]) => (
            <span
              key={`fuzzy-${detected}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-amber-900/80 text-amber-200 border border-amber-700/50"
            >
              <Check className="w-2.5 h-2.5 shrink-0" />
              {member.name}
            </span>
          ))}

          {/* AI: unmatched — red ? */}
          {unmatched.map((name) => (
            <span
              key={`unm-${name}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-red-900/80 text-red-200 border border-red-700/50"
              title={`Not matched — needs manual add: ${name}`}
            >
              <AlertCircle className="w-2.5 h-2.5 shrink-0" />
              {name}
            </span>
          ))}

          {/* AI: already attending — gray */}
          {alreadyAttended.map((name) => (
            <span
              key={`att-${name}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[#3f3f46] text-[#a1a1aa] border border-[#52525b]"
              title={`Already attending: ${name}`}
            >
              <Sparkles className="w-2.5 h-2.5 shrink-0" />
              {name}
            </span>
          ))}
        </div>

        {/* Summary count row */}
        <div className="flex items-center gap-2 mt-1.5">
          {attendingNames.length > 0 && (
            <span className="text-[10px] text-emerald-400">
              {attendingNames.length} ✓ checked
            </span>
          )}
          {exactMatches.length > 0 && (
            <span className="text-[10px] text-emerald-400">
              {exactMatches.length} AI ✓
            </span>
          )}
          {fuzzyMatches.size > 0 && (
            <span className="text-[10px] text-amber-400">
              {fuzzyMatches.size} AI ~
            </span>
          )}
          {unmatched.length > 0 && (
            <span className="text-[10px] text-red-400">
              {unmatched.length} AI ?
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
