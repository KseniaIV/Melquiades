-- deploy-board: the old mock panel, made real. Buttons run actual host
-- commands through /api/exec. Requires the server to run with
-- MELQUIADES_ENABLE_EXEC=1; each command is a stored snippet carrying
-- exec:system, and the backup is additionally gated with exec:confirm —
-- the parent app shows the confirmation, the panel can only ask.
-- Upsert: re-running this file updates bodies and capabilities.

INSERT INTO snippets (name, language, body, status, capabilities) VALUES
('cmd-docker-ps', 'bash',
'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"',
'ready', '{exec:system}'),

('cmd-db-status', 'bash',
'docker exec melquiades-db pg_isready -U melquiades -d melquiades
docker exec melquiades-db psql -U melquiades -d melquiades -tAc "select count(*) || '' snippets, '' || coalesce(max(updated_at)::text,''never'') || '' last write'' from snippets"',
'ready', '{exec:system}'),

('cmd-git-log', 'bash',
'git log --oneline -10',
'ready', '{exec:system}'),

('cmd-db-backup', 'bash',
'mkdir -p backups
docker exec melquiades-db pg_dump -U melquiades melquiades > "backups/melquiades_$(date +%Y%m%d_%H%M%S).sql"
ls -la backups | tail -3',
'ready', '{exec:system,exec:confirm}'),

('board-stage', 'html', '<div class="board-ops">
  <header id="board-head">
    <span id="board-dot"></span>
    <h1>deploy board</h1>
    <span id="board-state">idle</span>
  </header>
  <div id="board-actions"></div>
  <pre id="board-out">— output appears here —</pre>
  <p id="board-foot">real commands · exec:system snippets via /api/exec · confirm gates owned by the parent app</p>
</div>', 'ready', '{}'),
('board-skin', 'css', 'body{margin:0;overflow:hidden;background:#0a0e14;font-family:''Segoe UI'',system-ui,sans-serif}
.board-ops{display:flex;flex-direction:column;height:100vh;box-sizing:border-box;padding:18px 22px;gap:14px}
#board-head{display:flex;align-items:center;gap:10px}
#board-dot{width:9px;height:9px;border-radius:50%;background:#2ea88f;box-shadow:0 0 8px #2ea88f}
#board-dot.busy{background:#d9a13a;box-shadow:0 0 8px #d9a13a}
#board-dot.err{background:#e05252;box-shadow:0 0 8px #e05252}
#board-head h1{margin:0;font-size:13px;font-weight:600;letter-spacing:.25em;text-transform:uppercase;color:#9fb8c9}
#board-state{margin-left:auto;font:11px ''Cascadia Code'',monospace;color:#5d7283}
#board-actions{display:flex;flex-wrap:wrap;gap:8px}
#board-actions button{background:#101824;border:1px solid #24364a;border-radius:6px;color:#9fc0d8;
  padding:8px 14px;cursor:pointer;font:12px ''Cascadia Code'',monospace;transition:border-color .2s}
#board-actions button:hover{border-color:#3a6a8a}
#board-actions button:disabled{opacity:.4;cursor:default}
#board-actions button.danger{border-color:#6b4a2a;color:#d9a13a}
#board-actions button.danger:hover{border-color:#a8702f}
#board-actions button.danger::after{content:'' ⚠'';font-size:10px}
#board-out{flex:1;margin:0;background:#070a0f;border:1px solid #1a2634;border-radius:6px;
  padding:12px 14px;overflow-y:auto;font:12px/1.7 ''Cascadia Code'',''Fira Code'',monospace;
  color:#7fa896;white-space:pre-wrap;word-break:break-all}
#board-foot{margin:0;font-size:10px;color:#41566b;letter-spacing:.12em;text-transform:uppercase;text-align:center}', 'ready', '{}'),
('board-logic', 'js', '// Each button names a stored snippet. The server refuses anything that
// lacks exec:system; the parent app owns the confirm dialog for anything
// gated with exec:confirm. This panel can ask — it cannot approve.
const CMDS = [
  { label: "docker ps",          name: "cmd-docker-ps" },
  { label: "snippet db status",  name: "cmd-db-status" },
  { label: "own git history",    name: "cmd-git-log" },
  { label: "backup snippet db",  name: "cmd-db-backup", danger: true },
]

const out = document.getElementById("board-out")
const dot = document.getElementById("board-dot")
const stateEl = document.getElementById("board-state")
const actions = document.getElementById("board-actions")
let runId = 0, busy = false

CMDS.forEach(cmd => {
  const b = document.createElement("button")
  b.textContent = cmd.label
  if (cmd.danger) b.className = "danger"
  b.onclick = () => {
    if (busy) return
    busy = true
    runId++
    out.textContent = ""
    dot.className = "busy"
    stateEl.textContent = "running " + cmd.name + "…"
    actions.querySelectorAll("button").forEach(x => x.disabled = true)
    parent.postMessage({ type: "shell", id: runId, name: cmd.name }, "*")
  }
  actions.appendChild(b)
})

function settle(ok, msg){
  busy = false
  dot.className = ok ? "" : "err"
  stateEl.textContent = msg
  actions.querySelectorAll("button").forEach(x => x.disabled = false)
}

window.addEventListener("message", e => {
  const m = e.data
  if (!m || m.id !== runId) return
  if (m.type === "shell-line"){
    out.textContent += m.line + "\n"
    out.scrollTop = out.scrollHeight
  }
  if (m.type === "shell-done") settle(true, "done · " + new Date().toLocaleTimeString())
  if (m.type === "shell-error"){
    out.textContent += "\n[" + m.error + "]"
    settle(false, "failed")
  }
})', 'ready', '{}'),

('deploy-board', 'chain', 'board-stage
board-skin
board-logic', 'ready', '{}')
ON CONFLICT (name) DO UPDATE
  SET body = EXCLUDED.body, language = EXCLUDED.language, capabilities = EXCLUDED.capabilities;

INSERT INTO tags (name) VALUES ('ops') ON CONFLICT DO NOTHING;
INSERT INTO snippet_tags (snippet_id, tag_id)
SELECT s.id, t.id FROM snippets s, tags t
WHERE t.name = 'ops' AND s.name IN
  ('cmd-docker-ps','cmd-db-status','cmd-git-log','cmd-db-backup',
   'board-stage','board-skin','board-logic','deploy-board')
ON CONFLICT DO NOTHING;
