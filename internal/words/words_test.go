package words

import (
	"testing"
)

func TestWordCountsPerLevel(t *testing.T) {
	levels := []struct {
		level Level
		name  string
		min   int
	}{
		{HomeRow, "HomeRow", 30},
		{TopRow, "TopRow", 50},
		{BottomRow, "BottomRow", 50},
		{FullAlpha, "FullAlpha", 40},
	}

	for _, tc := range levels {
		words := WordsByLevel(tc.level)
		if len(words) < tc.min {
			t.Errorf("Level %s: expected at least %d words, got %d", tc.name, tc.min, len(words))
		}
	}
}

func TestNoDuplicatesWithinLevel(t *testing.T) {
	levels := []Level{HomeRow, TopRow, BottomRow, FullAlpha}
	for _, level := range levels {
		seen := make(map[string]bool)
		for _, w := range WordsByLevel(level) {
			if seen[w.Text] {
				t.Errorf("Level %d: duplicate word %q", level, w.Text)
			}
			seen[w.Text] = true
		}
	}
}

func TestWordsUseOnlyValidKeys(t *testing.T) {
	levels := []Level{HomeRow, TopRow, BottomRow, FullAlpha}
	for _, level := range levels {
		keys := KeysForLevel(level)
		for _, w := range WordsByLevel(level) {
			if !UsesOnlyKeys(w.Text, keys) {
				t.Errorf("Level %d: word %q uses keys outside %q", level, w.Text, keys)
			}
		}
	}
}

func TestAllWordsReturnsAll(t *testing.T) {
	all := AllWords()
	total := len(WordsByLevel(HomeRow)) + len(WordsByLevel(TopRow)) +
		len(WordsByLevel(BottomRow)) + len(WordsByLevel(FullAlpha))
	if len(all) != total {
		t.Errorf("AllWords() returned %d, expected %d", len(all), total)
	}
}

func TestWordByText(t *testing.T) {
	w, ok := WordByText("flash")
	if !ok {
		t.Fatal("expected to find 'flash'")
	}
	if w.Level != HomeRow {
		t.Errorf("expected 'flash' at HomeRow, got level %d", w.Level)
	}

	_, ok = WordByText("zzzznotaword")
	if ok {
		t.Error("expected not to find 'zzzznotaword'")
	}
}

func TestRanksAreSequential(t *testing.T) {
	levels := []Level{HomeRow, TopRow, BottomRow, FullAlpha}
	for _, level := range levels {
		words := WordsByLevel(level)
		for i, w := range words {
			expected := i + 1
			if w.Rank != expected {
				t.Errorf("Level %d word %q: expected rank %d, got %d", level, w.Text, expected, w.Rank)
			}
		}
	}
}
