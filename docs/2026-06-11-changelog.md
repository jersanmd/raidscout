# June 11, 2026 — Changelog

## 🆕 New Features

- **Rally image name overlay** — when viewing a rally screenshot fullscreen from history or weekly schedule, a bar of green ✓ badges appears below the image showing every participant already checked in the attendance list

## 🐛 Bug Fixes

- **Analytics attendance limit** — `fetchAnalytics` now paginates the attendance fallback query with a while loop and `.range()` to fetch all records beyond Supabase's default 1000-row limit

## 🎨 UI

- **"Mark Dead" button** — the boss kill button now reads "Mark Dead" instead of "Mark Died" for clearer, more standard terminology
