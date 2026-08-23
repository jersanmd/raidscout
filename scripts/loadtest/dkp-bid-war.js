// k6 load test: DKP bidding war.
//
// Simulates N players connected to one server's private dkp topic while a
// subset of them bid at a configured rate. Measures the two things that decide
// real capacity: place_bid latency under contention, and event-delivery lag
// from bid commit to broadcast receipt.
//
//   NEVER run this against the production project. It mints bids and mutates
//   DKP ledgers. Run it against a Supabase branch or a restored copy.
//
// Setup (once, on the TEST project):
//   1. Seed test auth users + claimed members with DKP:
//        node scripts/loadtest/seed-bidders.mjs   (see README.md)
//   2. Export their JWTs to bidders.json: [{ "token": "...", "memberId": "..." }, ...]
//
// Run:
//   k6 run scripts/loadtest/dkp-bid-war.js \
//     -e SUPABASE_URL=https://<ref>.supabase.co \
//     -e SUPABASE_ANON_KEY=<anon key> \
//     -e AUCTION_ID=<active auction uuid> \
//     -e SERVER_ID=<server uuid> \
//     -e PLAYERS=250 -e BIDS_PER_SEC=5 -e DURATION=5m
//
// Sweep the scenario grid from the scalability work:
//   PLAYERS   ∈ {50, 100, 250, 500}
//   BIDS_PER_SEC ∈ {1, 5, 10, 20}
//
// While it runs, capture on the Supabase side:
//   - Dashboard → Database → CPU / connections (pg_stat_activity peak)
//   - Dashboard → Realtime → concurrent connections, messages/sec
//   - API gateway requests/sec and error rate

import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Trend, Counter } from "k6/metrics";

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const AUCTION_ID = __ENV.AUCTION_ID;
const SERVER_ID = __ENV.SERVER_ID;
const PLAYERS = parseInt(__ENV.PLAYERS || "50", 10);
const BIDS_PER_SEC = parseFloat(__ENV.BIDS_PER_SEC || "1");
const DURATION = __ENV.DURATION || "3m";

const bidders = JSON.parse(open("./bidders.json"));

const bidLatency = new Trend("bid_latency", true);
const eventLag = new Trend("event_lag", true);
const bidsAccepted = new Counter("bids_accepted");
const bidsTooLow = new Counter("bids_too_low");
const bidsConflict = new Counter("bids_conflict");
const bidsFailed = new Counter("bids_failed");
const eventsReceived = new Counter("events_received");

export const options = {
  scenarios: {
    // Every player holds a realtime connection for the whole war.
    spectators: {
      executor: "per-vu-iterations",
      vus: PLAYERS,
      iterations: 1,
      maxDuration: DURATION,
      exec: "spectate",
    },
    // The bid stream: constant arrival rate spread across bidder VUs.
    bidders: {
      executor: "constant-arrival-rate",
      rate: Math.max(1, Math.round(BIDS_PER_SEC * 60)),
      timeUnit: "1m",
      duration: DURATION,
      preAllocatedVUs: Math.min(PLAYERS, bidders.length),
      exec: "bid",
    },
  },
  thresholds: {
    bid_latency: ["p(95)<1500", "p(99)<3000"],
    event_lag: ["p(95)<2000"],
    bids_failed: ["count<10"],
  },
};

// ── Spectator: hold a websocket, join the private dkp topic, time event lag ──
export function spectate() {
  const who = bidders[__VU % bidders.length];
  const url =
    `${SUPABASE_URL.replace("https://", "wss://")}/realtime/v1/websocket` +
    `?apikey=${ANON_KEY}&vsn=1.0.0`;

  ws.connect(url, {}, (socket) => {
    let ref = 0;
    const topic = `realtime:dkp:${SERVER_ID}`;

    socket.on("open", () => {
      socket.send(JSON.stringify({
        topic, event: "phx_join", ref: String(++ref),
        payload: {
          config: { broadcast: { self: true }, private: true },
          access_token: who.token,
        },
      }));
      // Phoenix heartbeat keeps the connection alive.
      socket.setInterval(() => {
        socket.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", ref: String(++ref), payload: {} }));
      }, 25000);
    });

    socket.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.event === "broadcast" && msg.payload?.event === "bid") {
        eventsReceived.add(1);
        const ts = Date.parse(msg.payload?.payload?.ts);
        if (!Number.isNaN(ts)) eventLag.add(Date.now() - ts);
      }
    });

    socket.setTimeout(() => socket.close(), parseDuration(DURATION));
  });
}

// ── Bidder: escalate the price via place_bid ────────────────────────────────
export function bid() {
  const who = bidders[Math.floor(Math.random() * bidders.length)];

  // Read the current highest off the denormalized auction row (1 cheap GET),
  // then bid one over — mirroring what the UI does.
  const state = http.get(
    `${SUPABASE_URL}/rest/v1/dkp_auctions?id=eq.${AUCTION_ID}&select=highest_bid`,
    { headers: authHeaders(who.token) },
  );
  const highest = state.status === 200 ? (state.json()[0]?.highest_bid ?? 0) : 0;

  const res = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/place_bid`,
    JSON.stringify({ p_auction_id: AUCTION_ID, p_amount: highest + 1 }),
    { headers: authHeaders(who.token) },
  );

  bidLatency.add(res.timings.duration);
  if (res.status === 200) {
    bidsAccepted.add(1);
    check(res, { "bid event returned": (r) => r.json()?.bidId !== undefined });
  } else {
    const body = res.body || "";
    if (body.includes("BID_TOO_LOW")) bidsTooLow.add(1);          // lost the race — expected under contention
    else if (body.includes("40001") || body.includes("deadlock")) bidsConflict.add(1);
    else bidsFailed.add(1);
  }
  sleep(0.1);
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
  };
}

function parseDuration(d) {
  const m = /^(\d+)(s|m|h)$/.exec(d);
  if (!m) return 180000;
  return parseInt(m[1], 10) * { s: 1000, m: 60000, h: 3600000 }[m[2]];
}
