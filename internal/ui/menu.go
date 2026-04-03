package ui

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

// MenuItem represents a menu option.
type MenuItem int

const (
	MenuPractice MenuItem = iota
	MenuStats
	MenuQuit
)

// MenuModel is the main menu view.
type MenuModel struct {
	cursor int
	items  []string
	width  int
	height int
}

// NewMenuModel creates a new main menu.
func NewMenuModel() MenuModel {
	return MenuModel{
		items: []string{"Practice", "Stats", "Quit"},
	}
}

func (m MenuModel) Init() tea.Cmd {
	return nil
}

func (m MenuModel) Update(msg tea.Msg) (MenuModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyUp:
			m.cursor--
			if m.cursor < 0 {
				m.cursor = len(m.items) - 1
			}
		case tea.KeyDown:
			m.cursor++
			if m.cursor >= len(m.items) {
				m.cursor = 0
			}
		}
	}
	return m, nil
}

// Selected returns the selected menu item when Enter is pressed.
// Returns -1 if no selection was made.
func (m MenuModel) Selected(msg tea.Msg) MenuItem {
	if km, ok := msg.(tea.KeyMsg); ok && km.Type == tea.KeyEnter {
		return MenuItem(m.cursor)
	}
	return -1
}

const logo = `
 ▄▄▄▄▄▄▄ ▄▄   ▄▄ ▄▄▄▄▄▄▄ ▄▄▄ ▄▄    ▄ ▄▄▄▄▄▄▄
█       █  █ █  █       █   █  █  █ █       █
█▄     ▄█  █▄█  █    ▄  █   █  █▄█ █   ▄▄▄▄█
  █   █ █       █   █▄█ █   █       █  █  ▄▄
  █   █ █▄     ▄█    ▄▄▄█   █  ▄    █  █ █  █
  █   █   █   █ █   █   █   █ █ █   █  █▄▄█ █
  █▄▄▄█   █▄▄▄█ █▄▄▄█   █▄▄▄█▄█  █▄▄█▄▄▄▄▄▄▄█
 ▄▄▄     ▄▄▄▄▄▄▄ ▄▄▄▄▄▄
█   █   █       █      █
█   █   █   ▄   █  ▄    █
█   █   █  █▄█  █ █ █   █
█   █▄▄▄█       █ █▄█   █
█       █   ▄   █       █
█▄▄▄▄▄▄▄█▄▄█ █▄▄█▄▄▄▄▄▄█`

func (m MenuModel) View() string {
	var b strings.Builder

	b.WriteString(TitleStyle.Render(logo))
	b.WriteString("\n")
	b.WriteString(SubtitleStyle.Render("  Touch Typing Tutor"))
	b.WriteString("\n\n")

	for i, item := range m.items {
		cursor := "  "
		style := MenuItemStyle
		if i == m.cursor {
			cursor = "▸ "
			style = MenuSelectedStyle
		}
		b.WriteString(fmt.Sprintf("%s%s\n", cursor, style.Render(item)))
	}

	b.WriteString("\n")
	b.WriteString(HelpStyle.Render("↑/↓ Navigate • Enter Select"))

	return b.String()
}
