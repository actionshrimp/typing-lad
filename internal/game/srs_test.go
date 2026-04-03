package game

import (
	"testing"
	"time"

	"github.com/dave/typing-lad/internal/store"
)

func TestCalculateQuality(t *testing.T) {
	tests := []struct {
		accuracy float64
		wpmRatio float64
		want     int
	}{
		{0.0, 0.0, 0},   // blank
		{0.3, 1.0, 0},   // terrible accuracy
		{0.6, 1.0, 1},   // wrong
		{0.8, 1.0, 2},   // minor errors
		{0.95, 0.3, 3},  // correct but slow
		{0.95, 0.7, 4},  // correct, decent
		{1.0, 1.0, 5},   // perfect + fast
		{0.9, 0.9, 5},   // threshold for perfect
		{0.9, 0.89, 4},  // just below fast threshold
		{0.9, 0.49, 3},  // just below decent threshold
		{0.89, 1.0, 2},  // just below correct threshold
		{0.74, 1.0, 1},  // just below minor errors threshold
		{0.49, 1.0, 0},  // just below wrong threshold
	}

	for _, tc := range tests {
		got := CalculateQuality(tc.accuracy, tc.wpmRatio)
		if got != tc.want {
			t.Errorf("CalculateQuality(%v, %v) = %d, want %d", tc.accuracy, tc.wpmRatio, got, tc.want)
		}
	}
}

func TestUpdateProgressSuccessful(t *testing.T) {
	now := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	p := store.WordProgress{
		WordID:     1,
		EaseFactor: 2.5,
	}

	// First successful review
	p = UpdateProgress(p, 5, now)
	if p.Repetitions != 1 {
		t.Errorf("after 1st review: repetitions = %d, want 1", p.Repetitions)
	}
	if p.IntervalDays != 1 {
		t.Errorf("after 1st review: interval = %f, want 1", p.IntervalDays)
	}
	if p.TimesCorrect != 1 {
		t.Errorf("after 1st review: timesCorrect = %d, want 1", p.TimesCorrect)
	}

	// Second successful review
	p = UpdateProgress(p, 5, now.Add(24*time.Hour))
	if p.Repetitions != 2 {
		t.Errorf("after 2nd review: repetitions = %d, want 2", p.Repetitions)
	}
	if p.IntervalDays != 3 {
		t.Errorf("after 2nd review: interval = %f, want 3", p.IntervalDays)
	}

	// Third successful review — interval should be 3 * EF
	p = UpdateProgress(p, 5, now.Add(4*24*time.Hour))
	if p.Repetitions != 3 {
		t.Errorf("after 3rd review: repetitions = %d, want 3", p.Repetitions)
	}
	// EF should have increased from 2.5 after three quality-5 reviews
	if p.EaseFactor <= 2.5 {
		t.Errorf("EF should increase with quality 5, got %f", p.EaseFactor)
	}
	expectedInterval := 3 * p.EaseFactor
	if p.IntervalDays < expectedInterval*0.99 || p.IntervalDays > expectedInterval*1.01 {
		t.Errorf("after 3rd review: interval = %f, want ~%f", p.IntervalDays, expectedInterval)
	}
}

func TestUpdateProgressFailure(t *testing.T) {
	now := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	p := store.WordProgress{
		WordID:       1,
		EaseFactor:   2.5,
		Repetitions:  3,
		IntervalDays: 10,
	}

	// Fail
	p = UpdateProgress(p, 1, now)
	if p.Repetitions != 0 {
		t.Errorf("after failure: repetitions = %d, want 0", p.Repetitions)
	}
	if p.IntervalDays != 0.01 {
		t.Errorf("after failure: interval = %f, want 0.01", p.IntervalDays)
	}
	if p.TimesIncorrect != 1 {
		t.Errorf("after failure: timesIncorrect = %d, want 1", p.TimesIncorrect)
	}
}

func TestEaseFactorMinimum(t *testing.T) {
	now := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	p := store.WordProgress{
		WordID:     1,
		EaseFactor: 1.3,
	}

	// Even with repeated low quality, EF should not go below 1.3
	for i := 0; i < 10; i++ {
		p = UpdateProgress(p, 0, now.Add(time.Duration(i)*time.Hour))
	}
	if p.EaseFactor < 1.3 {
		t.Errorf("EF went below 1.3: %f", p.EaseFactor)
	}
}

func TestUpdateProgressSetsNextReview(t *testing.T) {
	now := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	p := store.WordProgress{
		WordID:     1,
		EaseFactor: 2.5,
	}

	p = UpdateProgress(p, 5, now)
	if p.NextReview == nil {
		t.Fatal("NextReview should be set")
	}
	if p.LastReviewed == nil {
		t.Fatal("LastReviewed should be set")
	}
	if !p.LastReviewed.Equal(now) {
		t.Errorf("LastReviewed = %v, want %v", p.LastReviewed, now)
	}
	expectedNext := now.Add(24 * time.Hour) // 1 day interval
	if !p.NextReview.Equal(expectedNext) {
		t.Errorf("NextReview = %v, want %v", p.NextReview, expectedNext)
	}
}

func TestEaseFactorIncreasesWithHighQuality(t *testing.T) {
	now := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	p := store.WordProgress{
		WordID:     1,
		EaseFactor: 2.5,
	}
	p = UpdateProgress(p, 5, now)
	if p.EaseFactor <= 2.5 {
		t.Errorf("EF should increase with quality 5, got %f", p.EaseFactor)
	}
}

func TestEaseFactorDecreasesWithLowQuality(t *testing.T) {
	now := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	p := store.WordProgress{
		WordID:     1,
		EaseFactor: 2.5,
	}
	p = UpdateProgress(p, 2, now)
	if p.EaseFactor >= 2.5 {
		t.Errorf("EF should decrease with quality 2, got %f", p.EaseFactor)
	}
}
