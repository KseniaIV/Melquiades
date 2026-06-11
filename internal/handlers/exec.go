package handlers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"

	"melquiades/internal/db"
)

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// shellCommand picks the shell that runs snippet bodies.
// On Windows, "bash" on PATH is usually the WSL relay (System32\bash.exe),
// which fails with "execvpe(/bin/bash): No such file" unless a distro is
// configured — so prefer Git Bash. Override with MELQUIADES_SHELL.
func shellCommand(ctx context.Context, command string) *exec.Cmd {
	if sh := os.Getenv("MELQUIADES_SHELL"); sh != "" {
		return exec.CommandContext(ctx, sh, "-c", command)
	}
	if runtime.GOOS == "windows" {
		// Derive Git Bash from git.exe's own location — works for any
		// install directory (Program Files, scoop, portable, D:\...).
		if gitPath, err := exec.LookPath("git"); err == nil {
			root := filepath.Dir(filepath.Dir(gitPath)) // ...\Git\cmd\git.exe -> ...\Git
			if cand := filepath.Join(root, "bin", "bash.exe"); fileExists(cand) {
				return exec.CommandContext(ctx, cand, "-c", command)
			}
			if cand := filepath.Join(root, "usr", "bin", "bash.exe"); fileExists(cand) {
				return exec.CommandContext(ctx, cand, "-c", command)
			}
		}
		for _, p := range []string{
			`C:\Program Files\Git\bin\bash.exe`,
			`C:\Program Files (x86)\Git\bin\bash.exe`,
		} {
			if fileExists(p) {
				return exec.CommandContext(ctx, p, "-c", command)
			}
		}
	}
	return exec.CommandContext(ctx, "bash", "-c", command)
}

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
		if slices.Contains(sn.Capabilities, "exec:confirm") && !req.Confirm {
			http.Error(w, "snippet requires confirmation: re-send with \"confirm\": true", http.StatusConflict)
			return
		}

		command := sn.Body
		if req.Shell != "" {
			command = req.Shell
		}
		if command == "" {
			http.Error(w, "nothing to execute", http.StatusBadRequest)
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

		pr, pw, err := os.Pipe()
		if err != nil {
			fmt.Fprintf(w, "data: error: %s\n\n", err)
			flush.Flush()
			return
		}

		cmd := shellCommand(r.Context(), command)
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
