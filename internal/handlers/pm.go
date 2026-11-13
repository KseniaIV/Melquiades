package handlers

// Project-management REST API.
//
//	GET    /api/{projects|tasks|experiments|notes}?field=value&limit=N
//	POST   /api/{...}                 create (JSON body)
//	GET    /api/{...}/{id}
//	PATCH  /api/{...}/{id}            partial update (PUT is accepted as an alias)
//	DELETE /api/{...}/{id}
//	GET    /api/activity?project_id=&entity_type=&entity_id=&actor=&limit=
//
// Writers identify themselves with the X-Melquiades-Actor header
// (e.g. "owner", "assistant", "script"); it is recorded in the activity log.
// Tasks accept "depends_on": [task ids] on create/update.

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/lib/pq"

	"melquiades/internal/db"
)

const (
	actorHeader  = "X-Melquiades-Actor"
	defaultActor = "api"
	maxBody      = 1 << 20
)

// RegisterPM wires the project-management routes onto mux.
func RegisterPM(mux *http.ServeMux, store *db.Store) {
	for _, e := range []*db.Entity{db.Projects, db.Tasks, db.Experiments, db.Notes} {
		base := "/api/" + e.Name
		mux.HandleFunc("GET "+base, listEntity(store, e))
		mux.HandleFunc("POST "+base, createEntity(store, e))
		mux.HandleFunc("GET "+base+"/{id}", getEntity(store, e))
		mux.HandleFunc("PATCH "+base+"/{id}", updateEntity(store, e))
		mux.HandleFunc("PUT "+base+"/{id}", updateEntity(store, e))
		mux.HandleFunc("DELETE "+base+"/{id}", deleteEntity(store, e))
	}
	mux.HandleFunc("GET /api/activity", listActivity(store))
}

func listEntity(store *db.Store, e *db.Entity) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		filters, limit, ok := queryFilters(w, r)
		if !ok {
			return
		}
		rows, err := store.List(e, filters, limit)
		respond(w, http.StatusOK, rows, err)
	}
}

func listActivity(store *db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		filters, limit, ok := queryFilters(w, r)
		if !ok {
			return
		}
		rows, err := store.ListActivity(filters, limit)
		respond(w, http.StatusOK, rows, err)
	}
}

func getEntity(store *db.Store, e *db.Entity) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		row, err := store.Get(e, id)
		respond(w, http.StatusOK, row, err)
	}
}

func createEntity(store *db.Store, e *db.Entity) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		actor, body, ok := writeRequest(w, r)
		if !ok {
			return
		}
		row, err := store.Create(e, actor, body)
		respond(w, http.StatusCreated, row, err)
	}
}

func updateEntity(store *db.Store, e *db.Entity) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		actor, body, ok := writeRequest(w, r)
		if !ok {
			return
		}
		row, err := store.Update(e, actor, id, body)
		respond(w, http.StatusOK, row, err)
	}
}

func deleteEntity(store *db.Store, e *db.Entity) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathID(w, r)
		if !ok {
			return
		}
		actor, ok := requestActor(w, r)
		if !ok {
			return
		}
		if err := store.Delete(e, actor, id); err != nil {
			respond(w, 0, nil, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// --- request helpers -------------------------------------------------------

func pathID(w http.ResponseWriter, r *http.Request) (int, bool) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return id, true
}

func requestActor(w http.ResponseWriter, r *http.Request) (string, bool) {
	actor := r.Header.Get(actorHeader)
	if actor == "" {
		return defaultActor, true
	}
	if !db.ValidActor(actor) {
		writeError(w, http.StatusBadRequest, actorHeader+" must match [a-z0-9][a-z0-9_-]{0,31}")
		return "", false
	}
	return actor, true
}

func writeRequest(w http.ResponseWriter, r *http.Request) (string, map[string]json.RawMessage, bool) {
	actor, ok := requestActor(w, r)
	if !ok {
		return "", nil, false
	}
	var body map[string]json.RawMessage
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody)).Decode(&body); err != nil || body == nil {
		writeError(w, http.StatusBadRequest, "body must be a JSON object")
		return "", nil, false
	}
	return actor, body, true
}

func queryFilters(w http.ResponseWriter, r *http.Request) (map[string]string, int, bool) {
	q := r.URL.Query()
	limit, err := db.ParseLimit(q.Get("limit"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return nil, 0, false
	}
	filters := map[string]string{}
	for k, v := range q {
		if k != "limit" {
			filters[k] = v[0]
		}
	}
	return filters, limit, true
}

// --- responses -------------------------------------------------------------

func respond(w http.ResponseWriter, status int, v any, err error) {
	if err != nil {
		code, msg := classify(err)
		if code == http.StatusInternalServerError {
			log.Printf("pm: %v", err)
		}
		writeError(w, code, msg)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// classify maps store/database errors to HTTP status codes. Internal error
// text is not echoed to clients.
func classify(err error) (int, string) {
	switch {
	case errors.Is(err, sql.ErrNoRows):
		return http.StatusNotFound, "not found"
	case errors.Is(err, db.ErrInvalid):
		return http.StatusBadRequest, err.Error()
	}
	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		switch pqErr.Code {
		case "23505": // unique_violation
			return http.StatusConflict, "already exists: " + pqErr.Detail
		case "23503": // foreign_key_violation
			return http.StatusBadRequest, "referenced record does not exist: " + pqErr.Detail
		case "23514", "23502": // check / not-null violation
			return http.StatusBadRequest, "invalid value: " + pqErr.Message
		case "22P02", "22007", "22008", "22003": // bad text repr / datetime / out of range
			return http.StatusBadRequest, "invalid value: " + pqErr.Message
		}
	}
	return http.StatusInternalServerError, "internal error"
}
