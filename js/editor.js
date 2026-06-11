// ── Snippet selection, CRUD, tags, @context ──────────────────────

function selectSnippet(name) {
  const snippet = SNIPPETS[name]
  if (!snippet) return

  state.current = name
  state.currentId = snippet.id || null

  document.querySelectorAll('.snip-item').forEach(el => {
    el.classList.toggle('active', el.dataset.snippet === name)
  })

  const ta = $('body-snippet')
  if (ta) ta.value = snippetBody(snippet)

  $('meta-title').textContent = name
  $('meta-lang').textContent = snippet.lang || '—'
  $('meta-tags').value = (snippet.tags || []).join(', ')
  updateTagsPanel(snippet.tags || [])

  // JSON snippets get a structural mind map without calling the model.
  const btnMindmap = $('btn-mindmap')
  if (btnMindmap) {
    if (snippet.lang === 'json') {
      btnMindmap.textContent = '📊 JSON Mind map'
      btnMindmap.style.color = '#79c0ff'
      btnMindmap.style.borderColor = '#79c0ff'
    } else {
      btnMindmap.textContent = 'Mind map'
      btnMindmap.style.color = ''
      btnMindmap.style.borderColor = ''
    }
  }

  const picker = $('ctx-picker')
  if (picker) picker.value = ''

  snippet.lang === 'prompt' ? switchTab('prompt') : switchTab('snippet')
  setChain([name])
}

function newSnippet() {
  const name = prompt('Snippet name:')
  if (!name?.trim()) return
  const lang = prompt('Language (js/css/html/markdown/json/yaml/bash/sql/go/python/dockerfile/kubernetes/prompt/chain/mermaid):', 'html') || 'html'
  SNIPPETS[name] = { lang, body: () => '', id: null, tags: [] }
  buildList()
  selectSnippet(name)
  appendLog(`[new] ${name} (${lang}) — edit and save`, 'action')
}

function parseTags() {
  return $('meta-tags').value.split(',').map(t => t.trim()).filter(Boolean)
}

async function save() {
  const name = state.current
  if (!name) { appendLog('[save] no snippet selected', 'error'); return }
  const lang = $('meta-lang').textContent
  const body = $('body-snippet').value
  const tags = parseTags()
  try {
    let resp
    if (state.currentId) {
      resp = await fetch(`/api/snippets/${state.currentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, language: lang, body, status: 'ready', tags }),
      })
    } else {
      resp = await fetch('/api/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, language: lang, body, status: 'ready', tags }),
      })
    }
    if (!resp.ok) {
      const errorText = await resp.text()
      appendLog(`[save] server error ${resp.status}: ${errorText}`, 'error')
      return
    }
    const sn = await resp.json()
    state.currentId = sn.id
    SNIPPETS[name] = { lang, body: () => sn.body, id: sn.id, tags }
    updateTagsPanel(tags)
    appendLog(`[save] ${name} v${sn.version} saved`, 'action')
  } catch (e) {
    appendLog(`[save] network error: ${e.message}`, 'error')
  }
}

async function saveAs() {
  const newName = prompt('Save as:', (state.current || 'snippet') + '-copy')
  if (!newName?.trim()) return
  const lang = $('meta-lang').textContent
  const body = lang === 'prompt' ? $('body-prompt').value : $('body-snippet').value
  const tags = parseTags()
  try {
    const resp = await fetch('/api/snippets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, language: lang, body, status: 'ready', tags }),
    })
    if (!resp.ok) {
      appendLog(`[save-as] server error ${resp.status}: ${await resp.text()}`, 'error')
      return
    }
    const sn = await resp.json()
    SNIPPETS[newName] = { lang, body: () => sn.body, id: sn.id, tags }
    buildList()
    selectSnippet(newName)
    appendLog(`[save-as] ${newName} v1 created`, 'action')
  } catch (e) {
    appendLog(`[save-as] error: ${e.message}`, 'error')
  }
}

async function deleteSnippet() {
  const name = state.current
  if (!name) return
  if (!state.currentId) {
    appendLog(`[delete] ${name} not in DB — removed from list`, 'action')
    delete SNIPPETS[name]
    buildList()
    const first = Object.keys(SNIPPETS)[0]
    if (first) selectSnippet(first)
    return
  }
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
  try {
    await fetch(`/api/snippets/${state.currentId}`, { method: 'DELETE' })
    delete SNIPPETS[name]
    buildList()
    const first = Object.keys(SNIPPETS)[0]
    if (first) selectSnippet(first)
    appendLog(`[delete] ${name} deleted`, 'action')
  } catch (e) {
    appendLog(`[delete] error: ${e.message}`, 'error')
  }
}

function changeLang() {
  const current = $('meta-lang').textContent
  const languages = ['html', 'js', 'css', 'markdown', 'json', 'yaml', 'bash', 'sql', 'go', 'python', 'dockerfile', 'kubernetes', 'prompt', 'chain', 'mermaid']

  const dropdown = document.createElement('select')
  dropdown.style.cssText = 'position: absolute; z-index: 1000; background: var(--bg2); border: 1px solid var(--border); color: var(--fg); padding: 4px; border-radius: 3px; font-size: 11px;'

  languages.forEach(lang => {
    const option = document.createElement('option')
    option.value = lang
    option.textContent = lang
    option.selected = lang === current
    dropdown.appendChild(option)
  })

  const badge = $('meta-lang')
  const rect = badge.getBoundingClientRect()
  dropdown.style.left = rect.left + 'px'
  dropdown.style.top = (rect.bottom + 2) + 'px'

  dropdown.onchange = () => {
    const newLang = dropdown.value
    if (newLang !== current) {
      badge.textContent = newLang
      if (state.current && SNIPPETS[state.current]) SNIPPETS[state.current].lang = newLang
      buildList()
      appendLog(`[lang] changed to ${newLang}`, 'action')
      save()
    }
    document.body.removeChild(dropdown)
  }
  dropdown.onblur = () => setTimeout(() => {
    if (document.body.contains(dropdown)) document.body.removeChild(dropdown)
  }, 200)

  document.body.appendChild(dropdown)
  dropdown.focus()
}

// ── @context references in prompts ───────────────────────────────

function resolveContext(text) {
  const refs = []
  const resolved = text.replace(/@([\.\w-]+)/g, (match, name) => {
    const sn = SNIPPETS[name]
    if (!sn) return match
    refs.push(name)
    return `\n\n[Context: ${name}]\n${snippetBody(sn)}\n`
  })
  return { resolved, refs }
}

function insertCtx(sel) {
  const name = sel.value
  sel.value = ''
  if (!name) return
  const ta = $('body-prompt')
  const pos = ta.selectionStart
  const val = ta.value
  const ins = (pos > 0 && val[pos - 1] !== ' ' && val[pos - 1] !== '\n') ? ` @${name}` : `@${name}`
  ta.value = val.slice(0, pos) + ins + val.slice(pos)
  ta.selectionStart = ta.selectionEnd = pos + ins.length
  ta.focus()
}

// ── Multi-select actions ─────────────────────────────────────────

function chainSelected() {
  const selected = getSelectedSnippets()
  if (selected.length < 2) {
    appendLog('[chain] Select at least 2 snippets to chain', 'error')
    return
  }
  const chainName = prompt('Chain name:', selected.join('-chain'))
  if (!chainName?.trim()) return

  const chainBodyText = selected.join('\n')
  SNIPPETS[chainName] = { lang: 'chain', tags: ['chain', 'auto'], body: () => chainBodyText, id: null }

  buildList()
  selectSnippet(chainName)
  appendLog(`[chain] Created chain "${chainName}" with ${selected.length} snippets`, 'action')

  document.querySelectorAll('.snippet-checkbox').forEach(cb => cb.checked = false)
  updateMultiSelect()
}

async function deleteSelected() {
  const selected = getSelectedSnippets()
  if (selected.length === 0) return

  const confirmMsg = `Delete ${selected.length} snippet${selected.length > 1 ? 's' : ''}?\n${selected.join(', ')}`
  if (!confirm(confirmMsg)) return

  appendLog(`[delete] Deleting ${selected.length} snippets…`, 'action')

  const results = await Promise.all(selected.map(async (name) => {
    const snippet = SNIPPETS[name]
    if (!snippet) return { name, success: false }
    try {
      if (snippet.id) {
        const resp = await fetch(`/api/snippets/${snippet.id}`, { method: 'DELETE' })
        if (!resp.ok) return { name, success: false }
      }
      return { name, success: true }
    } catch (e) {
      return { name, success: false }
    }
  }))

  let deletedCount = 0
  results.forEach(r => {
    if (r.success) {
      delete SNIPPETS[r.name]
      delete state.registered[r.name]
      deletedCount++
    }
  })

  buildList()
  updateRegistry()
  const first = Object.keys(SNIPPETS)[0]
  if (first) selectSnippet(first)
  appendLog(`[delete] Complete: ${deletedCount} deleted, ${results.length - deletedCount} errors`, 'action')
}

// ── Persistence ──────────────────────────────────────────────────

async function loadFromDB() {
  appendLog('[db] Loading snippets from database…', 'action')
  try {
    const resp = await fetch('/api/snippets')
    if (!resp.ok) {
      // The body carries the real error (e.g. 'relation "snippets" does not
      // exist' when the schema was never applied) — surface it, not just 500.
      const detail = (await resp.text().catch(() => '')).trim()
      throw new Error(`HTTP ${resp.status}: ${detail || resp.statusText}`)
    }
    const snips = await resp.json()
    appendLog(`[db] ✓ Loaded ${snips.length} snippets from database`, 'action')
    snips.forEach(sn => {
      SNIPPETS[sn.name] = { lang: sn.language, body: () => sn.body, id: sn.id, tags: sn.tags || [] }
    })
  } catch (e) {
    appendLog(`[db] ✗ Database load failed: ${e.message}`, 'error')
    console.warn('loadFromDB:', e)
  }
  buildList()
}
