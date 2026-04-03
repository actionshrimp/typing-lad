package game

import (
	"fmt"
	"time"

	"github.com/dave/typing-lad/internal/store"
	"github.com/dave/typing-lad/internal/words"
)

const (
	DefaultSessionSize = 20
	TargetWPM          = 40.0 // baseline WPM for quality calculation
	MasteryThreshold   = 0.8  // 80% of level words mastered to unlock next
	MasteryReps        = 3    // repetitions needed to consider a word mastered
)

// AttemptResult holds the result of typing a single word.
type AttemptResult struct {
	Target     string
	Typed      string
	Correct    []bool // per-character correctness
	WPM        float64
	Accuracy   float64
	Quality    int
	IsCorrect  bool
	WordNumber int // 1-based position in session
}

// SessionResult holds the summary of a completed session.
type SessionResult struct {
	WordsPracticed int
	AvgWPM         float64
	Accuracy       float64
	NewWords       int
	StartedAt      time.Time
	EndedAt        time.Time
}

// Engine manages word selection, scoring, and session state.
type Engine struct {
	store        *store.DB
	currentLevel words.Level
	sessionSize  int

	// Session state
	wordsCompleted int
	totalWPM       float64
	totalAccuracy  float64
	newWords       int
	startedAt      time.Time
	queue          []store.WordProgress
}

// NewEngine creates a new game engine.
func NewEngine(db *store.DB) (*Engine, error) {
	stats, err := db.GetStats()
	if err != nil {
		return nil, fmt.Errorf("get stats: %w", err)
	}

	return &Engine{
		store:        db,
		currentLevel: stats.CurrentLevel,
		sessionSize:  DefaultSessionSize,
	}, nil
}

// CurrentLevel returns the current difficulty level.
func (e *Engine) CurrentLevel() words.Level {
	return e.currentLevel
}

// SessionSize returns the number of words per session.
func (e *Engine) SessionSize() int {
	return e.sessionSize
}

// WordsCompleted returns how many words have been completed this session.
func (e *Engine) WordsCompleted() int {
	return e.wordsCompleted
}

// StartSession begins a new practice session.
func (e *Engine) StartSession() {
	e.wordsCompleted = 0
	e.totalWPM = 0
	e.totalAccuracy = 0
	e.newWords = 0
	e.startedAt = time.Now()
	e.queue = nil
}

// SessionDone reports whether the session word count has been reached.
func (e *Engine) SessionDone() bool {
	return e.wordsCompleted >= e.sessionSize
}

// NextWord returns the next word to practice.
// Priority: due reviews first, then new words from current level.
func (e *Engine) NextWord() (string, error) {
	if len(e.queue) > 0 {
		w := e.queue[0]
		e.queue = e.queue[1:]
		return w.Text, nil
	}

	// Refill queue: try due words first
	now := time.Now()
	due, err := e.store.GetDueWords(now, 5)
	if err != nil {
		return "", fmt.Errorf("get due words: %w", err)
	}
	if len(due) > 0 {
		e.queue = due[1:]
		return due[0].Text, nil
	}

	// No due words — get new words from current level
	newWords, err := e.store.GetNewWords(e.currentLevel, 5)
	if err != nil {
		return "", fmt.Errorf("get new words: %w", err)
	}
	if len(newWords) > 0 {
		e.queue = newWords[1:]
		return newWords[0].Text, nil
	}

	// Current level exhausted — try next levels
	for level := e.currentLevel + 1; level <= words.FullAlpha; level++ {
		newWords, err = e.store.GetNewWords(level, 5)
		if err != nil {
			return "", fmt.Errorf("get new words level %d: %w", level, err)
		}
		if len(newWords) > 0 {
			e.queue = newWords[1:]
			return newWords[0].Text, nil
		}
	}

	// All words practiced — just re-review earliest due
	allDue, err := e.store.GetDueWords(now.Add(365*24*time.Hour), 5)
	if err != nil {
		return "", fmt.Errorf("get any words: %w", err)
	}
	if len(allDue) > 0 {
		e.queue = allDue[1:]
		return allDue[0].Text, nil
	}

	return "", fmt.Errorf("no words available")
}

// SubmitAttempt scores a typing attempt and updates SRS state.
func (e *Engine) SubmitAttempt(target, typed string, durationMs int) (*AttemptResult, error) {
	// Calculate per-character correctness
	correct := make([]bool, len(target))
	matches := 0
	for i := range target {
		if i < len(typed) && target[i] == typed[i] {
			correct[i] = true
			matches++
		}
	}

	accuracy := float64(matches) / float64(len(target))
	if len(target) == 0 {
		accuracy = 0
	}

	// WPM: (chars / 5) / (duration in minutes)
	durationMin := float64(durationMs) / 60000.0
	wpm := 0.0
	if durationMin > 0 {
		wpm = (float64(len(target)) / 5.0) / durationMin
	}

	wpmRatio := wpm / TargetWPM
	quality := CalculateQuality(accuracy, wpmRatio)

	isCorrect := typed == target

	// Update SRS
	now := time.Now()
	prog, err := e.store.GetWordProgress(target)
	if err != nil {
		return nil, fmt.Errorf("get progress for %q: %w", target, err)
	}

	isNew := prog.Repetitions == 0 && prog.LastReviewed == nil
	updated := UpdateProgress(*prog, quality, now)
	if err := e.store.UpdateWordProgress(&updated); err != nil {
		return nil, fmt.Errorf("update progress for %q: %w", target, err)
	}

	if isNew {
		e.newWords++
	}

	// Only count correct attempts toward session progress
	if isCorrect {
		e.wordsCompleted++
		e.totalWPM += wpm
		e.totalAccuracy += accuracy
	}

	// Check level progression
	stats, err := e.store.GetStats()
	if err == nil {
		e.currentLevel = stats.CurrentLevel
	}

	return &AttemptResult{
		Target:     target,
		Typed:      typed,
		Correct:    correct,
		WPM:        wpm,
		Accuracy:   accuracy,
		Quality:    quality,
		IsCorrect:  isCorrect,
		WordNumber: e.wordsCompleted,
	}, nil
}

// EndSession finalizes the current session and saves it.
func (e *Engine) EndSession() (*SessionResult, error) {
	now := time.Now()
	result := &SessionResult{
		WordsPracticed: e.wordsCompleted,
		NewWords:       e.newWords,
		StartedAt:      e.startedAt,
		EndedAt:        now,
	}

	if e.wordsCompleted > 0 {
		result.AvgWPM = e.totalWPM / float64(e.wordsCompleted)
		result.Accuracy = e.totalAccuracy / float64(e.wordsCompleted)
	}

	if e.wordsCompleted > 0 {
		record := &store.SessionRecord{
			StartedAt:      e.startedAt,
			EndedAt:        now,
			WordsPracticed: e.wordsCompleted,
			AvgWPM:         result.AvgWPM,
			Accuracy:       result.Accuracy,
		}
		if err := e.store.SaveSession(record); err != nil {
			return nil, fmt.Errorf("save session: %w", err)
		}
	}

	return result, nil
}
