package store

import (
	"testing"
	"time"

	"github.com/dave/typing-lad/internal/words"
)

func newTestDB(t *testing.T) *DB {
	t.Helper()
	db, err := NewDB(":memory:")
	if err != nil {
		t.Fatalf("NewDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestSeedWords(t *testing.T) {
	db := newTestDB(t)

	allWords := words.AllWords()
	if err := db.SeedWords(allWords); err != nil {
		t.Fatalf("SeedWords: %v", err)
	}

	var count int
	db.conn.QueryRow("SELECT COUNT(*) FROM words").Scan(&count)
	if count != len(allWords) {
		t.Errorf("expected %d words, got %d", len(allWords), count)
	}

	// Seeding again should not error or duplicate
	if err := db.SeedWords(allWords); err != nil {
		t.Fatalf("SeedWords (idempotent): %v", err)
	}
	db.conn.QueryRow("SELECT COUNT(*) FROM words").Scan(&count)
	if count != len(allWords) {
		t.Errorf("after re-seed: expected %d words, got %d", len(allWords), count)
	}
}

func TestGetWordProgress(t *testing.T) {
	db := newTestDB(t)
	db.SeedWords(words.AllWords())

	p, err := db.GetWordProgress("flash")
	if err != nil {
		t.Fatalf("GetWordProgress: %v", err)
	}
	if p.Text != "flash" {
		t.Errorf("expected text 'flash', got %q", p.Text)
	}
	if p.Level != words.HomeRow {
		t.Errorf("expected level HomeRow, got %d", p.Level)
	}
	if p.EaseFactor != 2.5 {
		t.Errorf("expected default EF 2.5, got %f", p.EaseFactor)
	}
	if p.Repetitions != 0 {
		t.Errorf("expected 0 repetitions, got %d", p.Repetitions)
	}
}

func TestUpdateWordProgress(t *testing.T) {
	db := newTestDB(t)
	db.SeedWords(words.AllWords())

	p, _ := db.GetWordProgress("flash")
	now := time.Now().UTC()
	nextReview := now.Add(24 * time.Hour)
	p.EaseFactor = 2.6
	p.IntervalDays = 1
	p.Repetitions = 1
	p.NextReview = &nextReview
	p.LastReviewed = &now
	p.TimesCorrect = 1

	if err := db.UpdateWordProgress(p); err != nil {
		t.Fatalf("UpdateWordProgress: %v", err)
	}

	// Read back
	p2, err := db.GetWordProgress("flash")
	if err != nil {
		t.Fatalf("GetWordProgress after update: %v", err)
	}
	if p2.EaseFactor != 2.6 {
		t.Errorf("expected EF 2.6, got %f", p2.EaseFactor)
	}
	if p2.Repetitions != 1 {
		t.Errorf("expected 1 repetition, got %d", p2.Repetitions)
	}
	if p2.TimesCorrect != 1 {
		t.Errorf("expected 1 correct, got %d", p2.TimesCorrect)
	}
	if p2.NextReview == nil {
		t.Fatal("expected non-nil NextReview")
	}
}

func TestGetDueWords(t *testing.T) {
	db := newTestDB(t)
	db.SeedWords(words.AllWords())

	now := time.Now().UTC()
	past := now.Add(-1 * time.Hour)
	future := now.Add(24 * time.Hour)

	// Create two progresses: one due, one not
	p1, _ := db.GetWordProgress("flash")
	p1.NextReview = &past
	p1.Repetitions = 1
	db.UpdateWordProgress(p1)

	p2, _ := db.GetWordProgress("dash")
	p2.NextReview = &future
	p2.Repetitions = 1
	db.UpdateWordProgress(p2)

	due, err := db.GetDueWords(now, 10)
	if err != nil {
		t.Fatalf("GetDueWords: %v", err)
	}
	if len(due) != 1 {
		t.Fatalf("expected 1 due word, got %d", len(due))
	}
	if due[0].Text != "flash" {
		t.Errorf("expected 'flash', got %q", due[0].Text)
	}
}

func TestGetNewWords(t *testing.T) {
	db := newTestDB(t)
	db.SeedWords(words.AllWords())

	// All home row words should be new
	newWords, err := db.GetNewWords(words.HomeRow, 5)
	if err != nil {
		t.Fatalf("GetNewWords: %v", err)
	}
	if len(newWords) != 5 {
		t.Fatalf("expected 5 new words, got %d", len(newWords))
	}
	// Should be ordered by rank
	for i := 1; i < len(newWords); i++ {
		if newWords[i].Rank <= newWords[i-1].Rank {
			t.Errorf("words not ordered by rank: %d >= %d", newWords[i].Rank, newWords[i-1].Rank)
		}
	}

	// After practicing one, it should not appear in new words
	p, _ := db.GetWordProgress(newWords[0].Text)
	now := time.Now().UTC()
	p.Repetitions = 1
	p.LastReviewed = &now
	db.UpdateWordProgress(p)

	newWords2, _ := db.GetNewWords(words.HomeRow, 5)
	for _, w := range newWords2 {
		if w.Text == newWords[0].Text {
			t.Errorf("practiced word %q should not appear in new words", newWords[0].Text)
		}
	}
}

func TestSaveSessionAndGetStats(t *testing.T) {
	db := newTestDB(t)
	db.SeedWords(words.AllWords())

	now := time.Now().UTC()
	session := &SessionRecord{
		StartedAt:      now.Add(-5 * time.Minute),
		EndedAt:        now,
		WordsPracticed: 20,
		AvgWPM:         45.5,
		Accuracy:       0.92,
	}
	if err := db.SaveSession(session); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}
	if session.ID == 0 {
		t.Error("expected non-zero session ID")
	}

	stats, err := db.GetStats()
	if err != nil {
		t.Fatalf("GetStats: %v", err)
	}
	if stats.TotalSessions != 1 {
		t.Errorf("expected 1 session, got %d", stats.TotalSessions)
	}
	if stats.TotalWords != 20 {
		t.Errorf("expected 20 total words, got %d", stats.TotalWords)
	}
	if stats.AvgWPM != 45.5 {
		t.Errorf("expected avg WPM 45.5, got %f", stats.AvgWPM)
	}
	if stats.CurrentLevel != words.HomeRow {
		t.Errorf("expected current level HomeRow, got %d", stats.CurrentLevel)
	}
}

func TestGetStatsLevelProgression(t *testing.T) {
	db := newTestDB(t)
	db.SeedWords(words.AllWords())

	now := time.Now().UTC()
	homeWords := words.WordsByLevel(words.HomeRow)

	// Master 80% of home row words (use ceiling to ensure we reach the threshold)
	needed := (len(homeWords)*80 + 99) / 100
	for i := 0; i < needed; i++ {
		p, _ := db.GetWordProgress(homeWords[i].Text)
		p.Repetitions = 3
		p.LastReviewed = &now
		db.UpdateWordProgress(p)
	}

	stats, _ := db.GetStats()
	if stats.CurrentLevel != words.TopRow {
		t.Errorf("expected level TopRow after mastering 80%% of home row, got %d", stats.CurrentLevel)
	}
}
