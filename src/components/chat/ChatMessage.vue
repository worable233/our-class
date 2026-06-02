<script setup lang="ts">
import { computed } from 'vue'
import { Bot, User } from '@lucide/vue'

const props = defineProps<{
  role: 'user' | 'assistant'
  content: string
}>()

const isUser = computed(() => props.role === 'user')

// Simple markdown: convert ```code``` blocks and **bold**, *italic*, and newlines
function render(text: string): string {
  // Escape HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langAttr = lang ? ` class="lang-${lang}"` : ''
    return `<pre class="bg-gray-900 text-gray-100 rounded-xl p-4 my-3 overflow-x-auto text-sm leading-relaxed"><code${langAttr}>${code.trim()}</code></pre>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-sm">$1</code>')

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // Newlines (but not inside pre)
  const parts = html.split(/(<pre[\s\S]*?<\/pre>)/g)
  return parts.map((part, i) => {
    if (i % 2 === 1) return part // pre block, skip
    return part.replace(/\n/g, '<br>')
  }).join('')
}
</script>

<template>
  <div class="flex gap-3 px-4 py-5" :class="isUser ? 'justify-end' : 'justify-start'">
    <!-- Assistant avatar (left) -->
    <div v-if="!isUser" class="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white mt-0.5">
      <Bot :size="16" />
    </div>

    <!-- Message content -->
    <div class="max-w-[680px] min-w-0">
      <div
        class="rounded-2xl px-4 py-3 text-sm leading-relaxed"
        :class="isUser ? 'bg-gray-900 text-white rounded-br-md' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-md'"
      >
        <div v-if="!content && role === 'assistant'" class="flex items-center gap-1.5 text-gray-400">
          <span class="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style="animation-delay:0s" />
          <span class="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style="animation-delay:0.15s" />
          <span class="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style="animation-delay:0.3s" />
        </div>
        <div v-else v-html="render(content)" class="[&_pre]:!bg-gray-900 [&_pre]:!text-gray-100 [&_code]:!text-sm" />
      </div>
    </div>

    <!-- User avatar (right) -->
    <div v-if="isUser" class="shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white mt-0.5">
      <User :size="16" />
    </div>
  </div>
</template>
