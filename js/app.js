
// Utility functions
const $ = (id) => document.getElementById(id)

const SNIPPETS = {}

const MOCK = {
  'k8s-status':      ['3 pods running','deployment/api   ✓ ready (1/1)','deployment/worker ✓ ready (2/2)'],
  'mock-deploy-dev': ['pulling image v1.4.2…','image ready','rolling out to dev…','rollout complete ✓'],
  'mock-rollback':   ['finding previous revision…','restoring v1.4.1','rollback complete ✓'],
  'git-push-dry':    ['dry-run: checking remote…','dry-run: 2 commits ahead of origin/main','dry-run: push ok (nothing sent)'],
}

const state = { current:null, currentId:null, registered:{}, generatedFrom:null, generating:false, abortCtrl:null, lastHtml:'' }
const srcdoc = html => `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${html}</body></html>`

function buildList() {
  const picker = $('ctx-picker')
  if (picker) {
    picker.innerHTML = '<option value="">@ insert snippet…</option>'
    Object.keys(SNIPPETS).forEach(name => {
      const o = document.createElement('option'); o.value = name; o.textContent = name
      picker.appendChild(o)
    })
  }
  const el = $('snip-list')
  el.innerHTML = ''
  
  // Get tag filter value
  const tagFilter = $('tag-filter').value.trim().toLowerCase()
  const filterTags = tagFilter ? tagFilter.split(',').map(t => t.trim()).filter(Boolean) : []
  
  Object.keys(SNIPPETS).forEach(name => {
    // Skip if snippet is undefined
    if (!SNIPPETS[name]) return
    
    // Apply tag filter
    if (filterTags.length > 0) {
      const snippetTags = (SNIPPETS[name].tags || []).map(t => t.toLowerCase())
      const hasMatchingTag = filterTags.some(filterTag => 
        snippetTags.some(snippetTag => snippetTag.includes(filterTag))
      )
      if (!hasMatchingTag) {
        return // Skip this snippet
      }
    }
    
    const d = document.createElement('div')
    d.className = 'snip-item'; d.id = `item-${name}`
    d.dataset.snippet = name
    d.innerHTML = `
      <input type="checkbox" class="snippet-checkbox" data-snippet="${name}" onchange="updateMultiSelect()" style="margin-right: 8px;">
      <span class="snip-name">${name}</span>
      <span class="snip-lang">${SNIPPETS[name].lang}</span>
    `
    d.onclick = (e) => {
      if (e.target.type !== 'checkbox') {
        selectSnippet(name)
      }
    }
    el.appendChild(d)
  })
  updateMultiSelect()
  
  // Update UI for currently selected snippet
  if (state.current && SNIPPETS[state.current]) {
    // Update tags panel
    updateTagsPanel(SNIPPETS[state.current].tags || [])
    
    // Update mindmap button for JSON snippets
    const btnMindmap = $('btn-mindmap')
    if (SNIPPETS[state.current].lang === 'json') {
      btnMindmap.textContent = '📊 JSON Mind map'
      btnMindmap.style.color = '#79c0ff'
      btnMindmap.style.borderColor = '#79c0ff'
    } else {
      btnMindmap.textContent = 'Mind map'
      btnMindmap.style.color = ''
      btnMindmap.style.borderColor = ''
    }
    
    SNIPPETS[state.current].lang === 'prompt' ? switchTab('prompt') : switchTab('snippet')
    setChain([state.current])
  }
}

function updateTagsPanel(tags) {
  const panel = $('snippet-tags')
  if (!tags || tags.length === 0) {
    panel.innerHTML = '<span style="font-size: 11px; color: var(--muted);">No tags</span>'
  } else {
    panel.innerHTML = tags.map(tag => 
      `<span style="font-size: 10px; color: var(--accent); background: var(--bg3); border: 1px solid var(--border); padding: 2px 6px; border-radius: 3px;">${tag}</span>`
    ).join('')
  }
}

function updateRegistry() {
  const bar = $('registry-bar')
  const names = Object.keys(state.registered)
  if (names.length) {
    bar.innerHTML = names.map(name => `<span class="reg-pill">${name}</span>`).join('')
    $('registry-empty').style.display = 'none'
  } else {
    bar.innerHTML = ''
    $('registry-empty').style.display = 'inline'
  }
}

function switchTab(t) {
  ['prompt','snippet','run'].forEach(id => {
    $(`tab-${id}`).classList.toggle('active', id === t)
    $(`screen-${id}`).classList.toggle('active', id === t)
  })
}

function setChain(steps) {
  $('chain').innerHTML = steps.map((s,i) =>
    i < steps.length-1 ? `<span class="done">${s}</span> → ` : `<span>${s}</span>`
  ).join('')
}

function resolveContext(text) {
  const refs = []
  const resolved = text.replace(/@([\.\w-]+)/g, (match, name) => {
    const sn = SNIPPETS[name]
    if (!sn) return match
    refs.push(name)
    return `\n\n[Context: ${name}]\n${sn.body()}\n`
  })
  return { resolved, refs }
}

function insertCtx(sel) {
  const name = sel.value; sel.value = ''
  if (!name) return
  const ta = $('body-prompt')
  const pos = ta.selectionStart
  const val = ta.value
  const ins = (pos > 0 && val[pos-1] !== ' ' && val[pos-1] !== '\n') ? ` @${name}` : `@${name}`
  ta.value = val.slice(0, pos) + ins + val.slice(pos)
  ta.selectionStart = ta.selectionEnd = pos + ins.length
  ta.focus()
}

async function generate() {
  const raw = $('body-prompt').value.trim()
  if (!raw) { appendLog('prompt is empty','error'); return }
  let { resolved: prompt, refs } = resolveContext(raw)
  if (refs.length) appendLog(`[generate] context: ${refs.map(r=>'@'+r).join(', ')}`,'action')
  const snippetBody = $('body-snippet').value.trim()
  if (snippetBody) {
    prompt += `\n\n[Current snippet: ${state.current}]\n${snippetBody}`
    appendLog(`[generate] auto-context: snippet ${state.current}`,'action')
  }
  const system = $('chk-code-only').checked
    ? 'You output ONLY raw code. No explanation, no comments, no markdown fences, no backticks. Start with the first line of code. Stop after the last line of code. Never add any text after the code.'
    : ''
  const src = state.current
  switchTab('snippet')
  const ta = $('body-snippet')
  state.prevSnippet = ta.value
  ta.value = ''
  appendLog('[generate] calling /api/ai/generate…','action')
  setChain([src, 'streaming…'])
  state.generating = true; state.abortCtrl = new AbortController()
  $('btn-stop-gen').disabled = false

  let resp
  try {
    resp = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({prompt, system, character: 'Melquíades'}),
      signal: state.abortCtrl.signal
    })
  } catch (e) {
    if (e.name === 'AbortError') { appendLog('[generate] stopped','action') }
    else { appendLog(`[generate] fetch error: ${e.message}`,'error') }
    state.generating = false; $('btn-stop-gen').disabled = true; return
  }

  if (!resp.ok) { appendLog(`[generate] ${resp.status} ${resp.statusText}`,'error'); state.generating = false; $('btn-stop-gen').disabled = true; return }

  const reader = resp.body.getReader(), dec = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      buf += dec.decode(value, {stream: true})
      const lines = buf.split('\n'); buf = lines.pop()
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
    if (e.name !== 'AbortError') appendLog(`[generate] stream error: ${e.message}`,'error')
    else appendLog('[generate] stopped','action')
    state.generating = false; $('btn-stop-gen').disabled = true; return
  }
  finishGenerate(src)
}

function stopGenerate() {
  state.abortCtrl?.abort()
  state.generating = false
  $('btn-stop-gen').disabled = true
  if (state.prevSnippet && !$('body-snippet').value.trim()) {
    $('body-snippet').value = state.prevSnippet
    appendLog('[generate] stopped · snippet restored','action')
  }
}

function stripFences(text) {
  const blocks = [...text.matchAll(/```(?:\w*)\n([\s\S]*?)```/g)].map(m => m[1].trim())
  return blocks.length ? blocks.join('\n\n') : text
}

function finishGenerate(src) {
  state.generating = false; $('btn-stop-gen').disabled = true
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
  $('gen-label').style.display   = 'block'; $('gen-from').textContent = src
  $('btn-suggest').style.display = 'block'
  appendLog('[generate] done','action')
  setChain([src, 'generated ✓'])
}

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

function buildJSONMindMap(data, rootKey = "JSON") {
  appendLog(`[mind-map] Processing JSON: ${typeof data}, keys: ${Object.keys(data || {}).join(', ')}`,'action')
  
  // Handle edge cases
  if (data === null || data === undefined) {
    appendLog(`[mind-map] Data is null/undefined`,'error')
    return {
      root: rootKey,
      branches: [],
      leaves: []
    }
  }
  
  const result = {
    branches: [],
    leaves: []
  }
  
  function processNode(obj, key, path = "") {
    const currentPath = path ? `${path}.${key}` : key
    
    if (typeof obj === 'object' && obj !== null) {
      if (Array.isArray(obj)) {
        // Array handling
        const branch = {
          id: `array_${path.replace(/\./g, '_')}`,
          label: `${key} [${obj.length}]`,
          color: '#79c0ff',
          tip: `Array with ${obj.length} items`,
          leaves: []
        }
        
        // Process array items
        obj.slice(0, 3).forEach((item, i) => {
          if (typeof item === 'object' && item !== null) {
            const nested = processNode(item, `Item ${i + 1}`, `${path}.${i}`)
            branch.leaves.push(...nested.branches.map(b => ({...b, id: b.id + '_leaf'})))
            branch.leaves.push(...nested.leaves)
          } else {
            branch.leaves.push({
              id: `leaf_${path.replace(/\./g, '_')}_${i}`,
              label: `Item ${i + 1}: ${String(item).substring(0, 15)}`,
              color: '#79c0ff',
              tip: `Value: ${String(item)}`
            })
          }
        })
        
        result.branches.push(branch)
      } else {
        // Object handling
        const entries = Object.entries(obj)
        const branch = {
          id: `obj_${path.replace(/\./g, '_')}`,
          label: `${key} (${entries.length})`,
          color: '#79c0ff',
          tip: `Object: ${entries.slice(0, 3).map(([k]) => k).join(', ')}${entries.length > 3 ? '...' : ''}`,
          leaves: []
        }
        
        // Process object properties
        entries.forEach(([k, v]) => {
          if (typeof v === 'object' && v !== null) {
            if (Array.isArray(v)) {
              const nested = processNode(v, k, `${path}.${k}`)
              branch.leaves.push(...nested.branches.map(b => ({...b, id: b.id + '_leaf'})))
              branch.leaves.push(...nested.leaves)
            } else {
              // Nested object - create a leaf for it
              branch.leaves.push({
                id: `leaf_${path.replace(/\./g, '_')}_${k}`,
                label: k,
                color: '#79c0ff',
                tip: `Nested object with ${Object.keys(v).length} properties`
              })
            }
          } else {
            // Primitive value
            branch.leaves.push({
              id: `leaf_${path.replace(/\./g, '_')}_${k}`,
              label: `${k}: ${String(v).substring(0, 15)}`,
              color: '#79c0ff',
              tip: `Value: ${String(v)}`
            })
          }
        })
        
        result.branches.push(branch)
      }
    } else {
      // Primitive value at root level
      result.leaves.push({
        id: `value_${path.replace(/\./g, '_')}`,
        label: `${key}: ${String(obj).substring(0, 20)}`,
        color: '#79c0ff',
        tip: `Value: ${String(obj)}`
      })
    }
    
    return result
  }
  
  const processed = processNode(data, rootKey)
  const branches = processed.branches.slice(0, 8) // Limit to 8 main branches
  
  // Ensure we have at least one branch
  if (branches.length === 0) {
    branches.push({
      id: 'single_value',
      label: 'Data',
      color: '#79c0ff',
      tip: 'Single data value',
      leaves: []
    })
  }
  
  appendLog(`[mind-map] Generated ${branches.length} branches, ${processed.leaves.length} leaves`,'action')
  
  return {
    root: rootKey,
    branches: branches,
    leaves: processed.leaves
  }
}

async function mindMap() {
  const code = $('body-snippet').value.trim()
  if (!code) { appendLog('no snippet to map','error'); return }
  
  const lang = $('meta-lang').textContent
  
  if (lang === 'json') {
    // Handle JSON directly without AI
    appendLog('[mind-map] parsing JSON structure…','action')
    try {
      appendLog(`[mind-map] JSON length: ${code.length} chars`,'action')
      const jsonData = JSON.parse(code)
      appendLog(`[mind-map] JSON parsed successfully, type: ${typeof jsonData}`,'action')
      const mindMapData = buildJSONMindMap(jsonData, state.current || 'JSON')
      appendLog(`[mind-map] Mindmap created, branches: ${mindMapData.branches.length}`,'action')
      
      const html = buildMindMapHTML(mindMapData)
      $('body-snippet').value = html
      execute()
      appendLog(`[mind-map] JSON visualization · ${mindMapData.branches.length} branches`,'action')
      setChain([state.current, 'json-mind-map ✓'])
    } catch(e) { 
      appendLog(`[mind-map] JSON error: ${e.message}`,'error')
      appendLog(`[mind-map] Debug - First 100 chars: ${code.substring(0, 100)}`,'action')
    }
  } else {
    // Use AI for other languages
    appendLog('[mind-map] asking model for relationships…','action')
    try {
      const resp = await fetch('/api/ai/mindmap', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({prompt: code})
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      if (!data.branches?.length) { appendLog('[mind-map] no branches returned','error'); return }
      const html = buildMindMapHTML(data)
      $('body-snippet').value = html
      execute()
      appendLog(`[mind-map] ${data.branches.length} branches · hover nodes for tips`,'action')
      setChain([state.current, 'mind-map ✓'])
    } catch(e) { appendLog(`[mind-map] error: ${e.message}`,'error') }
  }
}

function stop() {
  requestAnimationFrame(() => {
    const sandbox = $('sandbox')
    sandbox.srcdoc = '<!DOCTYPE html><html><body></body></html>'
    state.lastHtml = ''
    appendLog('[stop] sandbox cleared','action')
  })
}

function injectIntoHtml(base, tag, code) {
  if (tag === 'css') {
    const style = `<style>\n${code}\n</style>`
    const hi = base.lastIndexOf('</head>')
    if (hi !== -1) return base.slice(0, hi) + style + base.slice(hi)
    const bi = base.lastIndexOf('<body')
    if (bi !== -1) return base.slice(0, bi) + style + base.slice(bi)
    return style + base
  }
  if (tag === 'js') {
    const script = `<script>\n${code}\n<\/script>`
    const i = base.lastIndexOf('</body>')
    if (i !== -1) return base.slice(0, i) + script + base.slice(i)
    return base + script
  }
  return base
}

function runCode(code, lang, name) {
  // Use requestAnimationFrame to prevent blocking
  requestAnimationFrame(() => {
    const isFullDoc = code.trimStart().toLowerCase().startsWith('<!doctype') || code.trimStart().toLowerCase().startsWith('<html')
    const sandbox = $('sandbox')
    
    if (lang === 'css') {
      if (state.lastHtml) {
        state.lastHtml = injectIntoHtml(state.lastHtml, 'css', code)
        sandbox.srcdoc = state.lastHtml
        appendLog(`[execute] ${name} — CSS injected`,'action')
      } else {
        const demo = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>\n${code}\n</style></head><body><h1>Heading</h1><h2>Subheading</h2><p>Paragraph text. <a href="#">A link</a>.</p><ul><li>Item one</li><li>Item two</li></ul><button>Button</button><input placeholder="Input"></body></html>`
        state.lastHtml = demo; sandbox.srcdoc = demo
        appendLog(`[execute] ${name} — CSS preview`,'action')
      }
    } else if (lang === 'js') {
      // Ensure JavaScript is always wrapped in proper script tags
      let jsHtml
      if (state.lastHtml) {
        state.lastHtml = injectIntoHtml(state.lastHtml, 'js', code)
        jsHtml = state.lastHtml
      } else {
        // For standalone JS, create a proper HTML document with script tags
        jsHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><div id="widget"></div><script>\ntry {\n${code}\n} catch(e) {\n  console.error('JS Error:', e);\n  document.body.innerHTML += '<div style="color:red;padding:10px;border:1px solid red;margin:10px;">JS Error: ' + e.message + '</div>';\n}\n<\/script></body></html>`
        state.lastHtml = jsHtml
      }
      sandbox.srcdoc = jsHtml
      appendLog(`[execute] ${name} — JS executed`,'action')
    } else if (lang === 'mermaid') {
      // Auto-wrap mermaid code in HTML for execution
      var mermaidHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script><style>body{padding:20px;background:#f5f5f5}.mermaid{background:white;padding:20px;border-radius:8px}<\/style><\/head><body><div class="mermaid">' + code + '<\/div><script>mermaid.initialize({startOnLoad:true})<\/script><\/body><\/html>';
      state.lastHtml = mermaidHtml;
      sandbox.srcdoc = mermaidHtml;
      appendLog('[execute] ' + name + ' — Mermaid diagram rendered','action');
    } else {
      state.lastHtml = isFullDoc ? code : srcdoc(code)
      sandbox.srcdoc = state.lastHtml
      appendLog(`[execute] ${name} — done`,'action')
    }
  })
}

// Debounce execution to prevent rapid calls
let executeTimeout = null
function execute() {
  // Clear any pending execution
  if (executeTimeout) {
    clearTimeout(executeTimeout)
  }
  
  // Debounce execution with small delay
  executeTimeout = setTimeout(() => {
    const code = $('body-snippet').value.trim()
    if (!code) { appendLog('snippet is empty','error'); return }
    const lang = $('meta-lang').textContent
    if (lang === 'chain') {
      const names = code.split('\n').map(l => l.trim()).filter(Boolean)
      executeChain(names, state.current)
      return
    }
    switchTab('run')
    runCode(code, lang, state.current)
    const steps = state.generatedFrom ? [state.generatedFrom, state.current, 'execute'] : [state.current, 'execute']
    setChain(steps)
    executeTimeout = null
  }, 50) // 50ms debounce
}

async function executeChain(names, chainName) {
  switchTab('run')
  appendLog(`[chain] ${chainName}: ${names.join(' → ')}`,'action')
  for (const name of names) {
    const sn = SNIPPETS[name]
    if (!sn) { appendLog(`[chain] unknown snippet: ${name}`,'error'); continue }
    const code = sn.body ? sn.body() : (sn.code || '')
    runCode(code, sn.lang, name)
    await new Promise(r => setTimeout(r, 80))
  }
  setChain([chainName, ...names, '✓'])
  appendLog(`[chain] ${chainName} complete`,'action')
}

function register() {
  const name = state.current, code = $('body-snippet').value.trim()
  if (!name) return
  
  if (!state.registered[name]) {
    const pill = document.createElement('button')
    pill.className = 'reg-pill'; pill.textContent = name; pill.id = `pill-${name}`
    pill.onclick = () => runRegistered(name)
    $('registry-bar').appendChild(pill)
    $('registry-empty').style.display = 'none'
    const area = $('panels-area')
    area.querySelector('.empty-msg')?.remove()
    const card = document.createElement('div')
    card.className = 'panel-card'; card.id = `card-${name}`
    card.innerHTML = `<div class="panel-card-hdr"><span>${name}</span><span class="x" onclick="removePanel('${name}')">✕</span></div><iframe id="pframe-${name}" sandbox="allow-scripts"></iframe>`
    area.appendChild(card)
  }
  $(`pframe-${name}`).srcdoc = srcdoc(code)
  $(`dot-${name}`).classList.add('reg')
  state.registered[name] = code
  appendLog(`[register] ${name} registered as panel/tool`,'action')
  const steps = state.generatedFrom ? [state.generatedFrom, name, 'execute', 'register ✓'] : [name, 'execute', 'register ✓']
  setChain(steps)
}

function removePanel(name) {
  $(`card-${name}`)?.remove(); $(`pill-${name}`)?.remove()
  $(`dot-${name}`)?.classList.remove('reg'); delete state.registered[name]
  if (!Object.keys(state.registered).length) {
    $('registry-empty').style.display = ''
    $('panels-area').innerHTML = '<div class="empty-msg">Register a snippet to add it here as a live panel.</div>'
  }
  appendLog(`[register] ${name} removed`,'action')
}

function runRegistered(name) {
  switchTab('run'); appendLog(`[deploy-panel] triggered: ${name}`,'action')
  const lines = MOCK[name] ?? [`${name}: no mock action defined`]
  lines.forEach((l,i) => setTimeout(() => appendLog(`[${name}] ${l}`,'output'), i*320))
}

function appendLog(msg, cls='') {
  const el = $('log'), line = document.createElement('div')
  line.className = `log-line ${cls}`
  line.textContent = `${new Date().toLocaleTimeString('en',{hour12:false})}  ${msg}`
  el.appendChild(line); el.scrollTop = el.scrollHeight
}

function suggestNext() {
  const opts = [
    'add-error-handler — wrap exec calls in try/catch, show error in log',
    'status-poller — poll /api/status every 5s and append to log',
    'confirm-dialog — show confirmation before rollback/destructive actions',
  ]
  switchTab('run')
  appendLog(`[suggest] next: ${opts[Math.floor(Math.random()*opts.length)]}`,'action')
}

// ── AI sidebar actions ───────────────────────────────────────────
function streamToOutput(text) {
  const el = $('ai-output')
  el.textContent = ''; el.classList.add('live')
  let i = 0
  const iv = setInterval(() => { el.textContent += text[i++]; if (i >= text.length) clearInterval(iv) }, 16)
}

async function decompose() {
  const prompt = $('body-snippet').value.trim() || $('body-prompt').value.trim()
  if (!prompt) { appendLog('nothing to decompose','error'); return }
  appendLog('[decompose] calling /api/ai/decompose…','action')
  try {
    const resp = await fetch('/api/ai/decompose', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({prompt})
    })
    const {tasks} = await resp.json()
    streamToOutput(`Decompose →\n${tasks.map((t,i)=>`${i+1}. ${t}`).join('\n')}`)
    appendLog(`[decompose] ${tasks.length} units identified`,'action')
  } catch (e) { appendLog(`[decompose] error: ${e.message}`,'error') }
}

function revise() {
  if (!$('body-snippet').value.trim()) { appendLog('no snippet to revise','error'); return }
  appendLog('[revise] streaming revision…','action')
  streamToOutput('Revised: extracted button handler into named function. Added null check on postMessage target. Reduced nesting by one level.')
}

function explain() {
  if (!$('body-snippet').value.trim()) { appendLog('no snippet to explain','error'); return }
  streamToOutput('This snippet renders a deployment panel. Each button calls postMessage with an action name. The parent app intercepts the message and routes it to mock shell commands, streaming output to the log.')
}

function askQuestions() {
  const qs = [
    'What happens when K8s is unreachable?',
    'Should rollback require confirmation?',
    'Which snippet should chain after deploy?',
    'How do you test this panel in isolation?',
    'What is the expected output format?',
  ]
  const el = $('chip-list')
  el.innerHTML = qs.map(q => `<div class="chip" onclick="clickChip(this.textContent)">${q}</div>`).join('')
  appendLog('[questions] 5 questions generated','action')
}

function reflect() {
  const issues = [
    'No error handling on exec calls — add try/catch',
    'Output grows unbounded — add max-height + scroll',
    'Destructive ops (rollback, deploy) have no confirmation step',
  ]
  $('reflection-list').innerHTML = issues.map(t => `<div class="reflect-item">${t}</div>`).join('')
  appendLog('[reflect] 3 issues identified','action')
}

function clickChip(q) {
  selectSnippet('deploy-prompt')
  $('body-prompt').value = q
  appendLog(`[questions] prompt: "${q}"`,'action')
}

window.addEventListener('message', e => { if (e.data?.type==='exec') runRegistered(e.data.snippet) })

function changeLang() {
  const current = $('meta-lang').textContent
  const languages = ['html', 'js', 'css', 'bash', 'sql', 'go', 'python', 'dockerfile', 'kubernetes', 'prompt', 'chain', 'json', 'mermaid']
  
  // Create dropdown menu
  const dropdown = document.createElement('select')
  dropdown.style.cssText = 'position: absolute; z-index: 1000; background: var(--bg2); border: 1px solid var(--border); color: var(--fg); padding: 4px; border-radius: 3px; font-size: 11px;'
  
  // Add options
  languages.forEach(lang => {
    const option = document.createElement('option')
    option.value = lang
    option.textContent = lang
    option.selected = lang === current
    dropdown.appendChild(option)
  })
  
  // Position dropdown near the badge
  const badge = $('meta-lang')
  const rect = badge.getBoundingClientRect()
  dropdown.style.left = rect.left + 'px'
  dropdown.style.top = (rect.bottom + 2) + 'px'
  
  // Handle selection
  dropdown.onchange = () => {
    const newLang = dropdown.value
    if (newLang !== current) {
      $('meta-lang').textContent = newLang
      if (state.current) SNIPPETS[state.current].lang = newLang
      buildList()
      appendLog(`[lang] changed to ${newLang}`,'action')
      save()
    }
    document.body.removeChild(dropdown)
  }
  
  dropdown.onblur = () => setTimeout(() => {
    if (document.body.contains(dropdown)) {
      document.body.removeChild(dropdown)
    }
  }, 200)
  
  document.body.appendChild(dropdown)
  dropdown.focus()
}

async function deleteSnippet() {
  const name = state.current
  if (!state.currentId) { appendLog(`[delete] ${name} not in DB — removed from list`,'action'); delete SNIPPETS[name]; buildList(); selectSnippet(Object.keys(SNIPPETS)[0]); return }
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
  try {
    await fetch(`/api/snippets/${state.currentId}`, { method: 'DELETE' })
    delete SNIPPETS[name]
    buildList()
    selectSnippet(Object.keys(SNIPPETS)[0])
    appendLog(`[delete] ${name} deleted`,'action')
  } catch(e) { appendLog(`[delete] error: ${e.message}`,'error') }
}

function newSnippet() {
  const name = prompt('Snippet name:')
  if (!name?.trim()) return
  const lang = prompt('Language (html/js/css/bash/prompt/mermaid):', 'html') || 'html'
  SNIPPETS[name] = { lang, body: () => '', id: null }
  buildList()
  selectSnippet(name)
  appendLog(`[new] ${name} (${lang}) — edit and save`,'action')
}

function parseTags() {
  return $('meta-tags').value.split(',').map(t => t.trim()).filter(Boolean)
}

async function save() {
  const name = state.current
  const lang = $('meta-lang').textContent
  const body = $('body-snippet').value
  const tags = parseTags()
  try {
    let resp
    if (state.currentId) {
      resp = await fetch(`/api/snippets/${state.currentId}`, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({name, language:lang, body, status:'ready', tags})
      })
    } else {
      resp = await fetch('/api/snippets', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({name, language:lang, body, status:'ready', tags})
      })
    }
    if (!resp.ok) {
      const errorText = await resp.text()
      appendLog(`[save] server error ${resp.status}: ${errorText}`,'error')
      return
    }
    const sn = await resp.json()
    state.currentId = sn.id
    SNIPPETS[name] = { lang, body: () => sn.body, id: sn.id, tags }
    appendLog(`[save] ${name} v${sn.version} saved`,'action')
  } catch(e) { appendLog(`[save] network error: ${e.message}`,'error') }
}

async function saveAs() {
  const newName = prompt('Save as:', state.current + '-copy')
  if (!newName?.trim()) return
  const lang = $('meta-lang').textContent
  const body = lang === 'prompt' ? $('body-prompt').value : $('body-snippet').value
  const tags = parseTags()
  try {
    const resp = await fetch('/api/snippets', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({name: newName, language:lang, body, status:'ready', tags})
    })
    const sn = await resp.json()
    SNIPPETS[newName] = { lang, body: () => sn.body, id: sn.id, tags }
    buildList()
    selectSnippet(newName)
    appendLog(`[save-as] ${newName} v1 created`,'action')
  } catch(e) { appendLog(`[save-as] error: ${e.message}`,'error') }
}

async function loadFromDB() {
  appendLog('[db] Loading snippets from database…','action')
  try {
    const resp = await fetch('/api/snippets')
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
    }
    const snips = await resp.json()
    appendLog(`[db] ✓ Loaded ${snips.length} snippets from database`,'action')
    snips.forEach(sn => {
      SNIPPETS[sn.name] = { lang: sn.language, body: () => sn.body, id: sn.id, tags: sn.tags || [] }
    })
  } catch(e) { 
    appendLog(`[db] ✗ Database load failed: ${e.message}`,'error')
    console.warn('loadFromDB:', e)
  }
  buildList()
  
  // Execute startup chain
  appendLog('[startup] Executing startup chain…','action')
  setTimeout(() => {
    const startupChain = SNIPPETS['startup-chain']
    if (startupChain) {
      const names = startupChain.body().split('\n').map(l => l.trim()).filter(Boolean)
      executeChain(names, 'startup-chain')
    } else {
      // Fallback: select first available snippet
      const firstSnippet = Object.keys(SNIPPETS)[0]
      if (firstSnippet) {
        selectSnippet(firstSnippet)
        appendLog(`[db] Selected first snippet: ${firstSnippet}`,'action')
      } else {
        appendLog(`[db] No snippets available`,'error')
      }
    }
  }, 500) // Small delay to ensure UI is ready
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  buildList()
  try {
    await loadFromDB()
  } catch (e) {
    appendLog(`[startup] loadFromDB failed: ${e.message}`, 'error')
  }

  // Explicitly run startup-chain here so it cannot be skipped by
  // duplicate-function hoisting overriding loadFromDB's internal trigger.
  setTimeout(async () => {
    const startupChain = SNIPPETS['startup-chain']
    if (startupChain) {
      const body = typeof startupChain.body === 'function' ? startupChain.body() : (startupChain.body || '')
      const names = body.split('\n').map(l => l.trim()).filter(Boolean)
      appendLog(`[startup] startup-chain → ${names.join(' → ')}`, 'action')
      try {
        await executeChain(names, 'startup-chain')
      } catch (e) {
        appendLog(`[startup] executeChain error: ${e.message}`, 'error')
      }
    } else {
      const first = Object.keys(SNIPPETS)[0]
      if (first) {
        selectSnippet(first)
        appendLog(`[startup] no startup-chain; selected ${first}`, 'action')
      } else {
        appendLog('[startup] no snippets available', 'error')
      }
    }
  }, 200)
})

// Multi-select functions
function updateMultiSelect() {
  const checkboxes = document.querySelectorAll('.snippet-checkbox')
  const selected = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.dataset.snippet)
  const controls = $('multi-controls')
  const count = $('selection-count')
  
  if (selected.length > 0) {
    controls.style.display = 'flex'
    count.textContent = `${selected.length} selected`
  } else {
    controls.style.display = 'none'
  }
  
  // Update select-all checkbox
  const selectAll = $('select-all')
  if (selectAll) {
    selectAll.checked = selected.length === checkboxes.length && checkboxes.length > 0
    selectAll.indeterminate = selected.length > 0 && selected.length < checkboxes.length
  }
}

function toggleSelectAll() {
  const selectAll = $('select-all')
  const checkboxes = document.querySelectorAll('.snippet-checkbox')
  checkboxes.forEach(cb => cb.checked = selectAll.checked)
  updateMultiSelect()
}

function getSelectedSnippets() {
  return Array.from(document.querySelectorAll('.snippet-checkbox:checked'))
    .map(cb => cb.dataset.snippet)
}

function chainSelected() {
  const selected = getSelectedSnippets()
  if (selected.length < 2) {
    appendLog('[chain] Select at least 2 snippets to chain','error')
    return
  }
  
  const chainName = prompt('Chain name:', selected.join('-chain'))
  if (!chainName?.trim()) return
  
  const chainBody = selected.join('\n')
  SNIPPETS[chainName] = {
    lang: 'chain',
    tags: ['chain', 'auto'],
    body: () => chainBody
  }
  
  buildList()
  selectSnippet(chainName)
  appendLog(`[chain] Created chain "${chainName}" with ${selected.length} snippets`,'action')
  
  // Clear selection
  document.querySelectorAll('.snippet-checkbox').forEach(cb => cb.checked = false)
  updateMultiSelect()
}

async function deleteSelected() {
  const selected = getSelectedSnippets()
  if (selected.length === 0) return
  
  const confirmMsg = `Delete ${selected.length} snippet${selected.length > 1 ? 's' : ''}?\n${selected.join(', ')}`
  if (!confirm(confirmMsg)) return
  
  appendLog(`[delete] Deleting ${selected.length} snippets…`,'action')
  
  // Remove from UI immediately for instant feedback
  const elementsToRemove = []
  selected.forEach(name => {
    const item = $(`item-${name}`)
    const card = $(`card-${name}`)
    const pill = $(`pill-${name}`)
    if (item) elementsToRemove.push(item)
    if (card) elementsToRemove.push(card)
    if (pill) elementsToRemove.push(pill)
  })
  
  // Clear UI instantly
  requestAnimationFrame(() => {
    elementsToRemove.forEach(el => el?.remove())
    updateMultiSelect()
  })
  
  // Prepare delete operations with very short timeout
  const deletePromises = selected.map(async (name) => {
    const snippet = SNIPPETS[name]
    if (!snippet) return { name, success: false, error: 'Snippet not found' }
    
    try {
      if (snippet.id) {
        // Very aggressive timeout - 2 seconds max
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2000)
        
        const resp = await fetch(`/api/snippets/${snippet.id}`, { 
          method: 'DELETE',
          signal: controller.signal
        }).finally(() => clearTimeout(timeoutId))
        
        if (!resp.ok) {
          // Don't wait for error text - just return status
          return { name, success: false, error: `HTTP ${resp.status}` }
        }
        return { name, success: true, fromDb: true }
      } else {
        return { name, success: true, fromDb: false }
      }
    } catch (e) {
      return { name, success: false, error: 'Timeout/Network error' }
    }
  })
  
  // Execute with race condition to prevent hanging
  const results = await Promise.race([
    Promise.all(deletePromises),
    new Promise(resolve => setTimeout(() => resolve([]), 3000)) // 3 second max total
  ])
  
  // Process results in non-blocking way
  requestAnimationFrame(() => {
    let deletedCount = 0
    let errorCount = 0
    
    results.forEach(result => {
      if (result) {
        if (result.success) {
          // Remove from local state
          delete SNIPPETS[result.name]
          delete state.registered[result.name]
          deletedCount++
        } else {
          errorCount++
        }
      }
    })
    
    // Rebuild UI
    buildList()
    updateRegistry()
    
    // Select first available snippet
    const firstSnippet = Object.keys(SNIPPETS)[0]
    if (firstSnippet) {
      selectSnippet(firstSnippet)
    }
    
    appendLog(`[delete] Complete: ${deletedCount} deleted, ${errorCount} errors`,'action')
  })
}

// Tree panel functionality
const treeState = {
  expandedNodes: new Set(),
  selectedNode: null,
  searchTerm: ''
}

function categorizeSnippets() {
  const categories = {
    'ui-components': {
      name: 'UI Components',
      icon: '🎨',
      snippets: [],
      subcategories: {}
    },
    'events': {
      name: 'Events',
      icon: '⚡',
      snippets: [],
      subcategories: {}
    },
    'data': {
      name: 'Data',
      icon: '📊',
      snippets: [],
      subcategories: {}
    },
    'chains': {
      name: 'Chains',
      icon: '🔗',
      snippets: [],
      subcategories: {}
    },
    'ai': {
      name: 'AI & Prompts',
      icon: '🤖',
      snippets: [],
      subcategories: {}
    },
    'demo': {
      name: 'Demo',
      icon: '🎭',
      snippets: [],
      subcategories: {}
    },
    'other': {
      name: 'Other',
      icon: '📄',
      snippets: [],
      subcategories: {}
    }
  }

  Object.entries(SNIPPETS).forEach(([name, snippet]) => {
    const tags = snippet.tags || []
    const lang = snippet.lang
    
    // Categorize by tags first
    if (tags.includes('ui') || tags.includes('buttons')) {
      categories['ui-components'].snippets.push(name)
    } else if (tags.includes('events')) {
      categories['events'].snippets.push(name)
    } else if (tags.includes('data') || tags.includes('json')) {
      categories['data'].snippets.push(name)
    } else if (tags.includes('chain')) {
      categories['chains'].snippets.push(name)
    } else if (tags.includes('demo')) {
      categories['demo'].snippets.push(name)
    } else if (lang === 'prompt') {
      categories['ai'].snippets.push(name)
    } else {
      // Categorize by language
      if (lang === 'html' || lang === 'css') {
        categories['ui-components'].snippets.push(name)
      } else if (lang === 'js') {
        categories['events'].snippets.push(name)
      } else if (lang === 'json') {
        categories['data'].snippets.push(name)
      } else if (lang === 'chain') {
        categories['chains'].snippets.push(name)
      } else {
        categories['other'].snippets.push(name)
      }
    }
  })

  return categories
}

function buildTreeNode(name, data, level = 0) {
  const hasChildren = data.snippets.length > 0 || Object.keys(data.subcategories).length > 0
  const isExpanded = treeState.expandedNodes.has(name)
  
  const node = document.createElement('div')
  node.className = 'tree-node'
  node.dataset.name = name
  node.dataset.type = 'category'
  
  const content = document.createElement('div')
  content.className = 'tree-node-content'
  if (treeState.selectedNode === name) {
    content.classList.add('selected')
  }
  
  const toggle = document.createElement('span')
  toggle.className = `tree-toggle ${hasChildren ? '' : 'no-children'} ${isExpanded ? 'expanded' : ''}`
  toggle.textContent = hasChildren ? '▶' : ''
  
  const icon = document.createElement('span')
  icon.className = 'tree-icon'
  icon.textContent = data.icon
  
  const label = document.createElement('span')
  label.className = 'tree-label'
  label.textContent = data.name
  
  const badge = document.createElement('span')
  badge.className = 'tree-badge'
  badge.textContent = data.snippets.length
  
  content.appendChild(toggle)
  content.appendChild(icon)
  content.appendChild(label)
  content.appendChild(badge)
  
  content.addEventListener('click', () => {
    if (hasChildren) {
      toggleNode(name)
    }
    selectNode(name, 'category')
  })
  
  node.appendChild(content)
  
  if (hasChildren) {
    const children = document.createElement('div')
    children.className = `tree-children ${isExpanded ? 'expanded' : ''}`
    children.id = `children-${name}`
    
    // Add snippet nodes
    data.snippets.forEach(snippetName => {
      const snippetNode = buildSnippetNode(snippetName, level + 1)
      children.appendChild(snippetNode)
    })
    
    // Add subcategory nodes
    Object.entries(data.subcategories).forEach(([subName, subData]) => {
      const subNode = buildTreeNode(subName, subData, level + 1)
      children.appendChild(subNode)
    })
    
    node.appendChild(children)
  }
  
  return node
}

function buildSnippetNode(name, level = 0) {
  const snippet = SNIPPETS[name]
  if (!snippet) return document.createElement('div')
  
  const node = document.createElement('div')
  node.className = 'tree-node'
  node.dataset.name = name
  node.dataset.type = 'snippet'
  
  const content = document.createElement('div')
  content.className = 'tree-node-content'
  if (treeState.selectedNode === name) {
    content.classList.add('selected')
  }
  
  const toggle = document.createElement('span')
  toggle.className = 'tree-toggle no-children'
  
  const icon = document.createElement('span')
  icon.className = 'tree-icon'
  icon.textContent = getLanguageIcon(snippet.lang)
  
  const label = document.createElement('span')
  label.className = 'tree-label'
  label.textContent = name
  
  const badge = document.createElement('span')
  badge.className = 'tree-badge'
  badge.textContent = snippet.lang.toUpperCase()
  
  content.appendChild(toggle)
  content.appendChild(icon)
  content.appendChild(label)
  content.appendChild(badge)
  
  content.addEventListener('click', () => {
    selectNode(name, 'snippet')
  })
  
  node.appendChild(content)
  return node
}

function getLanguageIcon(lang) {
  const icons = {
    'html': '🌐',
    'css': '🎨',
    'js': '⚡',
    'json': '📊',
    'prompt': '🤖',
    'chain': '🔗',
    'sql': '🗄️',
    'go': '🔧',
    'bash': '💻'
  }
  return icons[lang] || '📄'
}

function toggleNode(name) {
  if (treeState.expandedNodes.has(name)) {
    treeState.expandedNodes.delete(name)
  } else {
    treeState.expandedNodes.add(name)
  }
  updateTree()
}

function selectNode(name, type) {
  treeState.selectedNode = name
  
  if (type === 'snippet') {
    selectSnippet(name)
  }
  
  updateTree()
}

function updateTree() {
  const treeContainer = $('snippet-tree')
  if (!treeContainer) return
  
  treeContainer.innerHTML = ''
  
  const categories = categorizeSnippets()
  const searchTerm = treeState.searchTerm.toLowerCase()
  
  Object.entries(categories).forEach(([key, category]) => {
    if (searchTerm) {
      // Filter category based on search
      const filteredSnippets = category.snippets.filter(name => 
        name.toLowerCase().includes(searchTerm) ||
        SNIPPETS[name]?.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
      )
      
      if (filteredSnippets.length === 0) return
      
      const filteredCategory = { ...category, snippets: filteredSnippets }
      const node = buildTreeNode(key, filteredCategory)
      treeContainer.appendChild(node)
    } else {
      const node = buildTreeNode(key, category)
      treeContainer.appendChild(node)
    }
  })
}

function initializeTree() {
  const searchInput = $('tree-search')
  const toggleAllBtn = $('tree-toggle-all')
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      treeState.searchTerm = e.target.value
      updateTree()
    })
  }
  
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', () => {
      const allCategories = Object.keys(categorizeSnippets())
      if (treeState.expandedNodes.size === allCategories.length) {
        treeState.expandedNodes.clear()
      } else {
        allCategories.forEach(cat => treeState.expandedNodes.add(cat))
      }
      updateTree()
    })
  }
  
  updateTree()
}

// Initialize tree when DOM is ready
document.addEventListener('DOMContentLoaded', initializeTree)

// Ooba integration for AI assistance
let currentController = null

async function generate(mode = null) {
  const prompt = $('body-prompt').value
  if (!prompt.trim()) return
  
  state.generating = true
  $('btn-stop-gen').disabled = false
  
  // Create abort controller for stopping
  currentController = new AbortController()
  
  // Default to chat mode for character selection, but allow instruct mode
  const requestMode = mode || 'chat'
  
  try {
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        character: 'Melquíades',
        mode: requestMode,
        prompt: prompt
      }),
      signal: currentController.signal
    })
    
    appendLog(`[AI] Response status: ${response.status} ${response.statusText}`, 'action')
    appendLog(`[AI] Content-Type: ${response.headers.get('content-type')}`, 'action')
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    // Handle streaming SSE response from OpenAI API
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullResponse = ''
    
    appendLog('[AI] Reading streaming response...', 'action')
    
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            
            if (data === '[DONE]') {
              appendLog('[AI] Stream completed', 'action')
              break
            }
            
            try {
              const parsed = JSON.parse(data)
              appendLog(`[AI] Parsed JSON: ${JSON.stringify(parsed)}`, 'action')
              
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                const content = parsed.choices[0].delta.content
                fullResponse += content
                appendLog(`[AI] Received content: "${content}"`, 'action')
              } else {
                appendLog(`[AI] No content in parsed structure`, 'action')
              }
            } catch (e) {
              appendLog(`[AI] JSON parse error: ${e.message} - data: ${data.substring(0, 50)}...`, 'action')
            }
          }
        }
      }
    } catch (streamError) {
      appendLog(`[AI] Stream error: ${streamError.message}`, 'error')
      return null
    }
    
    appendLog(`[AI] Full response: ${fullResponse}`, 'action')
    return fullResponse || null
  } catch (error) {
    appendLog(`[AI] Network Error: ${error.message}`, 'error')
    appendLog('[AI] Possible causes:', 'error')
    appendLog('[AI] - Backend server not running', 'error')
    appendLog('[AI] - /api/ai/generate endpoint not found', 'error')
    appendLog('[AI] - CORS or network issues', 'error')
    appendLog('[AI] - Oobabooga not running on localhost:5000', 'error')
    return null
  }
}

// Test function for ooba integration
async function testMelquiades() {
  appendLog('[AI] Testing Melquiades character...', 'action')
  
  // First debug characters
  try {
    const response = await fetch('/api/characters')
    const data = await response.json()
    appendLog(`[AI] Available characters: ${JSON.stringify(data)}`, 'action')
    
    if (data.characters) {
      Object.keys(data.characters).forEach(name => {
        appendLog(`[AI] Character: ${name}`, 'action')
        if (data.characters[name].system) {
          const preview = data.characters[name].system.substring(0, 100) + '...'
          appendLog(`[AI] System preview: ${preview}`, 'action')
        }
      })
    }
    
    appendLog(`[AI] Active character: ${data.active}`, 'action')
  } catch (error) {
    appendLog(`[AI] Error debugging characters: ${error.message}`, 'error')
  }
  
  // Then test the character
  const testPrompt = "What is your name and what do you do?"
  const response = await askMelquiades(testPrompt)
  
  if (response) {
    appendLog('[AI] ✓ Melquiades character is working!', 'action')
    // Optionally display the response in the snippet editor
    $('body-snippet').value = response
    $('meta-lang').textContent = 'html'
  } else {
    appendLog('[AI] ✗ Failed to get response from Melquiades', 'error')
  }
}

// Debug character selection
async function debugCharacters() {
  appendLog('[AI] Debugging character selection...', 'action')
  
  try {
    const response = await fetch('/api/characters')
    const data = await response.json()
    appendLog(`[AI] Available characters: ${JSON.stringify(data)}`, 'action')
    
    if (data.characters) {
      Object.keys(data.characters).forEach(name => {
        appendLog(`[AI] Character: ${name}`, 'action')
        if (data.characters[name].system) {
          const preview = data.characters[name].system.substring(0, 100) + '...'
          appendLog(`[AI] System preview: ${preview}`, 'action')
        }
      })
    }
    
    appendLog(`[AI] Active character: ${data.active}`, 'action')
  } catch (error) {
    appendLog(`[AI] Error debugging characters: ${error.message}`, 'error')
  }
}

function appendLog(msg, type = 'info') {
  const log = $('log')
  if (!log) return
  const entry = document.createElement('div')
  entry.className = `log-${type}`
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
  log.appendChild(entry)
  log.scrollTop = log.scrollHeight
}

function newSnippet() {
  const name = prompt('Snippet name:')
  if (!name) return
  
  const lang = prompt('Language (js,css,html,json,yaml,bash,sql,go,python,dockerfile,kubernetes,prompt):', 'js')
  if (!lang) return
  
  SNIPPETS[name] = {
    lang: lang,
    tags: [],
    body: () => ''
  }
  
  buildList()
  selectSnippet(name)
  appendLog(`Created new snippet: ${name}`, 'action')
}

function switchTab(tab) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab)
  })
  
  // Update tab content
  document.querySelectorAll('.screen').forEach(content => {
    content.style.display = content.id === `screen-${tab}` ? 'flex' : 'none'
  })
  
  appendLog(`Switched to ${tab} tab`, 'action')
}

async function save() {
  const name = state.current
  if (!name) return
  
  const snippet = SNIPPETS[name]
  if (!snippet) return
  
  const ta = $('body-snippet')
  if (!ta) return
  
  try {
    // Update the snippet body locally
    snippet.body = () => ta.value
    
    // Prepare request payload
    const payload = {
      name: name,
      language: snippet.lang,
      tags: snippet.tags,
      body: ta.value
    }
    console.log('Save payload:', payload)
    
    // Check if snippet exists in database (has an ID)
    const snippetId = state.registered[name]
    let response
    
    if (snippetId) {
      // Update existing snippet
      console.log('Updating existing snippet with ID:', snippetId)
      response = await fetch(`/api/snippets/${snippetId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
    } else {
      // Create new snippet
      console.log('Creating new snippet')
      response = await fetch('/api/snippets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
    }
    
    console.log('Save response status:', response.status)
    console.log('Save response headers:', response.headers)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Save error response:', errorText)
      
      // Handle duplicate key error by trying to find existing snippet
      if (response.status === 500 && errorText.includes('duplicate key value violates unique constraint')) {
        console.log('Duplicate key error, trying to find existing snippet...')
        try {
          const listResp = await fetch('/api/snippets')
          if (listResp.ok) {
            const snippets = await listResp.json()
            const existingSnippet = snippets.find(s => s.name === name)
            if (existingSnippet) {
              console.log('Found existing snippet, updating instead:', existingSnippet.id)
              state.registered[name] = existingSnippet.id
              // Retry with PUT request
              response = await fetch(`/api/snippets/${existingSnippet.id}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
              })
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`)
              }
            }
          }
        } catch (retryError) {
          console.error('Retry failed:', retryError)
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }
    }
    
    const responseData = await response.json()
    console.log('Save response data:', responseData)
    
    // Update registry with new ID if it was created
    if (responseData.id && !snippetId) {
      state.registered[name] = responseData.id
    }
    
    appendLog(`Saved snippet: ${name}`, 'action')
  } catch (e) {
    console.error('Save error:', e)
    appendLog(`Error saving snippet: ${e.message}`, 'error')
  }
}

async function saveAs() {
  const oldName = state.current
  if (!oldName) return
  
  const newName = prompt('Save as:', oldName)
  if (!newName || newName === oldName) return
  
  const oldSnippet = SNIPPETS[oldName]
  if (!oldSnippet) return
  
  const ta = $('body-snippet')
  if (!ta) return
  
  try {
    // Create new snippet with updated content
    const newSnippet = {
      ...oldSnippet,
      body: () => ta.value
    }
    
    // Save to database
    const response = await fetch('/api/snippets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: newName,
        language: newSnippet.lang,
        tags: newSnippet.tags,
        body: ta.value
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    // Update local snippets
    SNIPPETS[newName] = newSnippet
    
    buildList()
    selectSnippet(newName)
    appendLog(`Saved snippet as: ${newName}`, 'action')
  } catch (e) {
    appendLog(`Error saving snippet: ${e.message}`, 'error')
  }
}

async function execute() {
  const name = state.current
  if (!name) return
  
  const snippet = SNIPPETS[name]
  if (!snippet) return
  
  // Handle chains differently
  if (snippet.lang === 'chain') {
    const chainContent = snippet.body ? (typeof snippet.body === 'function' ? snippet.body() : snippet.body) : ''
    const names = chainContent.split('\n').map(l => l.trim()).filter(Boolean)
    if (names.length > 0) {
      appendLog(`[chain] Executing chain "${name}" with ${names.length} snippets`, 'action')
      await executeChain(names, name)
    }
    return
  }
  
  // Read current content from textarea, not cached snippet body
  const ta = $('body-snippet')
  const code = ta ? ta.value.trim() : ''
  if (!code) return
  
  appendLog(`Executing ${name} (${snippet.lang})`, 'action')
  
  switchTab('run')
  const sandbox = $('sandbox')
  if (sandbox) {
    if (snippet.lang === 'html') {
      sandbox.srcdoc = code
    } else if (snippet.lang === 'js') {
      sandbox.srcdoc = `<script>${code}<${'/'+'script'}>`
    } else {
      sandbox.srcdoc = `<pre>${code}</pre>`
    }
  }
}

function register() {
  const name = state.current
  if (!name) return
  
  appendLog(`Registering snippet: ${name}`, 'action')
  // Registration logic would go here
}

function deleteSnippet() {
  const name = state.current
  if (!name) return
  
  if (!confirm(`Delete snippet "${name}"?`)) return
  
  delete SNIPPETS[name]
  buildList()
  
  // Select first available snippet
  const first = Object.keys(SNIPPETS)[0]
  if (first) {
    selectSnippet(first)
  }
  
  appendLog(`Deleted snippet: ${name}`, 'action')
}

function toggleSelectAll() {
  const selectAll = $('select-all')
  const checkboxes = document.querySelectorAll('.snippet-checkbox')
  
  checkboxes.forEach(cb => cb.checked = selectAll.checked)
  updateMultiSelect()
}

async function generate() {
  const raw = $('body-prompt').value.trim()
  if (!raw) { appendLog('prompt is empty','error'); return }
  let { resolved: prompt, refs } = resolveContext(raw)
  if (refs.length) appendLog(`[generate] context: ${refs.map(r=>'@'+r).join(', ')}`,'action')
  const snippetBody = $('body-snippet').value.trim()
  if (snippetBody) {
    prompt += `\n\n[Current snippet: ${state.current}]\n${snippetBody}`
    appendLog(`[generate] auto-context: snippet ${state.current}`,'action')
  }
  const system = $('chk-code-only').checked
    ? 'You output ONLY raw code. No explanation, no comments, no markdown fences, no backticks. Start with the first line of code. Stop after the last line of code. Never add any text after the code.'
    : ''
  const src = state.current
  switchTab('snippet')
  const ta = $('body-snippet')
  state.prevSnippet = ta.value
  ta.value = ''
  setChain([src, 'streaming…'])
  state.generating = true; state.abortCtrl = new AbortController()
  $('btn-stop-gen').disabled = false

  let resp
  try {
    resp = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({prompt, system, character: 'Melquíades', mode: 'chat'}),
      signal: state.abortCtrl.signal
    })
  } catch (e) {
    appendLog(`[generate] network error: ${e.message}`,'error')
    state.generating = false; $('btn-stop-gen').disabled = true
    return
  }

  if (!resp.ok) { appendLog(`[generate] ${resp.status} ${resp.statusText}`,'error'); state.generating = false; $('btn-stop-gen').disabled = true; return }

  const reader = resp.body.getReader(), dec = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      const chunk = dec.decode(value, {stream: true})
      buf += chunk
      const lines = buf.split('\n'); buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)
        if (payload === '[DONE]') { finishGenerate(src); return }
        try {
          const parsed = JSON.parse(payload)
          const token = parsed?.choices?.[0]?.delta?.content
          if (token) {
            ta.value += token; ta.scrollTop = ta.scrollHeight
          }
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      // Handle stream errors silently
    }
    state.generating = false; $('btn-stop-gen').disabled = true; return
  }
  finishGenerate(src)
}

function stopGenerate() {
  if (currentController) {
    currentController.abort()
    currentController = null
  }
  state.generating = false
  $('btn-stop-gen').disabled = true
  appendLog('Generation stopped by user', 'action')
}

function finishGenerate(src) {
  state.generating = false
  $('btn-stop-gen').disabled = true
  currentController = null
  const ta = $('body-snippet')
  const content = ta.value.trim()
  if (content) {
    setChain([src, 'generated'])
    appendLog(`[generate] finished ${content.length} chars`,'action')
  } else {
    setChain([src])
    appendLog('[generate] no content generated','warning')
  }
}

function stopGenerate() {
  state.abortCtrl?.abort()
  state.generating = false
  $('btn-stop-gen').disabled = true
  if (state.prevSnippet && !$('body-snippet').value.trim()) {
    $('body-snippet').value = state.prevSnippet
  }
  appendLog('[generate] stopped','action')
}

function stop() {
  const sandbox = $('sandbox')
  if (sandbox) {
    sandbox.srcdoc = ''
  }
  appendLog('[run] stopped','action')
}

function changeLang() {
  const name = state.current
  if (!name) return
  
  const snippet = SNIPPETS[name]
  if (!snippet) return
  
  const newLang = prompt('Language (js,css,html,json,yaml,bash,sql,go,python,dockerfile,kubernetes,prompt):', snippet.lang)
  if (!newLang || newLang === snippet.lang) return
  
  snippet.lang = newLang
  buildList()
  appendLog(`Changed ${name} language to ${newLang}`, 'action')
}

function insertCtx(picker) {
  const name = picker.value
  if (!name) return
  
  const ta = $('body-prompt')
  const pos = ta.selectionStart
  const val = ta.value
  const ins = (pos > 0 && val[pos-1] !== ' ' && val[pos-1] !== '\n') ? ` @${name}` : `@${name}`
  ta.value = val.slice(0, pos) + ins + val.slice(pos)
  ta.selectionStart = ta.selectionEnd = pos + ins.length
  ta.focus()
  picker.value = ''
}

function resolveContext(text) {
  const refs = []
  const resolved = text.replace(/@(\w+)/g, (match, name) => {
    const snippet = SNIPPETS[name]
    if (snippet) {
      refs.push(name)
      return snippet.body() || ''
    }
    return match
  })
  return { resolved, refs }
}

function debugCharacters() {
  appendLog('[AI] Debugging character configuration...', 'action')
  try {
    const response = fetch('/api/ai/debug', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'}
    }).then(resp => resp.json())
    .then(data => {
      appendLog(`[AI] Debug info: ${JSON.stringify(data, null, 2)}`, 'action')
    })
  } catch (error) {
    appendLog(`[AI] Error debugging characters: ${error.message}`, 'error')
  }
}

function testMelquiades() {
  appendLog('[AI] Testing Melquíades connection...', 'action')
  generate()
}

function mindMap() {
  const prompt = $('body-prompt').value.trim()
  if (!prompt) { appendLog('prompt is empty for mind map','error'); return }
  
  appendLog('[AI] Generating mind map...', 'action')
  
  fetch('/api/ai/mindmap', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({prompt})
  })
  .then(resp => resp.json())
  .then(data => {
    appendLog('[AI] Mind map generated', 'action')
    // Display mind map logic would go here
  })
  .catch(e => {
    appendLog(`[AI] Mind map error: ${e.message}`, 'error')
  })
}

function revise() {
  appendLog('[AI] Revising current snippet...', 'action')
  const current = state.current
  if (!current) return
  
  const snippet = SNIPPETS[current]
  if (!snippet) return
  
  const prompt = `Please revise and improve this ${snippet.lang} code:\n\n${snippet.body()}`
  $('body-prompt').value = prompt
  generate()
}

function explain() {
  appendLog('[AI] Explaining current snippet...', 'action')
  const current = state.current
  if (!current) return
  
  const snippet = SNIPPETS[current]
  if (!snippet) return
  
  const prompt = `Please explain this ${snippet.lang} code:\n\n${snippet.body()}`
  $('body-prompt').value = prompt
  generate()
}

function askQuestions() {
  appendLog('[AI] Asking questions about current snippet...', 'action')
  const current = state.current
  if (!current) return
  
  const snippet = SNIPPETS[current]
  if (!snippet) return
  
  const prompt = `What are the key questions I should ask about this ${snippet.lang} code?\n\n${snippet.body()}`
  $('body-prompt').value = prompt
  generate()
}

function clickChip(text) {
  $('body-prompt').value = text
  generate()
}

function reflect() {
  appendLog('[AI] Reflecting on current snippet...', 'action')
  const current = state.current
  if (!current) return
  
  const snippet = SNIPPETS[current]
  if (!snippet) return
  
  const prompt = `Please reflect on this ${snippet.lang} code and suggest improvements:\n\n${snippet.body()}`
  $('body-prompt').value = prompt
  generate()
}

function selectSnippet(name) {
  state.current = name
  const snippet = SNIPPETS[name]
  if (!snippet) return
  
  // Update UI
  document.querySelectorAll('.snip-item').forEach(el => {
    el.classList.toggle('active', el.dataset.snippet === name)
  })
  
  // Update editor
  const ta = $('body-snippet')
  if (ta) {
    // Handle both string body (from DB) and function body (local)
    const content = snippet.body ? (typeof snippet.body === 'function' ? snippet.body() : snippet.body) : ''
    ta.value = content
    
    // Make sure we're on the snippet tab
    switchTab('snippet')
  }
  
  // Update context picker
  const picker = $('ctx-picker')
  if (picker) {
    picker.value = ''
  }
  
  // Update title
  const title = $('meta-title')
  if (title) {
    title.textContent = name
  }
  
  // Update language badge
  const langBadge = $('meta-lang')
  if (langBadge && snippet.lang) {
    langBadge.textContent = snippet.lang
  }
  
  }

function setChain(names) {
  state.chain = names
  const chainEl = $('chain-display')
  if (chainEl) {
    chainEl.textContent = names.join(' → ')
    chainEl.style.display = names.length > 0 ? 'block' : 'none'
  }
}

async function generateMissingSnippet(missingName, existingSnippets, source) {
  // Extract language from snippet name (e.g., "castle-html" -> "html")
  const language = missingName.split('-').pop().toLowerCase()
  
  // Look for prompt snippets in the chain
  const promptSnippets = existingSnippets.filter(name => {
    const snippet = SNIPPETS[name]
    return snippet && snippet.lang === 'prompt'
  })
  
  // Build context from existing snippets (excluding prompts for display)
  let context = ''
  const codeSnippets = existingSnippets.filter(name => {
    const snippet = SNIPPETS[name]
    return snippet && snippet.lang !== 'prompt'
  })
  
  if (codeSnippets.length > 0) {
    context += '\n\nExisting code snippets in this chain:\n'
    codeSnippets.forEach(name => {
      const snippet = SNIPPETS[name]
      if (snippet) {
        context += `\n--- ${name} (${snippet.lang}) ---\n`
        context += snippet.body ? (typeof snippet.body === 'function' ? snippet.body() : snippet.body) : ''
        context += '\n'
      }
    })
  }
  
  // Use prompt snippet if available, otherwise use generic prompt
  let userPrompt = ''
  if (promptSnippets.length > 0) {
    const promptSnippet = SNIPPETS[promptSnippets[0]]
    userPrompt = promptSnippet.body ? (typeof promptSnippet.body === 'function' ? promptSnippet.body() : promptSnippet.body) : ''
    appendLog(`[chain] Using prompt snippet: ${promptSnippets[0]}`, 'action')
  } else {
    // Fallback generic prompt
    userPrompt = `Generate a ${language} snippet that complements the existing code in this chain. The snippet should:

1. Be cohesive with the existing code
2. Follow the same naming/theme pattern (${source.split('-')[0]})
3. Be functional and complete
4. Include only the ${language} code (no explanations outside code blocks)
5. Be properly formatted and ready to execute`
    appendLog(`[chain] Using generic prompt for ${missingName}`, 'action')
  }
  
  // Create final prompt for AI
  const prompt = `I need you to generate a missing code snippet for a chain called "${source}".

Missing snippet name: ${missingName}
Language: ${language}

${context}

User Requirements:
${userPrompt}

Return only the ${language} code in a single code block.`

  try {
    // Use the existing generate function to create the snippet
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        character: 'Melquíades',
        mode: 'chat'
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    // Parse streaming response
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let generatedContent = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
              generatedContent += data.choices[0].delta.content
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }
    
    // Extract code from response
    const codeMatch = generatedContent.match(/```(\w+)?\n([\s\S]*?)\n```/)
    if (codeMatch) {
      const code = codeMatch[2].trim()
      const detectedLang = codeMatch[1] || language
      
      // Return snippet object
      return {
        name: missingName,
        lang: detectedLang,
        tags: ['generated', source.split('-')[0], detectedLang],
        body: () => code
      }
    } else {
      // If no code block found, treat entire response as code
      return {
        name: missingName,
        lang: language,
        tags: ['generated', source.split('-')[0], language],
        body: () => generatedContent.trim()
      }
    }
    
  } catch (e) {
    console.error('Error generating snippet:', e)
    throw e
  }
}

async function executeChain(names, source) {
  console.log('executeChain called with:', names, source)
  appendLog(`[chain] Executing ${names.length} snippets from ${source}`, 'action')
  appendLog(`[chain] Snippet names: ${JSON.stringify(names)}`, 'action')
  setChain(names)
  
  // Check for missing snippets and auto-generate them
  const missingSnippets = []
  const existingSnippets = []
  
  names.forEach(name => {
    if (!SNIPPETS[name]) {
      missingSnippets.push(name)
    } else {
      existingSnippets.push(name)
    }
  })
  
  // Generate missing snippets if any
  if (missingSnippets.length > 0) {
    appendLog(`[chain] Found ${missingSnippets.length} missing snippets: ${missingSnippets.join(', ')}`, 'warning')
    appendLog(`[chain] Auto-generating missing snippets...`, 'action')
    
    for (const missingName of missingSnippets) {
      try {
        const generated = await generateMissingSnippet(missingName, existingSnippets, source)
        if (generated) {
          appendLog(`[chain] Generated missing snippet: ${missingName}`, 'success')
          // Add to SNIPPETS registry
          SNIPPETS[missingName] = generated
        } else {
          appendLog(`[chain] Failed to generate: ${missingName}`, 'error')
        }
      } catch (e) {
        appendLog(`[chain] Error generating ${missingName}: ${e.message}`, 'error')
      }
    }
  }
  
  // Collect all browser-safe snippets for combined execution
  const htmlSnippets = []
  const cssSnippets = []
  const jsSnippets = []
  const otherSnippets = []
  
  names.forEach(name => {
    const snippet = SNIPPETS[name]
    if (!snippet) {
      appendLog(`[chain] Snippet not found: ${name}`, 'error')
      return
    }
    
    switch (snippet.lang) {
      case 'html':
        htmlSnippets.push(snippet)
        break
      case 'css':
        cssSnippets.push(snippet)
        break
      case 'js':
        jsSnippets.push(snippet)
        break
      default:
        otherSnippets.push(snippet)
    }
  })
  
  // Combine HTML, CSS, and JS into single execution
  if (htmlSnippets.length > 0 || cssSnippets.length > 0 || jsSnippets.length > 0) {
    appendLog(`[chain] Combining ${htmlSnippets.length} HTML, ${cssSnippets.length} CSS, ${jsSnippets.length} JS snippets`, 'action')
    
    let combinedContent = ''
    
    // Add HTML content
    htmlSnippets.forEach(snippet => {
      const code = snippet.body()
      if (code) combinedContent += code
    })
    
    // Add CSS in style tags
    if (cssSnippets.length > 0) {
      combinedContent += '<style>\n'
      cssSnippets.forEach(snippet => {
        const code = snippet.body()
        if (code) combinedContent += code + '\n'
      })
      combinedContent += '</style>\n'
    }
    
    // Add JS in script tags
    if (jsSnippets.length > 0) {
      combinedContent += '<script>\n'
      jsSnippets.forEach(snippet => {
        const code = snippet.body()
        if (code) combinedContent += code + '\n'
      })
      combinedContent += '<\/script>\n'
    }
    
    // Execute combined content in sandbox
    appendLog(`[chain] Executing combined content (${combinedContent.length} chars)`, 'action')
    switchTab('run')
    const sandbox = $('sandbox')
    if (sandbox) {
      sandbox.srcdoc = combinedContent
    }
  }
  
  // Handle non-browser-safe snippets (just log for now)
  otherSnippets.forEach(snippet => {
    appendLog(`[chain] Skipping non-browser-safe snippet: ${snippet.name} (${snippet.lang})`, 'warning')
  })
  
  appendLog(`[chain] Chain completed`, 'action')
}

async function loadFromDB() {
  try {
    const resp = await fetch('/api/snippets')
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()
    console.log('Database response:', data)
    
    // Handle API response - it's an array of snippets, not an object with snippets property
    const snippets = Array.isArray(data) ? data : (data.snippets || [])
    
    // Merge database snippets with local SNIPPETS, preserving local bodies
    snippets.forEach(dbSnippet => {
      const name = dbSnippet.name
      if (!name) return
      
      // Convert string body to function for consistency with local snippets
      const normalizedSnippet = {
        ...dbSnippet,
        lang: dbSnippet.language || dbSnippet.lang || 'js', // Handle both language fields
        body: typeof dbSnippet.body === 'function' ? dbSnippet.body : () => dbSnippet.body || ''
      }
      
      // Always preserve local snippets, only add new ones from database
      if (!SNIPPETS[name]) {
        console.log(`Adding new database snippet: ${name}`)
        SNIPPETS[name] = normalizedSnippet
      } else {
        console.log(`Preserving local snippet: ${name}`)
        // Update registry for existing local snippet
        if (dbSnippet.id) {
          state.registered[name] = dbSnippet.id
        }
      }
      
      // Update registry with snippet ID
      if (dbSnippet.id) {
        state.registered[name] = dbSnippet.id
        console.log(`Registered snippet ${name} with ID ${dbSnippet.id}`)
      }
    })
    
    buildList()
    updateRegistry()
    console.log('Registry after load:', state.registered)
  } catch (e) {
    appendLog(`[db] Failed to load: ${e.message}`, 'error')
  }
}

// Missing functions that are called but not defined
function newSnippet() {
  const name = prompt('New snippet name:')
  if (!name) return
  
  SNIPPETS[name] = {
    lang: 'js',
    tags: [],
    body: () => ''
  }
  
  buildList()
  selectSnippet(name)
  appendLog(`Created new snippet: ${name}`, 'action')
}

function register() {
  const name = state.current
  if (!name) return
  
  appendLog(`Registering snippet: ${name}`, 'action')
}

function stop() {
  appendLog('Execution stopped', 'action')
}

function stopGenerate() {
  if (state.generateController) {
    state.generateController.abort()
    state.generateController = null
  }
  state.generating = false
  $('btn-stop-gen').disabled = true
  appendLog('Generation stopped', 'action')
}

function finishGenerate(src) {
  state.generating = false
  $('btn-stop-gen').disabled = true
  appendLog('Generation completed', 'action')
}

function mindMap() {
  appendLog('Mind map feature not implemented', 'action')
}

function revise() {
  appendLog('Revise feature not implemented', 'action')
}

function explain() {
  appendLog('Explain feature not implemented', 'action')
}

function askQuestions() {
  appendLog('Ask questions feature not implemented', 'action')
}

function clickChip(text) {
  $('body-prompt').value = text
  switchTab('prompt')
}

function reflect() {
  appendLog('Reflect feature not implemented', 'action')
}

function changeLang() {
  const snippet = SNIPPETS[state.current]
  if (!snippet) return
  
  const langs = ['js', 'css', 'html', 'markdown', 'json', 'yaml', 'bash', 'sql', 'go', 'python', 'dockerfile', 'kubernetes', 'prompt']
  const current = snippet.lang || 'js'
  const currentIndex = langs.indexOf(current)
  const next = langs[(currentIndex + 1) % langs.length]
  
  snippet.lang = next
  $('meta-lang').textContent = next
  appendLog(`Changed language to: ${next}`, 'action')
}

function insertCtx(select) {
  if (!select.value) return
  const snippet = SNIPPETS[select.value]
  if (!snippet) return
  
  const ta = $('body-prompt')
  const cursor = ta.selectionStart
  const text = ta.value
  ta.value = text.slice(0, cursor) + `@${select.value}` + text.slice(cursor)
  ta.selectionStart = ta.selectionEnd = cursor + select.value.length + 1
  ta.focus()
  
  select.value = ''
}

function toggleSelectAll() {
  const checkboxes = document.querySelectorAll('.snippet-checkbox')
  const selectAll = document.getElementById('select-all')
  
  checkboxes.forEach(cb => {
    cb.checked = selectAll.checked
  })
  
  updateMultiSelect()
}

function chainSelected() {
  const selected = Array.from(document.querySelectorAll('.snippet-checkbox:checked'))
    .map(cb => cb.dataset.snippet)
  
  if (selected.length === 0) return
  
  const chainName = prompt('Chain name:')
  if (!chainName) return
  
  SNIPPETS[chainName] = {
    lang: 'prompt',
    tags: ['chain'],
    body: () => selected.join('\n')
  }
  
  buildList()
  appendLog(`Created chain: ${chainName}`, 'action')
}

function deleteSelected() {
  const selected = Array.from(document.querySelectorAll('.snippet-checkbox:checked'))
    .map(cb => cb.dataset.snippet)
  
  if (selected.length === 0) return
  if (!confirm(`Delete ${selected.length} snippets?`)) return
  
  selected.forEach(name => {
    delete SNIPPETS[name]
  })
  
  buildList()
  appendLog(`Deleted ${selected.length} snippets`, 'action')
}

function testMelquiades() {
  appendLog('Testing Melquíades...', 'action')
  generate()
}

function testInstructMode() {
  appendLog('Testing instruct mode (OpenAI format)...', 'action')
  generate('instruct')
}

function debugCharacters() {
  appendLog('Debugging characters...', 'action')
  fetch('/api/characters')
    .then(resp => resp.json())
    .then(data => {
      console.log('Characters:', data)
      appendLog(`Found ${data.characters?.length || 0} characters`, 'action')
    })
    .catch(e => {
      appendLog(`Error: ${e.message}`, 'error')
    })
}

function suggestNext() {
  appendLog('Suggest next feature not implemented', 'action')
}

