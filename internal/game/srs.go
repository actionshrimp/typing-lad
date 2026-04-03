package game

import (
	"math"
	"time"

	"github.com/dave/typing-lad/internal/store"
)

// CalculateQuality maps typing performance to a 0-5 quality score for SM-2.
//   - accuracy: fraction of characters correct (0.0 to 1.0)
//   - wpmRatio: actual WPM / target WPM (e.g., 1.0 = on target, >1 = faster)
func CalculateQuality(accuracy float64, wpmRatio float64) int {
	if accuracy < 0.5 {
		return 0 // blank/terrible
	}
	if accuracy < 0.75 {
		return 1 // wrong
	}
	if accuracy < 0.9 {
		return 2 // minor errors
	}
	// Correct (accuracy >= 0.9)
	if wpmRatio < 0.5 {
		return 3 // correct but slow
	}
	if wpmRatio < 0.9 {
		return 4 // correct, decent speed
	}
	return 5 // perfect + fast
}

// UpdateProgress applies the SM-2 algorithm to update word progress.
// Returns a new WordProgress with updated fields.
func UpdateProgress(p store.WordProgress, quality int, now time.Time) store.WordProgress {
	// Update ease factor: EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
	q := float64(quality)
	ef := p.EaseFactor + (0.1 - (5-q)*(0.08+(5-q)*0.02))
	ef = math.Max(ef, 1.3) // minimum EF

	p.EaseFactor = ef
	p.LastReviewed = &now

	if quality >= 3 {
		// Successful recall
		p.Repetitions++
		p.TimesCorrect++

		switch p.Repetitions {
		case 1:
			p.IntervalDays = 1
		case 2:
			p.IntervalDays = 3
		default:
			p.IntervalDays = p.IntervalDays * ef
		}
	} else {
		// Failed recall — reset
		p.Repetitions = 0
		p.IntervalDays = 0.01 // review very soon
		p.TimesIncorrect++
	}

	next := now.Add(time.Duration(p.IntervalDays*24) * time.Hour)
	p.NextReview = &next

	return p
}
