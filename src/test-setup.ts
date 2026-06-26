import "@testing-library/jest-dom/vitest";

// Suppress unhandled rejections from Supabase client initialization in tests
// that mock supabase.rpc but still trigger auth/realtime fetch attempts.
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes("fetch") || msg.includes("placeholder.supabase.co")) {
    return; // swallow
  }
  console.warn("[unhandledRejection]", reason);
});
