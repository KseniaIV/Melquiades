package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
)

type execRequest struct {
	Shell string `json:"shell"`
}

func Exec() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req execRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Shell == "" {
			http.Error(w, `body must be {"shell":"..."}`, http.StatusBadRequest)
			return
		}

		flush, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		pr, pw, err := os.Pipe()
		if err != nil {
			fmt.Fprintf(w, "data: error: %s\n\n", err)
			flush.Flush()
			return
		}

		cmd := exec.CommandContext(r.Context(), "bash", "-c", req.Shell)
		cmd.Stdout = pw
		cmd.Stderr = pw

		if err := cmd.Start(); err != nil {
			pw.Close()
			pr.Close()
			fmt.Fprintf(w, "data: error: %s\n\n", err)
			flush.Flush()
			return
		}
		pw.Close()

		scanner := bufio.NewScanner(pr)
		for scanner.Scan() {
			fmt.Fprintf(w, "data: %s\n\n", scanner.Text())
			flush.Flush()
		}
		pr.Close()
		cmd.Wait()

		fmt.Fprintf(w, "data: [done]\n\n")
		flush.Flush()
	}
}
