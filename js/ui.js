// ── UI primitives: log, tabs, chain display, lists, tree ─────────

function appendLog(msg, cls = '') {
  const el = $('log')
  if (!el) return
  const line = document.createElement('div')
  line.className = `log-line ${cls}`
  line.textContent = `${new Date().toLocaleTimeString('en', { hour12: false })}  ${msg}`
  el.appendChild(line)
  el.scrollTop = el.scrollHeight
}

function switchTab(t) {
  ;['prompt', 'snippet', 'run'].forEach(id => {
    $(`tab-${id}`).classList.toggle('active', id === t)
    $(`screen-${id}`).classList.toggle('active', id === t)
  })
}

function setChain(steps) {
  $('chain').innerHTML = steps.map((s, i) =>
    i < steps.length - 1 ? `<span class="done">${s}</span> → ` : `<span>${s}</span>`
  ).join('')
}

function updateTagsPanel(tags) {
  const panel = $('snippet-tags')
  if (!panel) return
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
  if (!bar) return // registry markup is currently commented out in index.html
  const names = Object.keys(state.registered)
  if (names.length) {
    bar.innerHTML = names.map(name => `<span class="reg-pill">${name}</span>`).join('')
    const empty = $('registry-empty')
    if (empty) empty.style.display = 'none'
  } else {
    bar.innerHTML = ''
    const empty = $('registry-empty')
    if (empty) empty.style.display = 'inline'
  }
}

function buildList() {
  const picker = $('ctx-picker')
  if (picker) {
    picker.innerHTML = '<option value="">@ insert snippet…</option>'
    Object.keys(SNIPPETS).forEach(name => {
      const o = document.createElement('option')
      o.value = name
      o.textContent = name
      picker.appendChild(o)
    })
  }

  const el = $('snip-list')
  el.innerHTML = ''

  const tagFilter = $('tag-filter').value.trim().toLowerCase()
  const filterTags = tagFilter ? tagFilter.split(',').map(t => t.trim()).filter(Boolean) : []
  const clearBtn = $('clear-filter')
  if (clearBtn) clearBtn.style.display = tagFilter ? 'inline-block' : 'none'

  Object.keys(SNIPPETS).forEach(name => {
    if (!SNIPPETS[name]) return

    if (filterTags.length > 0) {
      const snippetTags = (SNIPPETS[name].tags || []).map(t => t.toLowerCase())
      const langMatch = filterTags.some(f => SNIPPETS[name].lang.toLowerCase().includes(f))
      const tagMatch = filterTags.some(f => snippetTags.some(t => t.includes(f)))
      if (!tagMatch && !langMatch) return
    }

    const d = document.createElement('div')
    d.className = 'snip-item'
    d.id = `item-${name}`
    d.dataset.snippet = name
    d.innerHTML = `
      <input type="checkbox" class="snippet-checkbox" data-snippet="${name}" onchange="updateMultiSelect()" style="margin-right: 8px;">
      <span class="snip-name">${name}</span>
      <span class="snip-lang">${SNIPPETS[name].lang}</span>
    `
    if (name === state.current) d.classList.add('active')
    d.onclick = (e) => {
      if (e.target.type !== 'checkbox') selectSnippet(name)
    }
    el.appendChild(d)
  })
  updateMultiSelect()
}

// ── Multi-select ─────────────────────────────────────────────────

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

// ── AI sidebar output ────────────────────────────────────────────

function streamToOutput(text) {
  const el = $('ai-output')
  if (!el) return
  el.textContent = ''
  el.classList.add('live')
  let i = 0
  const iv = setInterval(() => {
    el.textContent += text[i++]
    if (i >= text.length) clearInterval(iv)
  }, 16)
}

// ── Tree panel (markup currently commented out; all entry points
//    null-guard so this is inert until the markup returns) ────────

function categorizeSnippets() {
  const categories = {
    'ui-components': { name: 'UI Components', icon: '🎨', snippets: [], subcategories: {} },
    'events':        { name: 'Events',        icon: '⚡', snippets: [], subcategories: {} },
    'data':          { name: 'Data',          icon: '📊', snippets: [], subcategories: {} },
    'chains':        { name: 'Chains',        icon: '🔗', snippets: [], subcategories: {} },
    'ai':            { name: 'AI & Prompts',  icon: '🤖', snippets: [], subcategories: {} },
    'demo':          { name: 'Demo',          icon: '🎭', snippets: [], subcategories: {} },
    'other':         { name: 'Other',         icon: '📄', snippets: [], subcategories: {} },
  }

  Object.entries(SNIPPETS).forEach(([name, snippet]) => {
    const tags = snippet.tags || []
    const lang = snippet.lang

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
    } else if (lang === 'html' || lang === 'css') {
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
  })

  return categories
}

function getLanguageIcon(lang) {
  const icons = {
    'html': '🌐', 'css': '🎨', 'js': '⚡', 'json': '📊', 'prompt': '🤖',
    'chain': '🔗', 'sql': '🗄️', 'go': '🔧', 'bash': '💻',
  }
  return icons[lang] || '📄'
}

function buildSnippetNode(name) {
  const snippet = SNIPPETS[name]
  if (!snippet) return document.createElement('div')

  const node = document.createElement('div')
  node.className = 'tree-node'
  node.dataset.name = name
  node.dataset.type = 'snippet'

  const content = document.createElement('div')
  content.className = 'tree-node-content'
  if (treeState.selectedNode === name) content.classList.add('selected')

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

  content.append(toggle, icon, label, badge)
  content.addEventListener('click', () => selectNode(name, 'snippet'))
  node.appendChild(content)
  return node
}

function buildTreeNode(name, data) {
  const hasChildren = data.snippets.length > 0 || Object.keys(data.subcategories).length > 0
  const isExpanded = treeState.expandedNodes.has(name)

  const node = document.createElement('div')
  node.className = 'tree-node'
  node.dataset.name = name
  node.dataset.type = 'category'

  const content = document.createElement('div')
  content.className = 'tree-node-content'
  if (treeState.selectedNode === name) content.classList.add('selected')

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

  content.append(toggle, icon, label, badge)
  content.addEventListener('click', () => {
    if (hasChildren) toggleNode(name)
    selectNode(name, 'category')
  })
  node.appendChild(content)

  if (hasChildren) {
    const children = document.createElement('div')
    children.className = `tree-children ${isExpanded ? 'expanded' : ''}`
    children.id = `children-${name}`
    data.snippets.forEach(n => children.appendChild(buildSnippetNode(n)))
    Object.entries(data.subcategories).forEach(([subName, subData]) =>
      children.appendChild(buildTreeNode(subName, subData)))
    node.appendChild(children)
  }

  return node
}

function toggleNode(name) {
  if (treeState.expandedNodes.has(name)) treeState.expandedNodes.delete(name)
  else treeState.expandedNodes.add(name)
  updateTree()
}

function selectNode(name, type) {
  treeState.selectedNode = name
  if (type === 'snippet') selectSnippet(name)
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
      const filteredSnippets = category.snippets.filter(name =>
        name.toLowerCase().includes(searchTerm) ||
        SNIPPETS[name]?.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
      )
      if (filteredSnippets.length === 0) return
      treeContainer.appendChild(buildTreeNode(key, { ...category, snippets: filteredSnippets }))
    } else {
      treeContainer.appendChild(buildTreeNode(key, category))
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
      if (treeState.expandedNodes.size === allCategories.length) treeState.expandedNodes.clear()
      else allCategories.forEach(cat => treeState.expandedNodes.add(cat))
      updateTree()
    })
  }
  updateTree()
}
