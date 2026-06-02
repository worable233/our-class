<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import ChatLayout from '@/components/chat/ChatLayout.vue'
import ChatSidebar from '@/components/chat/ChatSidebar.vue'
import ChatThread from '@/components/chat/ChatThread.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import ChatSettings from '@/components/chat/ChatSettings.vue'

const router = useRouter()
const auth = useAuthStore()
auth.loadFromStorage()

const sidebarRef = ref<InstanceType<typeof ChatSidebar> | null>(null)
const currentConvId = ref<number | null>(null)
const messages = ref<{ role: 'user' | 'assistant'; content: string }[]>([])
const streaming = ref(false)
const showSettings = ref(false)
const hasConfig = ref(false)

onMounted(async () => {
  if (!auth.isLoggedIn) {
    router.push('/')
    return
  }
  // Check if API key configured
  try {
    const res = await api.get<any>('/chat/config')
    hasConfig.value = !!res.data?.api_key
  } catch {}
  if (!hasConfig.value) {
    showSettings.value = true
  }
})

async function selectConversation(id: number) {
  currentConvId.value = id
  messages.value = []
  try {
    const res = await api.get<any>(`/chat/conversations/${id}`)
    if (res.data?.messages) {
      messages.value = res.data.messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      }))
    }
  } catch {}
}

async function newConversation() {
  if (!hasConfig.value) {
    showSettings.value = true
    return
  }
  try {
    const res = await api.post<any>('/chat/conversations', { title: '新对话' })
    currentConvId.value = res.data?.id
    messages.value = []
    sidebarRef.value?.load()
  } catch {}
}

async function sendMessage(content: string) {
  if (!currentConvId.value) {
    await newConversation()
    if (!currentConvId.value) return
  }

  // Add user message
  const userMsg = { role: 'user' as const, content }
  messages.value.push(userMsg)
  // Add empty assistant message for streaming
  const assistantMsg = { role: 'assistant' as const, content: '' }
  messages.value.push(assistantMsg)
  streaming.value = true

  try {
    const token = localStorage.getItem('ourclass_user')
      ? JSON.parse(localStorage.getItem('ourclass_user') || '{}').token
      : ''

    const response = await fetch(`/api/chat/conversations/${currentConvId.value}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ message: content }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: '请求失败' } }))
      throw new Error(err.error?.message || '请求失败')
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No stream')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          const lastMsg = messages.value[messages.value.length - 1]
          if (data.type === 'text' && lastMsg) {
            lastMsg.content += data.content
          } else if (data.type === 'error' && lastMsg) {
            lastMsg.content = `错误: ${data.content}`
          } else if (data.type === 'done') {
            sidebarRef.value?.load()
          }
        } catch {}
      }
    }
  } catch (e: any) {
    const last = messages.value[messages.value.length - 1]
    if (last) last.content = `错误: ${e.message || '连接失败'}`
  } finally {
    streaming.value = false
  }
}

function stopStream() {
  // The SSE stream will stop when component unmounts or page changes
  streaming.value = false
}

function onSettingsSaved() {
  hasConfig.value = true
  showSettings.value = false
}
</script>

<template>
  <ChatLayout>
    <template #sidebar>
      <ChatSidebar
        ref="sidebarRef"
        @select="selectConversation"
        @new="newConversation"
        @settings="showSettings = true"
      />
    </template>
    <template #main>
      <ChatThread :messages="messages" :loading="streaming" />
      <ChatInput :loading="streaming" @send="sendMessage" @stop="stopStream" />
    </template>
  </ChatLayout>

  <ChatSettings v-if="showSettings" @close="onSettingsSaved" />
</template>
