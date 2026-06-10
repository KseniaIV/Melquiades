package main

import (
	"log"
	"net/http"
	"os"

	"melquiades/internal/db"
	"melquiades/internal/handlers"
)

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
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
	mux.Handle("/api/exec", handlers.Exec())
	mux.Handle("/api/ai/generate", handlers.Generate())
	mux.Handle("/api/ai/decompose", handlers.Decompose())
	mux.Handle("/api/ai/mindmap", handlers.MindMap())
	mux.Handle("/api/characters", handlers.Characters())

	fs := http.FileServer(http.Dir("."))
	mux.Handle("/", fs)

	log.Println("listening on http://localhost:8092")

	log.Fatal(
		http.ListenAndServe(
			":8092",
			withCORS(mux),
		),
	)
}
