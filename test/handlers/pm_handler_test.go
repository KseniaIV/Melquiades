package handlers_test

// End-to-end tests for the project-management API.
// Needs a disposable PostgreSQL database; the schema is applied automatically:
//
//	MELQUIADES_TEST_DATABASE_URL=postgres://localhost:5432/melquiades_test?sslmode=disable go test ./test/...

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"melquiades/internal/db"
	"melquiades/internal/handlers"
)

type client struct {
	t   *testing.T
	srv *httptest.Server
}

func newClient(t *testing.T) *client {
	t.Helper()
	dsn := os.Getenv("MELQUIADES_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("MELQUIADES_TEST_DATABASE_URL not set")
	}
	store, err := db.Open(dsn)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range []string{"../../sql/schema.sql", "../../sql/schema-pm.sql"} {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := store.DB.Exec(string(b)); err != nil {
			t.Fatalf("%s: %v", f, err)
		}
	}
	mux := http.NewServeMux()
	// Same mix of legacy and method-pattern routes as main.go.
	mux.Handle("/api/snippets", handlers.Snippets(store))
	mux.Handle("/", http.NotFoundHandler())
	handlers.RegisterPM(mux, store)
	srv := httptest.NewServer(mux)
	t.Cleanup(func() { srv.Close(); store.DB.Close() })
	return &client{t, srv}
}

// do sends a request and decodes the JSON response into out (if non-nil).
func (c *client) do(method, path, actor string, body any, wantStatus int, out any) {
	c.t.Helper()
	var rdr *bytes.Reader
	if s, ok := body.(string); ok {
		rdr = bytes.NewReader([]byte(s))
	} else if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	} else {
		rdr = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, c.srv.URL+path, rdr)
	if actor != "" {
		req.Header.Set("X-Melquiades-Actor", actor)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	var raw json.RawMessage
	_ = json.NewDecoder(resp.Body).Decode(&raw)
	if resp.StatusCode != wantStatus {
		c.t.Fatalf("%s %s: status %d, want %d; body %s", method, path, resp.StatusCode, wantStatus, raw)
	}
	if out != nil {
		if err := json.Unmarshal(raw, out); err != nil {
			c.t.Fatalf("%s %s: decode %s: %v", method, path, raw, err)
		}
	}
}

type row map[string]any

func (r row) id() int { return int(r["id"].(float64)) }

func TestPMCrudFlow(t *testing.T) {
	c := newClient(t)
	slug := fmt.Sprintf("test-%d", time.Now().UnixNano())

	// Project CRUD.
	var p row
	c.do("POST", "/api/projects", "owner", row{"slug": slug, "name": "Test project"}, 201, &p)
	pid := p.id()
	if p["status"] != "active" {
		t.Fatalf("default status = %v", p["status"])
	}
	c.do("POST", "/api/projects", "owner", row{"slug": slug, "name": "dup"}, 409, nil)
	c.do("PATCH", fmt.Sprintf("/api/projects/%d", pid), "owner", row{"description": "updated"}, 200, &p)
	if p["description"] != "updated" || p["name"] != "Test project" {
		t.Fatalf("partial update wrong: %v", p)
	}

	// Tasks with dependencies.
	var t1, t2 row
	c.do("POST", "/api/tasks", "assistant", row{"project_id": pid, "title": "Task A", "priority": 1}, 201, &t1)
	c.do("POST", "/api/tasks", "assistant", row{"project_id": pid, "title": "Task B", "depends_on": []int{t1.id()}, "due_date": "2026-12-01"}, 201, &t2)
	if deps := t2["depends_on"].([]any); len(deps) != 1 || int(deps[0].(float64)) != t1.id() {
		t.Fatalf("depends_on = %v", t2["depends_on"])
	}
	if t2["due_date"] != "2026-12-01" {
		t.Fatalf("due_date = %v", t2["due_date"])
	}
	// Cycle and self-dependency are rejected and leave state unchanged.
	c.do("PATCH", fmt.Sprintf("/api/tasks/%d", t1.id()), "assistant", row{"depends_on": []int{t2.id()}}, 400, nil)
	c.do("PATCH", fmt.Sprintf("/api/tasks/%d", t1.id()), "assistant", row{"depends_on": []int{t1.id()}}, 400, nil)
	c.do("GET", fmt.Sprintf("/api/tasks/%d", t1.id()), "", nil, 200, &t1)
	if len(t1["depends_on"].([]any)) != 0 {
		t.Fatalf("rolled-back deps leaked: %v", t1["depends_on"])
	}
	// Status → done sets completed_at; clearing due_date with null works.
	c.do("PATCH", fmt.Sprintf("/api/tasks/%d", t2.id()), "script", row{"status": "done", "due_date": nil}, 200, &t2)
	if t2["completed_at"] == nil || t2["due_date"] != nil {
		t.Fatalf("done/clear wrong: %v", t2)
	}

	// Filters and ordering (priority 1 before default 2).
	var tasks []row
	c.do("GET", fmt.Sprintf("/api/tasks?project_id=%d", pid), "", nil, 200, &tasks)
	if len(tasks) != 2 || tasks[0].id() != t1.id() {
		t.Fatalf("list = %v", tasks)
	}
	c.do("GET", fmt.Sprintf("/api/tasks?project_id=%d&status=done", pid), "", nil, 200, &tasks)
	if len(tasks) != 1 {
		t.Fatalf("filtered list = %v", tasks)
	}

	// Experiments and notes.
	var ex, n row
	c.do("POST", "/api/experiments", "owner", row{"project_id": pid, "code": "X1", "title": "Example experiment"}, 201, &ex)
	c.do("POST", "/api/experiments", "owner", row{"project_id": pid, "code": "X1", "title": "dup code"}, 409, nil)
	c.do("POST", "/api/notes", "owner", row{"project_id": pid, "experiment_id": ex.id(), "body": "# Notes"}, 201, &n)
	c.do("PATCH", fmt.Sprintf("/api/notes/%d", n.id()), "owner", row{"experiment_id": nil}, 200, &n)
	if n["experiment_id"] != nil {
		t.Fatalf("note experiment_id not cleared: %v", n)
	}

	// Activity history records actors and diffs.
	var acts []row
	c.do("GET", fmt.Sprintf("/api/activity?project_id=%d&entity_type=tasks&entity_id=%d", pid, t2.id()), "", nil, 200, &acts)
	if len(acts) != 2 || acts[0]["action"] != "update" || acts[0]["actor"] != "script" {
		t.Fatalf("activity = %v", acts)
	}
	if _, ok := acts[0]["changes"].(map[string]any)["status"]; !ok {
		t.Fatalf("update diff missing status: %v", acts[0]["changes"])
	}

	// Delete cascades.
	c.do("DELETE", fmt.Sprintf("/api/projects/%d", pid), "owner", nil, 204, nil)
	c.do("GET", fmt.Sprintf("/api/projects/%d", pid), "", nil, 404, nil)
	c.do("GET", fmt.Sprintf("/api/tasks/%d", t1.id()), "", nil, 404, nil)
	c.do("DELETE", fmt.Sprintf("/api/projects/%d", pid), "owner", nil, 404, nil)
}

func TestPMValidation(t *testing.T) {
	c := newClient(t)
	cases := []struct {
		method, path, actor string
		body                any
		want                int
	}{
		{"POST", "/api/projects", "", row{"name": "no slug"}, 400},
		{"POST", "/api/projects", "", row{"slug": "Bad Slug", "name": "x"}, 400},
		{"POST", "/api/projects", "", row{"slug": "ok-slug-x", "name": "x", "id": 5}, 400}, // read-only field
		{"POST", "/api/projects", "", row{"slug": "ok-slug-y", "name": "x", "status": "nope"}, 400},
		{"POST", "/api/projects", "Bad Actor!", row{"slug": "ok-slug-z", "name": "x"}, 400},
		{"POST", "/api/projects", "", `not json`, 400},
		{"POST", "/api/tasks", "", row{"project_id": 999999999, "title": "orphan"}, 400}, // FK
		{"POST", "/api/tasks", "", row{"project_id": "1", "title": "x"}, 400},            // wrong type
		{"POST", "/api/tasks", "", row{"project_id": 1, "title": "x", "due_date": "tomorrow"}, 400},
		{"POST", "/api/projects", "", row{"slug": "x", "name": "y", "depends_on": []int{}}, 400}, // tasks only
		{"GET", "/api/tasks?project_id=abc", "", nil, 400},
		{"GET", "/api/tasks?evil=1", "", nil, 400},
		{"GET", "/api/tasks?limit=5000", "", nil, 400},
		{"GET", "/api/tasks/abc", "", nil, 400},
		{"GET", "/api/tasks/999999999", "", nil, 404},
		{"PATCH", "/api/tasks/999999999", "", row{"title": "x"}, 404},
		{"PATCH", "/api/tasks/1", "", row{}, 400},
		{"POST", "/api/tasks/1", "", row{}, 404}, // unmatched method falls through to the "/" file server
	}
	for _, tc := range cases {
		c.do(tc.method, tc.path, tc.actor, tc.body, tc.want, nil)
	}
}
