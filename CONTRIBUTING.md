# Contributing to RaidScout

Thanks for your interest in contributing! 🏰

## Getting Started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/jersanmd/raidscout.git`
3. Install dependencies: `npm install`
4. Copy `.env.example` to `.env.local` and fill in your Supabase project details
5. Start dev: `npm run dev`

## Development Setup

You'll need:
- A [Supabase](https://supabase.com) project (free tier works)
- Node.js 22+
- The SQL migrations in `supabase/migrations/` applied to your database

See [README.md](./README.md) for full setup instructions.

## What to Work On

- Check open issues tagged `good first issue` or `help wanted`
- New boss templates, game configs, or integrations
- Bug fixes and performance improvements

## Pull Requests

1. Create a branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Run tests: `npm test`
4. Submit a PR against `master`

## Code Style

- TypeScript with strict mode
- React hooks patterns (no class components)
- Tailwind CSS for styling
- Test with Vitest

## Questions?

Open a Discussion on GitHub or join our Discord.
