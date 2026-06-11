package db

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

type Store struct {
	DB *sql.DB
}

func Open(dsn string) (*Store, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("db open: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("db ping: %w", err)
	}
	return &Store{DB: db}, nil
}
