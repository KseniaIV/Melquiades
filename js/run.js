// ── Sandbox execution, chains, registered panels ─────────────────

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
  requestAnimationFrame(() => {
    const isFullDoc = code.trimStart().toLowerCase().startsWith('<!doctype') || code.trimStart().toLowerCase().startsWith('<html')
    const sandbox = $('sandbox')

    if (lang === 'css') {
      if (state.lastHtml) {
        state.lastHtml = injectIntoHtml(state.lastHtml, 'css', code)
        sandbox.srcdoc = state.lastHtml
        appendLog(`[execute] ${name} — CSS injected`, 'action')
      } else {
        const demo = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>\n${code}\n</style></head><body><h1>Heading</h1><h2>Subheading</h2><p>Paragraph text. <a href="#">A link</a>.</p><ul><li>Item one</li><li>Item two</li></ul><button>Button</button><input placeholder="Input"></body></html>`
        state.lastHtml = demo
        sandbox.srcdoc = demo
        appendLog(`[execute] ${name} — CSS preview`, 'action')
      }
    } else if (lang === 'js') {
      let jsHtml
      if (state.lastHtml) {
        state.lastHtml = injectIntoHtml(state.lastHtml, 'js', code)
        jsHtml = state.lastHtml
      } else {
        jsHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><div id="widget"></div><script>\ntry {\n${code}\n} catch(e) {\n  console.error('JS Error:', e);\n  document.body.innerHTML += '<div style="color:red;padding:10px;border:1px solid red;margin:10px;">JS Error: ' + e.message + '</div>';\n}\n<\/script></body></html>`
        state.lastHtml = jsHtml
      }
      sandbox.srcdoc = jsHtml
      appendLog(`[execute] ${name} — JS executed`, 'action')
    } else if (lang === 'mermaid') {
      const mermaidHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script><style>body{padding:20px;background:#f5f5f5}.mermaid{background:white;padding:20px;border-radius:8px}<\/style><\/head><body><div class="mermaid">' + code + '<\/div><script>mermaid.initialize({startOnLoad:true})<\/script><\/body><\/html>'
      state.lastHtml = mermaidHtml
      sandbox.srcdoc = mermaidHtml
      appendLog('[execute] ' + name + ' — Mermaid diagram rendered', 'action')
    } else {
      state.lastHtml = isFullDoc ? code : srcdoc(code)
      sandbox.srcdoc = state.lastHtml
      appendLog(`[execute] ${name} — done`, 'action')
    }
  })
}

// Debounced: rapid clicks collapse into one run.
let executeTimeout = null
function execute() {
  if (executeTimeout) clearTimeout(executeTimeout)
  executeTimeout = setTimeout(() => {
    const code = $('body-snippet').value.trim()
    if (!code) { appendLog('snippet is empty', 'error'); return }
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
  }, 50)
}

// Chains combine browser languages into one document; missing snippets
// are generated on the fly (see ai.js: generateMissingSnippet).
async function executeChain(names, source) {
  appendLog(`[chain] Executing ${names.length} snippets from ${source}`, 'action')
  appendLog(`[chain] Snippet names: ${JSON.stringify(names)}`, 'action')
  setChain(names)

  const missingSnippets = names.filter(n => !SNIPPETS[n])
  const existingSnippets = names.filter(n => SNIPPETS[n])

  if (missingSnippets.length > 0) {
    appendLog(`[chain] Found ${missingSnippets.length} missing snippets: ${missingSnippets.join(', ')}`, 'error')
    appendLog('[chain] Auto-generating missing snippets…', 'action')
    for (const missingName of missingSnippets) {
      try {
        const generated = await generateMissingSnippet(missingName, existingSnippets, source)
        if (generated) {
          SNIPPETS[missingName] = generated
          appendLog(`[chain] Generated missing snippet: ${missingName}`, 'action')
        } else {
          appendLog(`[chain] Failed to generate: ${missingName}`, 'error')
        }
      } catch (e) {
        appendLog(`[chain] Error generating ${missingName}: ${e.message}`, 'error')
      }
    }
  }

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
      case 'html': htmlSnippets.push(snippet); break
      case 'css':  cssSnippets.push(snippet);  break
      case 'js':   jsSnippets.push(snippet);   break
      default:     otherSnippets.push({ name, snippet })
    }
  })

  if (htmlSnippets.length > 0 || cssSnippets.length > 0 || jsSnippets.length > 0) {
    appendLog(`[chain] Combining ${htmlSnippets.length} HTML, ${cssSnippets.length} CSS, ${jsSnippets.length} JS snippets`, 'action')

    let combinedContent = ''
    htmlSnippets.forEach(sn => { combinedContent += snippetBody(sn) })
    if (cssSnippets.length > 0) {
      combinedContent += '<style>\n'
      cssSnippets.forEach(sn => { combinedContent += snippetBody(sn) + '\n' })
      combinedContent += '</style>\n'
    }
    if (jsSnippets.length > 0) {
      combinedContent += '<script>\n'
      jsSnippets.forEach(sn => { combinedContent += snippetBody(sn) + '\n' })
      combinedContent += '<\/script>\n'
    }

    appendLog(`[chain] Executing combined content (${combinedContent.length} chars)`, 'action')
    switchTab('run')
    const sandbox = $('sandbox')
    if (sandbox) {
      state.lastHtml = combinedContent
      // Assign srcdoc on the next frame: setting it in the same tick as the
      // tab switch can leave the just-unhidden iframe unpainted until a
      // reflow (the 'blank until you click away and back' bug). runCode()
      // uses the same pattern.
      requestAnimationFrame(() => { sandbox.srcdoc = combinedContent })
    }
  }

  otherSnippets.forEach(({ name, snippet }) => {
    appendLog(`[chain] Skipping non-browser snippet: ${name} (${snippet.lang})`, 'action')
  })

  appendLog('[chain] Chain completed', 'action')
}

function stop() {
  requestAnimationFrame(() => {
    const sandbox = $('sandbox')
    sandbox.srcdoc = '<!DOCTYPE html><html><body></body></html>'
    state.lastHtml = ''
    appendLog('[stop] sandbox cleared', 'action')
  })
}

// ── Registered panels (live mini-tools in the sidebar) ───────────

function register() {
  const name = state.current
  const code = $('body-snippet').value.trim()
  if (!name) return

  if (!state.registered[name]) {
    const bar = $('registry-bar') // registry strip markup is currently commented out
    if (bar) {
      const pill = document.createElement('button')
      pill.className = 'reg-pill'
      pill.textContent = name
      pill.id = `pill-${name}`
      pill.onclick = () => runRegistered(name)
      bar.appendChild(pill)
      const empty = $('registry-empty')
      if (empty) empty.style.display = 'none'
    }
    const area = $('panels-area')
    area.querySelector('.empty-msg')?.remove()
    const card = document.createElement('div')
    card.className = 'panel-card'
    card.id = `card-${name}`
    card.innerHTML = `<div class="panel-card-hdr"><span>${name}</span><span class="x" onclick="removePanel('${name}')">✕</span></div><iframe id="pframe-${name}" sandbox="allow-scripts"></iframe>`
    area.appendChild(card)
  }
  $(`pframe-${name}`).srcdoc = srcdoc(code)
  $(`dot-${name}`)?.classList.add('reg')
  state.registered[name] = code
  appendLog(`[register] ${name} registered as panel/tool`, 'action')
  const steps = state.generatedFrom ? [state.generatedFrom, name, 'execute', 'register ✓'] : [name, 'execute', 'register ✓']
  setChain(steps)
}

function removePanel(name) {
  $(`card-${name}`)?.remove()
  $(`pill-${name}`)?.remove()
  $(`dot-${name}`)?.classList.remove('reg')
  delete state.registered[name]
  if (!Object.keys(state.registered).length) {
    const empty = $('registry-empty')
    if (empty) empty.style.display = ''
    $('panels-area').innerHTML = '<div class="empty-msg">Register a snippet to add it here as a live panel.</div>'
  }
  appendLog(`[register] ${name} removed`, 'action')
}

function runRegistered(name) {
  switchTab('run')
  appendLog(`[deploy-panel] triggered: ${name}`, 'action')
  const lines = MOCK[name] ?? [`${name}: no mock action defined`]
  lines.forEach((l, i) => setTimeout(() => appendLog(`[${name}] ${l}`, 'output'), i * 320))
}
