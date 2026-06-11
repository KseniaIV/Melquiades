-- Three imagination chains: things Melquiades might have brought to Macondo.
-- macondo-rain : rain over Macondo, visited by yellow butterflies
-- orbit-clock  : the current time as a small solar system
-- star-notes   : click to place stars; they link into named constellations
-- Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO snippets (name, language, body, status) VALUES
('rain-stage', 'html', '<main class="macondo">
  <canvas id="sky"></canvas>
  <p class="caption">It rained in Macondo for four years, eleven months, and two days.</p>
</main>', 'ready'),

('rain-mood', 'css', 'body{margin:0;overflow:hidden;background:#0b0f1a}
.macondo{position:relative;width:100vw;height:100vh}
#sky{display:block;width:100%;height:100%}
.caption{position:absolute;bottom:18px;width:100%;text-align:center;margin:0;
  font:italic 15px Georgia,serif;color:#8fa3bf;letter-spacing:.06em;opacity:.85}', 'ready'),

('rain-life', 'js', 'const cv = document.getElementById("sky"), cx = cv.getContext("2d")
let W, H
function fit(){ W = cv.width = innerWidth; H = cv.height = innerHeight }
fit(); addEventListener("resize", fit)

const drops = Array.from({length: 220}, () => ({
  x: Math.random()*W, y: Math.random()*H,
  v: 4 + Math.random()*7, l: 8 + Math.random()*14
}))

// Mauricio Babilonia is always followed by yellow butterflies.
const flock = []
function butterfly(){
  flock.push({ x: -20, y: H*0.2 + Math.random()*H*0.5,
    t: Math.random()*6, v: 0.6 + Math.random()*0.8 })
}
setInterval(() => { if (flock.length < 5) butterfly() }, 4000)
butterfly()

function tick(){
  cx.fillStyle = "rgba(11,15,26,0.35)"; cx.fillRect(0,0,W,H)
  cx.strokeStyle = "rgba(140,170,210,0.5)"; cx.lineWidth = 1
  for (const d of drops){
    cx.beginPath(); cx.moveTo(d.x, d.y); cx.lineTo(d.x-1, d.y+d.l); cx.stroke()
    d.y += d.v; d.x -= 0.4
    if (d.y > H){ d.y = -d.l; d.x = Math.random()*W }
  }
  for (let i = flock.length-1; i >= 0; i--){
    const b = flock[i]; b.t += 0.12; b.x += b.v; b.y += Math.sin(b.t)*1.6
    const flap = Math.abs(Math.sin(b.t*2.2))*5 + 2
    cx.fillStyle = "#e8c43a"
    cx.beginPath(); cx.ellipse(b.x-3, b.y, flap, 3.2, -0.5, 0, 7); cx.fill()
    cx.beginPath(); cx.ellipse(b.x+3, b.y, flap, 3.2,  0.5, 0, 7); cx.fill()
    if (b.x > W+20) flock.splice(i,1)
  }
  requestAnimationFrame(tick)
}
tick()', 'ready'),

('macondo-rain', 'chain', 'rain-stage
rain-mood
rain-life', 'ready'),

('clock-stage', 'html', '<div class="cosmos">
  <canvas id="orbits"></canvas>
  <div id="readout">--:--:--</div>
</div>', 'ready'),

('clock-skin', 'css', 'body{margin:0;overflow:hidden;background:radial-gradient(ellipse at center,#101426 0%,#070910 70%)}
.cosmos{position:relative;width:100vw;height:100vh}
#orbits{display:block;width:100%;height:100%}
#readout{position:absolute;top:20px;left:0;right:0;text-align:center;
  font:600 13px "Cascadia Code",monospace;color:#58a6ff;letter-spacing:.4em;opacity:.7}', 'ready'),

('clock-motion', 'js', 'const cv = document.getElementById("orbits"), cx = cv.getContext("2d")
let W, H, R
function fit(){ W = cv.width = innerWidth; H = cv.height = innerHeight; R = Math.min(W,H)*0.36 }
fit(); addEventListener("resize", fit)

// Time as a tiny solar system: hours, minutes, seconds are planets.
const planets = [
  { r: 1.00, size: 10, color: "#7c83ff", period: 43200 },  // hours
  { r: 0.66, size: 7,  color: "#3fb950", period: 3600  },  // minutes
  { r: 0.36, size: 4,  color: "#e8c43a", period: 60    },  // seconds
]
const trails = planets.map(() => [])

function tick(){
  cx.fillStyle = "rgba(7,9,16,0.28)"; cx.fillRect(0,0,W,H)
  const c = { x: W/2, y: H/2 }
  cx.fillStyle = "#ffd27d"
  cx.shadowBlur = 26; cx.shadowColor = "#ffb347"
  cx.beginPath(); cx.arc(c.x, c.y, 13, 0, 7); cx.fill()
  cx.shadowBlur = 0

  const now = new Date()
  const secs = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds() + now.getMilliseconds()/1000

  planets.forEach((p, i) => {
    cx.strokeStyle = "rgba(120,140,180,0.14)"
    cx.beginPath(); cx.arc(c.x, c.y, R*p.r, 0, 7); cx.stroke()
    const a = (secs % p.period) / p.period * Math.PI*2 - Math.PI/2
    const x = c.x + Math.cos(a)*R*p.r, y = c.y + Math.sin(a)*R*p.r
    const tr = trails[i]; tr.push({x,y}); if (tr.length > 40) tr.shift()
    tr.forEach((t, j) => {
      cx.fillStyle = p.color + Math.floor(j/tr.length*99).toString().padStart(2,"0")
      cx.beginPath(); cx.arc(t.x, t.y, p.size*j/tr.length*0.5, 0, 7); cx.fill()
    })
    cx.fillStyle = p.color
    cx.beginPath(); cx.arc(x, y, p.size, 0, 7); cx.fill()
  })

  document.getElementById("readout").textContent = now.toTimeString().slice(0,8)
  requestAnimationFrame(tick)
}
tick()', 'ready'),

('orbit-clock', 'chain', 'clock-stage
clock-skin
clock-motion', 'ready'),

('stars-stage', 'html', '<div class="night">
  <canvas id="firmament"></canvas>
  <div id="constellation-name">click the sky to place stars</div>
</div>', 'ready'),

('stars-skin', 'css', 'body{margin:0;overflow:hidden;background:linear-gradient(#05060d,#0b1022 80%,#141a33)}
.night{position:relative;width:100vw;height:100vh;cursor:crosshair}
#firmament{display:block;width:100%;height:100%}
#constellation-name{position:absolute;top:22px;left:0;right:0;text-align:center;
  font:300 18px Georgia,serif;color:#9fb4dd;letter-spacing:.25em;text-transform:capitalize;opacity:.9}', 'ready'),

('stars-mind', 'js', 'const cv = document.getElementById("firmament"), cx = cv.getContext("2d")
let W, H
function fit(){ W = cv.width = innerWidth; H = cv.height = innerHeight }
fit(); addEventListener("resize", fit)

// Every idea is a star; place enough of them and they earn a name.
const stars = []
const SYL = ["vel","tra","nis","or","ka","lume","ce","dra","mon","ys","pha","el"]
function name(n){
  let s = "", seed = n*2654435761 % 4294967296
  for (let i = 0; i < 2 + n % 3; i++){ s += SYL[seed % SYL.length]; seed = (seed*48271) % 2147483647 }
  return s
}

cv.parentNode.addEventListener("click", e => {
  stars.push({ x: e.clientX, y: e.clientY, tw: Math.random()*6, born: performance.now() })
  if (stars.length >= 3)
    document.getElementById("constellation-name").textContent = "constellation " + name(stars.length)
})

function tick(t){
  cx.clearRect(0,0,W,H)
  // each star reaches toward its nearest elder — notes becoming knowledge
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

('star-notes', 'chain', 'stars-stage
stars-skin
stars-mind', 'ready')
ON CONFLICT (name) DO NOTHING;

INSERT INTO tags (name) VALUES ('imagination') ON CONFLICT DO NOTHING;

INSERT INTO snippet_tags (snippet_id, tag_id)
SELECT s.id, t.id FROM snippets s, tags t
WHERE t.name = 'imagination' AND s.name IN
  ('rain-stage','rain-mood','rain-life','macondo-rain',
   'clock-stage','clock-skin','clock-motion','orbit-clock',
   'stars-stage','stars-skin','stars-mind','star-notes')
ON CONFLICT DO NOTHING;
