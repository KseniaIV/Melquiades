package models

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type Character struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Model       string         `json:"model"`
	System      string         `json:"system"`
<<<<<<< HEAD
=======
	Greeting    string         `json:"greeting"`
	Context     string         `json:"context"`
>>>>>>> main
	Stop        []string       `json:"stop"`
	MaxTokens   int            `json:"max_tokens"`
	Temperature float64        `json:"temperature"`
	TopP        float64        `json:"top_p"`
	Params      map[string]any `json:"params"`
}

type CharacterConfig struct {
	Characters map[string]Character `json:"characters"`
	Active     string               `json:"active"`
}

func LoadCharacters() (*CharacterConfig, error) {
	// Try to load from ooba user_data characters directory
	oobaPath := os.Getenv("OOBA_PATH")
	var oobaCharsPath string
	if oobaPath == "" {
		oobaCharsPath = filepath.Join("c:", "Users", "mifam", "src", "ooba", "user_data", "characters")
	} else {
		oobaCharsPath = filepath.Join(oobaPath, "user_data", "characters")
	}

	config := &CharacterConfig{
		Characters: make(map[string]Character),
		Active:     "default",
	}

	// Load default character
	config.Characters["default"] = Character{
		Name:        "Default",
		Description: "Standard Melquíades assistant",
		Model:       "Mistral-7B-Instruct-v0.2",
		System:      "You are a helpful AI assistant for a development environment.",
		Stop:        []string{"\n\nThis", "\n\nNote", "\n\nIn this", "\n\nThe above", "\n\nYou can", "\n\nHere", "\n\nPlease"},
		MaxTokens:   1024,
		Temperature: 0.7,
		TopP:        0.9,
	}

	// Try to load characters from ooba directory
	if files, err := os.ReadDir(oobaCharsPath); err == nil {
		for _, file := range files {
			if !file.IsDir() && filepath.Ext(file.Name()) == ".json" {
				charPath := filepath.Join(oobaCharsPath, file.Name())
				if data, err := os.ReadFile(charPath); err == nil {
					var char Character
					if err := json.Unmarshal(data, &char); err == nil {
						char.Name = file.Name()[:len(file.Name())-5] // remove .json
						config.Characters[char.Name] = char
					}
				}
			}
		}
	}

	return config, nil
}

func (c *CharacterConfig) GetActive() Character {
	if char, exists := c.Characters[c.Active]; exists {
		return char
	}
	return c.Characters["default"]
}

func (c *CharacterConfig) SetActive(name string) error {
	if _, exists := c.Characters[name]; !exists {
		return fmt.Errorf("character '%s' not found", name)
	}
	c.Active = name
	return nil
}

func (c *CharacterConfig) List() []string {
	var names []string
	for name := range c.Characters {
		names = append(names, name)
	}
	return names
}
