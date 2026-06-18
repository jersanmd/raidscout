import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import "./index.css";

// ── localStorage wipe control ──────────────────────────────
// Bump WIPE_STORAGE_KEY when you want all users' raidscout-* localStorage cleared.
// Only change this when shipping features that need a fresh start (e.g., breaking state changes).
// ────────────────────────────────────────────────────────────
const WIPE_STORAGE_KEY = "v1"; // bump to "v2", "v3", etc. to trigger a wipe
const STORED_WIPE_KEY = "raidscout-wipe-version";
const storedWipeVersion = localStorage.getItem(STORED_WIPE_KEY);
if (storedWipeVersion !== WIPE_STORAGE_KEY) {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("raidscout-")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  localStorage.setItem(STORED_WIPE_KEY, WIPE_STORAGE_KEY);
}

// ── Chunk load error recovery ──────────────────────────────
// When a new build is deployed, old hashed chunk filenames 404.
// Catch the dynamic import failure and force a clean reload.
function handleStaleBuild() {
  console.warn("[raidscout] Stale build detected — reloading...");
  // Brief delay so the error doesn't loop before the new HTML arrives
  setTimeout(() => window.location.reload(), 100);
}
window.addEventListener("error", (event) => {
  const message = event.message || "";
  if (message.includes("Failed to fetch dynamically imported module") ||
      message.includes("Importing a module script failed")) {
    event.preventDefault();
    handleStaleBuild();
  }
});
// Vite-specific preload error
window.addEventListener("vite:preloadError", () => {
  handleStaleBuild();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <App />
      <Analytics />
    </HelmetProvider>
  </StrictMode>
);
