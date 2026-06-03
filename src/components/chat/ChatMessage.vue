<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Check, ChevronDown, Copy, CheckCheck } from '@lucide/vue'
import { useSearchPanel } from '@/composables/useSearchPanel'
const { open: openSearchPanel, results: searchPanelResults, favicons: spFavicons } = useSearchPanel()

function showSearch() {
  openSearchPanel(searchPanelResults.value)
}

function safeHost2(url: string): string {
  try { return new URL(url).hostname } catch { return '' }
}
import ToolCard from './ToolCard.vue'
import { marked } from 'marked'

marked.use({ breaks: true, gfm: true })

const props = defineProps<{ role: 'user' | 'assistant' | 'tool' | 'card'; content?: string; streaming?: boolean; toolStatus?: string; card?: Record<string, unknown>; toolResult?: string }>()
const toolExpanded = ref(false)
const copied = ref(false)
const isUser = computed(() => props.role === 'user')
const isTool = computed(() => props.role === 'tool')
const isCard = computed(() => props.role === 'card')
const isSearchTool = computed(() => isTool.value && (props.content || '').includes('web_search'))
const hasSearchResults = computed(() => isSearchTool.value && searchPanelResults.value.length > 0)

function stripMd(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .trim()
}

async function doCopy() {
  if (!props.content) return
  try {
    await navigator.clipboard.writeText(stripMd(props.content))
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {}
}

function render(text: string): string {
  if (!text) return ''

  let html = marked.parse(text) as string

  // Replace citation markers [1] [2] etc with styled spans
  html = html.replace(/\[(\d+)\]/g, '<span class="cite">$1</span>')

  html = html.replace(
    /<pre><code class="language-(\w*)">([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => {
      return `<div class="code-block-wrapper"><div class="code-block-header"><figcaption>${lang || 'code'}</figcaption></div><div class="code-block-body"><pre><code>${code}</code></pre></div></div>`
    },
  )

  // Wrap tables for export button
  html = html.replace(
    /<table>([\s\S]*?)<\/table>/g,
    (_, inner) => `<div class="table-wrapper"><div class="table-export"><button class="export-btn" data-action="export-table"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></div><div class="table-scroll"><table>${inner}</table></div></div>`,
  )

  return html
}

function handleTableExport(e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('[data-action="export-table"]')
  if (!btn) return
  e.stopPropagation()
  const wrapper = btn.closest('.table-wrapper')
  if (!wrapper) return
  const table = wrapper.querySelector('table')
  if (!table) return
  // Export as Excel HTML format
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>${table.outerHTML}</body></html>`
  const blob = new Blob([html], { type: 'application/vnd.ms-excel' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'table.xls'
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <!-- Tool message — inline pill -->
  <div v-if="isTool" class="tool-line">
    <div class="tool-pill" :class="{ running: toolStatus === 'running' }">
      <Search v-if="toolStatus === 'running'" :size="12" class="tp-icon spin" />
      <Check v-else :size="12" class="tp-icon" />
      <span class="tp-text">{{ content }}</span>
      <span v-if="isSearchTool && spFavicons.some(f => f)" class="tp-icons">
        <img v-for="(f, i) in spFavicons.filter(f => f).slice(0, 4)" :key="i" :src="f" width="14" height="14" class="tp-favicon" />
      </span>
      <button v-if="isSearchTool && hasSearchResults" class="tp-expand" @click.stop="showSearch()">查看</button>
      <button v-if="!isSearchTool && toolResult" class="tp-chevron" :class="{ open: toolExpanded }" @click.stop="toolExpanded = !toolExpanded">
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
  <div v-else class="msg-wrapper" :class="isUser ? 'user-wrap' : 'bot-wrap'">
    <div class="msg" :class="isUser ? 'user' : 'bot'">
      <div class="body">
        <div v-if="!content && !isUser" class="dots"><span /><span /><span /></div>
        <div v-else-if="!isUser && content" class="text text-bot" v-html="render(content)" @click="handleTableExport" />
        <div v-else class="text text-user" v-html="render(content)" />
      </div>
    </div>
    <div v-if="!isUser && content" class="copy-area">
      <button class="copy-btn" :class="{ done: copied }" @click.stop="doCopy">
        <Copy v-if="!copied" :size="14" />
        <CheckCheck v-else :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.msg-wrapper { max-width: 820px; margin: 0 auto; width: 100%; overflow: hidden; }
.msg-wrapper.user-wrap { display: flex; justify-content: flex-end; }
.msg-wrapper.bot-wrap:hover .copy-area { opacity: 1; }

.msg {
  display: flex;
  gap: 12px;
  padding: 12px 24px;
  width: 100%;
}

@media (max-width: 768px) {
  .msg { padding: 10px 12px; }
  .msg-wrapper { max-width: 100%; }
  .msg-wrapper.bot-wrap .body { max-width: 100%; }
  .copy-area { padding: 0 8px; }
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

.tp-icons { display: flex; gap: 1px; align-items: center; margin-left: 2px; }
.tp-favicon { width: 14px; height: 14px; border-radius: 2px; flex-shrink: 0; object-fit: contain; }
.tp-expand {
  flex-shrink: 0;
  background: none; border: none;
  color: var(--accent-text); font-size: 11px; cursor: pointer;
  padding: 2px 6px; border-radius: 4px; margin-left: 2px;
}
.tp-expand:hover { background: rgba(128,128,128,.1); }
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
  overflow-wrap: break-word;
  word-break: break-word;
}
.text :deep(*) {
  overflow-wrap: break-word;
  word-break: break-word;
}

.text-user {
  background: var(--surface-2);
  border-radius: 8px 8px 3px 8px;
  padding: 8px 14px;
}

.text-bot { padding: 0; }

/* ── Copy button ── */
.copy-area {
  padding: 0 16px;
  width: 100%;
  height: 28px;
  opacity: 0;
  transition: opacity .15s;
  display: flex; align-items: flex-start;
}

.copy-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all .12s;
}
.copy-btn:hover { background: var(--surface-2); color: var(--text-primary); }
.copy-btn.done { color: #22c55e; }

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
.text-bot :deep(ul) {
  list-style: disc outside;
  margin: 1em 0;
  padding-left: 1.625em;
}
.text-bot :deep(ol) {
  list-style: decimal outside;
  margin: 1em 0;
  padding-left: 1.625em;
}
.text-bot :deep(li) { margin: 0.4em 0; display: list-item; }
.text-bot :deep(li::marker) { color: var(--text-muted); }
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
  margin: 1.5em 0;
  border: 0;
  border-top: 1px solid var(--hairline);
  opacity: 0.3;
}

/* ── Tables ── */
.text-bot :deep(.table-wrapper) {
  position: relative;
  margin: 1.5em 0;
}
.text-bot :deep(.table-scroll) {
  overflow-x: auto;
  background:
    linear-gradient(to right, var(--ground), transparent 12px) left,
    linear-gradient(to left, var(--ground), transparent 12px) right,
    linear-gradient(to right, rgba(0,0,0,.06), transparent 24px) left,
    linear-gradient(to left, rgba(0,0,0,.06), transparent 24px) right;
  background-size: 32px 100%, 32px 100%, 32px 100%, 32px 100%;
  background-repeat: no-repeat;
  background-attachment: local, local, scroll, scroll;
}
.text-bot :deep(.table-export) {
  position: absolute; top: 6px; right: 6px;
  opacity: 0; transition: opacity .15s;
  z-index: 1;
}
.text-bot :deep(.table-wrapper:hover .table-export) { opacity: 1; }
.text-bot :deep(.export-btn) {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border-radius: 6px;
  border: 1px solid var(--hairline);
  background: rgba(128,128,128,.08);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--text-secondary);
  cursor: pointer; padding: 0;
  transition: all .12s;
}
.text-bot :deep(.export-btn:hover) { background: rgba(128,128,128,.15); color: var(--text-primary); }

.text-bot :deep(table) {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--surface-1);
  border-radius: 8px;
  border: 1px solid var(--hairline);
  font-size: 0.875em;
}
.text-bot :deep(td), .text-bot :deep(th) {
  white-space: nowrap;
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

/* ── Citation badges ── */
.text-bot :deep(.cite) {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--surface-3); color: var(--text-muted);
  font-size: 10px; font-weight: 600; cursor: pointer;
  vertical-align: middle; margin: 0 2px;
}
.text-bot :deep(.cite:hover) { background: var(--hairline-strong); color: var(--text-primary); }
</style>

