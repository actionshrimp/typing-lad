package main

import (
	"fmt"
	"os"
	"path/filepath"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/dave/typing-lad/internal/app"
	"github.com/dave/typing-lad/internal/game"
	"github.com/dave/typing-lad/internal/store"
	"github.com/dave/typing-lad/internal/words"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	// Database in user's config directory
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	dbDir := filepath.Join(configDir, "typing-lad")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	dbPath := filepath.Join(dbDir, "typing-lad.db")

	db, err := store.NewDB(dbPath)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	// Seed word list
	if err := db.SeedWords(words.AllWords()); err != nil {
		return fmt.Errorf("seed words: %w", err)
	}

	// Create game engine
	engine, err := game.NewEngine(db)
	if err != nil {
		return fmt.Errorf("create engine: %w", err)
	}

	// Launch TUI
	model := app.New(db, engine)
	p := tea.NewProgram(model, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		return fmt.Errorf("run program: %w", err)
	}

	return nil
}
