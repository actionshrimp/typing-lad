package ui

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/dave/typing-lad/internal/game"
)

// PracticeModel is the Bubbletea model for practice mode.
type PracticeModel struct {
	engine     *game.Engine
	target     string
	typed      string
	wordStart  time.Time
	lastResult *game.AttemptResult
	err        error
	width      int
	height     int
}

// NewPracticeModel creates a new practice view.
func NewPracticeModel(engine *game.Engine) PracticeModel {
	return PracticeModel{
		engine: engine,
	}
}

type nextWordMsg string
type attemptResultMsg *game.AttemptResult
type practiceErrMsg error

// Init starts the practice session and loads the first word.
func (m PracticeModel) Init() tea.Cmd {
	m.engine.StartSession()
	return m.loadNextWord()
}

func (m PracticeModel) loadNextWord() tea.Cmd {
	return func() tea.Msg {
		word, err := m.engine.NextWord()
		if err != nil {
			return practiceErrMsg(err)
		}
		return nextWordMsg(word)
	}
}

// Update handles input for practice mode.
func (m PracticeModel) Update(msg tea.Msg) (PracticeModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case nextWordMsg:
		m.target = string(msg)
		m.typed = ""
		m.wordStart = time.Now()
		m.lastResult = nil
		return m, nil

	case attemptResultMsg:
		m.lastResult = msg
		if m.engine.SessionDone() {
			return m, nil // app.go will handle transition to summary
		}
		if !msg.IsCorrect {
			// Retry the same word — reset input but keep target
			m.typed = ""
			m.wordStart = time.Now()
			return m, nil
		}
		return m, m.loadNextWord()

	case practiceErrMsg:
		m.err = msg
		return m, nil

	case tea.KeyMsg:
		return m.handleKey(msg)
	}

	return m, nil
}

func (m PracticeModel) handleKey(msg tea.KeyMsg) (PracticeModel, tea.Cmd) {
	switch msg.Type {
	case tea.KeyEsc:
		// End session early — handled by app
		return m, nil

	case tea.KeyBackspace:
		if len(m.typed) > 0 {
			m.typed = m.typed[:len(m.typed)-1]
		}
		return m, nil

	case tea.KeyEnter, tea.KeySpace:
		if len(m.typed) > 0 {
			return m.submitWord()
		}
		return m, nil

	case tea.KeyRunes:
		m.typed += string(msg.Runes)
		// Auto-submit when typed length matches target
		if len(m.typed) >= len(m.target) {
			return m.submitWord()
		}
		return m, nil
	}

	return m, nil
}

func (m PracticeModel) submitWord() (PracticeModel, tea.Cmd) {
	duration := time.Since(m.wordStart).Milliseconds()
	target := m.target
	typed := m.typed
	engine := m.engine

	return m, func() tea.Msg {
		result, err := engine.SubmitAttempt(target, typed, int(duration))
		if err != nil {
			return practiceErrMsg(err)
		}
		return attemptResultMsg(result)
	}
}

// Done reports whether the session is complete.
func (m PracticeModel) Done() bool {
	return m.engine.SessionDone()
}

// Escaped reports whether the user pressed Escape.
func (m PracticeModel) Escaped(msg tea.Msg) bool {
	if km, ok := msg.(tea.KeyMsg); ok {
		return km.Type == tea.KeyEsc
	}
	return false
}

// Engine returns the underlying game engine.
func (m PracticeModel) Engine() *game.Engine {
	return m.engine
}

// View renders the practice view.
func (m PracticeModel) View() string {
	if m.err != nil {
		return HeaderStyle.Render("Error: "+m.err.Error()) + "\n\n" +
			HelpStyle.Render("Press Esc to return to menu")
	}

	if m.target == "" {
		return HeaderStyle.Render("Loading...")
	}

	var b strings.Builder

	// Header
	levelName := levelNames[int(m.engine.CurrentLevel())]
	b.WriteString(HeaderStyle.Render(fmt.Sprintf("Practice — Level: %s", levelName)))
	b.WriteString("\n\n")

	// Target word (large)
	b.WriteString(TargetWordStyle.Render(m.target))
	b.WriteString("\n")

	// Typed characters with color feedback
	b.WriteString(m.renderTyped())
	b.WriteString("\n\n")

	// Last result feedback
	if m.lastResult != nil {
		b.WriteString(m.renderResult())
		b.WriteString("\n")
	}

	// Progress bar
	b.WriteString(m.renderProgress())
	b.WriteString("\n\n")

	// Stats line
	if m.engine.WordsCompleted() > 0 {
		b.WriteString(m.renderSessionStats())
		b.WriteString("\n")
	}

	// Help
	b.WriteString(HelpStyle.Render("Type the word above • Backspace to correct • Esc to end session"))

	return b.String()
}

func (m PracticeModel) renderTyped() string {
	var b strings.Builder
	for i, ch := range m.target {
		if i < len(m.typed) {
			if m.typed[i] == byte(ch) {
				b.WriteString(CorrectStyle.Render(string(ch)))
			} else {
				b.WriteString(IncorrectStyle.Render(string(m.typed[i])))
			}
		} else if i == len(m.typed) {
			b.WriteString(CursorStyle.Render(string(ch)))
		} else {
			b.WriteString(UntypedStyle.Render(string(ch)))
		}
	}
	// Show extra typed characters beyond target length
	if len(m.typed) > len(m.target) {
		b.WriteString(IncorrectStyle.Render(m.typed[len(m.target):]))
	}
	return b.String()
}

func (m PracticeModel) renderResult() string {
	r := m.lastResult
	accStyle := AccuracyStyle(r.Accuracy)
	check := CorrectStyle.Render("✓")
	if !r.IsCorrect {
		check = IncorrectStyle.Render("✗")
	}
	return fmt.Sprintf("%s %s  WPM: %.0f  Accuracy: %s",
		check, r.Target,
		r.WPM,
		accStyle.Render(fmt.Sprintf("%.0f%%", r.Accuracy*100)),
	)
}

func (m PracticeModel) renderProgress() string {
	done := m.engine.WordsCompleted()
	total := m.engine.SessionSize()
	pct := float64(done) / float64(total)

	barWidth := 30
	filled := int(pct * float64(barWidth))
	if filled > barWidth {
		filled = barWidth
	}

	bar := strings.Repeat("█", filled) + strings.Repeat("░", barWidth-filled)
	return StatusBarStyle.Render(fmt.Sprintf("[%s] %d/%d words", bar, done, total))
}

func (m PracticeModel) renderSessionStats() string {
	return StatusBarStyle.Render(fmt.Sprintf("Session: %d words completed", m.engine.WordsCompleted()))
}

var levelNames = map[int]string{
	int(1): "Home Row",
	int(2): "Top Row",
	int(3): "Bottom Row",
	int(4): "Full Alpha",
}
