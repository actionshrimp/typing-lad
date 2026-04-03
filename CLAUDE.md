# Typing Lad — Project Conventions

## Build & Test Commands
- `go build ./...` — must compile cleanly before committing
- `go test ./...` — all tests must pass before committing
- `go vet ./...` — no issues before committing

## Test Coverage Requirements
- **store**: Full CRUD cycle (seed, read, update, query due/new words, sessions)
- **SRS algorithm**: EF bounds, interval growth, reset on failure, quality mapping edge cases
- **game engine**: Word selection priority, level unlocking, scoring math
- **word list**: Counts per level, no duplicates, all words use only valid keys for their level

## Code Conventions
- Errors are returned, not panicked (except in main for fatal startup errors)
- Use `fmt.Errorf("context: %w", err)` for error wrapping
- Package names are singular (`store`, `game`, `word`)
- Unexported helpers stay in the same file as their caller
- SQLite via `modernc.org/sqlite` (pure Go, no CGO required)
- TUI via `charmbracelet/bubbletea` + `lipgloss` + `bubbles`

## Architecture
- `internal/words` — embedded word lists by keyboard zone level
- `internal/store` — SQLite persistence (migrations, queries)
- `internal/game` — SRS algorithm + game engine (word selection, scoring)
- `internal/ui` — Bubbletea views (menu, practice, stats, summary, styles)
- `internal/app` — top-level model routing between views
