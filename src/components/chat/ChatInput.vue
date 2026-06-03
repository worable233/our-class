<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { ArrowUp, Square } from '@lucide/vue'

const emit = defineEmits<{ send: [content: string]; stop: []; login: [] }>()
const props = defineProps<{ loading?: boolean; disabled?: boolean }>()
const auth = useAuthStore()
const input = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

function handleSend() {
  if (props.loading) { emit('stop'); return }
  if (props.disabled) return
  if (!auth.isLoggedIn) { emit('login'); return }
  const c = input.value.trim()
  if (!c) return
  emit('send', c)
  input.value = ''
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  })
}

function onInput() {
  autoResize()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="input-section">
    <div class="input-wrapper">
      <textarea
        ref="textareaRef"
        v-model="input"
        rows="1"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        :disabled="loading || disabled"
        class="input-area"
        @input="onInput"
        @keydown="onKeydown"
      />
      <button
        class="send-btn"
        :class="{ on: input.trim() && !loading, stop: loading }"
        :disabled="!input.trim() && !loading"
        @click="handleSend"
      >
        <ArrowUp v-if="!loading" :size="18" />
        <Square v-else :size="14" :fill="'currentColor'" />
      </button>
    </div>
    <p class="hint">AI 生成内容仅供参考，请核实重要信息</p>
  </div>
</template>

<style scoped>
.input-section {
  padding: 0 16px 8px 16px;
  background: var(--ground);
}

.input-wrapper {
  max-width: 768px;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 12px;
  padding: 8px 8px 8px 16px;
  transition: border-color .15s, box-shadow .15s;
}
.input-wrapper:hover {
  border-color: var(--hairline-strong);
}
.input-wrapper:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.input-area {
  flex: 1;
  resize: none;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  font-family: inherit;
  padding: 4px 0;
  max-height: 180px;
}
.input-area::placeholder {
  color: var(--text-muted);
}

.send-btn {
  width: 32px; height: 32px;
  border-radius: 8px;
  border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all .12s;
  background: var(--surface-3);
  color: var(--text-muted);
}
.send-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text-secondary);
}
.send-btn:active:not(:disabled) {
  transform: scale(0.92);
}
.send-btn.on {
  background: var(--accent);
  color: #fff;
}
.send-btn.on:hover:not(:disabled) {
  filter: brightness(1.15);
}
.send-btn.on:active:not(:disabled) {
  filter: brightness(0.9);
  transform: scale(0.92);
}
.send-btn.stop {
  background: var(--surface-2);
  color: var(--text-secondary);
}
.send-btn.stop:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text-primary);
}
.send-btn.stop:active:not(:disabled) {
  transform: scale(0.92);
}

.hint {
  text-align: center;
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 6px;
  margin-bottom: 0;
}
</style>
