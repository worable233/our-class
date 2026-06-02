<script setup lang="ts">
import { ref } from 'vue'
import { ArrowUp } from '@lucide/vue'

const emit = defineEmits<{ send: [content: string]; stop: [] }>()
const props = defineProps<{ loading?: boolean }>()
const input = ref('')

function handleSend() {
  if (props.loading) { emit('stop'); return }
  const c = input.value.trim()
  if (!c) return
  emit('send', c)
  input.value = ''
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
        v-model="input"
        rows="1"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        :disabled="loading"
        class="input-area"
        @keydown="onKeydown"
      />
      <button
        class="send-btn"
        :class="{ on: input.trim() && !loading, stop: loading }"
        :disabled="!input.trim() && !loading"
        @click="handleSend"
      >
        <ArrowUp :size="18" />
      </button>
    </div>
    <p class="hint">AI 生成内容仅供参考，请核实重要信息</p>
  </div>
</template>

<style scoped>
.input-section {
  padding: 0 16px 20px 16px;
  background: var(--ground);
}

.input-wrapper {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 16px;
  padding: 8px 8px 8px 16px;
  transition: border-color .15s;
}
.input-wrapper:focus-within {
  border-color: #3964fe;
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
  border-radius: 50%;
  border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all .15s;
  background: var(--surface-3);
  color: var(--text-muted);
}
.send-btn.on {
  background: #3964fe;
  color: #fff;
}
.send-btn.on:hover {
  filter: brightness(1.1);
}
.send-btn.stop {
  background: #ef4444;
  color: #fff;
}

.hint {
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 10px;
}
</style>
