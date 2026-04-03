package store

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/dave/typing-lad/internal/words"
)

// WordProgress represents the SRS state of a word.
type WordProgress struct {
	WordID         int
	Text           string
	Level          words.Level
	Rank           int
	EaseFactor     float64
	IntervalDays   float64
	Repetitions    int
	NextReview     *time.Time
	LastReviewed   *time.Time
	TimesCorrect   int
	TimesIncorrect int
}

// SessionRecord stores a completed practice session.
type SessionRecord struct {
	ID             int
	StartedAt      time.Time
	EndedAt        time.Time
	WordsPracticed int
	AvgWPM         float64
	Accuracy       float64
}

// Stats holds aggregate statistics.
type Stats struct {
	TotalSessions  int
	TotalWords     int
	AvgWPM         float64
	AvgAccuracy    float64
	WordsMastered  int // words with >= 3 repetitions
	CurrentLevel   words.Level
	WordsPerLevel  map[words.Level]int
}

// SeedWords inserts all words into the database, ignoring duplicates.
func (db *DB) SeedWords(wordList []words.Word) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("INSERT OR IGNORE INTO words (text, level, rank) VALUES (?, ?, ?)")
	if err != nil {
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer stmt.Close()

	for _, w := range wordList {
		if _, err := stmt.Exec(w.Text, w.Level, w.Rank); err != nil {
			return fmt.Errorf("insert word %q: %w", w.Text, err)
		}
	}
	return tx.Commit()
}

// GetWordProgress returns the progress for a specific word.
func (db *DB) GetWordProgress(text string) (*WordProgress, error) {
	row := db.conn.QueryRow(`
		SELECT w.id, w.text, w.level, w.rank,
			COALESCE(wp.ease_factor, 2.5),
			COALESCE(wp.interval_days, 0),
			COALESCE(wp.repetitions, 0),
			wp.next_review,
			wp.last_reviewed,
			COALESCE(wp.times_correct, 0),
			COALESCE(wp.times_incorrect, 0)
		FROM words w
		LEFT JOIN word_progress wp ON w.id = wp.word_id
		WHERE w.text = ?`, text)

	var p WordProgress
	var nextReview, lastReviewed sql.NullString
	err := row.Scan(&p.WordID, &p.Text, &p.Level, &p.Rank,
		&p.EaseFactor, &p.IntervalDays, &p.Repetitions,
		&nextReview, &lastReviewed,
		&p.TimesCorrect, &p.TimesIncorrect)
	if err != nil {
		return nil, fmt.Errorf("get word progress %q: %w", text, err)
	}

	if nextReview.Valid {
		t, _ := time.Parse(time.RFC3339, nextReview.String)
		p.NextReview = &t
	}
	if lastReviewed.Valid {
		t, _ := time.Parse(time.RFC3339, lastReviewed.String)
		p.LastReviewed = &t
	}
	return &p, nil
}

// UpdateWordProgress upserts progress for a word.
func (db *DB) UpdateWordProgress(p *WordProgress) error {
	var nextReview, lastReviewed *string
	if p.NextReview != nil {
		s := p.NextReview.Format(time.RFC3339)
		nextReview = &s
	}
	if p.LastReviewed != nil {
		s := p.LastReviewed.Format(time.RFC3339)
		lastReviewed = &s
	}

	_, err := db.conn.Exec(`
		INSERT INTO word_progress (word_id, ease_factor, interval_days, repetitions,
			next_review, last_reviewed, times_correct, times_incorrect)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(word_id) DO UPDATE SET
			ease_factor = excluded.ease_factor,
			interval_days = excluded.interval_days,
			repetitions = excluded.repetitions,
			next_review = excluded.next_review,
			last_reviewed = excluded.last_reviewed,
			times_correct = excluded.times_correct,
			times_incorrect = excluded.times_incorrect`,
		p.WordID, p.EaseFactor, p.IntervalDays, p.Repetitions,
		nextReview, lastReviewed, p.TimesCorrect, p.TimesIncorrect)
	if err != nil {
		return fmt.Errorf("update word progress: %w", err)
	}
	return nil
}

// GetDueWords returns words that are due for review (next_review <= now), ordered by due date.
func (db *DB) GetDueWords(now time.Time, limit int) ([]WordProgress, error) {
	rows, err := db.conn.Query(`
		SELECT w.id, w.text, w.level, w.rank,
			wp.ease_factor, wp.interval_days, wp.repetitions,
			wp.next_review, wp.last_reviewed,
			wp.times_correct, wp.times_incorrect
		FROM words w
		JOIN word_progress wp ON w.id = wp.word_id
		WHERE wp.next_review IS NOT NULL AND wp.next_review <= ?
		ORDER BY wp.next_review ASC
		LIMIT ?`, now.Format(time.RFC3339), limit)
	if err != nil {
		return nil, fmt.Errorf("query due words: %w", err)
	}
	defer rows.Close()
	return scanWordProgressRows(rows)
}

// GetNewWords returns words that have never been practiced for a given level,
// ordered by rank.
func (db *DB) GetNewWords(level words.Level, limit int) ([]WordProgress, error) {
	rows, err := db.conn.Query(`
		SELECT w.id, w.text, w.level, w.rank,
			2.5, 0, 0, NULL, NULL, 0, 0
		FROM words w
		LEFT JOIN word_progress wp ON w.id = wp.word_id
		WHERE w.level = ? AND wp.word_id IS NULL
		ORDER BY w.rank ASC
		LIMIT ?`, level, limit)
	if err != nil {
		return nil, fmt.Errorf("query new words: %w", err)
	}
	defer rows.Close()
	return scanWordProgressRows(rows)
}

func scanWordProgressRows(rows *sql.Rows) ([]WordProgress, error) {
	var results []WordProgress
	for rows.Next() {
		var p WordProgress
		var nextReview, lastReviewed sql.NullString
		err := rows.Scan(&p.WordID, &p.Text, &p.Level, &p.Rank,
			&p.EaseFactor, &p.IntervalDays, &p.Repetitions,
			&nextReview, &lastReviewed,
			&p.TimesCorrect, &p.TimesIncorrect)
		if err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		if nextReview.Valid {
			t, _ := time.Parse(time.RFC3339, nextReview.String)
			p.NextReview = &t
		}
		if lastReviewed.Valid {
			t, _ := time.Parse(time.RFC3339, lastReviewed.String)
			p.LastReviewed = &t
		}
		results = append(results, p)
	}
	return results, rows.Err()
}

// SaveSession records a completed practice session.
func (db *DB) SaveSession(s *SessionRecord) error {
	result, err := db.conn.Exec(`
		INSERT INTO sessions (started_at, ended_at, words_practiced, avg_wpm, accuracy)
		VALUES (?, ?, ?, ?, ?)`,
		s.StartedAt.Format(time.RFC3339), s.EndedAt.Format(time.RFC3339),
		s.WordsPracticed, s.AvgWPM, s.Accuracy)
	if err != nil {
		return fmt.Errorf("save session: %w", err)
	}
	id, _ := result.LastInsertId()
	s.ID = int(id)
	return nil
}

// GetStats returns aggregate statistics.
func (db *DB) GetStats() (*Stats, error) {
	stats := &Stats{
		WordsPerLevel: make(map[words.Level]int),
	}

	// Session stats
	row := db.conn.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(words_practiced), 0),
			COALESCE(AVG(avg_wpm), 0), COALESCE(AVG(accuracy), 0)
		FROM sessions`)
	if err := row.Scan(&stats.TotalSessions, &stats.TotalWords,
		&stats.AvgWPM, &stats.AvgAccuracy); err != nil {
		return nil, fmt.Errorf("get session stats: %w", err)
	}

	// Words mastered (>= 3 repetitions)
	row = db.conn.QueryRow(`SELECT COUNT(*) FROM word_progress WHERE repetitions >= 3`)
	if err := row.Scan(&stats.WordsMastered); err != nil {
		return nil, fmt.Errorf("get mastered count: %w", err)
	}

	// Current level: highest level where >= 80% of words have >= 3 reps, defaulting to HomeRow
	stats.CurrentLevel = words.HomeRow
	for _, level := range []words.Level{words.HomeRow, words.TopRow, words.BottomRow, words.FullAlpha} {
		var total, mastered int
		row = db.conn.QueryRow(`SELECT COUNT(*) FROM words WHERE level = ?`, level)
		if err := row.Scan(&total); err != nil {
			return nil, fmt.Errorf("count words level %d: %w", level, err)
		}
		row = db.conn.QueryRow(`
			SELECT COUNT(*) FROM word_progress wp
			JOIN words w ON w.id = wp.word_id
			WHERE w.level = ? AND wp.repetitions >= 3`, level)
		if err := row.Scan(&mastered); err != nil {
			return nil, fmt.Errorf("count mastered level %d: %w", level, err)
		}
		stats.WordsPerLevel[level] = mastered
		if total > 0 && float64(mastered)/float64(total) >= 0.8 && level < words.FullAlpha {
			stats.CurrentLevel = level + 1
		}
	}

	return stats, nil
}
