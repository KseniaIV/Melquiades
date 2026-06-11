-- star-myths: star-notes, but the loaded model writes each constellation's
-- origin myth. Reuses stars-stage and stars-skin; only the mind is swapped.
-- The sandbox cannot reach the API directly (opaque origin, no CORS) —
-- it asks the parent over postMessage, and the parent's AI bridge attaches
-- the run tab's loaded code as context before consulting the model.

INSERT INTO snippets (name, language, body, status) VALUES
('myth-mind', 'js', 'const cv = document.getElementById("firmament"), cx = cv.getContext("2d")
let W, H
function fit(){ W = cv.width = innerWidth; H = cv.height = innerHeight }
fit(); addEventListener("resize", fit)

const stars = []
const SYL = ["vel","tra","nis","or","ka","lume","ce","dra","mon","ys","pha","el"]
function name(n){
  let s = "", seed = n*2654435761 % 4294967296
  for (let i = 0; i < 2 + n % 3; i++){ s += SYL[seed % SYL.length]; seed = (seed*48271) % 2147483647 }
  return s
}

const night = document.querySelector(".night")

// The myth panel — where the loaded model writes.
const myth = document.createElement("div")
myth.style.cssText = "position:absolute;bottom:18px;left:50%;transform:translateX(-50%);width:72%;font:italic 15px Georgia,serif;color:#cdb97a;text-align:center;line-height:1.7;text-shadow:0 1px 10px #000;min-height:3em"
night.appendChild(myth)

const btn = document.createElement("button")
btn.textContent = "\u2726 ask the sky for its myth"
btn.style.cssText = "position:absolute;top:56px;left:50%;transform:translateX(-50%);background:rgba(10,14,30,.6);border:1px solid #3a4a76;color:#9fb4dd;padding:6px 16px;border-radius:16px;cursor:pointer;font:12px Georgia,serif;letter-spacing:.18em"
night.appendChild(btn)

night.addEventListener("click", e => {
  stars.push({ x: e.clientX, y: e.clientY, tw: Math.random()*6, born: performance.now() })
  if (stars.length >= 3)
    document.getElementById("constellation-name").textContent = "constellation " + name(stars.length)
})

// Ask the parent app to consult the loaded model. The bridge appends
// the run tab''s loaded code as context (includeRunContext), so the
// model sees this very program when it writes the myth.
let reqId = 0
btn.addEventListener("click", e => {
  e.stopPropagation() // do not also place a star under the button
  if (stars.length < 3){ myth.textContent = "place at least three stars first\u2026"; return }
  const cname = document.getElementById("constellation-name").textContent
  myth.textContent = "\u2026"
  btn.disabled = true; btn.style.opacity = .4
  parent.postMessage({
    type: "ai", id: ++reqId, includeRunContext: true,
    system: "You are a quiet astronomer-poet. Reply with ONLY a two or three sentence origin myth for the constellation. No preamble, no explanation.",
    prompt: "The " + cname + " has just appeared: " + stars.length + " stars at " +
      stars.map(s => "(" + Math.round(s.x) + "," + Math.round(s.y) + ")").join(" ") +
      ". Write its origin myth."
  }, "*")
})

window.addEventListener("message", e => {
  const m = e.data
  if (!m || m.id !== reqId) return
  if (m.type === "ai-token") myth.textContent = m.text
  if (m.type === "ai-result"){ myth.textContent = m.text.trim() || "(the sky was silent)"; btn.disabled = false; btn.style.opacity = 1 }
  if (m.type === "ai-error"){ myth.textContent = "the sky is silent: " + m.error; btn.disabled = false; btn.style.opacity = 1 }
})

function tick(t){
  cx.clearRect(0,0,W,H)
  cx.strokeStyle = "rgba(140,165,220,0.35)"; cx.lineWidth = 1
  for (let i = 1; i < stars.length; i++){
    let best = 0, bd = Infinity
    for (let j = 0; j < i; j++){
      const d = (stars[i].x-stars[j].x)**2 + (stars[i].y-stars[j].y)**2
      if (d < bd){ bd = d; best = j }
    }
    const grow = Math.min(1, (t - stars[i].born)/900)
    cx.beginPath(); cx.moveTo(stars[i].x, stars[i].y)
    cx.lineTo(stars[i].x + (stars[best].x-stars[i].x)*grow,
              stars[i].y + (stars[best].y-stars[i].y)*grow)
    cx.stroke()
  }
  for (const s of stars){
    const glow = 2.2 + Math.sin(t/400 + s.tw)*0.9
    cx.fillStyle = "#fff"
    cx.shadowBlur = 12; cx.shadowColor = "#aac4ff"
    cx.beginPath(); cx.arc(s.x, s.y, glow, 0, 7); cx.fill()
    cx.shadowBlur = 0
  }
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)', 'ready'),
('star-myths', 'chain', 'stars-stage
stars-skin
myth-mind', 'ready')
ON CONFLICT (name) DO NOTHING;

INSERT INTO snippet_tags (snippet_id, tag_id)
SELECT s.id, t.id FROM snippets s, tags t
WHERE t.name = 'imagination' AND s.name IN ('myth-mind','star-myths')
ON CONFLICT DO NOTHING;
