package app

import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/dave/typing-lad/internal/game"
	"github.com/dave/typing-lad/internal/store"
	"github.com/dave/typing-lad/internal/ui"
)

type view int

const (
	viewMenu view = iota
	viewPractice
	viewSummary
	viewStats
)

// Model is the top-level Bubbletea model that routes between views.
type Model struct {
	db       *store.DB
	engine   *game.Engine
	current  view
	menu     ui.MenuModel
	practice ui.PracticeModel
	summary  ui.SummaryModel
	stats    ui.StatsModel
}

// New creates a new app model.
func New(db *store.DB, engine *game.Engine) Model {
	return Model{
		db:      db,
		engine:  engine,
		current: viewMenu,
		menu:    ui.NewMenuModel(),
	}
}

func (m Model) Init() tea.Cmd {
	return m.menu.Init()
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Global quit
	if km, ok := msg.(tea.KeyMsg); ok {
		if km.Type == tea.KeyCtrlC {
			return m, tea.Quit
		}
	}

	switch m.current {
	case viewMenu:
		return m.updateMenu(msg)
	case viewPractice:
		return m.updatePractice(msg)
	case viewSummary:
		return m.updateSummary(msg)
	case viewStats:
		return m.updateStats(msg)
	}

	return m, nil
}

func (m Model) updateMenu(msg tea.Msg) (tea.Model, tea.Cmd) {
	sel := m.menu.Selected(msg)
	switch sel {
	case ui.MenuPractice:
		m.practice = ui.NewPracticeModel(m.engine)
		m.current = viewPractice
		return m, m.practice.Init()

	case ui.MenuStats:
		m.stats = ui.NewStatsModel(m.db)
		m.current = viewStats
		return m, m.stats.Init()

	case ui.MenuQuit:
		return m, tea.Quit
	}

	var cmd tea.Cmd
	m.menu, cmd = m.menu.Update(msg)
	return m, cmd
}

func (m Model) updatePractice(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Check for escape or session completion
	if m.practice.Escaped(msg) || m.practice.Done() {
		result, err := m.practice.Engine().EndSession()
		if err != nil {
			// Fall back to menu on error
			m.current = viewMenu
			return m, nil
		}
		m.summary = ui.NewSummaryModel(result)
		m.current = viewSummary
		return m, m.summary.Init()
	}

	var cmd tea.Cmd
	m.practice, cmd = m.practice.Update(msg)

	// Check if session became done after update
	if m.practice.Done() {
		result, err := m.practice.Engine().EndSession()
		if err != nil {
			m.current = viewMenu
			return m, nil
		}
		m.summary = ui.NewSummaryModel(result)
		m.current = viewSummary
		return m, m.summary.Init()
	}

	return m, cmd
}

func (m Model) updateSummary(msg tea.Msg) (tea.Model, tea.Cmd) {
	if m.summary.ShouldReturn(msg) {
		// Refresh engine to pick up level changes
		engine, err := game.NewEngine(m.db)
		if err == nil {
			m.engine = engine
		}
		m.menu = ui.NewMenuModel()
		m.current = viewMenu
		return m, nil
	}

	var cmd tea.Cmd
	m.summary, cmd = m.summary.Update(msg)
	return m, cmd
}

func (m Model) updateStats(msg tea.Msg) (tea.Model, tea.Cmd) {
	if m.stats.ShouldReturn(msg) {
		m.menu = ui.NewMenuModel()
		m.current = viewMenu
		return m, nil
	}

	var cmd tea.Cmd
	m.stats, cmd = m.stats.Update(msg)
	return m, cmd
}

func (m Model) View() string {
	switch m.current {
	case viewMenu:
		return m.menu.View()
	case viewPractice:
		return m.practice.View()
	case viewSummary:
		return m.summary.View()
	case viewStats:
		return m.stats.View()
	}
	return ""
}
