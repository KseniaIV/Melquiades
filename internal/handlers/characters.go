package handlers

import (
	"encoding/json"
	"net/http"
)

func Characters() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		config, err := getCharConfig()
		if err != nil {
			http.Error(w, "character config: "+err.Error(), http.StatusInternalServerError)
			return
		}

		switch r.Method {
		case http.MethodGet:
			// List all characters
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{
				"characters": config.List(),
				"active":     config.Active,
			})

		case http.MethodPost:
			// Set active character
			var req struct {
				Character string `json:"character"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `body must be {"character":"..."}`, http.StatusBadRequest)
				return
			}

			if err := config.SetActive(req.Character); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{
				"message": "Character switched",
				"active":  req.Character,
			})

		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}
}
