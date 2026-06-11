package main

import (
	"log"
	"net"
	"net/http"
	"os"
	"strings"

	"melquiades/internal/db"
	"melquiades/internal/handlers"
)

// localhostOnly rejects requests whose Host header is not a loopback name.
// Combined with binding to 127.0.0.1, this blocks DNS-rebinding attacks
// (a malicious site pointing its own domain at 127.0.0.1).
func localhostOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(r.Host); err == nil {
			host = h
		}
		host = strings.ToLower(strings.Trim(host, "[]"))
		if host != "localhost" && host != "127.0.0.1" && host != "::1" {
			http.Error(w, "forbidden host", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	dsn := os.Getenv("DATABASE_URL")

	if dsn == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	store, err := db.Open(dsn)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer store.DB.Close()

	log.Println("db: connected")

	mux := http.NewServeMux()

	mux.Handle("/api/snippets", handlers.Snippets(store))
	mux.Handle("/api/snippets/", handlers.SnippetByID(store))
	mux.Handle("/api/exec", handlers.Exec(store))
	mux.Handle("/api/ai/generate", handlers.Generate())
	mux.Handle("/api/ai/decompose", handlers.Decompose())
	mux.Handle("/api/ai/mindmap", handlers.MindMap())
	mux.Handle("/api/characters", handlers.Characters())

	fs := http.FileServer(http.Dir("."))
	mux.Handle("/", fs)

	log.Println("listening on http://localhost:8092")

	// Bind to loopback only: the UI is served same-origin by this server,
	// so no CORS headers are needed and no external interface is exposed.
	log.Fatal(
		http.ListenAndServe(
			"127.0.0.1:8092",
			localhostOnly(mux),
		),
	)
}
