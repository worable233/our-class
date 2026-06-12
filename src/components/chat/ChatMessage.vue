<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Loader2, Check, ChevronDown, Copy, CheckCheck } from '@lucide/vue'
import { useSearchPanel } from '@/composables/useSearchPanel'
import * as XLSX from 'xlsx'
import { STREAM_CONFIG, getGlowRgb } from '@/composables/useStreamAnimation'
const { open: openSearchPanel, results: searchPanelResults, favicons: spFavicons } = useSearchPanel()

function showSearch() {
  openSearchPanel()
}

function safeHost2(url: string): string {
  try { return new URL(url).hostname } catch { return '' }
}
import ToolCard from './ToolCard.vue'
import FilePreview from './FilePreview.vue'
import { marked } from 'marked'
import { safeHtml } from '@/utils/sanitize'

marked.use({ breaks: true, gfm: true })

const props = defineProps<{ role: 'user' | 'assistant' | 'tool' | 'card'; content?: string; streaming?: boolean; noCopy?: boolean; toolStatus?: string; card?: Record<string, unknown>; toolResult?: string; _morphing?: boolean; streamTimestamps?: number[]; fileInfo?: Array<{ id: number; name: string; url: string; size: number; mime_type: string }> }>()
const toolExpanded = ref(false)
const copied = ref(false)

// File preview
const previewFile = ref<{ id: number; name: string; url: string; size: number; mime_type: string } | null>(null)
const showPreview = ref(false)

function openFilePreview(file: { id: number; name: string; url: string; size: number; mime_type: string }) {
  previewFile.value = file
  showPreview.value = true
}
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

function render(text: string, postProcess = true): string {
  if (!text) return ''
  let html = marked.parse(text) as string
  // XSS 防护：用 DOMPurify 过滤渲染后的 HTML
  html = safeHtml(html)
  if (!postProcess) return html
  html = html.replace(/\[(\d+)\]/g, '<span class="cite">$1</span>')
  html = html.replace(
    /<pre><code class="language-(\w*)">([\s\S]*?)<\/code><\/pre>/g,
    (_, lang, code) => {
      return `<div class="code-block-wrapper"><div class="code-block-header"><figcaption>${lang || 'code'}</figcaption><button class="code-copy-btn" data-action="copy-code"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button></div><div class="code-block-body"><pre><code>${code}</code></pre></div></div>`
    },
  )
  html = html.replace(
    /<table>([\s\S]*?)<\/table>/g,
    (_, inner) => `<div class="table-wrapper"><div class="table-export"><button class="export-btn" data-action="export-table"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button></div><div class="table-scroll"><table>${inner}</table></div></div>`,
  )
  return html
}

function handleContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const action = target.closest('[data-action]')
  if (!action) return
  e.stopPropagation()

  const dataAction = action.getAttribute('data-action')

  // Table export
  if (dataAction === 'export-table') {
    const wrapper = action.closest('.table-wrapper')
    if (!wrapper) return
    const table = wrapper.querySelector('table')
    if (!table) return
    const data: string[][] = []
    const rows = table.querySelectorAll('tr')
    for (const row of rows) {
      const cells = row.querySelectorAll('th, td')
      data.push(Array.from(cells).map(c => c.textContent?.trim() || ''))
    }
    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, 'exported-table.xlsx')
  }

  // Code block copy
  if (dataAction === 'copy-code') {
    const wrapper = action.closest('.code-block-wrapper')
    if (!wrapper) return
    const code = wrapper.querySelector('code')?.textContent || ''
    if (!code) return
    navigator.clipboard.writeText(code).then(() => {
      const btn = action as HTMLElement
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      setTimeout(() => {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
      }, 1500)
    }).catch(() => {})
  }
}

// ── Streaming: v-html 渲染完整 markdown + rAF 加动画 ───────────────────────

const streamEl = ref<HTMLElement | null>(null)

/**
 * 用 marked.lexer() token 树建立"渲染后字符位置 → 原文字符位置"映射
 * 返回一个数组，mapping[渲染pos] = 原文pos
 */
function buildRenderToContentPos(text: string): number[] {
  const map: number[] = []
  let pos = 0
  try {
    function walk(toks: marked.Token[]) {
      for (const t of toks) {
        const raw = (t as any).raw || ''
        const start = pos
        switch (t.type) {
          case 'text': {
            const txt = (t as marked.Tokens.Text).text
            for (let i = 0; i < txt.length; i++) map.push(pos + i)
            pos += txt.length
            break
          }
          case 'strong': {
            pos += 2 // **
            walk((t as any).tokens || [])
            pos += 2 // **
            break
          }
          case 'em': {
            pos += 1
            walk((t as any).tokens || [])
            pos += 1
            break
          }
          case 'del': {
            pos += 2
            walk((t as any).tokens || [])
            pos += 2
            break
          }
          case 'codespan': {
            const cd = t as marked.Tokens.CodeSpan
            const delimLen = raw.length - cd.text.length
            const openLen = Math.ceil(delimLen / 2)
            pos += openLen
            for (let i = 0; i < cd.text.length; i++) map.push(pos + i)
            pos += cd.text.length
            pos += delimLen - openLen
            break
          }
          case 'code': {
            const cd = t as marked.Tokens.Code
            // raw: ```lang\n + code + \n```
            const openingLen = cd.lang ? cd.lang.length + 4 : 3
            for (let i = 0; i < cd.text.length; i++) map.push(pos + openingLen + i)
            break
          }
          case 'link': {
            const lnk = t as marked.Tokens.Link
            pos += 1 // [
            walk(lnk.tokens || [])
            pos += 1 // ]
            pos += 1 // (
            pos += lnk.href.length
            if (lnk.title) pos += lnk.title.length + 3
            pos += 1 // )
            break
          }
          case 'image': { pos += raw.length; break }
          default: {
            if ((t as any).tokens) walk((t as any).tokens)
            else pos += raw.length
          }
        }
        pos = start + raw.length // 确保对齐 raw 长度
      }
    }
    walk(marked.lexer(text))
  } catch {}
  return map
}

/**
 * 遍历 DOM 文本节点，用 buildRenderToContentPos 映射找到每个渲染字符
 * 在原文中的位置，从而拿到正确的时间戳计算 age
 */
function animateTextNodes(container: HTMLElement, text: string, addCssAnimation = false) {
  const ts = props.streamTimestamps || []
  const now = performance.now()
  const glowMs = STREAM_CONFIG.GLOW_DURATION_MS
  const glowRgb = getGlowRgb()
  const isDark = document.documentElement.classList.contains('dark')
  const contentLen = text.length
  const newCharStart = addCssAnimation ? prevContentLen : contentLen

  // 渲染位置 → 原文位置的映射
  const posMap = buildRenderToContentPos(text)

  // 收集所有 Text node
  const textNodes: Text[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let n: Text | null
  while ((n = walker.nextNode() as Text | null)) textNodes.push(n)

  let renderPos = 0
  for (const textNode of textNodes) {
    const str = textNode.textContent || ''
    if (!str.length) continue
    const parent = textNode.parentNode!
    const frag = document.createDocumentFragment()

    for (let i = 0; i < str.length; i++) {
      const renderIdx = renderPos + i

      // 通过映射找到该渲染字符对应原文的位置
      const contentPos = (renderIdx < posMap.length ? posMap[renderIdx] : contentLen - 1) ?? contentLen - 1
      const batchIdx = Math.floor(contentPos / STREAM_CONFIG.CHARS_PER_TICK)
      const batchTime = ts[batchIdx]
      const age = batchTime ? Math.min(now - batchTime, glowMs) : glowMs

      const opacity = STREAM_CONFIG.INITIAL_OPACITY
        + (1 - STREAM_CONFIG.INITIAL_OPACITY)
        * Math.min(age / STREAM_CONFIG.ANIMATION_DURATION_MS, 1)

      const gp = Math.min(age / glowMs, 1)
      const ge = 1 - (1 - gp) * (1 - gp)
      const ga = 0.9 * (1 - ge)

      const span = document.createElement('span')
      span.textContent = (str[i] ?? '') === ' ' ? ' ' : (str[i] ?? '')
      // 新增字符：CSS 动画渐入；已有字符：JS 计算 opacity（DOM 重建后瞬间恢复）
      if (contentPos >= newCharStart) {
        span.style.animation = `stream-char-in ${STREAM_CONFIG.ANIMATION_DURATION_MS}ms ease forwards`
      } else {
        span.style.opacity = String(opacity)
      }

      span.style.textShadow = isDark && ga > 0.01
        ? `0 0 3px rgba(${glowRgb},${ga.toFixed(2)}), 0 0 8px rgba(${glowRgb},${(ga * 0.65).toFixed(2)}), 0 0 20px rgba(${glowRgb},${(ga * 0.35).toFixed(2)})`
        : 'none'
      frag.appendChild(span)
    }

    renderPos += str.length
    parent.replaceChild(frag, textNode)
  }
}

// 记录上次内容长度，用于判断哪些字符是新增的（需要 CSS 动画）
let prevContentLen = 0

watch(
  [() => props.content, () => props.streaming],
  () => {
    if (props.role !== 'assistant' || !props.content) return
    const el = streamEl.value
    if (!el) return

    // 统一用 render() 渲染完整 markdown（含表格、代码块等全部特性）
    el.innerHTML = render(props.content)

    if (props.streaming) {
      const isNewContent = props.content.length > prevContentLen
      animateTextNodes(el, props.content!, isNewContent)
      prevContentLen = props.content.length
    } else {
      prevContentLen = 0
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <!-- Tool message — inline pill -->
  <div v-if="isTool" class="tool-line">
    <div class="tool-pill" :class="{ running: toolStatus === 'running' }">
      <Loader2 v-if="toolStatus === 'running'" :size="12" class="tp-icon spin" />
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
  <div v-else-if="isCard && card" class="msg card-msg" :class="{ 'card-morphing': _morphing }">
    <ToolCard :card="card" />
  </div>

  <!-- Normal message -->
  <div v-else class="msg-wrapper" :class="isUser ? 'user-wrap' : 'bot-wrap'">
    <div class="msg" :class="isUser ? 'user' : 'bot'">
      <div class="body">
        <div v-if="!content && !isUser" class="dots"><span /><span /><span /></div>
        <div v-else-if="!isUser && content && streaming" ref="streamEl" class="text text-bot" @click="handleContentClick" />
        <div v-else-if="!isUser && content" class="text text-bot" v-html="render(content)" @click="handleContentClick" />
        <div v-else class="text text-user">
          <!-- File attachments -->
          <div v-if="fileInfo?.length" class="file-attachments">
            <div
              v-for="f in fileInfo"
              :key="f.id"
              class="file-chip"
              @click="openFilePreview(f)"
              :title="f.name"
            >
              <template v-if="f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(f.name)">
                <img :src="f.url" :alt="f.name" class="file-chip-thumb" @error="(e:any)=>e.target.style.display='none'" />
              </template>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {{ f.name }}
            </div>
          </div>
          <!-- Message text -->
          <div v-html="render(content || '')" />
        </div>
      </div>
    </div>
    <div v-if="!isUser && content && !streaming && !noCopy" class="copy-area">
      <button class="copy-btn" :class="{ done: copied }" @click.stop="doCopy">
        <Copy v-if="!copied" :size="14" />
        <CheckCheck v-else :size="14" />
      </button>
    </div>
  </div>

  <!-- File preview modal -->
  <FilePreview :file="previewFile" :show="showPreview" @update:show="showPreview = $event" />
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
  max-width: min(400px, 60%);
}
.tp-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
.tool-pill.running {
  color: var(--text-muted);
}
.tp-icon { flex-shrink: 0; display: flex; color: var(--accent-text); }
.tp-icon.spin { animation: tpSpin 1s linear infinite; }
@keyframes tpSpin { to { transform: rotate(360deg); } }
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
.tp-chevron:active:not(.open) { transform: scale(0.88); }
.tp-chevron.open:active { transform: rotate(180deg) scale(0.88); }

.tp-icons { display: flex; gap: 1px; align-items: center; margin-left: 2px; }
.tp-favicon { width: 14px; height: 14px; border-radius: 2px; flex-shrink: 0; object-fit: contain; }
.tp-expand {
  flex-shrink: 0;
  background: none; border: none;
  color: var(--accent-text); font-size: 11px; cursor: pointer;
  padding: 2px 6px; border-radius: 4px; margin-left: 2px;
}
.tp-expand:hover { background: var(--surface-2); }
.tp-expand:active { transform: scale(0.88); }
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
.card-morphing { opacity: 0; }

.body { min-width: 0; max-width: 90%; position: relative; }

.text {
  font-size: 15px;
  line-height: 1.6;
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

/* File attachments in user messages */
.file-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}
.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  cursor: pointer;
  transition: all .12s;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-chip:hover {
  border-color: var(--accent);
  color: var(--accent-text);
  background: var(--accent-glow);
}
.file-chip-thumb {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  object-fit: cover;
  flex-shrink: 0;
}

.text-bot { padding: 0; }

/* ── Streaming container ── */
.stream-text {
  white-space: pre-wrap;
}

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
.copy-btn:active { transform: scale(0.88); }
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
/* 新字符渐入动画：从半透明到完全不透明 */
@keyframes stream-char-in {
  from { opacity: 0.5; }
  to { opacity: 1; }
}

/* ═══════════════════════════════════════════
   Prose: Fumadocs-inspired (from simple-theme)
   ═══════════════════════════════════════════ */

.text-bot :deep(p) {
  margin: 1.25em 0;
}
.text-bot :deep(p:first-child) { margin-top: 0; }
.text-bot :deep(p:last-child)  { margin-bottom: 0; }

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

.text-bot :deep(strong) { font-weight: 600; color: var(--text-primary); }

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
.text-bot :deep(.code-block-header .code-copy-btn) {
  margin-left: auto;
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: all .12s;
  opacity: 0;
}
.text-bot :deep(.code-block-wrapper:hover .code-copy-btn) {
  opacity: 1;
}
.text-bot :deep(.code-copy-btn:hover) {
  background: var(--surface-2);
  color: var(--text-primary);
}
.text-bot :deep(.code-copy-btn:active) {
  transform: scale(0.88);
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

.text-bot :deep(hr) {
  margin: 1.5em 0;
  border: 0;
  border-top: 1px solid var(--hairline);
  opacity: 0.3;
}

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
.text-bot :deep(.export-btn:hover) { background: var(--surface-2); color: var(--text-primary); }
.text-bot :deep(.export-btn:active) { transform: scale(0.88); }

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

.text-bot :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

.text-bot :deep(.cite) {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%;
  background: var(--surface-3); color: var(--text-muted);
  font-size: 10px; font-weight: 600; cursor: pointer;
  vertical-align: middle; margin: 0 2px;
}
.text-bot :deep(.cite:hover) { background: var(--hairline-strong); color: var(--text-primary); }
</style>
