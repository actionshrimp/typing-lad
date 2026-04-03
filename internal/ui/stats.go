package ui

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/dave/typing-lad/internal/store"
	"github.com/dave/typing-lad/internal/words"
)

// StatsModel displays all-time statistics.
type StatsModel struct {
	db     *store.DB
	stats  *store.Stats
	err    error
	width  int
	height int
}

// NewStatsModel creates a stats view.
func NewStatsModel(db *store.DB) StatsModel {
	return StatsModel{db: db}
}

type statsLoadedMsg *store.Stats
type statsErrMsg error

func (m StatsModel) Init() tea.Cmd {
	return m.loadStats()
}

func (m StatsModel) loadStats() tea.Cmd {
	db := m.db
	return func() tea.Msg {
		stats, err := db.GetStats()
		if err != nil {
			return statsErrMsg(err)
		}
		return statsLoadedMsg(stats)
	}
}

func (m StatsModel) Update(msg tea.Msg) (StatsModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case statsLoadedMsg:
		m.stats = msg

	case statsErrMsg:
		m.err = msg
	}
	return m, nil
}

// ShouldReturn reports whether the user wants to go back to menu.
func (m StatsModel) ShouldReturn(msg tea.Msg) bool {
	if km, ok := msg.(tea.KeyMsg); ok {
		return km.Type == tea.KeyEsc || km.Type == tea.KeyEnter
	}
	return false
}

func (m StatsModel) View() string {
	if m.err != nil {
		return HeaderStyle.Render("Error loading stats: "+m.err.Error()) + "\n\n" +
			HelpStyle.Render("Press Esc to return")
	}

	if m.stats == nil {
		return HeaderStyle.Render("Loading stats...")
	}

	var b strings.Builder

	b.WriteString(TitleStyle.Render("Statistics"))
	b.WriteString("\n\n")

	s := m.stats
	lvl := levelNames[int(s.CurrentLevel)]

	rows := []struct {
		label string
		value string
	}{
		{"Current Level", lvl},
		{"Total Sessions", fmt.Sprintf("%d", s.TotalSessions)},
		{"Total Words", fmt.Sprintf("%d", s.TotalWords)},
		{"Words Mastered", fmt.Sprintf("%d", s.WordsMastered)},
		{"Average WPM", fmt.Sprintf("%.1f", s.AvgWPM)},
		{"Average Accuracy", fmt.Sprintf("%.0f%%", s.AvgAccuracy*100)},
	}

	for _, row := range rows {
		b.WriteString(StatLabelStyle.Render(row.label))
		if row.label == "Average Accuracy" {
			b.WriteString(AccuracyStyle(s.AvgAccuracy).Render(row.value))
		} else {
			b.WriteString(StatValueStyle.Render(row.value))
		}
		b.WriteString("\n")
	}

	// Per-level breakdown
	b.WriteString("\n")
	b.WriteString(SubtitleStyle.Render("Words Mastered by Level"))
	b.WriteString("\n")

	allLevels := []struct {
		level words.Level
		name  string
	}{
		{words.HomeRow, "Home Row"},
		{words.TopRow, "Top Row"},
		{words.BottomRow, "Bottom Row"},
		{words.FullAlpha, "Full Alpha"},
	}

	for _, lv := range allLevels {
		total := len(words.WordsByLevel(lv.level))
		mastered := s.WordsPerLevel[lv.level]
		pct := 0.0
		if total > 0 {
			pct = float64(mastered) / float64(total) * 100
		}
		b.WriteString(StatLabelStyle.Render(fmt.Sprintf("  %s", lv.name)))
		b.WriteString(StatValueStyle.Render(fmt.Sprintf("%d/%d (%.0f%%)", mastered, total, pct)))
		b.WriteString("\n")
	}

	b.WriteString("\n")
	b.WriteString(HelpStyle.Render("Press Esc or Enter to return to menu"))

	return b.String()
}
