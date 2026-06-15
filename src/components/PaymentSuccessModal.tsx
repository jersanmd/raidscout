import { useEffect, useState } from "react";
import { CheckCircle, PartyPopper, Sparkles, Clock, Shield } from "lucide-react";

interface PaymentSuccessModalProps {
  open: boolean;
  onClose: () => void;
  daysExtended?: number;
  newExpiryDate?: string;
  error?: string | null;
}

/** Celebratory modal shown after payment — success or error. */
export function PaymentSuccessModal({ open, onClose, daysExtended = 30, newExpiryDate, error }: PaymentSuccessModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

  if (!open) return null;

  const isError = !!error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative bg-[#0a0a0f] border border-[#27272a] rounded-2xl max-w-md w-full p-8 shadow-2xl shadow-black/40 transition-all duration-500 ${visible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"}`}>
        {isError ? (
          <>
            {/* Error State */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                <Shield className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#fafafa] mb-1">Something went wrong</h3>
                <p className="text-sm text-[#71717a]">{error}</p>
                <p className="text-xs text-[#52525b] mt-2">Your payment may have been processed. Please check your email or contact support if the issue persists.</p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-[#27272a] text-[#fafafa] text-sm font-medium hover:bg-[#3f3f46] transition"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Success State — Celebratory */}
            <div className="text-center space-y-5">
              {/* Animated icon */}
              <div className="relative mx-auto w-20 h-20">
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: "2s" }} />
                <div className="relative w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <PartyPopper className="w-10 h-10 text-emerald-400" />
                </div>
                {/* Sparkles */}
                <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-amber-400 animate-bounce" style={{ animationDuration: "1.5s" }} />
                <Sparkles className="absolute -bottom-1 -left-1 w-4 h-4 text-amber-400 animate-bounce" style={{ animationDuration: "1.8s", animationDelay: "0.3s" }} />
              </div>

              <div>
                <h3 className="text-xl font-bold text-[#fafafa] mb-1">🎉 Payment Successful!</h3>
                <p className="text-sm text-[#a1a1aa]">Your server access has been extended.</p>
              </div>

              {/* Extension details */}
              <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#71717a] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Days added
                  </span>
                  <span className="text-sm font-bold text-emerald-400">+{daysExtended} days</span>
                </div>
                {newExpiryDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#71717a] flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> Access until
                    </span>
                    <span className="text-sm font-semibold text-[#fafafa]">{newExpiryDate}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-[#52525b] leading-relaxed">
                Thank you for supporting RaidScout! Your guild now has full access to all features — boss timers, Discord bot, leaderboards, and more.
              </p>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-emerald-600 text-[#fafafa] text-sm font-semibold hover:bg-emerald-500 transition-all duration-200 shadow-lg shadow-emerald-500/20"
              >
                Let's Go! 🚀
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
