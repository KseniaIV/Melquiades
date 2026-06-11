# Melquíades

> A personal, snippet-driven micro-IDE for composing, executing, and reasoning about small pieces of code, prompts, and chains.

![Melquíades panel](./screenshot.png)

Melquíades is a local workbench that stores tiny named code/prompt snippets in PostgreSQL and lets you compose, chain, and run them from a single-page UI. It wires in LLM-backed actions (generate, decompose, mind map, revise, explain, reflect) for working through ideas while you build.

## Why

Everything is a snippet. A snippet can be code, a prompt, a small panel, or a step in a chain. Snippets are small on purpose. A typical flow:

- write a note or a prompt
- break it down (manually or with AI)
- generate a few small snippets
- edit them until they make sense
- run them in the sandbox
- connect them into a chain
- optionally register one as a live panel

You can stop at any step. Nothing is forced into a full system. AI is there to help you think, break things down, and suggest directions — while you stay close enough to understand every piece so you can reuse it later. It is optional: everything stays visible and editable.

## What it does

- **Snippet library** — Small units of `js`, `css`, `html`, `markdown`, `json`, `yaml`, `bash`, `sql`, `go`, `python`, `dockerfile`, `kubernetes`, `mermaid`, `chain`, or `prompt` content. Each snippet has a status (`draft` / `ready` / `archived`), capabilities (e.g. `exec:system`, `exec:confirm`), tags, and dependencies on other snippets.
- **Chains** — A snippet of language `chain` lists other snippets by name, one per line. HTML / CSS / JS members are combined into a single document and run in the sandbox; missing members are auto-generated from the chain's context. A snippet named `startup-chain` runs at boot.
- **Run panel** — Execute snippets in a sandboxed iframe, watch the log, register snippets as live panels.
- **AI actions** — Generate (streamed over SSE), decompose an intent into smaller steps, build a mind map of a snippet (JSON snippets are mapped structurally without a model call), revise, explain, reflect.
- **Characters** — AI personas loaded from an Oobabooga `characters/` directory; see `misc/README-CHARACTERS.md`.

## Stack

- **Backend:** Go (`net/http`, standard library), PostgreSQL via `lib/pq`
- **Frontend:** Single static page, vanilla JS in six plain modules (`js/state|ui|editor|run|ai|main.js`) — no build step
- **LLM:** Local model behind an OpenAI-compatible endpoint (`http://localhost:5000/v1/chat/completions`, e.g. Oobabooga; Mistral-7B in the screenshot)

## Project layout

```
.
├── main.go              # HTTP server + route wiring (loopback only)
├── sql/                 # schema.sql + seed*.sql (applied in order on first start)
├── index.html           # Single-page UI
├── internal/
│   ├── db/              # PostgreSQL store
│   ├── handlers/        # snippets, exec, ai, characters
│   └── models/          # character config
├── js/                  # Frontend modules (load order: state → ui → editor → run → ai → main)
├── css/                 # Styles
├── test/                # Handler tests (need a live PostgreSQL)
└── misc/                # Prototypes, demos, notes
```

## API

| Method  | Path                  | Purpose                                          |
|---------|-----------------------|--------------------------------------------------|
| `GET/POST` | `/api/snippets`    | List / create snippets                           |
| `GET/PUT/DELETE` | `/api/snippets/{id}` | Read / update / delete a snippet         |
| `POST`  | `/api/exec`           | Execute a stored snippet on the host shell (disabled by default — see Security) |
| `POST`  | `/api/ai/generate`    | Generate a snippet from a prompt (SSE stream)    |
| `POST`  | `/api/ai/decompose`   | Break an intent into smaller snippet steps       |
| `POST`  | `/api/ai/mindmap`     | Produce a mind map over a snippet                |
| `GET/POST` | `/api/characters`  | List / switch character personas                 |
| `GET`   | `/`                   | Serves the panel UI (`index.html`)               |

## Security

The server binds to `127.0.0.1:8092` only, rejects non-loopback `Host` headers (DNS rebinding), and sets no CORS headers — the UI is same-origin, nothing else gets in.

Host shell execution (`/api/exec`) is **off by default**. To use it:

1. Start the server with `MELQUIADES_ENABLE_EXEC=1`.
2. The request must name a stored snippet carrying the `exec:system` capability.
3. If the snippet also carries `exec:confirm`, the request must include `"confirm": true`.

Browser-language snippets (HTML/CSS/JS) always run inside a sandboxed iframe and never touch the host.

## Getting started

### Prerequisites

- Go 1.24+
- PostgreSQL — either Docker or a native install

### Option A: Docker (recommended)

```bash
docker compose up -d
```

The container publishes on host port **55432** (not 5432) so it can never clash with a native PostgreSQL install. Schema and starter snippets are applied automatically on first start. Then:

```powershell
$env:DATABASE_URL = "postgres://melquiades:melquiades@localhost:55432/melquiades?sslmode=disable"
go run .
```

To wipe and rebuild the database: `docker compose down -v && docker compose up -d`

### Option B: Native PostgreSQL (Windows)

```powershell
.\setup.ps1            # defaults: port 5432, user postgres
.\setup.ps1 -Port 5433  # if your Postgres listens elsewhere
```

The script creates the database, applies `sql/schema.sql`, and runs every `sql/seed*.sql` in order — re-running it is safe. It prints the `DATABASE_URL` to set when it finishes.

### Demo content

All seeds live in `sql/` and are idempotent. Docker applies them automatically on first start; on an existing database, load any of them manually:

```powershell
Get-Content sql\seed-imagination.sql | docker exec -i melquiades-db psql -U melquiades -d melquiades
```

`seed.sql` holds the starter snippets, `seed-imagination.sql` the demo chains (macondo-rain, orbit-clock, star-notes), `seed-myths.sql` and `seed-symbols.sql` the model-assisted chains, and `seed-deploy.sql` the **deploy board** — a panel whose buttons run real host commands (`docker ps`, snippet-DB status, its own git history, a confirm-gated database backup). It needs the server started with:

```powershell
$env:MELQUIADES_ENABLE_EXEC = "1"
go run .
```

Commands are stored snippets carrying `exec:system`; the backup also carries `exec:confirm`, and the confirmation dialog is owned by the app, not the panel.

### Run

Open <http://localhost:8092> after `go run .`. A fresh database boots into the `startup-chain` snippet; try executing `demo-chain` to see structure → styles → logic compose live.

> **If snippets fail to load with HTTP 500:** the server connected to a database that's missing the tables — usually a `DATABASE_URL` pointing at the wrong port or database. The run log now shows the underlying Postgres error; re-run `setup.ps1` (or `docker compose up -d`) against the right instance.

## Status

This is a personal exploration project — expect rough edges, opinionated defaults, and occasional rewrites. It's primarily a place for me to think out loud in code.

## License

MIT
