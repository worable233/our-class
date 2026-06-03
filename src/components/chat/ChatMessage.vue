<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Check, ChevronDown } from '@lucide/vue'
import ToolCard from './ToolCard.vue'
import { marked } from 'marked'

marked.use({ breaks: true, gfm: true })

const props = defineProps<{ role: 'user' | 'assistant' | 'tool' | 'card'; content?: string; streaming?: boolean; toolStatus?: string; card?: Record<string, unknown>; toolResult?: string }>()
const toolExpanded = ref(false)
const isUser = computed(() => props.role === 'user')
const isTool = computed(() => props.role === 'tool')
const isCard = computed(() => props.role === 'card')

function render(text: string): string {
  if (!text) return ''

  let html = marked.parse(text) as string

  html = html.replace(
    /<pre><code class="language-(\w*)">([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => {
      return `<div class="code-block-wrapper"><div class="code-block-header"><figcaption>${lang || 'code'}</figcaption></div><div class="code-block-body"><pre><code>${code}</code></pre></div></div>`
    },
  )

  return html
}
</script>

<template>
  <!-- Tool message — inline pill (DeepSeek-inspired) -->
  <div v-if="isTool" class="tool-line">
    <div class="tool-pill" :class="{ running: toolStatus === 'running' }">
      <Search v-if="toolStatus === 'running'" :size="12" class="tp-icon spin" />
      <Check v-else :size="12" class="tp-icon" />
      <span class="tp-text">{{ content }}</span>
      <button v-if="toolResult" class="tp-chevron" :class="{ open: toolExpanded }" @click.stop="toolExpanded = !toolExpanded">
        <ChevronDown :size="12" />
      </button>
    </div>
    <div v-if="toolResult" class="tool-result-body" :class="{ open: toolExpanded }">{{ toolResult }}</div>
  </div>

  <!-- Rich card -->
  <div v-else-if="isCard && card" class="msg card-msg">
    <ToolCard :card="card" />
  </div>

  <!-- Normal message -->
  <div v-else class="msg" :class="isUser ? 'user' : 'bot'">
    <div class="body">
      <div v-if="!content && !isUser" class="dots"><span /><span /><span /></div>

      <!-- Bot message: real-time markdown rendering -->
      <div v-else-if="!isUser && content" class="text text-bot" v-html="render(content)" />

      <!-- User message -->
      <div v-else class="text text-user" v-html="render(content)" />
    </div>
  </div>
</template>

<style scoped>
.msg {
  display: flex;
  gap: 12px;
  padding: 12px 24px;
  max-width: 820px;
  margin: 0 auto;
  width: 100%;
}
.msg.user { justify-content: flex-end; }
.msg.bot  { justify-content: flex-start; }

/* ── Tool pill (DeepSeek-inspired) ── */
.tool-line {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 4px 24px 4px 24px;
}
.tool-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px 3px 6px;
  border-radius: 9999px;
  font-size: 11.5px;
  color: var(--text-muted);
  background: transparent;
  max-width: 70%;
}
.tool-pill.running {
  color: var(--text-muted);
}
.tp-icon { flex-shrink: 0; display: flex; color: var(--accent-text); }
.tp-icon.spin { animation: tpSpin 1s linear infinite; }
@keyframes tpSpin { to { transform: rotate(360deg); } }
.tp-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tp-chevron {
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  width: 18px; height: 18px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  margin: 0 -2px 0 2px;
  transition: all .15s;
}
.tp-chevron:hover { background: var(--surface-2); color: var(--text-secondary); }
.tp-chevron.open { transform: rotate(180deg); }

.tool-result-body {
  font-size: 11.5px;
  color: var(--text-muted);
  background: transparent;
  padding: 4px 0 2px 0;
  line-height: 1.6;
  word-break: break-all;
  white-space: pre-wrap;
  overflow: hidden;
  max-height: 500px;
  opacity: 1;
  transition: max-height 0.25s ease, opacity 0.2s ease, padding 0.2s ease;
}
.tool-result-body:not(.open) {
  max-height: 0;
  opacity: 0;
  padding: 0;
}
.card-msg { max-width: 600px; }

.body { min-width: 0; max-width: 90%; position: relative; }

.text {
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-primary);
}

.text-user {
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: 8px 8px 3px 8px;
  padding: 8px 14px;
}

.text-bot { padding: 0; }

/* typing dots */
.dots { display: flex; gap: 4px; padding: 2px 0; }
.dots span {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--text-muted);
  animation: bounce 1.2s infinite;
}
.dots span:nth-child(2) { animation-delay: .2s; }
.dots span:nth-child(3) { animation-delay: .4s; }
@keyframes bounce {
  0%,60%,100% { opacity:.2; transform:translateY(0); }
  30% { opacity:1; transform:translateY(-4px); }
}

/* ═══════════════════════════════════════════
   Prose: Fumadocs-inspired (from simple-theme)
   ═══════════════════════════════════════════ */

/* ── Paragraphs ── */
.text-bot :deep(p) {
  margin: 1.25em 0;
}
.text-bot :deep(p:first-child) { margin-top: 0; }
.text-bot :deep(p:last-child)  { margin-bottom: 0; }

/* ── Headings ── */
.text-bot :deep(h1),
.text-bot :deep(h2),
.text-bot :deep(h3),
.text-bot :deep(h4),
.text-bot :deep(h5),
.text-bot :deep(h6) {
  line-height: 1.35;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}
.text-bot :deep(h1) { font-size: 1.5rem;   margin: 1.2em 0 0.6em; }
.text-bot :deep(h2) { font-size: 1.3rem;   margin: 1.6em 0 0.5em; }
.text-bot :deep(h3) { font-size: 1.15rem;  margin: 1.2em 0 0.4em; }
.text-bot :deep(h4) { font-size: 1.05rem;  margin: 1em 0 0.3em;  }

/* ── Lists ── */
.text-bot :deep(ul),
.text-bot :deep(ol) {
  margin: 1em 0;
  padding-left: 1.625em;
}
.text-bot :deep(li) { margin: 0.4em 0; }
.text-bot :deep(li > ul),
.text-bot :deep(li > ol) { margin: 0.4em 0; }

/* ── Links ── */
.text-bot :deep(a) {
  color: var(--text-primary);
  text-decoration: underline;
  text-underline-offset: 3.5px;
  text-decoration-thickness: 1.5px;
  text-decoration-color: color-mix(in srgb, var(--accent) 50%, transparent);
  font-weight: 500;
  transition: opacity 0.2s;
}
.text-bot :deep(a:hover) { opacity: 0.8; }

/* ── Bold ── */
.text-bot :deep(strong) { font-weight: 600; color: var(--text-primary); }

/* ── Blockquote ── */
.text-bot :deep(blockquote) {
  font-style: italic;
  font-weight: 500;
  border-left: 3px solid var(--hairline-strong);
  padding: 0.5em 1em;
  margin: 1.2em 0;
  background: var(--surface-2);
  border-radius: 0 6px 6px 0;
  color: var(--text-secondary);
}
.text-bot :deep(blockquote p) { margin: 0.75em 0; }
.text-bot :deep(blockquote p:first-child) { margin-top: 0; }
.text-bot :deep(blockquote p:last-child)  { margin-bottom: 0; }

/* ── Code blocks (Fumadocs-style wrapper) ── */
.text-bot :deep(.code-block-wrapper) {
  position: relative;
  margin: 1.5em 0;
  border-radius: 8px;
  border: 1px solid var(--hairline);
  background: var(--surface-1);
  overflow: hidden;
}
.text-bot :deep(.code-block-header) {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--hairline);
  background: var(--surface-2);
  font-size: 0.8125rem;
  color: var(--text-muted);
  font-family: 'JetBrains Mono','Fira Code',monospace;
}
.text-bot :deep(.code-block-header figcaption) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.text-bot :deep(.code-block-body) { overflow-x: auto; }
.text-bot :deep(.code-block-body pre) {
  margin: 0;
  padding: 1.25em 1.5em;
  border: none;
  border-radius: 0;
  background: transparent;
  font-size: 0.8125rem;
  line-height: 1.7;
  font-family: 'JetBrains Mono','Fira Code',monospace;
  -webkit-font-smoothing: auto;
}
.text-bot :deep(.code-block-body pre code) {
  background: transparent;
  border: none;
  padding: 0;
  font-size: inherit;
  line-height: inherit;
  color: var(--text-primary);
}

/* ── Inline code ── */
.text-bot :deep(code) {
  font-family: 'JetBrains Mono','Fira Code',monospace;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 0.15em 0.4em;
  font-size: 0.875em;
  color: var(--text-primary);
}
.text-bot :deep(pre code) {
  background: transparent;
  border: 0;
  padding: 0;
  font-size: inherit;
  color: inherit;
}

/* ── Horizontal rule ── */
.text-bot :deep(hr) {
  margin: 2em 0;
  border: 0;
  border-top: 1px solid var(--hairline);
}

/* ── Tables ── */
.text-bot :deep(table) {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--surface-1);
  border-radius: 8px;
  border: 1px solid var(--hairline);
  margin: 1.5em 0;
  font-size: 0.875em;
  overflow: hidden;
}
.text-bot :deep(th) {
  text-align: left;
  padding: 0.6em 0.9em;
  background: var(--surface-2);
  font-weight: 600;
  border-bottom: 1px solid var(--hairline);
  color: var(--text-primary);
}
.text-bot :deep(td) {
  padding: 0.6em 0.9em;
  border-bottom: 1px solid var(--hairline);
  text-align: left;
}
.text-bot :deep(tbody tr:last-child td) { border-bottom: none; }
.text-bot :deep(tbody tr:hover) { background: var(--surface-2); opacity: 0.9; }

/* ── Images ── */
.text-bot :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}
</style>

