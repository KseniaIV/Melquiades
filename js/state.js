// ── Shared state ─────────────────────────────────────────────────
// Loaded first; every other module reads these globals.

const $ = (id) => document.getElementById(id)

// name → { lang, body: () => string, id, tags }
const SNIPPETS = {}

// Demo actions for registered panels (postMessage playground).
const MOCK = {
  'k8s-status':      ['3 pods running', 'deployment/api   ✓ ready (1/1)', 'deployment/worker ✓ ready (2/2)'],
  'mock-deploy-dev': ['pulling image v1.4.2…', 'image ready', 'rolling out to dev…', 'rollout complete ✓'],
  'mock-rollback':   ['finding previous revision…', 'restoring v1.4.1', 'rollback complete ✓'],
  'git-push-dry':    ['dry-run: checking remote…', 'dry-run: 2 commits ahead of origin/main', 'dry-run: push ok (nothing sent)'],
}

const state = {
  current: null,        // selected snippet name
  currentId: null,      // DB id of selected snippet (null = not persisted)
  registered: {},       // name → code of registered live panels
  generatedFrom: null,  // snippet that seeded the last generation
  generating: false,
  abortCtrl: null,      // AbortController for the running generation
  prevSnippet: '',      // editor content before generation (restored on stop)
  lastHtml: '',         // last sandbox document (CSS/JS injection target)
}

const treeState = {
  expandedNodes: new Set(),
  selectedNode: null,
  searchTerm: '',
}

const srcdoc = html =>
  `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${html}</body></html>`

// Snippet bodies are stored as thunks locally but arrive as strings from
// the DB; this reads either shape.
const snippetBody = sn =>
  !sn ? '' : (typeof sn.body === 'function' ? sn.body() : (sn.body || ''))
