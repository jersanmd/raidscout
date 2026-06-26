import { useRef, useState, useCallback } from "react";
import { toPng } from "html-to-image";
import { Share2, Check, Loader2 } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import type { BossWithSpawn } from "@/types";

interface Props {
  spawn: BossWithSpawn;
  ownerGuildName?: string;
  serverName?: string;
}

const CARD_W = 600;
const CARD_H = 340;

export default function ShareableBossCard({ spawn, ownerGuildName, serverName }: Props) {
  const [capturing, setCapturing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { boss, status, nextSpawn, remainingMs } = spawn;
  const isAlive = status === "alive";
  const imageUrl = (boss as any).image_url as string | undefined;

  const generateAndCopy = useCallback(async () => {
    setCapturing(true);
    setShowCanvas(true);
    // Wait for render
    await new Promise(r => setTimeout(r, 100));
    try {
      if (!cardRef.current) return;
      const dataUrl = await toPng(cardRef.current, {
        width: CARD_W,
        height: CARD_H,
        pixelRatio: 2,
        backgroundColor: "#09090b",
      });

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast("success", "Image copied! Paste it anywhere with Ctrl+V");
    } catch (err) {
      console.error("Failed to copy boss card:", err);
    } finally {
      setCapturing(false);
      setShowCanvas(false);
    }
  }, []);

  // Format time
  const timeStr = nextSpawn
    ? nextSpawn.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
    : "Unknown";

  const dateStr = nextSpawn
    ? nextSpawn.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";

  // Progress bar
  const totalMs = (boss.respawn_hours ?? 24) * 3600_000;
  const elapsedPct = Math.min(100, Math.max(0, isAlive ? ((totalMs + remainingMs) / totalMs) * 100 : 0));
  const remainingFormatted = isAlive
    ? formatRemaining(-remainingMs)
    : remainingMs > 0
    ? formatRemaining(remainingMs)
    : "";

  return (
    <>
      {/* Visible canvas during capture — html-to-image needs in-viewport elements */}
      {showCanvas && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
          <div
            ref={cardRef}
            style={{ width: CARD_W, height: CARD_H }}
          >
        <div
          style={{
            width: CARD_W,
            height: CARD_H,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "linear-gradient(135deg, #09090b 0%, #18181b 100%)",
            border: "1px solid #27272a",
            borderRadius: 16,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            userSelect: "none",
            overflow: "hidden",
          }}
        >
          {/* Status banner */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "4px 12px", borderRadius: 9999,
                fontSize: 12, fontWeight: 700,
                background: isAlive ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
                color: isAlive ? "#ef4444" : "#22c55e",
              }}
            >
              <div
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: isAlive ? "#ef4444" : "#22c55e",
                  boxShadow: `0 0 6px ${isAlive ? "#ef4444" : "#22c55e"}`,
                }}
              />
              {isAlive ? "ALIVE NOW" : "COUNTING DOWN"}
            </div>
            <span style={{ fontSize: 10, color: "#52525b", fontWeight: 500 }}>raidscout.com</span>
          </div>

          {/* Boss name + image */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "12px 0" }}>
            {imageUrl && (
              <div style={{ width: 64, height: 64, borderRadius: 12, overflow: "hidden", border: "1px solid #27272a", flexShrink: 0 }}>
                <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} crossOrigin="anonymous" />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: "#fafafa", letterSpacing: "-0.025em", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {boss.name}
              </h2>
              {serverName && (
                <p style={{ fontSize: 11, color: "#71717a", margin: "2px 0 0 0" }}>{serverName}</p>
              )}
            </div>
          </div>

          {/* Info grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "8px 0" }}>
            <InfoBlock label={isAlive ? "Spawned" : "Spawning"} value={`${dateStr} ${timeStr}`} />
            {ownerGuildName && <InfoBlock label="Owner" value={ownerGuildName} highlight />}
            {nextSpawn && !isAlive && (
              <InfoBlock label="Est. Alive" value={remainingFormatted} />
            )}
            {boss.spawn_type === "fixed_hours" && (
              <InfoBlock label="Respawn" value={`${boss.respawn_hours ?? 24}h`} />
            )}
          </div>

          {/* Progress bar */}
          {isAlive && remainingFormatted && (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#71717a", marginBottom: 4 }}>
                <span>Alive for {remainingFormatted}</span>
                <span>{Math.round(elapsedPct)}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 9999, background: "#27272a", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%", borderRadius: 9999,
                    width: `${elapsedPct}%`,
                    background: "linear-gradient(90deg, #ef4444, #f97316)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #27272a" }}>
            <span style={{ fontSize: 10, color: "#52525b" }}>Powered by RaidScout</span>
            {ownerGuildName && (
              <span style={{ fontSize: 11, fontWeight: 600, color: "#a1a1aa" }}>⚔️ {ownerGuildName}</span>
            )}
          </div>
        </div>
      </div>
      </div>
      )}

      {/* Share button */}
      <button
        onClick={generateAndCopy}
        disabled={capturing}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-[#18181b] text-[#a1a1aa] hover:bg-[#27272a] hover:text-[#fafafa] transition-colors"
        title="Copy boss card image"
      >
        {capturing ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : copied ? (
          <Check className="w-3 h-3 text-emerald-400" />
        ) : (
          <Share2 className="w-3 h-3" />
        )}
        {copied ? "Copied!" : "Share"}
      </button>
    </>
  );
}

function InfoBlock({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(24,24,27,0.6)",
        border: "1px solid #27272a",
        overflow: "hidden",
      }}
    >
      <p style={{ fontSize: 9, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{label}</p>
      <p
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: highlight ? "#fbbf24" : "#fafafa",
          margin: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "any moment";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
