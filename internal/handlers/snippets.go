package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"melquiades/internal/db"
)

type createRequest struct {
	Name         string   `json:"name"`
	Language     string   `json:"language"`
	Body         string   `json:"body"`
	Status       string   `json:"status"`
	Capabilities []string `json:"capabilities"`
	Tags         []string `json:"tags"`
}

func Snippets(store *db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		switch r.Method {
		case http.MethodGet:
			listSnippets(store, w)
		case http.MethodPost:
			createSnippet(store, w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func createSnippet(store *db.Store, w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Language == "" {
		req.Language = "js"
	}
	if req.Status == "" {
		req.Status = "draft"
	}
	sn, err := store.CreateSnippet(req.Name, req.Language, req.Body, req.Status, req.Capabilities)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(req.Tags) > 0 {
		_ = store.SetSnippetTags(sn.ID, req.Tags)
		sn.Tags = req.Tags
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(sn)
}

func SnippetByID(store *db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		idStr := strings.TrimPrefix(r.URL.Path, "/api/snippets/")
		id, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodPut:
			updateSnippet(store, w, r, id)
		case http.MethodDelete:
			deleteSnippet(store, w, id)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

func updateSnippet(store *db.Store, w http.ResponseWriter, r *http.Request, id int) {
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	sn, err := store.UpdateSnippet(id, req.Name, req.Language, req.Body, req.Status, req.Capabilities)
	if err == sql.ErrNoRows {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = store.SetSnippetTags(sn.ID, req.Tags)
	sn.Tags = req.Tags
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sn)
}

func deleteSnippet(store *db.Store, w http.ResponseWriter, id int) {
	if err := store.DeleteSnippet(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func listSnippets(store *db.Store, w http.ResponseWriter) {
	snippets, err := store.ListSnippets()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snippets)
}
