package handlers

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"melquiades/internal/models"
)

const oobaURL = "http://localhost:5000/v1/chat/completions"

type generateRequest struct {
	Prompt    string `json:"prompt"`
	System    string `json:"system"`
	Character string `json:"character,omitempty"`
	Mode      string `json:"mode,omitempty"` // "instruct" or "chat"
}

func getCharConfig() (*models.CharacterConfig, error) {
	return models.LoadCharacters()
}

const decomposeSystem = `You are a task decomposer. The user gives you a description or snippet. Return ONLY a flat JSON array of short task strings, no explanation, no markdown. Example: ["task one","task two"]`

const mindmapSystem = `You output ONLY raw JSON. No explanation, no markdown, no backticks. Analyze the input and return a mind map with this exact structure: {"root":"topic","branches":[{"id":"b1","label":"Branch","color":"#79c0ff","leaves":[{"id":"l1","label":"Leaf","tip":"description"}]}]}. Use 3-5 branches, 2-4 leaves each. Colors: #3fb950 #d2a8ff #ffa657 #ff7b72 #79c0ff #58a6ff. Start your response with { and end with }.`

type oobaMessage struct {
	Content string `json:"content"`
}
type oobaFullChoice struct {
	Message oobaMessage `json:"message"`
}
type oobaFullResponse struct {
	Choices []oobaFullChoice `json:"choices"`
}

func MindMap() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req generateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Prompt == "" {
			http.Error(w, `body must be {"prompt":"..."}`, http.StatusBadRequest)
			return
		}

		config, err := getCharConfig()
		if err != nil {
			http.Error(w, "character config: "+err.Error(), http.StatusInternalServerError)
			return
		}

		char := config.GetActive()
		if req.Character != "" {
			if err := config.SetActive(req.Character); err == nil {
				char = config.GetActive()
			}
		}

		body, _ := json.Marshal(map[string]any{
			"model": char.Model,
			"messages": []map[string]string{
				{"role": "system", "content": mindmapSystem},
				{"role": "user", "content": req.Prompt},
				{"role": "assistant", "content": "{"},
			},
			"stream":      false,
			"max_tokens":  char.MaxTokens,
			"temperature": char.Temperature,
			"top_p":       char.TopP,
		})

		resp, err := http.Post(oobaURL, "application/json", bytes.NewReader(body))
		if err != nil {
			http.Error(w, "ooba: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		raw, err := io.ReadAll(resp.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var full oobaFullResponse
		if err := json.Unmarshal(raw, &full); err != nil || len(full.Choices) == 0 {
			http.Error(w, "unexpected ooba response", http.StatusBadGateway)
			return
		}

		content := strings.TrimSpace(full.Choices[0].Message.Content)
		// the assistant prefill started with {, so prepend it if the model didn't include it
		if !strings.HasPrefix(content, "{") {
			content = "{" + content
		}
		// strip any leading text before first {
		if i := strings.Index(content, "{"); i > 0 {
			content = content[i:]
		}
		if j := strings.LastIndex(content, "}"); j >= 0 && j < len(content)-1 {
			content = content[:j+1]
		}
		// validate JSON — on failure return a fallback single-branch map with raw content visible
		var result map[string]any
		if err := json.Unmarshal([]byte(content), &result); err != nil {
			preview := content
			if len(preview) > 120 {
				preview = preview[:120] + "…"
			}
			fallback, _ := json.Marshal(map[string]any{
				"root": "parse error",
				"branches": []map[string]any{{
					"id": "raw", "label": "Model output", "color": "#ff7b72",
					"leaves": []map[string]string{{"id": "l0", "label": "invalid JSON", "tip": preview}},
				}},
			})
			w.Header().Set("Content-Type", "application/json")
			w.Write(fallback)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(content))
	}
}

func Decompose() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req generateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Prompt == "" {
			http.Error(w, `body must be {"prompt":"..."}`, http.StatusBadRequest)
			return
		}

		config, err := getCharConfig()
		if err != nil {
			http.Error(w, "character config: "+err.Error(), http.StatusInternalServerError)
			return
		}

		char := config.GetActive()
		if req.Character != "" {
			if err := config.SetActive(req.Character); err == nil {
				char = config.GetActive()
			}
		}

		body, _ := json.Marshal(map[string]any{
			"model": char.Model,
			"messages": []map[string]string{
				{"role": "system", "content": decomposeSystem},
				{"role": "user", "content": req.Prompt},
			},
			"stream":      false,
			"max_tokens":  char.MaxTokens,
			"temperature": char.Temperature,
			"top_p":       char.TopP,
		})

		resp, err := http.Post(oobaURL, "application/json", bytes.NewReader(body))
		if err != nil {
			http.Error(w, "ooba: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		raw, err := io.ReadAll(resp.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		var full oobaFullResponse
		if err := json.Unmarshal(raw, &full); err != nil || len(full.Choices) == 0 {
			http.Error(w, "unexpected ooba response", http.StatusBadGateway)
			return
		}

		content := strings.TrimSpace(full.Choices[0].Message.Content)
		var tasks []string
		if err := json.Unmarshal([]byte(content), &tasks); err != nil {
			// ooba didn't return clean JSON — return raw content for inspection
			tasks = []string{content}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"tasks": tasks})
	}
}

func Generate() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req generateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Prompt == "" {
			http.Error(w, `body must be {"prompt":"..."}`, http.StatusBadRequest)
			return
		}

		config, err := getCharConfig()
		if err != nil {
			http.Error(w, "character config: "+err.Error(), http.StatusInternalServerError)
			return
		}

		char := config.GetActive()
		if req.Character != "" {
			if err := config.SetActive(req.Character); err == nil {
				char = config.GetActive()
			}
		} else {
			// Force Melquíades character by default
			if err := config.SetActive("Melquíades"); err == nil {
				char = config.GetActive()
			}
		}

		flush, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}

		msgs := []map[string]string{}
		var oobaReq map[string]any

		// Handle different modes
		if req.Mode == "instruct" {
			// OpenAI instruct format - prepend system prompt to user message
			systemPrompt := char.System
			if req.System != "" {
				systemPrompt = req.System
			}

			userMessage := req.Prompt
			if systemPrompt != "" {
				userMessage = systemPrompt + "\n\n" + req.Prompt
			}

			// Debug logging
			fmt.Printf("[DEBUG] Instruct mode - System prompt: %s\n", systemPrompt)
			fmt.Printf("[DEBUG] Instruct mode - User message: %s\n", userMessage)

			msgs = append(msgs, map[string]string{"role": "user", "content": userMessage})

			oobaReq = map[string]any{
				"model":       char.Model,
				"messages":    msgs,
				"stream":      true,
				"max_tokens":  char.MaxTokens,
				"temperature": char.Temperature,
				"top_p":       char.TopP,
			}
		} else {
			// Default: character mode (current behavior)
			// Add character greeting and context to establish Melquíades persona
			if char.Greeting != "" {
				msgs = append(msgs, map[string]string{"role": "assistant", "content": char.Greeting})
			}
			if char.Context != "" {
				msgs = append(msgs, map[string]string{"role": "system", "content": char.Context})
			}

			systemPrompt := char.System
			if req.System != "" {
				systemPrompt = req.System
			}
			if systemPrompt != "" {
				msgs = append(msgs, map[string]string{"role": "system", "content": systemPrompt})
			}
			msgs = append(msgs, map[string]string{"role": "user", "content": req.Prompt})

			oobaReq = map[string]any{
				"model":       char.Model,
				"character":   req.Character,
				"mode":        "chat",
				"messages":    msgs,
				"stream":      true,
				"max_tokens":  char.MaxTokens,
				"temperature": char.Temperature,
				"top_p":       char.TopP,
			}
		}

		stopWords := char.Stop
		if req.System != "" && len(stopWords) == 0 {
			stopWords = []string{"\n\nThis", "\n\nNote", "\n\nIn this", "\n\nThe above", "\n\nYou can", "\n\nHere", "\n\nPlease"}
		}
		if len(stopWords) > 0 {
			oobaReq["stop"] = stopWords
		}

		// Add any additional params from character
		for k, v := range char.Params {
			oobaReq[k] = v
		}

		body, _ := json.Marshal(oobaReq)

		resp, err := http.Post(oobaURL, "application/json", bytes.NewReader(body))
		if err != nil {
			http.Error(w, "ooba: "+err.Error(), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			fmt.Fprintln(w, line)
			if strings.TrimSpace(line) == "" {
				flush.Flush()
			}
		}
		flush.Flush()
	}
}
