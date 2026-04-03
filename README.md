# Typing Lad

A TUI touch typing tutor with spaced repetition, built for learning split/ergo keyboards.

Words are introduced progressively by keyboard zone:

1. **Home Row** — `asdfghjkl`
2. **Top Row** — adds `qwertyuiop`
3. **Bottom Row** — adds `zxcvbnm`
4. **Full Alpha** — longer words using all keys

Within each zone, common/short words come first. Progress persists between sessions via SQLite, and an SM-2 spaced repetition algorithm schedules reviews.

## Install

```
go install github.com/dave/typing-lad@latest
```

Or build from source:

```
git clone https://github.com/dave/typing-lad.git
cd typing-lad
go build -o typing-lad .
```

## Usage

```
./typing-lad
```

Navigate the menu with arrow keys and Enter. In practice mode, just type — words auto-submit when you finish. If you mistype, the word repeats until you get it right.

Data is stored in `~/.config/typing-lad/typing-lad.db` (or the platform equivalent).

## Tech Stack

- [Bubbletea](https://github.com/charmbracelet/bubbletea) + [Lipgloss](https://github.com/charmbracelet/lipgloss) for the TUI
- [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite) for persistence (pure Go, no CGO)
- SM-2 spaced repetition for review scheduling
