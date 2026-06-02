import { Loader2 } from "lucide-react";

interface SavingOverlayProps {
  /** Custom message shown below the spinner. Defaults to "Saving attendance..." */
  message?: string;
}

/**
 * Full-screen overlay with a spinner, blocking all interaction.
 * Use while waiting for an async operation (e.g. recording a death + attendance).
 */
export function SavingOverlay({ message = "Saving attendance..." }: SavingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl px-6 py-4 shadow-lg flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-[#a1a1aa] animate-spin" />
        <span className="text-[#fafafa] text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}
