<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { Plus, MessageSquare, Trash2, Settings } from '@lucide/vue'

const emit = defineEmits<{
  select: [id: number]
  new: []
  settings: []
}>()

interface Conversation {
  id: number
  title: string
  model: string
  updated_at: string
}

const conversations = ref<Conversation[]>([])
const selectedId = ref<number | null>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    const res = await api.get<any>('/chat/conversations')
    conversations.value = res.data || []
  } catch {}
  loading.value = false
}

function select(id: number) {
  selectedId.value = id
  emit('select', id)
}

async function remove(id: number) {
  try {
    await api.delete(`/chat/conversations/${id}`)
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (selectedId.value === id) {
      selectedId.value = null
    }
  } catch {}
}

onMounted(load)

defineExpose({ load })
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- New chat button -->
    <div class="p-3">
      <button
        class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors"
        @click="emit('new')"
      >
        <Plus :size="16" />
        新对话
      </button>
    </div>

    <!-- Conversation list -->
    <div class="flex-1 overflow-y-auto px-2 pb-3">
      <div
        v-for="c in conversations"
        :key="c.id"
        class="flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer group transition-colors mb-0.5"
        :class="selectedId === c.id ? 'bg-gray-200' : 'hover:bg-gray-100'"
        @click="select(c.id)"
      >
        <MessageSquare :size="15" class="shrink-0 text-gray-400" />
        <span class="flex-1 text-sm text-gray-700 truncate">{{ c.title }}</span>
        <button
          class="shrink-0 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
          @click.stop="remove(c.id)"
        >
          <Trash2 :size="14" />
        </button>
      </div>
      <div v-if="!loading && conversations.length === 0" class="text-xs text-gray-300 text-center py-8">
        暂无对话
      </div>
      <div v-if="loading" class="text-xs text-gray-300 text-center py-8">加载中...</div>
    </div>

    <!-- Bottom settings -->
    <div class="p-3 border-t border-gray-100">
      <button
        class="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        @click="emit('settings')"
      >
        <Settings :size="15" />
        API 配置
      </button>
    </div>
  </div>
</script>
