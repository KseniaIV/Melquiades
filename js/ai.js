// ── AI actions: generate, decompose, mind map, reflection ────────

async function generate(mode = null) {
  const raw = $('body-prompt').value.trim()
  if (!raw) { appendLog('prompt is empty', 'error'); return }
  let { resolved: prompt, refs } = resolveContext(raw)
  if (refs.length) appendLog(`[generate] context: ${refs.map(r => '@' + r).join(', ')}`, 'action')
  const snippetText = $('body-snippet').value.trim()
  if (snippetText) {
    prompt += `\n\n[Current snippet: ${state.current}]\n${snippetText}`
    appendLog(`[generate] auto-context: snippet ${state.current}`, 'action')
  }
  const system = $('chk-code-only').checked
    ? 'You output ONLY raw code. No explanation, no comments, no markdown fences, no backticks. Start with the first line of code. Stop after the last line of code. Never add any text after the code.'
    : ''
  const src = state.current
  switchTab('snippet')
  const ta = $('body-snippet')
  state.prevSnippet = ta.value
  ta.value = ''
  appendLog('[generate] calling /api/ai/generate…', 'action')
  setChain([src, 'streaming…'])
  state.generating = true
  state.abortCtrl = new AbortController()
  $('btn-stop-gen').disabled = false

  let resp
  try {
    resp = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, system, character: 'Melquíades', mode: mode || 'chat' }),
      signal: state.abortCtrl.signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') appendLog('[generate] stopped', 'action')
    else appendLog(`[generate] fetch error: ${e.message}`, 'error')
    state.generating = false
    $('btn-stop-gen').disabled = true
    return
  }

  if (!resp.ok) {
    appendLog(`[generate] ${resp.status} ${resp.statusText}`, 'error')
    state.generating = false
    $('btn-stop-gen').disabled = true
    return
  }

  const reader = resp.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)
        if (payload === '[DONE]') { finishGenerate(src); return }
        try {
          const token = JSON.parse(payload)?.choices?.[0]?.delta?.content
          if (token) { ta.value += token; ta.scrollTop = ta.scrollHeight }
        } catch (_) {}
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') appendLog(`[generate] stream error: ${e.message}`, 'error')
    else appendLog('[generate] stopped', 'action')
    state.generating = false
    $('btn-stop-gen').disabled = true
    return
  }
  finishGenerate(src)
}

function stopGenerate() {
  state.abortCtrl?.abort()
  state.generating = false
  $('btn-stop-gen').disabled = true
  if (state.prevSnippet && !$('body-snippet').value.trim()) {
    $('body-snippet').value = state.prevSnippet
    appendLog('[generate] stopped · snippet restored', 'action')
  }
}

function stripFences(text) {
  const blocks = [...text.matchAll(/```(?:\w*)\n([\s\S]*?)```/g)].map(m => m[1].trim())
  return blocks.length ? blocks.join('\n\n') : text
}

function finishGenerate(src) {
  state.generating = false
  $('btn-stop-gen').disabled = true
  if ($('chk-code-only').checked && $('meta-lang').textContent !== 'prompt') {
    const stripped = stripFences($('body-snippet').value)
    $('body-snippet').value = stripped
    const t = stripped.trim()
    const lang = $('meta-lang').textContent
    if (lang === 'html' && (!t.startsWith('<') || !t.endsWith('>'))) {
      $('body-prompt').value = stripped
      $('body-snippet').value = state.prevSnippet || ''
      switchTab('prompt')
      appendLog('[generate] not HTML — routed back to prompt · snippet restored', 'action')
      setChain([src, 'not HTML ↩'])
      return
    }
  }
  state.generatedFrom = src
  $('gen-label').style.display = 'block'
  $('gen-from').textContent = src
  $('btn-suggest').style.display = 'block'
  appendLog('[generate] done', 'action')
  setChain([src, 'generated ✓'])
}

// ── Decompose ────────────────────────────────────────────────────

async function decompose() {
  const prompt = $('body-snippet').value.trim() || $('body-prompt').value.trim()
  if (!prompt) { appendLog('nothing to decompose', 'error'); return }
  appendLog('[decompose] calling /api/ai/decompose…', 'action')
  try {
    const resp = await fetch('/api/ai/decompose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    const { tasks } = await resp.json()
    streamToOutput(`Decompose →\n${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}`)
    appendLog(`[decompose] ${tasks.length} units identified`, 'action')
  } catch (e) {
    appendLog(`[decompose] error: ${e.message}`, 'error')
  }
}

// ── Mind map ─────────────────────────────────────────────────────

function buildMindMapHTML(data) {
  const d = JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>')
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;font-family:system-ui;overflow:hidden;user-select:none}
svg{display:block}
.edge{fill:none;stroke-width:2;opacity:.4}
.node{cursor:pointer}
.node:hover .pb{stroke-width:3}
.lbl{pointer-events:none;text-anchor:middle;dominant-baseline:central;font-weight:600;fill:#fff}
#tt{position:fixed;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:10px 14px;color:#c9d1d9;font-size:12px;max-width:260px;line-height:1.6;pointer-events:none;display:none;z-index:20;box-shadow:0 8px 24px #0008}
.tip-title{font-size:13px;font-weight:700;margin-bottom:4px}
</style></head><body>
<svg id="map" style="width:100vw;height:100vh"></svg>
<div id="tt"></div>
<script>
const DATA=${d}
const VW=1800,VH=1200,VCX=900,VCY=600,BR=460,LR=240
const svg=document.getElementById('map'),NS='http://www.w3.org/2000/svg',tt=document.getElementById('tt')
const el=(t,a)=>{const e=document.createElementNS(NS,t);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));return e}
svg.setAttribute('viewBox','0 0 '+VW+' '+VH)
svg.setAttribute('width',window.innerWidth)
svg.setAttribute('height',window.innerHeight)
const defs=el('defs',{})
defs.innerHTML='<filter id="gl"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#00000088"/></filter>'
svg.appendChild(defs)
const g=el('g',{id:'world'})
svg.appendChild(g)
const nodes=[{id:'root',kind:'root',label:DATA.root,x:VCX,y:VCY,color:'#58a6ff',tip:''}]
const edges=[]
const nb=DATA.branches.length
DATA.branches.forEach((b,bi)=>{
  const angle=bi*(2*Math.PI/nb)-Math.PI/2
  const bx=VCX+Math.cos(angle)*BR,by=VCY+Math.sin(angle)*BR
  nodes.push({id:b.id,kind:'branch',label:b.label,x:bx,y:by,color:b.color||'#79c0ff',tip:b.tip||''})
  edges.push({x1:VCX,y1:VCY,x2:bx,y2:by,color:b.color||'#79c0ff'})
  const nl=b.leaves.length
  b.leaves.forEach((lf,li)=>{
    const spread=Math.PI*.52
    const la=angle+(li-(nl-1)/2)*(spread/Math.max(nl-1,1))
    const lx=bx+Math.cos(la)*LR,ly=by+Math.sin(la)*LR
    nodes.push({id:lf.id,kind:'leaf',label:lf.label,x:lx,y:ly,color:b.color||'#79c0ff',tip:lf.tip||''})
    edges.push({x1:bx,y1:by,x2:lx,y2:ly,color:b.color||'#79c0ff'})
  })
})
edges.forEach(e=>{
  g.appendChild(el('path',{class:'edge',stroke:e.color,
    d:'M'+e.x1+','+e.y1+' C'+((e.x1+e.x2)/2)+','+e.y1+' '+((e.x1+e.x2)/2)+','+e.y2+' '+e.x2+','+e.y2}))
})
nodes.forEach(n=>{
  const ng=el('g',{class:'node',transform:'translate('+n.x+','+n.y+')'})
  if(n.kind==='root'){
    ng.appendChild(el('circle',{r:54,fill:n.color,stroke:'#ffffff33','stroke-width':2,filter:'url(#gl)'}))
    const t=el('text',{class:'lbl','font-size':20});t.textContent=n.label.slice(0,14);ng.appendChild(t)
  } else if(n.kind==='branch'){
    ng.appendChild(el('rect',{class:'pill',x:-92,y:-23,width:184,height:46,rx:23,fill:n.color+'22',filter:'url(#sh)'}))
    ng.appendChild(el('rect',{class:'pb',x:-92,y:-23,width:184,height:46,rx:23,fill:'none',stroke:n.color,'stroke-width':2}))
    const t=el('text',{class:'lbl','font-size':15});t.textContent=n.label.slice(0,20);ng.appendChild(t)
  } else {
    ng.appendChild(el('rect',{class:'pill',x:-88,y:-19,width:176,height:38,rx:9,fill:'#161b22',filter:'url(#sh)'}))
    ng.appendChild(el('rect',{class:'pb',x:-88,y:-19,width:176,height:38,rx:9,fill:'none',stroke:n.color+'99','stroke-width':1.5}))
    const t=el('text',{class:'lbl','font-size':12});t.textContent=n.label.slice(0,24);ng.appendChild(t)
  }
  ng.addEventListener('mouseenter',()=>{
    tt.innerHTML='<div class="tip-title" style="color:'+n.color+'">'+n.label+'</div>'+(n.tip||'').replace(/\\n/g,'<br>')
    tt.style.display='block'
  })
  ng.addEventListener('mousemove',e=>{
    tt.style.left=Math.min(e.clientX+16,window.innerWidth-280)+'px'
    tt.style.top=Math.min(e.clientY+16,window.innerHeight-120)+'px'
  })
  ng.addEventListener('mouseleave',()=>{tt.style.display='none'})
  g.appendChild(ng)
})
let zoom=Math.min(window.innerWidth/VW,window.innerHeight/VH),px=0,py=0,drag=false,lm={}
const applyT=()=>g.setAttribute('transform','translate('+px+','+py+') scale('+zoom+')')
applyT()
svg.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.min(4,Math.max(.15,zoom*(e.deltaY<0?1.1:.91)));applyT()},{passive:false})
svg.addEventListener('mousedown',e=>{drag=true;lm={x:e.clientX,y:e.clientY};svg.style.cursor='grabbing'})
window.addEventListener('mouseup',()=>{drag=false;svg.style.cursor='default'})
window.addEventListener('mousemove',e=>{
  if(!drag)return
  px+=(e.clientX-lm.x)/zoom*(VW/window.innerWidth)
  py+=(e.clientY-lm.y)/zoom*(VH/window.innerHeight)
  lm={x:e.clientX,y:e.clientY};applyT()
})
<\/script></body></html>`
}

// Structural mind map for JSON snippets — no model call needed.
function buildJSONMindMap(data, rootKey = 'JSON') {
  if (data === null || data === undefined) {
    appendLog('[mind-map] Data is null/undefined', 'error')
    return { root: rootKey, branches: [], leaves: [] }
  }

  const result = { branches: [], leaves: [] }

  function processNode(obj, key, path = '') {
    if (typeof obj === 'object' && obj !== null) {
      if (Array.isArray(obj)) {
        const branch = {
          id: `array_${path.replace(/\./g, '_')}`,
          label: `${key} [${obj.length}]`,
          color: '#79c0ff',
          tip: `Array with ${obj.length} items`,
          leaves: [],
        }
        obj.slice(0, 3).forEach((item, i) => {
          if (typeof item === 'object' && item !== null) {
            const nested = processNode(item, `Item ${i + 1}`, `${path}.${i}`)
            branch.leaves.push(...nested.branches.map(b => ({ ...b, id: b.id + '_leaf' })))
            branch.leaves.push(...nested.leaves)
          } else {
            branch.leaves.push({
              id: `leaf_${path.replace(/\./g, '_')}_${i}`,
              label: `Item ${i + 1}: ${String(item).substring(0, 15)}`,
              color: '#79c0ff',
              tip: `Value: ${String(item)}`,
            })
          }
        })
        result.branches.push(branch)
      } else {
        const entries = Object.entries(obj)
        const branch = {
          id: `obj_${path.replace(/\./g, '_')}`,
          label: `${key} (${entries.length})`,
          color: '#79c0ff',
          tip: `Object: ${entries.slice(0, 3).map(([k]) => k).join(', ')}${entries.length > 3 ? '…' : ''}`,
          leaves: [],
        }
        entries.forEach(([k, v]) => {
          if (typeof v === 'object' && v !== null) {
            if (Array.isArray(v)) {
              const nested = processNode(v, k, `${path}.${k}`)
              branch.leaves.push(...nested.branches.map(b => ({ ...b, id: b.id + '_leaf' })))
              branch.leaves.push(...nested.leaves)
            } else {
              branch.leaves.push({
                id: `leaf_${path.replace(/\./g, '_')}_${k}`,
                label: k,
                color: '#79c0ff',
                tip: `Nested object with ${Object.keys(v).length} properties`,
              })
            }
          } else {
            branch.leaves.push({
              id: `leaf_${path.replace(/\./g, '_')}_${k}`,
              label: `${k}: ${String(v).substring(0, 15)}`,
              color: '#79c0ff',
              tip: `Value: ${String(v)}`,
            })
          }
        })
        result.branches.push(branch)
      }
    } else {
      result.leaves.push({
        id: `value_${path.replace(/\./g, '_')}`,
        label: `${key}: ${String(obj).substring(0, 20)}`,
        color: '#79c0ff',
        tip: `Value: ${String(obj)}`,
      })
    }
    return result
  }

  const processed = processNode(data, rootKey)
  const branches = processed.branches.slice(0, 8)
  if (branches.length === 0) {
    branches.push({ id: 'single_value', label: 'Data', color: '#79c0ff', tip: 'Single data value', leaves: [] })
  }
  return { root: rootKey, branches, leaves: processed.leaves }
}

async function mindMap() {
  const code = $('body-snippet').value.trim()
  if (!code) { appendLog('no snippet to map', 'error'); return }

  const lang = $('meta-lang').textContent

  if (lang === 'json') {
    appendLog('[mind-map] parsing JSON structure…', 'action')
    try {
      const jsonData = JSON.parse(code)
      const mindMapData = buildJSONMindMap(jsonData, state.current || 'JSON')
      $('body-snippet').value = buildMindMapHTML(mindMapData)
      execute()
      appendLog(`[mind-map] JSON visualization · ${mindMapData.branches.length} branches`, 'action')
      setChain([state.current, 'json-mind-map ✓'])
    } catch (e) {
      appendLog(`[mind-map] JSON error: ${e.message}`, 'error')
    }
  } else {
    appendLog('[mind-map] asking model for relationships…', 'action')
    try {
      const resp = await fetch('/api/ai/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: code }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      if (!data.branches?.length) { appendLog('[mind-map] no branches returned', 'error'); return }
      $('body-snippet').value = buildMindMapHTML(data)
      execute()
      appendLog(`[mind-map] ${data.branches.length} branches · hover nodes for tips`, 'action')
      setChain([state.current, 'mind-map ✓'])
    } catch (e) {
      appendLog(`[mind-map] error: ${e.message}`, 'error')
    }
  }
}

// ── Sidebar actions: revise / explain / questions / reflection ───
// These compose a prompt from the current snippet and stream the
// result through generate(). Stop ■ restores the previous snippet.

function revise() {
  const sn = SNIPPETS[state.current]
  if (!sn) { appendLog('no snippet to revise', 'error'); return }
  appendLog('[revise] composing revision prompt…', 'action')
  $('body-prompt').value = `Please revise and improve this ${sn.lang} code:\n\n${snippetBody(sn)}`
  generate()
}

function explain() {
  const sn = SNIPPETS[state.current]
  if (!sn) { appendLog('no snippet to explain', 'error'); return }
  appendLog('[explain] composing explanation prompt…', 'action')
  $('body-prompt').value = `Please explain this ${sn.lang} code:\n\n${snippetBody(sn)}`
  generate()
}

function askQuestions() {
  const sn = SNIPPETS[state.current]
  if (!sn) { appendLog('no snippet selected', 'error'); return }
  appendLog('[questions] composing question prompt…', 'action')
  $('body-prompt').value = `What are the key questions I should ask about this ${sn.lang} code?\n\n${snippetBody(sn)}`
  generate()
}

function reflect() {
  const sn = SNIPPETS[state.current]
  if (!sn) { appendLog('no snippet to reflect on', 'error'); return }
  appendLog('[reflect] composing reflection prompt…', 'action')
  $('body-prompt').value = `Please reflect on this ${sn.lang} code: list failure modes, open questions, and suggested improvements.\n\n${snippetBody(sn)}`
  generate()
}

function clickChip(text) {
  $('body-prompt').value = text
  switchTab('prompt')
  appendLog(`[questions] prompt: "${text}"`, 'action')
}

function suggestNext() {
  const opts = [
    'add-error-handler — wrap exec calls in try/catch, show error in log',
    'status-poller — poll /api/status every 5s and append to log',
    'confirm-dialog — show confirmation before rollback/destructive actions',
  ]
  switchTab('run')
  appendLog(`[suggest] next: ${opts[Math.floor(Math.random() * opts.length)]}`, 'action')
}

async function debugCharacters() {
  appendLog('[AI] Debugging character selection…', 'action')
  try {
    const response = await fetch('/api/characters')
    const data = await response.json()
    appendLog(`[AI] Available characters: ${JSON.stringify(data.characters)}`, 'action')
    appendLog(`[AI] Active character: ${data.active}`, 'action')
  } catch (error) {
    appendLog(`[AI] Error debugging characters: ${error.message}`, 'error')
  }
}

// ── Chain auto-generation ────────────────────────────────────────
// Generates a missing chain member from its name plus the chain's
// existing snippets as context.

async function generateMissingSnippet(missingName, existingSnippets, source) {
  const language = missingName.split('-').pop().toLowerCase()

  const promptSnippets = existingSnippets.filter(name => SNIPPETS[name]?.lang === 'prompt')
  const codeSnippets = existingSnippets.filter(name => SNIPPETS[name] && SNIPPETS[name].lang !== 'prompt')

  let context = ''
  if (codeSnippets.length > 0) {
    context += '\n\nExisting code snippets in this chain:\n'
    codeSnippets.forEach(name => {
      context += `\n--- ${name} (${SNIPPETS[name].lang}) ---\n${snippetBody(SNIPPETS[name])}\n`
    })
  }

  let userPrompt = ''
  if (promptSnippets.length > 0) {
    userPrompt = snippetBody(SNIPPETS[promptSnippets[0]])
    appendLog(`[chain] Using prompt snippet: ${promptSnippets[0]}`, 'action')
  } else {
    userPrompt = `Generate a ${language} snippet that complements the existing code in this chain. The snippet should:

1. Be cohesive with the existing code
2. Follow the same naming/theme pattern (${source.split('-')[0]})
3. Be functional and complete
4. Include only the ${language} code (no explanations outside code blocks)
5. Be properly formatted and ready to execute`
    appendLog(`[chain] Using generic prompt for ${missingName}`, 'action')
  }

  const prompt = `I need you to generate a missing code snippet for a chain called "${source}".

Missing snippet name: ${missingName}
Language: ${language}

${context}

User Requirements:
${userPrompt}

Return only the ${language} code in a single code block.`

  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, character: 'Melquíades', mode: 'chat' }),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let generatedContent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value)
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue
      try {
        const data = JSON.parse(line.slice(6))
        const token = data?.choices?.[0]?.delta?.content
        if (token) generatedContent += token
      } catch (_) {}
    }
  }

  const codeMatch = generatedContent.match(/```(\w+)?\n([\s\S]*?)\n```/)
  if (codeMatch) {
    const code = codeMatch[2].trim()
    const detectedLang = codeMatch[1] || language
    return {
      name: missingName,
      lang: detectedLang,
      tags: ['generated', source.split('-')[0], detectedLang],
      body: () => code,
    }
  }
  return {
    name: missingName,
    lang: language,
    tags: ['generated', source.split('-')[0], language],
    body: () => generatedContent.trim(),
  }
}
