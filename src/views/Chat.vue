<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import ChatLayout from '@/components/chat/ChatLayout.vue'
import ChatSidebar from '@/components/chat/ChatSidebar.vue'
import ChatMessage from '@/components/chat/ChatMessage.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import { Star, BarChart3, FileText, MessageSquare } from '@lucide/vue'

const props = withDefaults(defineProps<{ encodedId?: string; sidebarOpen?: boolean }>(), { sidebarOpen: true })
const emit = defineEmits<{ login: [] }>()

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
auth.loadFromStorage()

const sidebarRef = ref<InstanceType<typeof ChatSidebar> | null>(null)
const currentConvId = ref<number | null>(null)
const messages = ref<{ role: 'user' | 'assistant'; content: string }[]>([])
const streaming = ref(false)
const hasConfig = ref(false)
let abortCtrl: AbortController | null = null
let streamTimer = 0
let loadSeq = 0   // prevent stale async loads

function cleanup() {
  clearTimeout(streamTimer)
  streamTimer = 0
  abortCtrl?.abort()
  abortCtrl = null
  streaming.value = false
}

onUnmounted(cleanup)

onMounted(async () => {
  // Only load conversation if URL has an encoded ID
  const encoded = props.encodedId || route.params.encodedId
  if (!encoded) return  // homepage — just show welcome, no redirect

  if (!auth.isLoggedIn) { router.push('/login'); return }

  const seq = ++loadSeq
  // Check config before loading conversation
  try {
    const config = await api.get<any>('/chat/config')
    if (loadSeq !== seq) return
    hasConfig.value = !!config
  } catch {}
  if (loadSeq !== seq) return
  if (!hasConfig.value) { router.push('/teacher/settings'); return }

  try {
    const id = parseInt(atob(encoded))
    if (!isNaN(id)) {
      if (loadSeq !== seq) return
      const res = await api.get<any>(`/chat/conversations/${id}`)
      if (loadSeq !== seq) return
      currentConvId.value = id
      if (res?.messages) {
        messages.value = res.messages.map((m: any) => ({ role: m.role, content: m.content }))
      }
    }
  } catch {}
})

async function selectConversation(id: number) {
  cleanup()
  currentConvId.value = id
  messages.value = []
  router.replace('/chat/' + btoa(String(id)))
  const seq = ++loadSeq
  try {
    const res = await api.get<any>(`/chat/conversations/${id}`)
    if (loadSeq !== seq) return  // stale
    if (res?.messages) {
      messages.value = res.messages.map((m: any) => ({
        role: m.role,
        content: m.content,
      }))
    }
  } catch {}
}

function newConversation() {
  cleanup()
  currentConvId.value = null
  messages.value = []
  router.push('/')
}

async function sendMessage(content: string) {
  if (streaming.value) return  // prevent double-send

  // Lazy create conversation on first message
  if (!currentConvId.value) {
    // Lazy config check
    if (!hasConfig.value) {
      try {
        const config = await api.get<any>('/chat/config')
        hasConfig.value = !!config
      } catch {}
      if (!hasConfig.value) { router.push('/teacher/settings'); return }
    }
    try {
      const title = content.slice(0, 20) + (content.length > 20 ? '...' : '')
      const res = await api.post<any>('/chat/conversations', { title })
      currentConvId.value = res.id
      router.replace('/chat/' + btoa(String(res.id)))
      sidebarRef.value?.load()
    } catch {
      return
    }
  }

  messages.value.push({ role: 'user', content })
  messages.value.push({ role: 'assistant', content: '' })
  const convId = currentConvId.value
  streaming.value = true
  abortCtrl = new AbortController()

  let queue = ''
  let done = false

  function tick() {
    if (!streaming.value || currentConvId.value !== convId) return
    if (!queue) {
      if (done) { streaming.value = false; sidebarRef.value?.load() }
      return
    }
    const chunk = queue.charAt(0)
    queue = queue.slice(1)
    // Find last assistant message (skip tool messages)
    if (currentConvId.value === convId) {
      for (let j = messages.value.length - 1; j >= 0; j--) {
        if (messages.value[j].role === 'assistant') {
          (messages.value[j] as any).content += chunk
          break
        }
      }
    }
    streamTimer = window.setTimeout(tick, 200)
  }

  try {
    const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
    const response = await fetch(`/api/chat/conversations/${currentConvId.value}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: content }),
      signal: abortCtrl.signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: '请求失败' } }))
      throw new Error(err.error?.message || '请求失败')
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No stream')

    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done: d, value } = await reader.read()
      if (d) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'text') {
            queue += data.content
            if (!streamTimer) tick()
          } else if (data.type === 'tool_start') {
            if (currentConvId.value === convId) {
              messages.value.push({ role: 'tool' as any, content: data.label, toolStatus: 'running' } as any)
            }
          } else if (data.type === 'tool_result') {
            if (currentConvId.value === convId) {
              const last = messages.value[messages.value.length - 1] as any
              if (last && last.role === 'tool' && last.toolStatus === 'running') {
                last.toolStatus = 'done'
                last.content = data.summary
              } else {
                messages.value.push({ role: 'tool' as any, content: data.summary, toolStatus: 'done' } as any)
              }
            }
          } else if (data.type === 'tool_card') {
            if (currentConvId.value === convId) {
              messages.value.push({ role: 'card' as any, card: data.card } as any)
            }
          } else if (data.type === 'error') {
            if (currentConvId.value === convId) {
              for (let j = messages.value.length - 1; j >= 0; j--) {
                if (messages.value[j].role === 'assistant') {
                  (messages.value[j] as any).content = `错误: ${data.content}`; break
                }
              }
            }
          } else if (data.type === 'done') {
            done = true
          }
        } catch {}
      }
    }
    // flush remaining to last assistant message
    if (queue && currentConvId.value === convId) {
      for (let j = messages.value.length - 1; j >= 0; j--) {
        if (messages.value[j].role === 'assistant') {
          (messages.value[j] as any).content += queue; break
        }
      }
    }
    queue = ''
    done = true
  } catch (e: any) {
    if (e.name !== 'AbortError' && currentConvId.value === convId) {
      for (let j = messages.value.length - 1; j >= 0; j--) {
        if (messages.value[j].role === 'assistant') {
          (messages.value[j] as any).content = `错误: ${e.message || '连接失败'}`; break
        }
      }
    }
  } finally {
    clearTimeout(streamTimer)
    streamTimer = 0
    if (abortCtrl) abortCtrl = null
    if (currentConvId.value === convId) {
      streaming.value = false
    }
    sidebarRef.value?.load()
  }
}

function stopStream() {
  cleanup()
}

// ── scroll ───────────────────────────────────────────────────────────────
const threadRef = ref<HTMLElement | null>(null)
function scrollToBottom() {
  nextTick(() => {
    if (threadRef.value) threadRef.value.scrollTop = threadRef.value.scrollHeight
  })
}
watch(() => messages.value.length, scrollToBottom)
watch(() => messages.value[messages.value.length - 1]?.content, scrollToBottom)
</script>

<template>
  <ChatLayout :sidebar-open="props.sidebarOpen">
    <template #sidebar>
      <ChatSidebar
        ref="sidebarRef"
        :selected-id="currentConvId"
        @select="selectConversation"
        @new="newConversation"
      />
    </template>
    <template #main>
      <div ref="threadRef" class="flex-1 overflow-y-auto" style="background: var(--ground)">
        <!-- Welcome empty state -->
        <div v-if="!currentConvId && messages.length === 0 && !streaming" class="welcome">
          <div class="welcome-label"><span>/</span>Welcome to OurClass</div>
          <h1 class="welcome-title">班级管理系统</h1>
          <div class="welcome-btns">
            <button class="welcome-btn" @click="router.push('/teacher/points')"><Star :size="14" />积分管理</button>
            <button class="welcome-btn" @click="router.push(auth.isTeacher ? '/teacher/assignments' : '/student/assignments')"><BarChart3 :size="14" />成绩分析</button>
            <button class="welcome-btn" @click="router.push(auth.isTeacher ? '/teacher/assignments' : '/student/assignments')"><FileText :size="14" />作业管理</button>
            <button class="welcome-btn" @click="router.push(auth.isTeacher ? '/teacher/posts' : '/student/posts')"><MessageSquare :size="14" />班级圈</button>
          </div>
        </div>

        <TransitionGroup name="msg" :key="currentConvId || 0">
          <ChatMessage
            v-for="(m, i) in messages"
            :key="i"
            :role="m.role"
            :content="m.content"
            :streaming="streaming && m.role === 'assistant' && !messages.slice(i + 1).some(x => x.role === 'assistant')"
          />
        </TransitionGroup>
      </div>
      <ChatInput :loading="streaming" @send="sendMessage" @stop="stopStream" />
    </template>
  </ChatLayout>
</template>

<style>
/* unscoped — TransitionGroup classes are applied to child component roots */

.welcome {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding-top: 160px; text-align: center;
}
.welcome-label {
  font-family: var(--font-orbix);
  font-size: 12px; text-transform: uppercase;
  letter-spacing: 1px; margin-bottom: 12px;
  display: flex; align-items: center; gap: 4px;
}
.welcome-label span { color: #5E6AD2; }
.welcome-title {
  font-family: 'Inter Tight', sans-serif;
  font-size: 40px; font-weight: 500;
  color: var(--text-primary); margin-bottom: 32px;
  letter-spacing: -0.02em;
}
.welcome-btns {
  display: flex; flex-wrap: wrap; align-items: center;
  justify-content: center; gap: 8px;
}
.welcome-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid var(--hairline);
  font-size: 13px; color: var(--text-muted);
  background: transparent; cursor: pointer;
  transition: all .15s;
}
.welcome-btn:hover {
  color: var(--text-primary);
  border-color: var(--hairline-strong);
}

.msg-enter-active {
  transition: all .3s cubic-bezier(.22,1,.36,1);
}
.msg-leave-active {
  transition: all .15s cubic-bezier(.4,0,1,1);
}
.msg-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.msg-leave-to {
  opacity: 0;
}
</style>
