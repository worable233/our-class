<script setup lang="ts">
import { computed } from 'vue'
import { Wrench, Check } from '@lucide/vue'
import ToolCard from './ToolCard.vue'
const props = defineProps<{ role: 'user' | 'assistant' | 'tool' | 'card'; content?: string; streaming?: boolean; toolStatus?: string; card?: Record<string, unknown> }>()
const isUser = computed(() => props.role === 'user')
const isTool = computed(() => props.role === 'tool')
const isCard = computed(() => props.role === 'card')

function render(text: string): string {
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<div class="code-block"><div class="code-header">${lang || 'code'}</div><pre><code>${code.trim()}</code></pre></div>`
  })
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  const parts = html.split(/(<div class="code-block"[\s\S]*?<\/div>)/g)
  return parts.map((p, i) => i % 2 === 1 ? p : p.replace(/\n/g, '<br>')).join('')
}
</script>

<template>
  <!-- Tool message -->
  <div v-if="isTool" class="msg tool-msg">
    <div class="tool-body" :class="{ running: toolStatus === 'running' }">
      <Wrench v-if="toolStatus === 'running'" :size="14" class="tool-icon spinning" />
      <Check v-else :size="14" class="tool-icon done" />
      <span class="tool-text">{{ content }}</span>
    </div>
  </div>

  <!-- Rich card -->
  <div v-else-if="isCard && card" class="msg card-msg">
    <ToolCard :card="card" />
  </div>

  <!-- Normal message -->
  <div v-else class="msg" :class="isUser ? 'user' : 'bot'">
    <div class="body" :class="{ streaming }">
      <div v-if="!content && !isUser" class="dots"><span /><span /><span /></div>
      <div v-else class="text" :class="isUser ? 'text-user' : 'text-bot'" v-html="render(content)" />
      <span v-if="streaming && !isUser && content" class="cursor" />
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

/* Tool message */
.tool-msg { justify-content: center; padding: 6px 24px; }
.tool-body {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px; border-radius: 20px;
  font-size: 12px; color: var(--text-muted);
  background: var(--surface-2); border: 1px solid var(--hairline);
  max-width: 70%;
}
.tool-body.running { color: #3964fe; border-color: rgba(57,100,254,.2); background: rgba(57,100,254,.06); }
.tool-icon { flex-shrink: 0; }
.tool-icon.done { color: #22c55e; }
.tool-icon.spinning { animation: spin 1.5s linear infinite; }
.tool-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-msg { max-width: 600px; }
@keyframes spin { to { transform: rotate(360deg); } }

.body { min-width: 0; max-width: 90%; position: relative; }
.body.streaming :deep(*) { transition: color .1s; }

.text {
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-primary);
}

.text-user {
  background: var(--surface-2);
  border-radius: 14px 3px 14px 14px;
  padding: 8px 14px;
}

.text-bot { padding: 0; }

/* blinking cursor */
.cursor {
  display: inline-block;
  width: 7px; height: 16px;
  background: var(--text-primary);
  vertical-align: text-bottom;
  margin-left: 1px;
  border-radius: 1px;
  animation: blink .8s steps(1) infinite;
}
@keyframes blink {
  0%,100% { opacity: 1; }
  50%     { opacity: 0; }
}

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

/* markdown */
:deep(.code-block) {
  margin: 10px 0; border-radius: 8px; overflow: hidden;
  background: #1b1b1c; border: 1px solid rgba(255,255,255,.06);
}
:deep(.code-header) {
  padding: 5px 12px; font-size: 11px; color: #adb2b8;
  background: rgba(255,255,255,.03); border-bottom: 1px solid rgba(255,255,255,.05);
  text-transform: lowercase;
}
:deep(.code-block pre) {
  margin: 0; padding: 12px 14px; overflow-x: auto;
  font-size: 13px; line-height: 1.6;
  font-family: 'JetBrains Mono','Fira Code',monospace; color: #e1e5ee;
}
:deep(.inline-code) {
  background: var(--surface-3); color: #e11d48;
  padding: 1px 5px; border-radius: 3px; font-size: .92em;
  font-family: 'JetBrains Mono','Fira Code',monospace;
}
:deep(strong) { font-weight: 600; }
:deep(em)     { font-style: italic; }
</style>
