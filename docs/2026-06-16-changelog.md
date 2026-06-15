# June 16, 2026 — Changelog (v0.15.0)

## 💰 Monetization & Billing

- **Server access model** — new servers get a 7-day free trial, then $9.99 per 30 days for full access
- **PayPal one-time checkout** — pay once, get 30 days. Days stack on top of remaining time (no lost days)
- **Billing dashboard** — new `/billing` page with plan status, payment buttons, features list, and payment history with PayPal receipt links
- **Celebratory payment modal** — animated success screen with confetti, extension details, and error handling
- **Free trial banner** — neutral gray banner shown during trial, cannot be dismissed. Pro users see no banner (nav badge only)
- **Expired server gating** — locked pages (History, Leaderboard, Members, Inventory) and tabs (Bosses, Activities, Integrations) when access expires
- **Kill recording blocked** — "Mark as Died", "Edit Spawn", "Finish Activity", and "Select Multiple" hidden on expired servers
- **Discord bot expiration** — bot commands blocked with friendly "access expired" message, spawn cron excludes expired servers
- **PayPal IPN edge function** — handles payment verification, extends subscription via RPC, records transactions
- **Payment history table** — tracks every transaction with date, amount, days added, status, and PayPal receipt link

## 🎨 Landing Page

- **Pricing section** — $9.99/30d card with feature checklist, 7-day trial badge, and value prop cards
- **Pricing nav button** — "$9.99 / 30 days" CTA between Deploy Dashboard and Watch Guides

## 📄 Legal

- **Refund Policy** — new page covering eligibility, non-refundable cases, chargebacks, and contact
- **Terms of Service** — added Section 9: Payments & Server Access
- **Privacy Policy** — added Section 1.5: Payment Data (PayPal integration)
- **Footer** — added Refund Policy link, fixed broken em dash and copyright encoding

## 🐛 Fixes

- **Weekly Schedule kill** — resolved guild name-to-UUID mismatch causing 22P02 errors on guild-based kills
- **Activity kill in bot** — fixed "already completed" bug where new schedule windows weren't resetting
- **Bot expiry check** — removed grandfathered bypass, aligned with website's `computeIsExpired` logic
- **Viewer role type** — added "viewer" to Server role union type, fixed PromiseLike catch pattern
- **Footer text** — fixed `\u2014` and `Ã‚Â©` encoding issues

## 🔧 Bot

- **Spawn cron** — expired servers excluded from monitoring (no notifications, no threads)
- **Expiry message** — updated wording from "subscription" to "access" throughout
- **Grandfathered check** — removed from both commands.ts and spawn-cron.ts