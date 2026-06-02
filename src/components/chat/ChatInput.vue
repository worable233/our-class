<script setup lang="ts">
import { ref } from 'vue'
import { ArrowUp, Square } from '@lucide/vue'

const emit = defineEmits<{
  send: [content: string]
  stop: []
}>()

const props = defineProps<{
  loading?: boolean
}>()

const input = ref('')

function handleSend() {
  if (props.loading) {
    emit('stop')
    return
  }
  const content = input.value.trim()
  if (!content) return
  emit('send', content)
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
  <div class="border-t border-gray-100 bg-white px-4 pb-4 pt-3">
    <div class="max-w-[48rem] mx-auto">
      <div class="relative border border-gray-200 rounded-2xl bg-gray-50 p-1.5 flex items-end gap-1 focus-within:border-gray-300 transition-colors">
        <textarea
          v-model="input"
          rows="1"
          placeholder="输入消息..."
          class="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none py-2 px-3 leading-6"
          :disabled="loading"
          @keydown="onKeydown"
        />
        <button
          class="h-8 w-8 flex items-center justify-center rounded-full text-white transition-colors shrink-0"
          :class="loading ? 'bg-red-500 hover:bg-red-600' : (input.trim() ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-200')"
          :disabled="!loading && !input.trim()"
          @click="handleSend"
        >
          <Square v-if="loading" :size="14" />
          <ArrowUp v-else :size="16" />
        </button>
      </div>
      <p class="text-xs text-gray-300 text-center mt-2">内容由 AI 生成，仅供参考</p>
    </div>
  </div>
</template>
