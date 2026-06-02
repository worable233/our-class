<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import ChatMessage from './ChatMessage.vue'

interface Message {
  id?: number
  role: 'user' | 'assistant'
  content: string
}

const props = defineProps<{
  messages: Message[]
  loading?: boolean
}>()

const threadRef = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (threadRef.value) {
      threadRef.value.scrollTop = threadRef.value.scrollHeight
    }
  })
}

watch(() => props.messages.length, scrollToBottom)
watch(() => props.messages[props.messages.length - 1]?.content, scrollToBottom)
</script>

<template>
  <div ref="threadRef" class="flex-1 overflow-y-auto">
    <div class="max-w-[48rem] mx-auto py-6">
      <!-- Empty state -->
      <div v-if="messages.length === 0 && !loading" class="flex flex-col items-center justify-center pt-24 text-center">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white text-lg font-bold mb-4">O</div>
        <h2 class="text-lg font-semibold text-gray-900 mb-1">开始对话</h2>
        <p class="text-sm text-gray-400">输入你的问题，AI 助手将为你解答</p>
      </div>

      <!-- Messages -->
      <ChatMessage
        v-for="(msg, i) in messages"
        :key="i"
        :role="msg.role"
        :content="msg.content"
      />
    </div>
  </div>
</template>
