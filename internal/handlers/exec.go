package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"slices"

	"melquiades/internal/db"
)

type execRequest struct {
	// Name of a stored snippet whose capabilities authorize this execution.
	Name string `json:"name"`
	// Shell overrides the snippet body (e.g. running an edited, unsaved buffer).
	Shell string `json:"shell,omitempty"`
	// Confirm must be true when the snippet carries the exec:confirm capability.
	Confirm bool `json:"confirm,omitempty"`
}

// Exec runs a stored snippet on the host shell, streaming output as SSE.
//
// Security model:
//   - The endpoint is disabled unless MELQUIADES_ENABLE_EXEC=1.
//   - Execution is authorized by a stored snippet, never by raw input alone:
//     the snippet must exist and carry the exec:system capability.
//   - Snippets with exec:confirm additionally require "confirm": true.
func Exec(store *db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if os.Getenv("MELQUIADES_ENABLE_EXEC") != "1" {
			http.Error(w, "shell execution is disabled; set MELQUIADES_ENABLE_EXEC=1 to enable", http.StatusForbidden)
			return
		}

		var req execRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
			http.Error(w, `body must be {"name":"snippet-name","shell":"...","confirm":bool}`, http.StatusBadRequest)
			return
		}

		sn, err := store.GetSnippetByName(req.Name)
		if err != nil {
			http.Error(w, "snippet not found: "+req.Name, http.StatusNotFound)
			return
		}
		if !slices.Contains(sn.Capabilities, "exec:system") {
			http.Error(w, "snippet lacks the exec:system capability", http.StatusForbidden)
			return
		}
		if slices.Contains(sn.Capab