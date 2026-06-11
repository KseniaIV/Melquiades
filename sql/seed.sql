-- Melquíades starter snippets (idempotent — ON CONFLICT DO NOTHING)
-- Gives a fresh database something to show: a hello panel, a 3-snippet
-- demo chain (structure → styles → logic), and a startup chain.

INSERT INTO snippets (name, language, body, status) VALUES
('hello-world', 'html',
'<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 45%,#15152a 0%,#0b0b16 70%);font-family:system-ui">
  <h1 style="color:#9aa0ff;font-weight:300;letter-spacing:.18em;text-shadow:0 0 28px rgba(124,131,247,.45)">Hello from Melquíades ✦</h1>
</div>', 'ready'),

('demo-structure', 'html',
'<div class="board">
  <section class="panel">
    <h2>Focus Timer</h2>
    <div id="timer">25:00</div>
    <button id="start">Start</button>
  </section>
  <section class="panel">
    <h2>Tasks</h2>
    <input id="task-input" placeholder="Add a task…">
    <ul id="task-list"></ul>
  </section>
</div>', 'ready'),

('demo-styles', 'css',
'body{background:#0d1117;color:#c9d1d9;font-family:''Segoe UI'',system-ui,sans-serif;margin:0;padding:24px}
.board{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:720px;margin:auto}
.panel{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px}
.panel h2{margin-top:0;font-size:14px;color:#58a6ff;text-transform:uppercase;letter-spacing:.1em}
#timer{font:600 42px/1.2 ''Cascadia Code'',monospace;color:#3fb950;text-align:center;margin:12px 0}
button{background:#238636;color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;width:100%}
button:hover{background:#2ea043}
input{background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;padding:8px;width:100%;box-sizing:border-box}
ul{list-style:none;padding:0}li{padding:6px 0;border-bottom:1px solid #21262d}', 'ready'),

('demo-logic', 'js',
'let secs = 25 * 60, running = null
const timer = document.getElementById("timer")
const fmt = s => String(Math.floor(s/60)).padStart(2,"0") + ":" + String(s%60).padStart(2,"0")
document.getElementById("start").onclick = function () {
  if (running) { clearInterval(running); running = null; this.textContent = "Start"; return }
  this.textContent = "Pause"
  running = setInterval(() => { if (secs > 0) timer.textContent = fmt(--secs) }, 1000)
}
const input = document.getElementById("task-input")
input.addEventListener("keydown", e => {
  if (e.key !== "Enter" || !input.value.trim()) return
  const li = document.createElement("li")
  li.textContent = input.value.trim()
  li.onclick = () => li.style.textDecoration = li.style.textDecoration ? "" : "line-through"
  document.getElementById("task-list").appendChild(li)
  input.value = ""
})', 'ready'),

('demo-chain', 'chain',
'demo-structure
demo-styles
demo-logic', 'ready'),

('startup-chain', 'chain',
'hello-world', 'ready')
ON CONFLICT (name) DO NOTHING;

INSERT INTO tags (name) VALUES ('demo'), ('chain'), ('ui') ON CONFLICT DO NOTHING;

INSERT INTO snippet_tags (snippet_id, tag_id)
SELECT s.id, t.id FROM snippets s, tags t
WHERE (s.name IN ('demo-structure','demo-styles','demo-logic','demo-chain') AND t.name = 'demo')
   OR (s.name IN ('demo-chain','startup-chain') AND t.name = 'chain')
   OR (s.name IN ('hello-world','demo-structure') AND t.name = 'ui')
ON CONFLICT DO NOTHING;
