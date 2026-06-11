// ── Boot: load snippets, run startup chain, wire filters ─────────

window.addEventListener('message', e => {
  if (e.data?.type === 'exec') runRegistered(e.data.snippet)
})

document.addEventListener('DOMContentLoaded', async () => {
  // Tag filter wiring (the input had no listener before).
  $('tag-filter')?.addEventListener('input', () => buildList())
  $('clear-filter')?.addEventListener('click', () => {
    $('tag-filter').value = ''
    buildList()
  })

  initializeTree()

  try {
    await loadFromDB()
  } catch (e) {
    appendLog(`[startup] loadFromDB failed: ${e.message}`, 'error')
  }

  // A snippet named "startup-chain" acts as the boot sequence.
  const startupChain = SNIPPETS['startup-chain']
  if (startupChain) {
    const names = snippetBody(startupChain).split('\n').map(l => l.trim()).filter(Boolean)
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
})

// ── AI bridge ────────────────────────────────────────────────────
// Sandboxed frames have an opaque origin and no CORS access to the API,
// by design. Instead they postMessage the parent:
//   { type:'ai', id, prompt, system?, includeRunContext? }
// includeRunContext appends state.lastHtml — the code currently loaded
// in the run tab — so the model can see what it is being asked about.
// The parent streams back {type:'ai-token', id, text} and finishes with
// {type:'ai-result', id, text} (or {type:'ai-error', id, error}).
window.addEventListener('message', async (e) => {
  const msg = e.data
  if (msg?.type !== 'ai') return

  // Only frames this app itself embeds may use the bridge.
  const ours = [...document.querySelectorAll('iframe')].map(f => f.contentWindow)
  if (!ours.includes(e.source)) return

  let prompt = String(msg.prompt || '').slice(0, 8000)
  if (msg.includeRunContext && state.lastHtml) {
    prompt += `\n\n[Code currently running in the sandbox]\n${state.lastHtml.slice(0, 4000)}`
  }
  appendLog(`[ai-bridge] sandbox request (${prompt.length} chars)`, 'action')

  try {
    const resp = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        system: String(msg.system || ''),
        character: 'Melquíades',
        mode: 'chat',
      }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

    const reader = resp.body.getReader()
    const dec = new TextDecoder()
    let buf = '', text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)
        if (payload === '[DONE]') continue
        try {
          const tok = JSON.parse(payload)?.choices?.[0]?.delta?.content
          if (tok) {
            text += tok
            e.source.postMessage({ type: 'ai-token', id: msg.id, text }, '*')
          }
        } catch (_) {}
      }
    }
    e.source.postMessage({ type: 'ai-result', id: msg.id, text }, '*')
    appendLog(`[ai-bridge] delivered ${text.length} chars`, 'action')
  } catch (err) {
    e.source.postMessage({ type: 'ai-error', id: msg.id, error: String(err.message || err) }, '*')
    appendLog(`[ai-bridge] error: ${err.message}`, 'error')
  }
})
