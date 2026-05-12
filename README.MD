# Melquiades

## Features

### Build IDE
- Snippet-based development environment
- Multi-language support (js, css, html, bash, sql, go, python, dockerfile, kubernetes, prompt)
- Real-time editing and execution
- Database persistence for snippets

### Tinkerable Runtime
- Sandbox execution in iframe
- Live preview of HTML/CSS/JS
- Chain execution for multi-snippet workflows
- Runtime inspection and debugging

### AI Generation
- Optional AI-assisted snippet generation
- Character-based interactions (Melquíades)
- Context-aware generation using existing snippets
- Streaming responses with abort capability

### Chain Execution
- Sequential snippet execution
- Auto-generation of missing snippets
- Browser-safe snippet combination
- Visual execution logging

### Character Interactions
- Melquíades character system
- Custom character definitions
- System prompts and context
- Greeting and context messages

## Dependencies

### API Layer
- Go 1.24+ backend
- RESTful API endpoints
- JSON request/response format
- Server-sent events for streaming

### Database Layer
- PostgreSQL persistence
- Snippet storage and retrieval
- Character configuration
- Version tracking

### AI Backend
- oobabooga integration (optional)
- OpenAI-compatible API
- Character loading from user_data/characters
- Model: Mistral-7B-Instruct-v0.2

### Runtime
- Browser sandbox execution
- iframe srcdoc rendering
- Mermaid diagram support
- Real-time log output

## Philosophy

Melquiades is a tool inspired by the power of independent tinkering. It is designed to be flexible and modular, allowing you to build and experiment with your ideas in a way that best suits your needs.

## Installation

**Requirements:** Go 1.24+, PostgreSQL on port 5433, oobabooga on port 5000 (optional for AI)

```bash
# 1. create the database (first time only)
createdb -U admin -h localhost -p 5433 -W melquiades

# 2. apply the schema (first time only)
psql -U admin -h localhost -p 5433 -d melquiades -W -f schema.sql

# 3. run the server
go run main.go
# → db: connected
# → listening on http://localhost:8090

# 4. open the demo
# http://localhost:8090/demo-panel.html
```

Override the DB connection:
```bash
DATABASE_URL="postgres://user:password@localhost:5433/melquiades?sslmode=disable" go run main.go