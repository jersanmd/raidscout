import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

declare global {
  interface Window {
    paypal?: any;
  }
}

interface PayPalSubscribeButtonProps {
  serverId: string;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
  /** The money was captured but the time isn't credited yet. Falls back to onError. */
  onPending?: (message: string) => void;
  className?: string;
}

const SCRIPT_ID = "paypal-sdk-script";

/**
 * Credit a captured order. paypal-ipn credits each capture at most once, so
 * retrying is safe; a 4xx means PayPal says the order itself can't be credited.
 */
async function activateOrder(serverId: string, orderId: string): Promise<{ pending?: boolean }> {
  const delaysMs = [0, 2000, 5000];
  let lastError: any;
  for (const delay of delaysMs) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const { data, error } = await supabase.functions.invoke("paypal-ipn", {
      body: { server_id: serverId, order_id: orderId },
    });
    if (!error) return data ?? {};
    const status = error?.context?.status;
    if (status >= 400 && status < 500) {
      // paid: false means PayPal never took the money.
      const body = await error.context.json().catch(() => null);
      throw Object.assign(new Error(body?.error || error.message), { status, paid: body?.paid });
    }
    lastError = error;
  }
  throw lastError;
}

/**
 * PayPal one-time checkout button ($9.99 for 30 days).
 * Uses intent=capture which supports guest debit/credit cards.
 */
export function PayPalSubscribeButton({
  serverId,
  onSuccess,
  onError,
  onPending,
  className = "",
}: PayPalSubscribeButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paypalButtonRef = useRef<any>(null);
  const cardButtonRef = useRef<any>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  // Callbacks are read through a ref so a parent re-render (with fresh inline
  // callbacks) doesn't tear down and rebuild the buttons — possibly mid-checkout.
  const callbacksRef = useRef({ onSuccess, onError, onPending });
  callbacksRef.current = { onSuccess, onError, onPending };

  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) {
      if (window.paypal) {
        setSdkReady(true);
      } else {
        const check = setInterval(() => {
          if (window.paypal) { setSdkReady(true); clearInterval(check); }
        }, 200);
        return () => clearInterval(check);
      }
      return;
    }

    const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
    if (!clientId) {
      setSdkError("PayPal client ID not configured.");
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    const paypalHost = import.meta.env.DEV ? "www.sandbox.paypal.com" : "www.paypal.com";
    script.src = `https://${paypalHost}/sdk/js?client-id=${clientId}&intent=capture&currency=USD&components=buttons&disable-funding=credit,paylater`;
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setSdkError("Failed to load PayPal SDK.");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!sdkReady || !containerRef.current || !window.paypal) return;

    containerRef.current.innerHTML = "";

    // Shared order creation logic
    const createOrder = (_data: any, actions: any) => {
      return actions.order.create({
        intent: "CAPTURE",
        purchase_units: [{
          amount: { currency_code: "USD", value: "9.99" },
          description: "RaidScout Server — 30 Days",
          custom_id: serverId,
        }],
        application_context: {
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          landing_page: "BILLING",
          brand_name: "RaidScout",
        },
      });
    };

    const onApprove = async (data: any, actions: any) => {
      const { onSuccess, onError, onPending } = callbacksRef.current;
      setProcessing(true);
      setCardError(null);
      let capture: any;
      try {
        capture = await actions.order.capture();
      } catch (err: any) {
        console.error("PayPal capture failed:", err);
        setCardError(err?.message || "Payment failed. Please try again.");
        onError?.(err instanceof Error ? err : new Error("Payment failed. Please try again."));
        setProcessing(false);
        return;
      }
      // Card declines, and any capture status other than COMPLETED/PENDING: no money moved
      const captureStatus = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.status;
      if (capture?.status === "DECLINED" || (captureStatus && captureStatus !== "COMPLETED" && captureStatus !== "PENDING")) {
        const rawReason = capture?.purchase_units?.[0]?.payments?.captures?.[0]?.status_details?.reason || "";
        const declineReason = rawReason
          ? `Card declined: ${rawReason}. Try a different card or use PayPal checkout above.`
          : "Card was declined by your bank. Try a different card or use PayPal checkout above.";
        setCardError(declineReason);
        setProcessing(false);
        return;
      }

      // From here the money is captured, so every failure message must say so
      // and carry the order id support needs to find the payment.
      const reportPending = (message: string) => {
        if (onPending) onPending(message);
        else onError?.(new Error(message));
      };
      try {
        const result = await activateOrder(serverId, data.orderID);
        if (result.pending) {
          reportPending(`PayPal is still processing your payment (order ${data.orderID}). Your 30 days will be added automatically as soon as it clears.`);
          return;
        }
        onSuccess?.();
      } catch (err: any) {
        console.error("paypal-ipn error:", err);
        // Only trust "not paid" when the browser didn't itself see the capture go through.
        if (err?.paid === false && !captureStatus) {
          const message = "Your payment didn't complete and no money was taken. Please try again.";
          setCardError(message);
          onError?.(new Error(message));
          return;
        }
        const status = err?.status ?? err?.context?.status;
        reportPending(
          status >= 400 && status < 500
            ? `Your payment went through, but we couldn't apply it automatically (PayPal order ${data.orderID}). Please contact admin@raidscout.com with this order ID and we'll add your time.`
            : `Your payment went through (PayPal order ${data.orderID}). Activation is taking longer than usual — your 30 days will be added automatically within a few minutes. If not, contact admin@raidscout.com with this order ID.`,
        );
      } finally {
        setProcessing(false);
      }
    };

    const onErr = (err: any) => {
      console.error("PayPal button error:", err);
      const msg = typeof err === "string" ? err : err?.message || String(err);
      setCardError(msg);
      callbacksRef.current.onError?.(err instanceof Error ? err : new Error(msg));
    };

    containerRef.current.style.minWidth = "400px";
    containerRef.current.style.width = "100%";
    containerRef.current.style.maxWidth = "500px";

    // ── PayPal ──
    const ppLabel = document.createElement("p");
    ppLabel.textContent = "Pay with PayPal";
    ppLabel.className = "text-[11px] text-[#71717a] font-medium mb-1.5";
    containerRef.current.appendChild(ppLabel);

    const ppWrapper = document.createElement("div");
    containerRef.current.appendChild(ppWrapper);

    window.paypal.Buttons({
      style: { layout: "horizontal", tagline: false, height: 40 },
      fundingSource: window.paypal.FUNDING.PAYPAL,
      createOrder,
      onApprove,
      onClick: () => { setCardError(null); },
      onError: onErr,
      onCancel: () => { setCardError(null); },
    }).render(ppWrapper).then((instance: any) => {
      paypalButtonRef.current = instance;
    });

    // ── Debit / Credit Card ──
    const cardLabel = document.createElement("p");
    cardLabel.textContent = "Pay with Debit / Credit Card";
    cardLabel.className = "text-[11px] text-[#6b7280] font-medium mb-1.5 mt-4";
    containerRef.current.appendChild(cardLabel);

    const cardWrapper = document.createElement("div");
    containerRef.current.appendChild(cardWrapper);

    window.paypal.Buttons({
      style: {
        layout: "horizontal",
        tagline: false,
        height: 40,
        color: "white",
        input: { color: "#111827", fontSize: "14px" },
      },
      fundingSource: window.paypal.FUNDING.CARD,
      createOrder,
      onApprove,
      onClick: () => { setCardError(null); },
      onError: onErr,
      onCancel: () => { setCardError(null); },
    }).render(cardWrapper).then((instance: any) => {
      cardButtonRef.current = instance;
    });

    return () => {
      // Properly close PayPal buttons before cleanup
      if (paypalButtonRef.current) {
        try { paypalButtonRef.current.close(); } catch {}
        paypalButtonRef.current = null;
      }
      if (cardButtonRef.current) {
        try { cardButtonRef.current.close(); } catch {}
        cardButtonRef.current = null;
      }
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [sdkReady, serverId]);

  if (sdkError) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 ${className}`}>
        <AlertTriangle className="w-3.5 h-3.5" />
        {sdkError}
      </div>
    );
  }

  if (!sdkReady) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#a1a1aa] bg-[#27272a] animate-pulse ${className}`}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <>
      {/* Full-screen processing overlay */}
      {processing && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex flex-col items-center gap-6 p-8 rounded-2xl bg-[#0a0a0f] border border-[#27272a] shadow-2xl">
            {/* Animated payment icon */}
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-400 animate-spin" style={{ animationDuration: "0.8s" }} />
              <div className="absolute inset-2 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
            {/* Text */}
            <div className="text-center space-y-2">
              <p className="text-lg font-bold text-[#fafafa]">Processing Payment</p>
              <p className="text-sm text-[#71717a]">Securing your transaction with PayPal...</p>
              <p className="text-xs text-[#52525b]">Extending server access by 30 days</p>
            </div>
            {/* Progress dots */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDuration: "0.6s" }} />
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDuration: "0.6s", animationDelay: "0.15s" }} />
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDuration: "0.6s", animationDelay: "0.3s" }} />
            </div>
          </div>
        </div>
      )}
      <div className={`relative z-0 ${className}`} style={{ minWidth: "400px", maxWidth: "500px", width: "100%" }}>
        <div ref={containerRef} />
        {cardError && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{cardError}</span>
          </div>
        )}
      </div>
    </>
  );
}
