package ui

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/dave/typing-lad/internal/game"
)

// SummaryModel displays the post-session summary.
type SummaryModel struct {
	result          *game.SessionResult
	paragraphResult *game.ParagraphResult
	width           int
	height          int
}

// NewSummaryModel creates a summary view from a session result.
func NewSummaryModel(result *game.SessionResult) SummaryModel {
	return SummaryModel{result: result}
}

// NewParagraphSummaryModel creates a summary view from a paragraph result.
func NewParagraphSummaryModel(result *game.ParagraphResult) SummaryModel {
	return SummaryModel{paragraphResult: result}
}

func (m SummaryModel) Init() tea.Cmd {
	return nil
}

func (m SummaryModel) Update(msg tea.Msg) (SummaryModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
	}
	return m, nil
}

// ShouldReturn reports whether the user wants to go back to menu.
func (m SummaryModel) ShouldReturn(msg tea.Msg) bool {
	if km, ok := msg.(tea.KeyMsg); ok {
		return km.Type == tea.KeyEnter || km.Type == tea.KeyEsc
	}
	return false
}

func (m SummaryModel) View() string {
	if m.paragraphResult != nil {
		return m.viewParagraph()
	}
	if m.result == nil {
		return "No session data."
	}

	var b strings.Builder

	b.WriteString(TitleStyle.Render("Session Complete!"))
	b.WriteString("\n\n")

	r := m.result
	duration := r.EndedAt.Sub(r.StartedAt)

	rows := []struct {
		label string
		value string
	}{
		{"Words Practiced", fmt.Sprintf("%d", r.WordsPracticed)},
		{"New Words", fmt.Sprintf("%d", r.NewWords)},
		{"Average WPM", fmt.Sprintf("%.1f", r.AvgWPM)},
		{"Accuracy", fmt.Sprintf("%.0f%%", r.Accuracy*100)},
		{"Duration", fmt.Sprintf("%.0f seconds", duration.Seconds())},
	}

	for _, row := range rows {
		b.WriteString(StatLabelStyle.Render(row.label))
		if row.label == "Accuracy" {
			b.WriteString(AccuracyStyle(r.Accuracy).Render(row.value))
		} else {
			b.WriteString(StatValueStyle.Render(row.value))
		}
		b.WriteString("\n")
	}

	b.WriteString("\n")
	b.WriteString(HelpStyle.Render("Press Enter to return to menu"))

	return b.String()
}

func (m SummaryModel) viewParagraph() string {
	var b strings.Builder

	b.WriteString(TitleStyle.Render("Paragraph Complete!"))
	b.WriteString("\n\n")

	r := m.paragraphResult
	duration := r.EndedAt.Sub(r.StartedAt)

	rows := []struct {
		label    string
		value    string
		accuracy bool
	}{
		{"Words Correct", fmt.Sprintf("%d / %d", r.WordsCorrect, r.WordsTotal), false},
		{"WPM", fmt.Sprintf("%.1f", r.WPM), false},
		{"Accuracy", fmt.Sprintf("%.0f%%", r.Accuracy*100), true},
		{"Duration", fmt.Sprintf("%.0f seconds", duration.Seconds()), false},
	}

	for _, row := range rows {
		b.WriteString(StatLabelStyle.Render(row.label))
		if row.accuracy {
			b.WriteString(AccuracyStyle(r.Accuracy).Render(row.value))
		} else {
			b.WriteString(StatValueStyle.Render(row.value))
		}
		b.WriteString("\n")
	}

	b.WriteString("\n")
	b.WriteString(HelpStyle.Render("Press Enter to return to menu"))

	return b.String()
}
