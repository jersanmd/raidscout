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
  className?: string;
}

const SCRIPT_ID = "paypal-sdk-script";

/**
 * PayPal one-time checkout button ($9.99 for 30 days).
 * Uses intent=capture which supports guest debit/credit cards.
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
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&intent=capture&currency=USD`;
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
      });
    };

    const onApprove = async (data: any, actions: any) => {
      await actions.order.capture();
      try {
        await supabase.functions.invoke("paypal-ipn", {
          body: { server_id: serverId, order_id: data.orderID },
        });
      } catch (err) {
        console.error("Failed to activate subscription:", err);
      }
      onSuccess?.();
    };

    const onErr = (err: any) => {
      console.error("PayPal button error:", err);
      onError?.(err instanceof Error ? err : new Error(String(err)));
    };

    // Render PayPal button
    window.paypal.Buttons({
      style: { layout: "horizontal", tagline: false, height: 36 },
      createOrder,
      onApprove,
      onError: onErr,
      onCancel: () => {},
    }).render(containerRef.current);

    // Render separate Debit/Credit Card button
    const cardContainer = document.createElement("div");
    cardContainer.style.marginTop = "8px";
    containerRef.current.appendChild(cardContainer);

    window.paypal.Buttons({
      style: { layout: "horizontal", tagline: false, height: 36 },
      createOrder,
      onApprove,
      onError: onErr,
      onCancel: () => {},
      fundingSource: window.paypal.FUNDING.CARD,
    }).render(cardContainer);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
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
