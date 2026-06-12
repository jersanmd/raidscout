import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useEscapeKey } from "@/hooks/useEscapeKey";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  /** If set, user must type this exact text to enable the confirm button */
  confirmText?: string;
  variant?: "danger" | "warning";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  confirmText,
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  useEscapeKey(() => onCancel(false), open);
  if (!open) return null;
  const confirmed = !confirmText || typed === confirmText;

  const colors = {
    danger: {
      btn: "bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b]",
      icon: "text-[#a1a1aa]",
      ring: "ring-[#27272a]",
    },
    warning: {
      btn: "bg-[#fafafa] hover:bg-[#e4e4e7] text-[#09090b]",
      icon: "text-[#a1a1aa]",
      ring: "ring-[#27272a]",
    },
  }[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-sm shadow-lg p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full bg-[#27272a] flex items-center justify-center shrink-0 ${colors.ring} ring-1`}>
            <AlertTriangle className={`w-5 h-5 ${colors.icon}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#fafafa]">{title}</h3>
            <p className="text-xs text-[#71717a] mt-1">{message}</p>
          </div>
        </div>
        {confirmText && (
          <div>
            <p className="text-xs text-slate-500 mb-1.5">
              Type <code className="text-red-400 bg-red-950/50 px-1 rounded">{confirmText}</code> to confirm:
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmText}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition"
              autoFocus
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setTyped(""); onCancel(); }}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm text-[#71717a] hover:text-[#fafafa] transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || !confirmed}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${colors.btn}`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
