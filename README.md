# Melquíades

> A personal, snippet-driven micro-IDE for composing, executing, and reasoning about small pieces of code, prompts, and chains.

![Melquíades panel](./screenshot.png)

Melquíades is an experimental local workbench that stores tiny named code/prompt snippets in PostgreSQL (or your DB of choice potentially) and lets you compose, chain, and run them from a single-page UI. It also wires in a few LLM-backed actions (generate, decompose, mindmap, reflect) for working through ideas while you build.

## What it does

- **Snippet library** — Store small units of `js`, `css`, `html`, `markdown`, `json`, `yaml`, `bash`, `sql`, `go`, `python`, `dockerfile`, `kubernetes`, or `prompt` content. Each snippet has a status (`draft` / `ready` / `archived`), capabilities (e.g. `exec:browser`, `exec:confirm`), tags, and dependencies on other snippets.
- **Chains** — Combine multiple snippets into a single executable unit. HTML / CSS / JS are merged and run in the browser panel.
- **Run panel** — A small UI to view, execute, and watch the log of chain runs.
- **AI actions** — Generate, debug, revise, and explain snippets. Decompose intents into smaller snippet plans. Build a mindmap of related snippets.
- **Reflection** — Track failure modes and open questions next to each chain.

## Stack

- **Backend:** Go (`net/http`, standard library)
- **Database:** PostgreSQL
- **Frontend:** Single static page (`demo-panel.html`), no build step
- **LLM:** Local model endpoint (Mistral-7B in the screenshot, configurable)

## Project layout

```
.
├── main.go              # HTTP server + route wiring
├── schema.sql           # PostgreSQL schema (snippets, tags, dependencies)
├── index.html      # Single-page UI
├── internal/
│   ├── db/              # PostgreSQL store
│   ├── handlers/        # snippets, exec, ai, characters
│   └── models/
├── js/                 # Helper functions
├── css/                # Styles
```

## API

| Method  | Path                  | Purpose                                       |
|---------|-----------------------|-----------------------------------------------|
| `*`     | `/api/snippets`       | List / create snippets                        |
| `*`     | `/api/snippets/{id}`  | Read / update / delete a snippet              |
| `POST`  | `/api/exec`           | Execute a snippet or chain                    |
| `POST`  | `/api/ai/generate`    | Generate a new snippet from a prompt          |
| `POST`  | `/api/ai/decompose`   | Break an intent into smaller snippet steps    |
| `POST`  | `/api/ai/mindmap`     | Produce a mindmap over related snippets       |
| `*`     | `/api/characters`     | Load supporting "character" personas          |
| `GET`   | `/`                   | Redirects to `/demo-panel.html`               |

## Getting started

### Prerequisites

- Go 1.21+
- PostgreSQL (the schema assumes a database called `melquiades`)

### 1. Create the database

```bash
createdb melquiades
psql -d melquiades -f schema.sql
```

### 2. Set the connection string

```bash
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/melquiades?sslmode=disable"
```

### 3. Run the server

```bash
go run .
```

Then open <http://localhost:8091>. You'll be redirected to the panel UI.

## Status

This is a personal exploration project — expect rough edges, opinionated defaults, and occasional rewrites. It's primarily a place for me to think out loud in code.

## License

MIT
