package handlers_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"melquiades/internal/db"
	"melquiades/internal/handlers"
)

func TestCreateSnippet(t *testing.T) {
	store, err := db.Open("postgres://localhost/melquiades?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}

	body := []byte(`{
		"name":"test snippet",
		"language":"js",
		"body":"console.log('hi')"
	}`)

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/snippets",
		bytes.NewReader(body),
	)

	w := httptest.NewRecorder()

	handler := handlers.Snippets(store)

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 got %d", w.Code)
	}

	t.Log(w.Body.String())
}
