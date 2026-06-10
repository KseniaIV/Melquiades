<script setup lang="ts">
import { ref } from "vue"

const output = ref("Click button to load snippets...")

async function fetchSnippets() {
  output.value = "Loading..."

  try {
    const response = await fetch("http://localhost:8092/api/snippets")
    const text = await response.text()

    if (!response.ok) {
      output.value = `Error ${response.status}: ${text}`
      return
    }

    const data = JSON.parse(text)
    output.value = JSON.stringify(data, null, 2)
  } catch (err) {
    output.value = String(err)
  }
}
</script>

<template>
  <main class="page">
    <h1>Melquíades API Test</h1>

    <button @click="fetchSnippets">
      GET /api/snippets
    </button>

    <pre>{{ output }}</pre>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 2rem;
  background: #111;
  color: #eee;
  font-family: system-ui, sans-serif;
}

button {
  padding: 0.7rem 1rem;
  cursor: pointer;
}

pre {
  margin-top: 1rem;
  padding: 1rem;
  min-height: 300px;
  border: 1px solid #444;
  background: #1b1b1b;
  white-space: pre-wrap;
  overflow: auto;
}
</style>