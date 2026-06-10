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
├── schema.sql           # PostgreSQL schema (snippets, tags, dependencies)
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
| `GET/PUT/DELETE` | `/api/snippets/{id}` | Read / update / 