# Typing Lad — Project Conventions

## Build & Test Commands
- `npx tsc --build` — must type-check cleanly before committing
- `npm run test:web` — Playwright E2E tests must pass
- `npm run test:tui` — Vitest TUI tests must pass

## Test Coverage Requirements
- **store**: Full CRUD cycle (seed, read, update, query due/new words, sessions, key errors)
- **SRS algorithm**: EF bounds, interval growth, reset on failure, quality mapping edge cases
- **game engine**: Word selection priority, level unlocking, scoring math
- **word list**: Counts per level, no duplicates, all words use only valid keys for their level

## Code Conventions
- TypeScript strict mode across all packages
- Monorepo with npm workspaces (`packages/core`, `packages/web`, `packages/tui`)
- Core package exports shared types and logic; web and TUI depend on core
- Web uses Tailwind CSS v4 with `@theme` design tokens
- TUI uses React + Ink for terminal rendering

## Architecture
- `packages/core/src/words.ts` — word lists by keyboard zone level
- `packages/core/src/store.ts` — in-memory store with import/export (persisted externally)
- `packages/core/src/srs.ts` — SM-2 spaced repetition algorithm
- `packages/core/src/engine.ts` — game engine (word selection, scoring, sessions)
- `packages/web/src/` — React + Vite + Tailwind web app (localStorage persistence)
- `packages/tui/src/` — React + Ink terminal UI (file persistence)
- `tests/web/` — Playwright E2E tests
- `tests/tui/` — Vitest + node-pty tests
