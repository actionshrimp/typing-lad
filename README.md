# Typing Lad

A touch typing tutor with spaced repetition, available as a [web app](https://actionshrimp.com/typing-lad/) and a terminal UI.

Words are introduced progressively by keyboard zone:

1. **Home Row** — `asdfghjkl`
2. **Top Row** — adds `qwertyuiop`
3. **Bottom Row** — adds `zxcvbnm`
4. **Full Alpha** — longer words using all keys

Within each zone, common/short words come first. An SM-2 spaced repetition algorithm schedules reviews so you spend time on words you struggle with.

## Web App

**[Try it now](https://actionshrimp.com/typing-lad/)** — no install needed, runs entirely in the browser.

- **Word Mode** — type individual words in a 20-word session
- **Paragraph Mode** — type full sentences
- Session summary with per-word velocity chart
- Stats dashboard with speed progression, error heatmap, and session history
- Progress saved to localStorage (export/import as JSON)

## Terminal UI

```
git clone https://github.com/actionshrimp/typing-lad.git
cd typing-lad
npm install
npm run dev:tui
```

Same practice modes and SRS engine, rendered in the terminal via [Ink](https://github.com/vadimdemedes/ink). Progress saved to `~/.config/typing-lad/data.json`.

## Development

```
npm install              # install dependencies
npm run dev:web          # start web dev server (localhost:5173)
npm run dev:tui          # start terminal UI
npx tsc --build          # type-check all packages
npm run test:web         # Playwright E2E tests
npm run test:tui         # Vitest TUI tests
```

### Project Structure

```
packages/
  core/    — shared engine, SRS algorithm, word lists, store
  web/     — React + Vite + Tailwind CSS + Recharts
  tui/     — React + Ink terminal UI
tests/
  web/     — Playwright E2E tests
  tui/     — Vitest + node-pty tests
```

## Tech Stack

- **Core**: TypeScript, SM-2 spaced repetition
- **Web**: React, Vite, Tailwind CSS v4, Recharts
- **TUI**: React, [Ink](https://github.com/vadimdemedes/ink)
