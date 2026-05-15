package main

import (
	"log"
	"net/http"
	"os"

	"melquiades/internal/db"
	"melquiades/internal/handlers"
)

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

	http.Handle("/api/snippets", handlers.Snippets(store))
	http.Handle("/api/snippets/", handlers.SnippetByID(store))
	http.Handle("/api/exec", handlers.Exec())
	http.Handle("/api/ai/generate", handlers.Generate())
	http.Handle("/api/ai/decompose", handlers.Decompose())
	http.Handle("/api/ai/mindmap", handlers.MindMap())
	http.Handle("/api/characters", handlers.Characters())
	fs := http.FileServer(http.Dir("."))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/demo-panel.html", http.StatusFound)
			return
		}
		fs.ServeHTTP(w, r)
	})
	log.Println("listening on http://localhost:8091")
	log.Fatal(http.ListenAndServe(":8091", nil))
}
