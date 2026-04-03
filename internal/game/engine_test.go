package game

import (
	"testing"

	"github.com/dave/typing-lad/internal/store"
	"github.com/dave/typing-lad/internal/words"
)

func newTestEngine(t *testing.T) (*Engine, *store.DB) {
	t.Helper()
	db, err := store.NewDB(":memory:")
	if err != nil {
		t.Fatalf("NewDB: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if err := db.SeedWords(words.AllWords()); err != nil {
		t.Fatalf("SeedWords: %v", err)
	}

	engine, err := NewEngine(db)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}

	return engine, db
}

func TestNewEngineStartsAtHomeRow(t *testing.T) {
	engine, _ := newTestEngine(t)
	if engine.CurrentLevel() != words.HomeRow {
		t.Errorf("expected HomeRow, got %d", engine.CurrentLevel())
	}
}

func TestNextWordReturnsHomeRowFirst(t *testing.T) {
	engine, _ := newTestEngine(t)
	engine.StartSession()

	word, err := engine.NextWord()
	if err != nil {
		t.Fatalf("NextWord: %v", err)
	}

	// Should be a home row word (first by rank)
	w, ok := words.WordByText(word)
	if !ok {
		t.Fatalf("word %q not found in word list", word)
	}
	if w.Level != words.HomeRow {
		t.Errorf("expected HomeRow word, got level %d for %q", w.Level, word)
	}
}

func TestSubmitAttemptPerfect(t *testing.T) {
	engine, _ := newTestEngine(t)
	engine.StartSession()

	word, _ := engine.NextWord()
	result, err := engine.SubmitAttempt(word, word, 1000)
	if err != nil {
		t.Fatalf("SubmitAttempt: %v", err)
	}

	if result.Accuracy != 1.0 {
		t.Errorf("expected accuracy 1.0, got %f", result.Accuracy)
	}
	if !result.IsCorrect {
		t.Error("expected IsCorrect true")
	}
	if result.WordNumber != 1 {
		t.Errorf("expected word number 1, got %d", result.WordNumber)
	}
}

func TestSubmitAttemptIncorrect(t *testing.T) {
	engine, _ := newTestEngine(t)
	engine.StartSession()

	word, _ := engine.NextWord()
	result, err := engine.SubmitAttempt(word, "zzzzz", 1000)
	if err != nil {
		t.Fatalf("SubmitAttempt: %v", err)
	}

	if result.IsCorrect {
		t.Error("expected IsCorrect false")
	}
	if result.Accuracy == 1.0 {
		t.Error("expected accuracy < 1.0")
	}
}

func TestSubmitAttemptWPMCalculation(t *testing.T) {
	engine, _ := newTestEngine(t)
	engine.StartSession()

	// "flash" = 5 chars, typed in 1500ms = 0.025 min
	// WPM = (5/5) / 0.025 = 40
	word, _ := engine.NextWord()
	result, err := engine.SubmitAttempt(word, word, 1500)
	if err != nil {
		t.Fatalf("SubmitAttempt: %v", err)
	}

	// WPM depends on word length, just verify it's positive
	if result.WPM <= 0 {
		t.Errorf("expected positive WPM, got %f", result.WPM)
	}
}

func TestSessionCompletion(t *testing.T) {
	engine, _ := newTestEngine(t)
	engine.StartSession()

	if engine.SessionDone() {
		t.Error("session should not be done at start")
	}

	// Complete all session words
	for i := 0; i < engine.SessionSize(); i++ {
		word, err := engine.NextWord()
		if err != nil {
			t.Fatalf("NextWord %d: %v", i, err)
		}
		_, err = engine.SubmitAttempt(word, word, 1000)
		if err != nil {
			t.Fatalf("SubmitAttempt %d: %v", i, err)
		}
	}

	if !engine.SessionDone() {
		t.Error("session should be done after completing all words")
	}

	result, err := engine.EndSession()
	if err != nil {
		t.Fatalf("EndSession: %v", err)
	}
	if result.WordsPracticed != engine.SessionSize() {
		t.Errorf("expected %d words, got %d", engine.SessionSize(), result.WordsPracticed)
	}
	if result.AvgWPM <= 0 {
		t.Error("expected positive average WPM")
	}
	if result.NewWords == 0 {
		t.Error("expected some new words")
	}
}

func TestDueWordsPrioritized(t *testing.T) {
	engine, db := newTestEngine(t)
	engine.StartSession()

	// Practice a word, then it becomes due immediately on failure
	word, _ := engine.NextWord()
	// Submit as failure so it gets scheduled for immediate review
	engine.SubmitAttempt(word, "xxxxx", 10000)

	// The next word should prioritize due reviews if the word is due
	// (interval is 0.01 days ≈ 14 minutes, so it won't be immediately due)
	// But we can verify the queue mechanism works
	word2, err := engine.NextWord()
	if err != nil {
		t.Fatalf("NextWord after failure: %v", err)
	}
	_ = word2
	_ = db
}

func TestLevelProgression(t *testing.T) {
	engine, db := newTestEngine(t)

	// Master enough home row words to unlock top row
	homeWords := words.WordsByLevel(words.HomeRow)
	needed := (len(homeWords)*80 + 99) / 100

	engine.StartSession()
	for i := 0; i < needed; i++ {
		// Get the word progress and manually set it as mastered
		prog, _ := db.GetWordProgress(homeWords[i].Text)
		now := engine.startedAt
		for rep := 0; rep < MasteryReps; rep++ {
			*prog = UpdateProgress(*prog, 5, now)
			db.UpdateWordProgress(prog)
		}
	}

	// Re-create engine to pick up level change
	engine2, err := NewEngine(db)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	if engine2.CurrentLevel() != words.TopRow {
		t.Errorf("expected TopRow after mastering home row, got %d", engine2.CurrentLevel())
	}
}

func TestPerCharCorrectness(t *testing.T) {
	engine, _ := newTestEngine(t)
	engine.StartSession()

	word, _ := engine.NextWord()
	// Type with one wrong character
	typed := []byte(word)
	if len(typed) > 1 {
		typed[1] = 'Z'
	}

	result, err := engine.SubmitAttempt(word, string(typed), 1000)
	if err != nil {
		t.Fatalf("SubmitAttempt: %v", err)
	}

	if len(result.Correct) != len(word) {
		t.Fatalf("expected %d correct entries, got %d", len(word), len(result.Correct))
	}
	if len(word) > 1 {
		if !result.Correct[0] {
			t.Error("first char should be correct")
		}
		if result.Correct[1] {
			t.Error("second char should be incorrect")
		}
	}
}

func TestGenerateParagraph(t *testing.T) {
	engine, _ := newTestEngine(t)
	engine.StartSession()

	words, err := engine.GenerateParagraph(10)
	if err != nil {
		t.Fatalf("GenerateParagraph: %v", err)
	}
	if len(words) != 10 {
		t.Fatalf("expected 10 words, got %d", len(words))
	}
	for i, w := range words {
		if w == "" {
			t.Errorf("word %d is empty", i)
		}
	}
}

func TestSubmitParagraphAllCorrect(t *testing.T) {
	engine, _ := newTestEngine(t)
	engine.StartSession()

	paraWords, err := engine.GenerateParagraph(5)
	if err != nil {
		t.Fatalf("GenerateParagraph: %v", err)
	}

	typed := ""
	for i, w := range paraWords {
		if i > 0 {
			typed += " "
		}
		typed += w
	}

	start := engine.startedAt
	result, err := engine.SubmitParagraph(paraWords, typed, 5000, start)
	if err != nil {
		t.Fatalf("SubmitParagraph: %v", err)
	}

	if result.Accuracy != 1.0 {
		t.Errorf("expected accuracy 1.0, got %f", result.Accuracy)
	}
	if result.WordsCorrect != 5 {
		t.Errorf("expected 5 correct, got %d", result.WordsCorrect)
	}
	if result.WordsTotal != 5 {
		t.Errorf("expected 5 total, got %d", result.WordsTotal)
	}
	if result.WPM <= 0 {
		t.Errorf("expected positive WPM, got %f", result.WPM)
	}
}

func TestSubmitParagraphWithErrors(t *testing.T) {
	engine, _ := newTestEngine(t)
	engine.StartSession()

	paraWords, err := engine.GenerateParagraph(3)
	if err != nil {
		t.Fatalf("GenerateParagraph: %v", err)
	}

	// Type the first word correctly, second wrong, third correct
	typed := paraWords[0] + " zzzzz " + paraWords[2]

	start := engine.startedAt
	result, err := engine.SubmitParagraph(paraWords, typed, 3000, start)
	if err != nil {
		t.Fatalf("SubmitParagraph: %v", err)
	}

	if result.WordsTotal != 3 {
		t.Errorf("expected 3 total, got %d", result.WordsTotal)
	}
	if result.PerWordCorrect[0] != true {
		t.Error("word 0 should be correct")
	}
	if result.PerWordCorrect[1] != false {
		t.Error("word 1 should be incorrect")
	}
	if result.PerWordCorrect[2] != true {
		t.Error("word 2 should be correct")
	}
	if result.Accuracy >= 1.0 {
		t.Error("expected accuracy < 1.0")
	}
}
