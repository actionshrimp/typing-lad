package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// DB wraps a SQLite database connection.
type DB struct {
	conn *sql.DB
}

// NewDB opens a SQLite database at path and runs migrations.
// Use ":memory:" for an in-memory database.
func NewDB(path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	// Enable WAL mode for better concurrent read performance.
	if _, err := conn.Exec("PRAGMA journal_mode=WAL"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("set WAL mode: %w", err)
	}
	if _, err := conn.Exec("PRAGMA foreign_keys=ON"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}
	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return db, nil
}

// Close closes the database connection.
func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS words (
		id INTEGER PRIMARY KEY,
		text TEXT UNIQUE NOT NULL,
		level INTEGER NOT NULL,
		rank INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS word_progress (
		word_id INTEGER PRIMARY KEY REFERENCES words(id),
		ease_factor REAL NOT NULL DEFAULT 2.5,
		interval_days REAL NOT NULL DEFAULT 0,
		repetitions INTEGER NOT NULL DEFAULT 0,
		next_review TEXT,
		last_reviewed TEXT,
		times_correct INTEGER NOT NULL DEFAULT 0,
		times_incorrect INTEGER NOT NULL DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS sessions (
		id INTEGER PRIMARY KEY,
		started_at TEXT NOT NULL,
		ended_at TEXT NOT NULL,
		words_practiced INTEGER NOT NULL,
		avg_wpm REAL NOT NULL,
		accuracy REAL NOT NULL
	);
	`
	_, err := db.conn.Exec(schema)
	return err
}
