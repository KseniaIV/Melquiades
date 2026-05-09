# Melquiades

A self-writing IDE where you can write or generate code snippets.

---

## What this is

Melquiades is the second iteration of my favorite pet project.

The original version was a very lean core workbench with a starter database of snippets. I wanted a flexible tool that I could rearrange for different needs — small custom timers, widgets, UI samples. My long-term goal was always to be able to develop and deploy within the IDE itself.

As a DevOps engineer, I like to meditate about orchestration tools. I think an IDE should adapt to the individual — to personality and task. This project follows the same idea, but applied to AI-assisted development.

I think LLMs are useful for reflection and rapid visualization of structures. They can quickly render ideas — like generating a JSON map of a conversation. My tool leverages that by providing a fast path from request to visual structure, enabling quick iteration.

This version embodies my main personal interest:  
working with tools without giving up control. I want something that helps break things down, and suggest alternatives — while I stay close enough to understand every piece so I can reuse it later.

---

## How it works

Everything is a snippet.

A snippet can be:
- code (js, css, html, bash, etc)
- a prompt
- a small panel
- a step in a chain
- a tool action

Snippets are small on purpose.

A typical flow looks like:
- write a note or a prompt
- break it down (manually or with AI)
- generate a few small snippets
- edit them until they make sense
- run them in the sandbox
- connect them into a chain
- optionally turn them into a small tool or panel

You can stop at any step. Nothing is forced into a full system.

---

## AI (optional)

AI is there, but it's not required.

You can use it to:
- generate snippets
- decompose a problem
- suggest next steps
- reflect on what you built
- turn notes into mind maps

Or you can ignore it and write everything yourself.
Everything stays visible and editable.

---

## Current state

This is still a prototype.

Right now the focus is:

- generating and editing snippets
- running snippets in a sandbox
- chaining snippets together
- experimenting with simple tool panels
- exploring note → mind map → snippet workflows

---

## Running locally

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
```