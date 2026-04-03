package store

import (
	"testing"
)

func TestNewDBInMemory(t *testing.T) {
	db, err := NewDB(":memory:")
	if err != nil {
		t.Fatalf("NewDB: %v", err)
	}
	defer db.Close()

	// Verify tables exist by querying them
	for _, table := range []string{"words", "word_progress", "sessions"} {
		_, err := db.conn.Exec("SELECT COUNT(*) FROM " + table)
		if err != nil {
			t.Errorf("table %s does not exist: %v", table, err)
		}
	}
}

func TestMigrateIdempotent(t *testing.T) {
	db, err := NewDB(":memory:")
	if err != nil {
		t.Fatalf("NewDB: %v", err)
	}
	defer db.Close()

	// Running migrate again should not error
	if err := db.migrate(); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
}
