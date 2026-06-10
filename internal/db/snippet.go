package db

import (
	"strings"
	"time"

	"github.com/lib/pq"
)

type Snippet struct {
	ID           int       `json:"id"`
	Name         string    `json:"name"`
	Language     string    `json:"language"`
	Body         string    `json:"body"`
	Version      int       `json:"version"`
	Status       string    `json:"status"`
	Capabilities []string  `json:"capabilities"`
	Tags         []string  `json:"tags"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (s *Store) ListSnippets() ([]Snippet, error) {
	rows, err := s.DB.Query(`
		SELECT s.id, s.name, s.language, s.body, s.version, s.status, s.capabilities,
		       s.created_at, s.updated_at,
		       COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}')
		FROM snippets s
		LEFT JOIN snippet_tags st ON st.snippet_id = s.id
		LEFT JOIN tags t ON t.id = st.tag_id
		GROUP BY s.id ORDER BY s.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Snippet{}
	for rows.Next() {
		var sn Snippet
		if err := rows.Scan(
			&sn.ID, &sn.Name, &sn.Language, &sn.Body,
			&sn.Version, &sn.Status, pq.Array(&sn.Capabilities),
			&sn.CreatedAt, &sn.UpdatedAt, pq.Array(&sn.Tags),
		); err != nil {
			return nil, err
		}
		out = append(out, sn)
	}
	return out, rows.Err()
}

func (s *Store) SetSnippetTags(id int, tags []string) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM snippet_tags WHERE snippet_id=$1`, id); err != nil {
		tx.Rollback()
		return err
	}
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		var tagID int
		if err := tx.QueryRow(`
			INSERT INTO tags (name) VALUES ($1)
			ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name
			RETURNING id`, tag).Scan(&tagID); err != nil {
			tx.Rollback()
			return err
		}
		if _, err := tx.Exec(`
			INSERT INTO snippet_tags (snippet_id, tag_id) VALUES ($1,$2)
			ON CONFLICT DO NOTHING`, id, tagID); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) CreateSnippet(name, language, body, status string, capabilities []string) (*Snippet, error) {
	if capabilities == nil {
		capabilities = []string{}
	}
	var sn Snippet
	err := s.DB.QueryRow(`
		INSERT INTO snippets (name, language, body, status, capabilities)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, language, body, version, status, capabilities, created_at, updated_at`,
		name, language, body, status, pq.Array(capabilities),
	).Scan(
		&sn.ID, &sn.Name, &sn.Language, &sn.Body,
		&sn.Version, &sn.Status, pq.Array(&sn.Capabilities),
		&sn.CreatedAt, &sn.UpdatedAt,
	)
	return &sn, err
}

func (s *Store) UpdateSnippet(id int, name, language, body, status string, capabilities []string) (*Snippet, error) {
	if capabilities == nil {
		capabilities = []string{}
	}
	var sn Snippet
	err := s.DB.QueryRow(`
		UPDATE snippets
		SET name=$2, language=$3, body=$4, status=$5, capabilities=$6, version=version+1
		WHERE id=$1
		RETURNING id, name, language, body, version, status, capabilities, created_at, updated_at`,
		id, name, language, body, status, pq.Array(capabilities),
	).Scan(
		&sn.ID, &sn.Name, &sn.Language, &sn.Body,
		&sn.Version, &sn.Status, pq.Array(&sn.Capabilities),
		&sn.CreatedAt, &sn.UpdatedAt,
	)
	return &sn, err
}

func (s *Store) DeleteSnippet(id int) error {
	_, err := s.DB.Exec(`DELETE FROM snippets WHERE id=$1`, id)
	return err
}
