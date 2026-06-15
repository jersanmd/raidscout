import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

declare global {
  interface Window {
    paypal?: any;
  }
}

interface PayPalSubscribeButtonProps {
  serverId: string;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
  className?: string;
}

const SCRIPT_ID = "paypal-sdk-script";

/**
 * Loads the PayPal JS SDK once and renders a smart subscription button.
 * Supports PayPal accounts, credit/debit cards, and Venmo (US).
 * Requires VITE_PAYPAL_CLIENT_ID and VITE_PAYPAL_PLAN_ID env vars.
 */
export function PayPalSubscribeButton({
  serverId,
  onSuccess,
  onError,
  className = "",
}: PayPalSubscribeButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  // Load PayPal SDK script once
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) {
      // Script already loading/loaded — poll for paypal global
      if (window.paypal) {
        setSdkReady(true);
      } else {
        const check = setInterval(() => {
          if (window.paypal) {
            setSdkReady(true);
            clearInterval(check);
          }
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
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&vault=true&intent=subscription&currency=USD`;
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setSdkError("Failed to load PayPal SDK.");
    document.head.appendChild(script);
  }, []);

  // Render the button once SDK is ready
  useEffect(() => {
    if (!sdkReady || !containerRef.current || !window.paypal) return;

    const planId = import.meta.env.VITE_PAYPAL_PLAN_ID;
    if (!planId) {
      setSdkError("PayPal plan ID not configured.");
      return;
    }

    // Clear any previous button
    containerRef.current.innerHTML = "";

    window.paypal
      .Buttons({
        style: {
          layout: "horizontal",
          tagline: false,
          height: 36,
        },
        createSubscription: (_data: any, actions: any) => {
          return actions.subscription.create({
            plan_id: planId,
            custom_id: serverId,
          });
        },
        onApprove: (_data: any) => {
          // PayPal will send an IPN to our edge function, which extends the subscription.
          // Optimistically trigger the success callback to refresh the UI.
          onSuccess?.();
        },
        onError: (err: any) => {
          console.error("PayPal button error:", err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        },
        onCancel: () => {
          // User closed the PayPal popup — nothing to do
        },
      })
      .render(containerRef.current);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [sdkReady, serverId, onSuccess, onError]);

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

  return <div ref={containerRef} className={className} />;
}
