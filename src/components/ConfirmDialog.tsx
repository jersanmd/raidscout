import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";

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

  if (!open) return null;

  const confirmed = !confirmText || typed === confirmText;

  const colors = {
    danger: {
      btn: "bg-red-600 hover:bg-red-500 text-white",
      icon: "text-red-400",
      ring: "ring-red-800",
    },
    warning: {
      btn: "bg-amber-600 hover:bg-amber-500 text-white",
      icon: "text-amber-400",
      ring: "ring-amber-800",
    },
  }[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0 ${colors.ring} ring-1`}>
            <AlertTriangle className={`w-5 h-5 ${colors.icon}`} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-400 mt-1">{message}</p>
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
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white transition disabled:opacity-50"
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
