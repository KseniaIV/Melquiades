package db

// Project-management store: projects, tasks, experiments, notes and their
// activity history (see sql/schema-pm.sql).
//
// Rows are returned as JSON produced by PostgreSQL itself (to_jsonb), so the
// API shape always matches the schema and adding a column needs no Go change
// beyond whitelisting it as writable below.

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type fieldKind int

const (
	kindText     fieldKind = iota // non-null string
	kindInt                       // non-null integer
	kindNullInt                   // integer or null
	kindNullDate                  // "YYYY-MM-DD" or null
)

// Entity describes one project-management table.
type Entity struct {
	Name     string               // table name, also the URL segment
	Fields   map[string]fieldKind // client-writable columns
	Required []string             // must be present on create
	Filters  []string             // columns allowed as ?col=value list filters
	OrderBy  string
	extra    string // extra jsonb merged into each row
}

const taskDeps = `jsonb_build_object('depends_on', (
	SELECT COALESCE(jsonb_agg(d.depends_on ORDER BY d.depends_on), '[]')
	FROM task_dependencies d WHERE d.task_id = t.id))`

var (
	Projects = &Entity{
		Name: "projects",
		Fields: map[string]fieldKind{
			"slug": kindText, "name": kindText, "description": kindText,
			"status": kindText, "repo_url": kindText,
		},
		Required: []string{"slug", "name"},
		Filters:  []string{"status", "slug"},
		OrderBy:  "t.id",
	}
	Tasks = &Entity{
		Name: "tasks",
		Fields: map[string]fieldKind{
			"project_id": kindInt, "title": kindText, "description": kindText,
			"status": kindText, "priority": kindInt, "due_date": kindNullDate,
		},
		Required: []string{"project_id", "title"},
		Filters:  []string{"project_id", "status", "priority"},
		OrderBy:  "t.priority, t.due_date NULLS LAST, t.id",
		extra:    taskDeps,
	}
	Experiments = &Entity{
		Name: "experiments",
		Fields: map[string]fieldKind{
			"project_id": kindInt, "code": kindText, "title": kindText,
			"hypothesis": kindText, "status": kindText, "evidence": kindText,
			"next_step": kindText,
		},
		Required: []string{"project_id", "title"},
		Filters:  []string{"project_id", "status", "code"},
		OrderBy:  "t.id",
	}
	Notes = &Entity{
		Name: "notes",
		Fields: map[string]fieldKind{
			"project_id": kindInt, "task_id": kindNullInt,
			"experiment_id": kindNullInt, "body": kindText,
		},
		Required: []string{"project_id", "body"},
		Filters:  []string{"project_id", "task_id", "experiment_id"},
		OrderBy:  "t.id",
	}
)

// ErrInvalid wraps client mistakes (unknown field, wrong type, bad value).
var ErrInvalid = errors.New("invalid request")

// ErrConflict is returned for unique-constraint violations.
var ErrConflict = errors.New("conflict")

func invalid(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, a...))
}

var actorRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,31}$`)

// ValidActor reports whether s is an acceptable activity actor label.
func ValidActor(s string) bool { return actorRe.MatchString(s) }

func (e *Entity) selectSQL() string {
	row := "to_jsonb(t)"
	if e.extra != "" {
		row += " || " + e.extra
	}
	return "SELECT " + row + " FROM " + e.Name + " t"
}

// List returns rows matching equality filters, at most limit rows.
func (s *Store) List(e *Entity, filters map[string]string, limit int) ([]json.RawMessage, error) {
	var where []string
	var args []any
	keys := make([]string, 0, len(filters))
	for k := range filters {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if !contains(e.Filters, k) {
			return nil, invalid("unknown filter %q (allowed: %s)", k, strings.Join(e.Filters, ", "))
		}
		args = append(args, filters[k])
		where = append(where, fmt.Sprintf("t.%s = $%d", k, len(args)))
	}
	q := e.selectSQL()
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	args = append(args, limit)
	q += fmt.Sprintf(" ORDER BY %s LIMIT $%d", e.OrderBy, len(args))
	return s.queryJSON(s.DB, q, args...)
}

// Get returns one row or sql.ErrNoRows.
func (s *Store) Get(e *Entity, id int) (json.RawMessage, error) {
	return getRow(s.DB, e, id)
}

// Create inserts a row from client JSON fields and returns it.
func (s *Store) Create(e *Entity, actor string, body map[string]json.RawMessage) (json.RawMessage, error) {
	deps, hasDeps, err := takeDeps(e, body)
	if err != nil {
		return nil, err
	}
	cols, vals, err := e.decode(body)
	if err != nil {
		return nil, err
	}
	for _, r := range e.Required {
		if !contains(cols, r) {
			return nil, invalid("%q is required", r)
		}
	}
	ph := make([]string, len(cols))
	for i := range cols {
		ph[i] = fmt.Sprintf("$%d", i+1)
	}
	var out json.RawMessage
	err = s.withActor(actor, func(tx *sql.Tx) error {
		var id int
		q := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING id",
			e.Name, strings.Join(cols, ", "), strings.Join(ph, ", "))
		if err := tx.QueryRow(q, vals...).Scan(&id); err != nil {
			return err
		}
		if hasDeps {
			if err := setDeps(tx, id, deps); err != nil {
				return err
			}
		}
		out, err = getRow(tx, e, id)
		return err
	})
	return out, err
}

// Update applies a partial update (only the fields present) and returns the row.
// Returns sql.ErrNoRows if the id does not exist.
func (s *Store) Update(e *Entity, actor string, id int, body map[string]json.RawMessage) (json.RawMessage, error) {
	deps, hasDeps, err := takeDeps(e, body)
	if err != nil {
		return nil, err
	}
	cols, vals, err := e.decode(body)
	if err != nil {
		return nil, err
	}
	if len(cols) == 0 && !hasDeps {
		return nil, invalid("no fields to update")
	}
	var out json.RawMessage
	err = s.withActor(actor, func(tx *sql.Tx) error {
		// Lock the row (and prove it exists) even when only deps change.
		var got int
		if err := tx.QueryRow(fmt.Sprintf("SELECT id FROM %s WHERE id = $1 FOR UPDATE", e.Name), id).Scan(&got); err != nil {
			return err
		}
		if len(cols) > 0 {
			set := make([]string, len(cols))
			for i, c := range cols {
				set[i] = fmt.Sprintf("%s = $%d", c, i+2)
			}
			q := fmt.Sprintf("UPDATE %s SET %s WHERE id = $1", e.Name, strings.Join(set, ", "))
			if _, err := tx.Exec(q, append([]any{id}, vals...)...); err != nil {
				return err
			}
		}
		if hasDeps {
			if err := setDeps(tx, id, deps); err != nil {
				return err
			}
		}
		out, err = getRow(tx, e, id)
		return err
	})
	return out, err
}

// Delete removes a row. Returns sql.ErrNoRows if the id does not exist.
func (s *Store) Delete(e *Entity, actor string, id int) error {
	return s.withActor(actor, func(tx *sql.Tx) error {
		res, err := tx.Exec(fmt.Sprintf("DELETE FROM %s WHERE id = $1", e.Name), id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return sql.ErrNoRows
		}
		return nil
	})
}

var activityFilters = []string{"project_id", "entity_type", "entity_id", "actor"}

// ListActivity returns history, newest first.
func (s *Store) ListActivity(filters map[string]string, limit int) ([]json.RawMessage, error) {
	var where []string
	var args []any
	for _, k := range activityFilters {
		if v, ok := filters[k]; ok {
			args = append(args, v)
			where = append(where, fmt.Sprintf("t.%s = $%d", k, len(args)))
		}
	}
	for k := range filters {
		if !contains(activityFilters, k) {
			return nil, invalid("unknown filter %q (allowed: %s)", k, strings.Join(activityFilters, ", "))
		}
	}
	q := "SELECT to_jsonb(t) FROM activity t"
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	args = append(args, limit)
	q += fmt.Sprintf(" ORDER BY t.id DESC LIMIT $%d", len(args))
	return s.queryJSON(s.DB, q, args...)
}

// --- helpers ---------------------------------------------------------------

type querier interface {
	Query(string, ...any) (*sql.Rows, error)
	QueryRow(string, ...any) *sql.Row
}

func (s *Store) queryJSON(q querier, query string, args ...any) ([]json.RawMessage, error) {
	rows, err := q.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []json.RawMessage{}
	for rows.Next() {
		var b []byte
		if err := rows.Scan(&b); err != nil {
			return nil, err
		}
		out = append(out, json.RawMessage(b))
	}
	return out, rows.Err()
}

func getRow(q querier, e *Entity, id int) (json.RawMessage, error) {
	var b []byte
	if err := q.QueryRow(e.selectSQL()+" WHERE t.id = $1", id).Scan(&b); err != nil {
		return nil, err
	}
	return json.RawMessage(b), nil
}

// withActor runs fn in a transaction whose activity rows are attributed to actor.
func (s *Store) withActor(actor string, fn func(*sql.Tx) error) error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`SELECT set_config('melquiades.actor', $1, true)`, actor); err != nil {
		tx.Rollback()
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// decode validates client fields against the whitelist and returns
// columns (sorted, for deterministic SQL) and driver values.
func (e *Entity) decode(body map[string]json.RawMessage) ([]string, []any, error) {
	cols := make([]string, 0, len(body))
	for k := range body {
		if _, ok := e.Fields[k]; !ok {
			return nil, nil, invalid("unknown or read-only field %q", k)
		}
		cols = append(cols, k)
	}
	sort.Strings(cols)
	vals := make([]any, len(cols))
	for i, c := range cols {
		raw := bytes.TrimSpace(body[c])
		isNull := bytes.Equal(raw, []byte("null"))
		switch e.Fields[c] {
		case kindText:
			var v string
			if isNull || json.Unmarshal(raw, &v) != nil {
				return nil, nil, invalid("%q must be a string", c)
			}
			vals[i] = v
		case kindInt, kindNullInt:
			if isNull && e.Fields[c] == kindNullInt {
				vals[i] = nil
				continue
			}
			var v int64
			if isNull || json.Unmarshal(raw, &v) != nil {
				return nil, nil, invalid("%q must be an integer", c)
			}
			vals[i] = v
		case kindNullDate:
			if isNull {
				vals[i] = nil
				continue
			}
			var v string
			if json.Unmarshal(raw, &v) != nil || !dateRe.MatchString(v) {
				return nil, nil, invalid("%q must be a YYYY-MM-DD date or null", c)
			}
			vals[i] = v
		}
	}
	return cols, vals, nil
}

// takeDeps pulls the tasks-only "depends_on" list out of body.
func takeDeps(e *Entity, body map[string]json.RawMessage) ([]int64, bool, error) {
	raw, ok := body["depends_on"]
	if !ok {
		return nil, false, nil
	}
	if e != Tasks {
		return nil, false, invalid("unknown or read-only field %q", "depends_on")
	}
	delete(body, "depends_on")
	var ids []int64
	if err := json.Unmarshal(raw, &ids); err != nil {
		return nil, false, invalid(`"depends_on" must be an array of task ids`)
	}
	return ids, true, nil
}

// setDeps replaces a task's dependencies and rejects cycles.
func setDeps(tx *sql.Tx, id int, deps []int64) error {
	if _, err := tx.Exec(`DELETE FROM task_dependencies WHERE task_id = $1`, id); err != nil {
		return err
	}
	for _, d := range deps {
		if d == int64(id) {
			return invalid("a task cannot depend on itself")
		}
		if _, err := tx.Exec(`INSERT INTO task_dependencies (task_id, depends_on)
			VALUES ($1, $2) ON CONFLICT DO NOTHING`, id, d); err != nil {
			return err
		}
	}
	var cycle bool
	err := tx.QueryRow(`
		WITH RECURSIVE r(t) AS (
			SELECT depends_on FROM task_dependencies WHERE task_id = $1
			UNION
			SELECT d.depends_on FROM task_dependencies d JOIN r ON d.task_id = r.t
		)
		SELECT EXISTS (SELECT 1 FROM r WHERE t = $1)`, id).Scan(&cycle)
	if err != nil {
		return err
	}
	if cycle {
		return invalid("dependencies would create a cycle")
	}
	return nil
}

// ParseLimit turns a ?limit= value into a bounded row count.
func ParseLimit(s string) (int, error) {
	if s == "" {
		return 200, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 || n > 1000 {
		return 0, invalid("limit must be 1..1000")
	}
	return n, nil
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}
