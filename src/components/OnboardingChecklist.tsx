import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronRight, Copy, CheckCheck, PartyPopper, X } from "lucide-react";
import { useOnboardingProgress, type OnboardingItem } from "@/hooks/useOnboardingProgress";

function ChecklistItem({
  item,
  index,
  total,
}: {
  item: OnboardingItem;
  index: number;
  total: number;
}) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Animate check when item becomes done
  useEffect(() => {
    if (item.done) {
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 600);
      return () => clearTimeout(t);
    }
  }, [item.done]);

  const handleCta = () => {
    if (item.cta.href) {
      navigate(item.cta.href);
    } else if (item.cta.copyText) {
      navigator.clipboard.writeText(item.cta.copyText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-500 ${
        item.done
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-[#27272a] bg-[#09090b] hover:border-[#3f3f46]"
      }`}
    >
      {/* Check circle */}
      <div
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
          item.done
            ? "border-emerald-400 bg-emerald-400 scale-100"
            : "border-[#3f3f46] bg-transparent scale-100"
        } ${animating ? "animate-bounce" : ""}`}
      >
        {item.done ? (
          <Check
            className={`w-3.5 h-3.5 text-[#09090b] transition-all duration-300 ${
              animating ? "scale-125" : "scale-100"
            }`}
            strokeWidth={3}
          />
        ) : (
          <span className="text-[11px] font-bold text-[#52525b]">{index + 1}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-[13px] font-semibold truncate transition-colors duration-500 ${
            item.done ? "text-emerald-400" : "text-[#fafafa]"
          }`}
        >
          {item.label}
        </p>
        <p className="text-[11px] text-[#71717a] truncate">{item.description}</p>
      </div>

      {/* CTA button */}
      {!item.done && (
        <div className="shrink-0 flex flex-col items-end gap-1">
          <button
            onClick={handleCta}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-[#18181b] text-[#fafafa] hover:bg-[#27272a] active:scale-95 transition-all"
          >
            {copied ? (
              <>
                <CheckCheck className="w-3 h-3 text-emerald-400" />
                Copied!
              </>
            ) : (
              <>
                {item.cta.label}
                <ChevronRight className="w-3 h-3" />
              </>
            )}
          </button>
          {item.videoUrl && (
            <a
              href={item.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
              Watch Guide
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function OnboardingChecklist() {
  const { items, completed, total, allDone, show, dismiss, markDkpExplored } = useOnboardingProgress();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const prevAllDone = useRef(allDone);

  // Entrance animation
  useEffect(() => {
    if (show) {
      const t = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
      setExiting(false);
    }
  }, [show]);

  // Celebration when all done
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      setCelebrating(true);
      const t = setTimeout(() => {
        setCelebrating(false);
        dismissAfterDelay();
      }, 2500);
      return () => clearTimeout(t);
    }
    prevAllDone.current = allDone;
  }, [allDone]);

  function dismissAfterDelay() {
    setExiting(true);
    setTimeout(() => dismiss(), 400);
  }

  if (!show && !exiting) return null;

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      className={`transition-all duration-500 ${
        visible && !exiting
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-4 scale-95"
      }`}
    >
      <div
        className={`relative overflow-hidden rounded-xl border bg-gradient-to-br transition-all duration-500 ${
          celebrating
            ? "from-emerald-500/10 to-emerald-500/5 border-emerald-500/40 shadow-lg shadow-emerald-500/10"
            : allDone
            ? "from-[#18181b] to-[#09090b] border-[#27272a]"
            : "from-[#18181b] to-[#09090b] border-[#27272a]"
        }`}
      >
        {/* Background glow on celebration */}
        {celebrating && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent animate-shimmer" />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              {celebrating ? (
                <PartyPopper className="w-4 h-4 text-white animate-bounce" />
              ) : (
                <span className="text-sm">🚀</span>
              )}
            </div>
            <div>
              <h3 className="text-[13px] font-bold text-[#fafafa] leading-tight">
                {celebrating
                  ? "All set!"
                  : allDone
                  ? "RaidScout Ready"
                  : "Welcome to RaidScout"}
              </h3>
              <p className="text-[11px] text-[#71717a]">
                {celebrating
                  ? "Your server is fully configured! 🎉"
                  : allDone
                  ? "Everything is configured."
                  : `${completed} of ${total} steps complete`}
              </p>
            </div>
          </div>
          <button
            onClick={dismissAfterDelay}
            className="p-1 rounded-md text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#27272a] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-0.5">
          <div className="h-1.5 rounded-full bg-[#27272a] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Checklist items */}
        <div className="px-3 py-2.5 space-y-1.5">
          {items.map((item, i) => (
            <ChecklistItem key={item.id} item={item} index={i} total={total} />
          ))}
        </div>

        {/* Footer quote */}
        {!allDone && !celebrating && (
          <div className="px-4 pb-3 pt-0.5">
            <p className="text-[11px] text-[#52525b] italic text-center">
              Tip: You can always access these features from the sidebar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
