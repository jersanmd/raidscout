import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Loader2, Activity, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────
interface BotStatus {
  ok: boolean;
  discord_connected: boolean;
  uptime_display: string;
  region: string;
  memory_mb: number;
  active_commands: number;
  node_version: string;
  spawn_cron: {
    last_tick_seconds_ago: number | null;
    last_tick_duration_ms: number | null;
    tick_interval_ms: number | null;
    servers_checked: number | null;
    bosses_checked: number | null;
    tick_history_ms: number[];
  };
}

interface TickMetric {
  ts: number;
  duration_ms: number;
}

// ── Fly.io region → country ────────────────────────────────
const FLY_REGIONS: Record<string, string> = {
  ams: "🇳🇱 Netherlands", arn: "🇸🇪 Sweden", atl: "🇺🇸 Atlanta", bog: "🇨🇴 Colombia",
  bos: "🇺🇸 Boston", cdg: "🇫🇷 France", den: "🇺🇸 Denver", dfw: "🇺🇸 Dallas",
  ewr: "🇺🇸 New Jersey", fra: "🇩🇪 Germany", gru: "🇧🇷 Brazil", hkg: "🇭🇰 Hong Kong",
  iad: "🇺🇸 Virginia", jnb: "🇿🇦 South Africa", lax: "🇺🇸 Los Angeles",
  lhr: "🇬🇧 London", maa: "🇮🇳 Chennai", mad: "🇪🇸 Madrid", mia: "🇺🇸 Miami",
  nrt: "🇯🇵 Tokyo", ord: "🇺🇸 Chicago", otp: "🇷🇴 Romania", sea: "🇺🇸 Seattle",
  sin: "🇸🇬 Singapore", syd: "🇦🇺 Sydney", waw: "🇵🇱 Poland", yul: "🇨🇦 Montreal",
  yyz: "🇨🇦 Toronto",
};

// ── BOT_URL ────────────────────────────────────────────────
function getBotUrl(): string {
  const host = window.location.hostname;
  const isDev = host === "localhost" || host === "127.0.0.1";
  const isStaging = host.includes("staging") || host.endsWith(".vercel.app");
  if (isDev || isStaging) return "https://raidscout-staging.fly.dev";
  return "https://raidscout-bot.fly.dev";
}

// ── Interactive Trend Chart ────────────────────────────────
function TickChart({ metrics, timezone }: { metrics: TickMetric[]; timezone: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<{ x: number; y: number; idx: number }[]>([]);
  const timezoneRef = useRef(timezone);
  timezoneRef.current = timezone;
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; time: string; date: string } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || metrics.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 10, right: 12, bottom: 22, left: 44 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // Clip to chart area
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, chartW, chartH);
    ctx.clip();

    // Convert to seconds, find min/max
    const secs = metrics.map((m) => m.duration_ms / 1000);
    const maxSec = Math.max(...secs, 0.001);
    const minSec = Math.min(...secs);
    const range = maxSec - minSec || 1;

    // Compute time range — start from first data point, extend to now
    const dataStart = metrics[0].ts;
    const dataEnd = Math.max(metrics[metrics.length - 1].ts, Date.now());
    const timeRange = Math.max(dataEnd - dataStart, 60_000); // at least 1 minute

    // Compute points + store in ref for mouse interaction
    const points: { x: number; y: number; idx: number }[] = [];
    for (let i = 0; i < metrics.length; i++) {
      const frac = (secs[i] - minSec) / range;
      const timeFrac = (metrics[i].ts - dataStart) / timeRange;
      const x = pad.left + timeFrac * chartW;
      const y = pad.top + chartH - frac * chartH;
      points.push({ x, y, idx: i });
    }
    pointsRef.current = points;

    // Detect downtime gaps (>3 minutes between ticks = bot likely offline)
    const GAP_THRESHOLD = 180_000; // 3 minutes
    const segments: { start: number; end: number; points: typeof points }[] = [];
    let segStart = 0;
    for (let i = 1; i < metrics.length; i++) {
      if (metrics[i].ts - metrics[i - 1].ts > GAP_THRESHOLD) {
        segments.push({ start: segStart, end: i - 1, points: points.slice(segStart, i) });
        segStart = i;
      }
    }
    segments.push({ start: segStart, end: points.length - 1, points: points.slice(segStart) });

    // Draw red gap backgrounds
    ctx.fillStyle = "rgba(239,68,68,0.08)";
    for (let s = 1; s < segments.length; s++) {
      const gapStart = points[segments[s - 1].end].x;
      const gapEnd = points[segments[s].start].x;
      if (gapEnd > gapStart) {
        ctx.fillRect(gapStart, pad.top, gapEnd - gapStart, chartH);
      }
    }

    // Draw green filled area + line per segment
    for (const seg of segments) {
      if (seg.points.length < 2) continue;

      const lastP = seg.points[seg.points.length - 1];
      const isLast = seg === segments[segments.length - 1];
      const rightEdge = pad.left + chartW;

      // Filled area under curve — only up to the last real data point
      ctx.beginPath();
      ctx.moveTo(seg.points[0].x, pad.top + chartH);
      for (const p of seg.points) ctx.lineTo(p.x, p.y);
      ctx.lineTo(lastP.x, pad.top + chartH);
      ctx.closePath();
      const areaGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
      areaGrad.addColorStop(0, "rgba(74,222,128,0.20)");
      areaGrad.addColorStop(1, "rgba(74,222,128,0.02)");
      ctx.fillStyle = areaGrad;
      ctx.fill();

      // Trend line with glow — only up to the last real data point
      ctx.save();
      ctx.shadowColor = "rgba(74,222,128,0.6)";
      ctx.shadowBlur = 6;
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(seg.points[0].x, seg.points[0].y);
      for (let i = 1; i < seg.points.length; i++) {
        ctx.lineTo(seg.points[i].x, seg.points[i].y);
      }
      ctx.stroke();
      ctx.restore();

      // Red "no data" extension for the last segment (between last tick and now)
      if (isLast && lastP.x < rightEdge) {
        // Red filled area
        ctx.beginPath();
        ctx.moveTo(lastP.x, pad.top + chartH);
        ctx.lineTo(lastP.x, lastP.y);
        ctx.lineTo(rightEdge, lastP.y);
        ctx.lineTo(rightEdge, pad.top + chartH);
        ctx.closePath();
        ctx.fillStyle = "rgba(239,68,68,0.08)";
        ctx.fill();

        // Red dashed line
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(239,68,68,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lastP.x, lastP.y);
        ctx.lineTo(rightEdge, lastP.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw red dash at gap boundaries
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "rgba(239,68,68,0.4)";
    ctx.lineWidth = 0.5;
    for (let s = 1; s < segments.length; s++) {
      const x = points[segments[s].start].x;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + chartH);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw data points with glow
    ctx.save();
    ctx.shadowColor = "rgba(74,222,128,0.8)";
    ctx.shadowBlur = 4;
    ctx.fillStyle = "#4ade80";
    for (let i = 0; i < points.length; i++) {
      if (i % Math.max(1, Math.floor(points.length / 30)) !== 0 && i !== points.length - 1) continue;
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Threshold lines
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 0.5;
    for (const thresh of [0.2, 0.5]) {
      const y = pad.top + chartH - ((thresh - minSec) / range) * chartH;
      if (y < pad.top || y > pad.top + chartH) continue;
      ctx.strokeStyle = thresh === 0.2 ? "rgba(74,222,128,0.25)" : "rgba(74,222,128,0.12)";
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + chartW, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.restore(); // end clip

    // Y-axis labels
    ctx.fillStyle = "#52525b";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 3; i++) {
      const val = minSec + (range / 3) * i;
      const y = pad.top + chartH - (i / 3) * chartH;
      const label = val >= 1 ? `${val.toFixed(1)}s` : `${(val * 1000).toFixed(0)}ms`;
      ctx.fillText(label, pad.left - 6, y + 3);
    }

    // X-axis: time labels based on actual data range (5 evenly-spaced ticks)
    const tickCount = 5;
    const showDates = new Date(dataStart).toLocaleDateString("en-US", { timeZone: timezone })
      !== new Date(dataEnd).toLocaleDateString("en-US", { timeZone: timezone });

    for (let i = 0; i < tickCount; i++) {
      const ts = dataStart + (timeRange / (tickCount - 1)) * i;
      const d = new Date(ts);
      const timeStr = d.toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone,
      });
      const dateStr = d.toLocaleDateString("en-US", {
        month: "short", day: "numeric", timeZone: timezone,
      });
      const label = showDates && (i === 0 || i === tickCount - 1)
        ? `${dateStr} ${timeStr}`
        : timeStr;
      const x = pad.left + (i / (tickCount - 1)) * chartW;
      if (i === 0) ctx.textAlign = "left";
      else if (i === tickCount - 1) ctx.textAlign = "right";
      else ctx.textAlign = "center";
      ctx.fillText(label, x, h - 4);
    }
  }, [metrics, timezone]);

  // ── Mouse interaction ──────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || pointsRef.current.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pts = pointsRef.current;
    let nearest = pts[0];
    let minDist = Math.abs(pts[0].x - mx);
    for (let i = 1; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - mx);
      if (d < minDist) { minDist = d; nearest = pts[i]; }
    }
    const m = metrics[nearest.idx];
    const dur = m.duration_ms >= 1000
      ? `${(m.duration_ms / 1000).toFixed(2)}s`
      : `${m.duration_ms}ms`;
    const t = new Date(m.ts);
    const tz = timezoneRef.current;
    setTooltip({
      x: rect.left + mx + 12,
      y: rect.top + my - 52,
      label: dur,
      time: t.toLocaleString("en-US", {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false, timeZone: tz,
      }),
      date: "",
    });
  }, [metrics]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (metrics.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-[10px] text-[#52525b]">
        No tick data yet
      </div>
    );
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full h-32 rounded cursor-crosshair"
        style={{ backgroundColor: "#0a0f0a" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {tooltip && (
        <div
          className="fixed z-[10000] pointer-events-none bg-[#18181b] border border-[#3f3f46] rounded-lg px-2.5 py-1.5 shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="text-xs font-medium text-[#4ade80] font-mono">{tooltip.label}</div>
          <div className="text-[10px] text-[#a1a1aa]">{tooltip.time}</div>
        </div>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────
export function BotStatusIndicator({ timezone }: { timezone: string }) {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [baseUptimeSec, setBaseUptimeSec] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [liveUptime, setLiveUptime] = useState("");
  const [tickMetrics, setTickMetrics] = useState<TickMetric[]>([]);
  const [tickMetricsLoading, setTickMetricsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const [popupPos, setPopupPos] = useState({ top: 0, right: 0 });

  const botUrl = getBotUrl();

  // ── Parse uptime_display → seconds ─────────────────────
  const parseUptime = (d: string): number => {
    const h = parseInt((d.match(/(\d+)h/) || [])[1] || "0");
    const m = parseInt((d.match(/(\d+)m/) || [])[1] || "0");
    const s = parseInt((d.match(/(\d+)s/) || [])[1] || "0");
    return h * 3600 + m * 60 + s;
  };

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${botUrl}/status`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setStatus(data);
      setBaseUptimeSec(parseUptime(data.uptime_display || ""));
      setFetchedAt(Date.now());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [botUrl]);

  const fetchTickMetrics = useCallback(async () => {
    setTickMetricsLoading(true);
    try {
      // Use bot uptime as the range, capped at 24h — so fresh restarts fill the chart
      let rangeHours = 24;
      const s = statusRef.current;
      if (s?.uptime_display) {
        const uptimeSec = parseUptime(s.uptime_display);
        rangeHours = Math.max(Math.ceil(uptimeSec / 3600), 1);
        rangeHours = Math.min(rangeHours, 24);
      }
      const resp = await fetch(`${botUrl}/tick-metrics?range=${rangeHours}h`);
      if (resp.ok) {
        const data = await resp.json();
        setTickMetrics(data.metrics || []);
      }
    } catch {
      // non-critical
    } finally {
      setTickMetricsLoading(false);
    }
  }, [botUrl]);

  // Poll status every 30 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Live uptime counter while popup is open
  useEffect(() => {
    if (!showPopup || baseUptimeSec === 0) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - fetchedAt) / 1000);
      const total = baseUptimeSec + elapsed;
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      setLiveUptime(`${h}h ${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [showPopup, baseUptimeSec, fetchedAt]);

  // Fetch tick metrics once when popup opens — historical view, no need to poll
  useEffect(() => {
    if (!showPopup) return;
    fetchTickMetrics();
  }, [showPopup, fetchTickMetrics]);

  const isOnline = status?.discord_connected === true;

  const handleClick = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPopupPos({
        top: r.bottom + 6,
        right: Math.max(4, window.innerWidth - r.right),
      });
    }
    setShowPopup(!showPopup);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleClick}
        className="relative flex items-center gap-1.5 px-2 py-1 rounded-md text-[#fafafa]/70 hover:text-[#fafafa] hover:bg-[#18181b] transition text-xs font-medium"
        title={`Bot: ${loading ? "Checking..." : error ? "Unreachable" : isOnline ? "Online" : "Offline"}`}
      >
        <span className="hidden sm:inline text-[#71717a] text-[11px]">RaidScout Bot</span>
        {loading ? (
          <Loader2 className="w-3 h-3 text-[#a1a1aa] animate-spin" />
        ) : (
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              error
                ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
                : isOnline
                  ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                  : "bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.5)]"
            }`}
          />
        )}
        <span className={`hidden sm:inline font-semibold ${
          loading ? "text-[#a1a1aa]" : error ? "text-red-400" : isOnline ? "text-green-400" : "text-yellow-400"
        }`}>
          {loading ? "Checking..." : error ? "Offline" : isOnline ? "Online" : "Offline"}
        </span>
      </button>

      {showPopup &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setShowPopup(false)}
            />
            <div
              className="fixed z-[9999] w-[calc(100vw-2rem)] max-w-80 bg-[#18181b] border border-[#27272a] rounded-xl shadow-2xl overflow-hidden
                max-sm:left-1/2 max-sm:top-16 max-sm:-translate-x-1/2"
              style={window.innerWidth >= 640 ? { top: popupPos.top, right: popupPos.right, maxHeight: "80vh" } : { maxHeight: "80vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272a]">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#a1a1aa]" />
                  <span className="text-sm font-semibold text-[#fafafa]">RaidScout Bot Status</span>
                </div>
                <button
                  onClick={() => setShowPopup(false)}
                  className="p-1 rounded text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#27272a] transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3 overflow-y-auto" style={{ maxHeight: "calc(80vh - 52px)" }}>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 text-[#a1a1aa] animate-spin" />
                  </div>
                ) : error ? (
                  <div className="text-center py-6">
                    <div className="w-3 h-3 rounded-full bg-red-500 mx-auto mb-2" />
                    <p className="text-sm text-[#d4d4d8]">Bot is unreachable</p>
                    <p className="text-[11px] text-[#52525b] mt-1">
                      The bot server may be restarting or down.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Status row */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#a1a1aa]">Status</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isOnline ? "bg-green-500" : "bg-yellow-500"
                          }`}
                        />
                        <span className="text-xs font-medium text-[#fafafa]">
                          {isOnline ? "Online" : "Offline"}
                        </span>
                      </div>
                    </div>

                    {/* Uptime */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#a1a1aa]">Uptime</span>
                      <span className="text-xs text-[#d4d4d8] font-mono">
                        {liveUptime || status?.uptime_display || "—"}
                      </span>
                    </div>

                    {/* Tick Interval */}
                    {status?.spawn_cron?.tick_interval_ms != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#a1a1aa]">Tick Interval</span>
                        <span className="text-xs text-[#d4d4d8] font-mono">
                          every {status.spawn_cron.tick_interval_ms / 1000}s
                        </span>
                      </div>
                    )}

                    {/* Region */}
                    {status?.region && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[#a1a1aa]">Region</span>
                        <span className="text-xs text-[#d4d4d8]">
                          {FLY_REGIONS[status.region] || status.region.toUpperCase()}
                        </span>
                      </div>
                    )}

                    {/* Divider */}
                    <div className="border-t border-[#27272a]" />

                    {/* Tick chart */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-[#a1a1aa]">
                          Server Scan Duration
                          {tickMetrics.length >= 2 ? (() => {
                            const hrs = (tickMetrics[tickMetrics.length - 1].ts - tickMetrics[0].ts) / 3600_000;
                            return hrs >= 1 ? ` (${hrs.toFixed(1)}h)` : ` (${Math.round(hrs * 60)}m)`;
                          })() : ""}
                        </span>
                        <span className="text-[10px] text-[#52525b]">
                          {(() => {
                            if (tickMetricsLoading) return null;
                            const cfgInterval = status?.spawn_cron?.tick_interval_ms;
                            if (cfgInterval) return `every ${cfgInterval / 1000}s`;
                            if (tickMetrics.length < 2) return `${tickMetrics.length} scan${tickMetrics.length !== 1 ? "s" : ""}`;
                            const intervals: number[] = [];
                            for (let i = 1; i < Math.min(tickMetrics.length, 10); i++) {
                              intervals.push(new Date(tickMetrics[i].ts).getTime() - new Date(tickMetrics[i - 1].ts).getTime());
                            }
                            const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                            const secs = Math.round(avg / 1000);
                            return `scans every ${secs}s`;
                          })()}
                        </span>
                      </div>
                      {tickMetricsLoading ? (
                        <div className="flex flex-col items-center justify-center h-32 gap-2">
                          <Loader2 className="w-5 h-5 text-[#a1a1aa] animate-spin" />
                          <span className="text-[10px] text-[#52525b]">Fetching chart data…</span>
                        </div>
                      ) : (
                        <TickChart metrics={tickMetrics} timezone={timezone} />
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
