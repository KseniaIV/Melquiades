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
