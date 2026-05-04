# Melquíades

A self-writing IDE where you can compose or generate code snippets.

---

## What this is

Melquíades is the second iteration of my favorite pet project.

The original idea was a very lean workbench engine with a starter database of snippets. I wanted a flexible tool that I could rearrange for different needs — small custom timers, widgets, UI samples. My long-term goal was always to be able to develop and deploy within the IDE itself.

As a DevOps engineer, I find a lot lacking in most orchestration tools I use, as well as in the marketplace-driven focus of proprietary IDEs. I think an IDE should adapt to the individual — to personality and task. This project follows the same idea, but applied to AI-assisted development.

When I pair code with LLMs, I benefit most from their reflections and their ability to visualize structure. So I added features where it suggests follow-up questions and can turn a snippet into a mind map.

I want something that helps me think, break things down, and suggest directions — while staying close enough to understand every piece and reuse it later.

---

## Everything is a snippet.

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

---

## AI (optional)

Predictive model integration is there, but it’s not required.

You can use it to:
- generate snippets  
- decompose a problem  
- suggest next steps  
- reflect on what you built  
- turn notes into mind maps  

Or you can ignore it and write everything yourself.

Everything stays visible and editable.

---

## What makes it different

Melquíades works at a small scale:
- small pieces instead of big files  
- composition instead of generation  
- inspectable steps instead of magic  

It’s closer to building with parts than writing a full program in one go.  
AI features are used to break down ideas (like mind maps) into smaller, usable snippets.

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

(coming soon)
