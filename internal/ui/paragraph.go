package ui

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/dave/typing-lad/internal/game"
)

// ParagraphModel is the Bubbletea model for paragraph practice mode.
type ParagraphModel struct {
	engine    *game.Engine
	words     []string
	typed     string
	startTime time.Time
	result    *game.ParagraphResult
	err       error
	escaped   bool
	width     int
	height    int
}

// NewParagraphModel creates a new paragraph practice view.
func NewParagraphModel(engine *game.Engine) ParagraphModel {
	return ParagraphModel{
		engine: engine,
	}
}

type paragraphWordsMsg []string
type paragraphResultMsg *game.ParagraphResult
type paragraphErrMsg error

// Init starts the paragraph session and loads words.
func (m ParagraphModel) Init() tea.Cmd {
	m.engine.StartSession()
	engine := m.engine
	return func() tea.Msg {
		words, err := engine.GenerateParagraph(15)
		if err != nil {
			return paragraphErrMsg(err)
		}
		return paragraphWordsMsg(words)
	}
}

// Update handles input for paragraph mode.
func (m ParagraphModel) Update(msg tea.Msg) (ParagraphModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	case paragraphWordsMsg:
		m.words = []string(msg)
		m.typed = ""
		m.startTime = time.Now()
		return m, nil

	case paragraphResultMsg:
		m.result = msg
		return m, nil

	case paragraphErrMsg:
		m.err = msg
		return m, nil

	case tea.KeyMsg:
		return m.handleKey(msg)
	}

	return m, nil
}

func (m ParagraphModel) handleKey(msg tea.KeyMsg) (ParagraphModel, tea.Cmd) {
	if m.result != nil || m.words == nil {
		return m, nil
	}

	switch msg.Type {
	case tea.KeyEsc:
		m.escaped = true
		return m, nil

	case tea.KeyBackspace:
		if len(m.typed) > 0 {
			m.typed = m.typed[:len(m.typed)-1]
		}
		return m, nil

	case tea.KeySpace:
		m.typed += " "
		// Check if we've completed typing all words
		if m.isComplete() {
			return m, m.submit()
		}
		return m, nil

	case tea.KeyRunes:
		m.typed += string(msg.Runes)
		// Check if last word is complete (no trailing space needed for final word)
		if m.isComplete() {
			return m, m.submit()
		}
		return m, nil
	}

	return m, nil
}

// isComplete checks if the user has typed all the words.
func (m ParagraphModel) isComplete() bool {
	target := strings.Join(m.words, " ")
	return len(m.typed) >= len(target)
}

func (m ParagraphModel) submit() tea.Cmd {
	words := m.words
	typed := m.typed
	startTime := m.startTime
	duration := time.Since(startTime).Milliseconds()
	engine := m.engine
	return func() tea.Msg {
		result, err := engine.SubmitParagraph(words, typed, int(duration), startTime)
		if err != nil {
			return paragraphErrMsg(err)
		}
		return paragraphResultMsg(result)
	}
}

// Done reports whether the paragraph has been completed.
func (m ParagraphModel) Done() bool {
	return m.result != nil
}

// Escaped reports whether the user pressed Escape.
func (m ParagraphModel) Escaped(msg tea.Msg) bool {
	if km, ok := msg.(tea.KeyMsg); ok {
		return km.Type == tea.KeyEsc
	}
	return false
}

// Result returns the paragraph result, or nil if not done.
func (m ParagraphModel) Result() *game.ParagraphResult {
	return m.result
}

// Engine returns the underlying game engine.
func (m ParagraphModel) Engine() *game.Engine {
	return m.engine
}

// View renders the paragraph practice view.
func (m ParagraphModel) View() string {
	if m.err != nil {
		return HeaderStyle.Render("Error: "+m.err.Error()) + "\n\n" +
			HelpStyle.Render("Press Esc to return to menu")
	}

	if m.words == nil {
		return HeaderStyle.Render("Loading...")
	}

	var b strings.Builder

	// Header
	levelName := levelNames[int(m.engine.CurrentLevel())]
	b.WriteString(HeaderStyle.Render(fmt.Sprintf("Paragraph Mode — Level: %s", levelName)))
	b.WriteString("\n\n")

	// Render paragraph with per-character feedback
	target := strings.Join(m.words, " ")
	b.WriteString(m.renderParagraph(target))
	b.WriteString("\n\n")

	// Progress info
	typedWords := countTypedWords(m.typed)
	b.WriteString(StatusBarStyle.Render(fmt.Sprintf("Word %d/%d", min(typedWords+1, len(m.words)), len(m.words))))

	// Running WPM
	if elapsed := time.Since(m.startTime).Seconds(); elapsed > 1 && len(m.typed) > 0 {
		wpm := (float64(len(m.typed)) / 5.0) / (elapsed / 60.0)
		b.WriteString(StatusBarStyle.Render(fmt.Sprintf("  WPM: %.0f", wpm)))
	}
	b.WriteString("\n\n")

	b.WriteString(HelpStyle.Render("Type the paragraph above • Keep going on mistakes • Esc to end early"))

	return b.String()
}

func (m ParagraphModel) renderParagraph(target string) string {
	maxWidth := m.width
	if maxWidth <= 0 {
		maxWidth = 80
	}
	breaks := wordWrapBreaks(m.words, maxWidth)

	var b strings.Builder
	for i, ch := range target {
		if breaks[i] {
			// Visually replace this space with a line break
			if i == len(m.typed) {
				// Cursor is on the space — show it highlighted before wrapping
				b.WriteString(CursorStyle.Render(" "))
			}
			b.WriteString("\n")
			continue
		}

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
	// Extra typed chars beyond target
	if len(m.typed) > len(target) {
		b.WriteString(IncorrectStyle.Render(m.typed[len(target):]))
	}
	return b.String()
}

// wordWrapBreaks returns the set of space indices in the target string
// that should become visual line breaks.
func wordWrapBreaks(words []string, maxWidth int) map[int]bool {
	if maxWidth <= 0 {
		return nil
	}
	breaks := map[int]bool{}
	col := 0
	pos := 0
	for i, word := range words {
		if i > 0 {
			spacePos := pos
			if col+1+len(word) > maxWidth {
				breaks[spacePos] = true
				col = len(word)
			} else {
				col += 1 + len(word)
			}
			pos++ // the space character
		} else {
			col = len(word)
		}
		pos += len(word)
	}
	return breaks
}

func countTypedWords(typed string) int {
	if typed == "" {
		return 0
	}
	return len(strings.Fields(typed))
}
