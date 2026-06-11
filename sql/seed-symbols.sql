-- symbol-atlas: draw a symbol point by point; the loaded model reads it
-- and offers a short interpretive paragraph on its resemblances and the
-- history of symbols like it. Output is explicitly labeled as the model's
-- interpretation, not established lore — nothing here pretends to be a
-- real constellation or a real tradition.

INSERT INTO snippets (name, language, body, status) VALUES
('symbol-stage', 'html', '<div class="atlas">
  <canvas id="vellum"></canvas>
  <div id="atlas-hint">click to place points \u2014 close the shape by clicking near your first point</div>
  <div id="atlas-bar">
    <input id="symbol-label" placeholder="call it\u2026 (optional)" spellcheck="false">
    <button id="read-symbol">read this symbol</button>
  </div>
  <p id="symbol-note"></p>
  <p id="atlas-credit">interpretation by the local model \u2014 not established lore</p>
</div>', 'ready'),
('symbol-skin', 'css', 'body{margin:0;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#161320 0%,#0b0a12 75%)}
.atlas{position:relative;width:100vw;height:100vh}
#vellum{display:block;width:100%;height:100%;cursor:crosshair}
#atlas-hint{position:absolute;top:20px;left:0;right:0;text-align:center;
  font:300 13px Georgia,serif;color:#9a8db5;letter-spacing:.12em;opacity:.85}
#atlas-bar{position:absolute;top:48px;left:50%;transform:translateX(-50%);display:flex;gap:8px}
#symbol-label{background:rgba(20,16,34,.7);border:1px solid #463d63;border-radius:14px;
  color:#cfc4e8;padding:6px 14px;font:12px Georgia,serif;outline:none;width:170px;text-align:center}
#read-symbol{background:rgba(20,16,34,.7);border:1px solid #6b5a35;border-radius:14px;
  color:#d9b96a;padding:6px 16px;cursor:pointer;font:12px Georgia,serif;letter-spacing:.14em}
#read-symbol:disabled{opacity:.4}
#symbol-note{position:absolute;bottom:44px;left:50%;transform:translateX(-50%);width:70%;
  font:italic 15px Georgia,serif;color:#d9c89a;text-align:center;line-height:1.7;
  text-shadow:0 1px 10px #000;min-height:3em;margin:0}
#atlas-credit{position:absolute;bottom:14px;left:0;right:0;text-align:center;margin:0;
  font:10px Georgia,serif;color:#6a5f85;letter-spacing:.2em;text-transform:uppercase}', 'ready'),
('symbol-mind', 'js', 'const cv = document.getElementById("vellum"), cx = cv.getContext("2d")
let W, H
function fit(){ W = cv.width = innerWidth; H = cv.height = innerHeight }
fit(); addEventListener("resize", fit)

// Draw a symbol: each point connects to the previous; clicking near the
// first point closes the figure.
const pts = []
let closed = false

cv.addEventListener("click", e => {
  if (closed) return
  if (pts.length > 2){
    const d = Math.hypot(e.clientX - pts[0].x, e.clientY - pts[0].y)
    if (d < 16){ closed = true; return }
  }
  pts.push({ x: e.clientX, y: e.clientY, tw: Math.random()*6 })
})

// Geometry the model can reason about without seeing the canvas.
function describe(){
  const xs = pts.map(p=>p.x), ys = pts.map(p=>p.y)
  const w = Math.max(...xs)-Math.min(...xs), h = Math.max(...ys)-Math.min(...ys)
  const ratio = (w/Math.max(h,1)).toFixed(2)
  let turns = 0
  for (let i = 2; i < pts.length; i++){
    const a1 = Math.atan2(pts[i-1].y-pts[i-2].y, pts[i-1].x-pts[i-2].x)
    const a2 = Math.atan2(pts[i].y-pts[i-1].y, pts[i].x-pts[i-1].x)
    let da = a2-a1; while (da > Math.PI) da -= 2*Math.PI; while (da < -Math.PI) da += 2*Math.PI
    if (Math.abs(da) > 0.6) turns++
  }
  return pts.length + " points, " + (closed ? "closed figure" : "open line") +
    ", width/height ratio " + ratio + ", " + turns + " sharp turns"
}

const note = document.getElementById("symbol-note")
const btn = document.getElementById("read-symbol")
const label = document.getElementById("symbol-label")
let reqId = 0

btn.addEventListener("click", () => {
  if (pts.length < 3){ note.textContent = "give it at least three points first\u2026"; return }
  note.textContent = "\u2026"
  btn.disabled = true
  const named = label.value.trim()
  parent.postMessage({
    type: "ai", id: ++reqId,
    system: "You are a thoughtful historian of symbols and iconography. In one short paragraph (3-4 sentences), say what the described symbol most resembles and sketch the cultural history of symbols like it. Plain, warm prose. No lists, no preamble.",
    prompt: "Someone hand-drew a symbol: " + describe() + "." +
      (named ? " They call it \"" + named + "\"." : "") +
      " What does it resemble, and what is the history of such symbols?"
  }, "*")
})

window.addEventListener("message", e => {
  const m = e.data
  if (!m || m.id !== reqId) return
  if (m.type === "ai-token") note.textContent = m.text
  if (m.type === "ai-result"){ note.textContent = m.text.trim() || "(no reading)"; btn.disabled = false }
  if (m.type === "ai-error"){ note.textContent = "the model is unreachable: " + m.error; btn.disabled = false }
})

function tick(t){
  cx.clearRect(0,0,W,H)
  if (pts.length > 1){
    cx.strokeStyle = "rgba(217,185,106,0.55)"; cx.lineWidth = 1.6
    cx.beginPath(); cx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) cx.lineTo(pts[i].x, pts[i].y)
    if (closed) cx.closePath()
    cx.stroke()
    if (closed){ cx.fillStyle = "rgba(217,185,106,0.06)"; cx.fill() }
  }
  for (let i = 0; i < pts.length; i++){
    const p = pts[i]
    const glow = 2.4 + Math.sin(t/420 + p.tw)*0.8
    cx.fillStyle = i === 0 && !closed && pts.length > 2 ? "#e8d9a8" : "#fff"
    cx.shadowBlur = 11; cx.shadowColor = "#d9b96a"
    cx.beginPath(); cx.arc(p.x, p.y, glow, 0, 7); cx.fill()
    cx.shadowBlur = 0
  }
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)', 'ready'),
('symbol-atlas', 'chain', 'symbol-stage
symbol-skin
symbol-mind', 'ready')
ON CONFLICT (name) DO NOTHING;

INSERT INTO snippet_tags (snippet_id, tag_id)
SELECT s.id, t.id FROM snippets s, tags t
WHERE t.name = 'imagination'
  AND s.name IN ('symbol-stage','symbol-skin','symbol-mind','symbol-atlas')
ON CONFLICT DO NOTHING;
