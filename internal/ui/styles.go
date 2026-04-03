package ui

import "github.com/charmbracelet/lipgloss"

// Colors
var (
	ColorGreen   = lipgloss.Color("#04B575")
	ColorRed     = lipgloss.Color("#FF4672")
	ColorDim     = lipgloss.Color("#626262")
	ColorPrimary = lipgloss.Color("#7D56F4")
	ColorWhite   = lipgloss.Color("#FAFAFA")
	ColorYellow  = lipgloss.Color("#FFD700")
	ColorCyan    = lipgloss.Color("#00CED1")
)

// Text styles
var (
	CorrectStyle   = lipgloss.NewStyle().Foreground(ColorGreen)
	IncorrectStyle = lipgloss.NewStyle().Foreground(ColorRed).Underline(true)
	UntypedStyle   = lipgloss.NewStyle().Foreground(ColorDim)
	CursorStyle    = lipgloss.NewStyle().Foreground(ColorWhite).Background(ColorPrimary)
)

// Layout styles
var (
	TargetWordStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(ColorWhite).
			MarginBottom(1)

	HeaderStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(ColorPrimary).
			MarginBottom(1)

	StatusBarStyle = lipgloss.NewStyle().
			Foreground(ColorDim).
			MarginTop(1)

	MenuItemStyle = lipgloss.NewStyle().
			PaddingLeft(2)

	MenuSelectedStyle = lipgloss.NewStyle().
				PaddingLeft(2).
				Foreground(ColorPrimary).
				Bold(true)

	TitleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(ColorPrimary).
			MarginBottom(1).
			Padding(0, 1)

	SubtitleStyle = lipgloss.NewStyle().
			Foreground(ColorCyan).
			MarginBottom(1)

	StatLabelStyle = lipgloss.NewStyle().
			Foreground(ColorDim).
			Width(20)

	StatValueStyle = lipgloss.NewStyle().
			Foreground(ColorWhite).
			Bold(true)

	AccuracyGoodStyle = lipgloss.NewStyle().Foreground(ColorGreen).Bold(true)
	AccuracyOkStyle   = lipgloss.NewStyle().Foreground(ColorYellow).Bold(true)
	AccuracyBadStyle  = lipgloss.NewStyle().Foreground(ColorRed).Bold(true)

	HelpStyle = lipgloss.NewStyle().Foreground(ColorDim)
)

// AccuracyStyle returns the appropriate style for a given accuracy value.
func AccuracyStyle(accuracy float64) lipgloss.Style {
	switch {
	case accuracy >= 0.95:
		return AccuracyGoodStyle
	case accuracy >= 0.8:
		return AccuracyOkStyle
	default:
		return AccuracyBadStyle
	}
}
