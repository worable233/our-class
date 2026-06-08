<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import ChatLayout from '@/components/chat/ChatLayout.vue'
import ChatSidebar from '@/components/chat/ChatSidebar.vue'
import ChatMessage from '@/components/chat/ChatMessage.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import { Star, BarChart3, FileText, MessageSquare } from '@lucide/vue'
import SearchPanel from '@/components/chat/SearchPanel.vue'
import RandomPickModal from '@/components/chat/RandomPickModal.vue'
import { useSearchPanel } from '@/composables/useSearchPanel'
import { STREAM_CONFIG } from '@/composables/useStreamAnimation'
const { setResults: setSearchResults } = useSearchPanel()

interface ChatMessage {
  role: string
  content: string
  toolStatus?: 'done' | 'running'
  toolResult?: string
  card?: any
  _morphing?: boolean
  _streamTimestamps?: number[]
  fileInfo?: Array<{ id: number; name: string; url: string; size: number; mime_type: string }>
}

function mapToolMsg(m: any): any {
  if (m.role === 'tool') {
    try {
      const p = JSON.parse(m.content)
      const result: any = { role: m.role, content: p.label || m.content, toolStatus: 'done' as const, toolResult: p.result }
      if (p.card) (result as any).card = p.card
      return result
    }
    catch { return { role: m.role, content: m.content, toolStatus: 'done' as const } }
  }
  if (m.role === 'card') {
    try {
      const p = JSON.parse(m.content)
      return { role: 'card', card: p }
    } catch { return { role: m.role, content: m.content } }
  }
  return { role: m.role, content: m.content, toolStatus: (m.role === 'tool' ? 'done' : undefined) as any }
}

function loadSearchResults(rawMessages: any[]) {
  for (const m of rawMessages) {
    if (m.role === 'tool') {
      try {
        const p = JSON.parse(m.content)
        if (p.label?.includes('web_search') && p.result) {
          const r = JSON.parse(p.result)
          if (Array.isArray(r)) { setSearchResults(r); return }
        }
      } catch {}
    }
  }
}

const props = withDefaults(defineProps<{ encodedId?: string; sidebarOpen?: boolean }>(), { sidebarOpen: true })
const emit = defineEmits<{ login: []; closeSidebar: [] }>()

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
auth.loadFromStorage()

// AI feature settings
const settings = ref({ enable_deep_think: false, enable_file_upload: false })
const deepThink = ref(false)
const webSearch = ref(true)
const fileMap = ref<Record<number, any>>({})

const sidebarRef = ref<InstanceType<typeof ChatSidebar> | null>(null)
const currentConvId = ref<number | null>(null)
const messages = ref<ChatMessage[]>([])
// Group messages into conversation turns (user → response)
const messageGroups = computed(() => {
  const groups: { id: number; messages: typeof messages.value }[] = []
  let groupId = 0
  let current: typeof messages.value = []
  for (const m of messages.value) {
    if (m.role === 'user' && current.length > 0) {
      groups.push({ id: groupId++, messages: current })
      current = []
    }
    current.push(m)
  }
  if (current.length > 0) groups.push({ id: groupId++, messages: current })
  return groups
})
const streaming = ref(false)
const hasConfig = ref(false)
const terminated = ref(false)
const stoppedByUser = ref(false)

// Pending random pick modal — shown during live tool execution, not persisted
interface PendingPickCard {
  type: 'random_pick'
  title: string
  subtitle: string
  candidates: string[]
  result: string[]
  count: number
  note?: string | null
}
const pendingPickCard = ref<PendingPickCard | null>(null)

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

watch(() => auth.isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    messages.value = []
    currentConvId.value = null
    terminated.value = false
    stoppedByUser.value = false
    hasConfig.value = false
  }
})

onMounted(async () => {
  // Load AI feature settings early (needed on homepage too)
  if (auth.isLoggedIn) {
    try { const s = await api.get<any>('/chat/settings'); if (s) settings.value = s } catch {}
  }

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
    const id = parseInt(atob((encoded as string).replace(/-/g, '+').replace(/_/g, '/')))
    if (!isNaN(id)) {
      if (loadSeq !== seq) return
      const res = await api.get<any>(`/chat/conversations/${id}`)
      if (loadSeq !== seq) return
      currentConvId.value = id
      fileMap.value = res?.file_map || {}
      if (res?.messages) {
        const raw = res.messages
        const flat: any[] = []
        for (const m of raw) {
          const msg = mapToolMsg(m)
          // Parse user messages with file JSON
          if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('{')) {
            try {
              const parsed = JSON.parse(m.content)
              msg.content = parsed.text || ''
              const files: any[] = (parsed.files || []).map((fid: number) => fileMap.value[fid]).filter(Boolean)
              if (files.length > 0) msg.fileInfo = files
            } catch {}
          }
          flat.push(msg)
          // If a tool message has embedded card data, emit a card message after the tool pill
          if (m.role === 'tool' && msg.card) {
            flat.push({ role: 'card', card: msg.card })
            delete msg.card
          }
        }
        messages.value = flat
        terminated.value = raw.length >= 100
        loadSearchResults(raw)
      }
    }
  } catch {}
})

async function selectConversation(id: number) {
  cleanup()
  pendingPickCard.value = null
  currentConvId.value = id
  messages.value = []
  terminated.value = false
  stoppedByUser.value = false
  router.replace('/chat/' + btoa(String(id)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
  const seq = ++loadSeq
  try {
    const res = await api.get<any>(`/chat/conversations/${id}`)
    if (loadSeq !== seq) return  // stale
    fileMap.value = res?.file_map || {}
    if (res?.messages) {
      const raw = res.messages
      const flat: any[] = []
      for (const m of raw) {
        const msg = mapToolMsg(m)
        if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith('{')) {
          try {
            const parsed = JSON.parse(m.content)
            msg.content = parsed.text || ''
            const files: any[] = (parsed.files || []).map((fid: number) => fileMap.value[fid]).filter(Boolean)
            if (files.length > 0) msg.fileInfo = files
          } catch {}
        }
        flat.push(msg)
        if (m.role === 'tool' && msg.card) {
          flat.push({ role: 'card', card: msg.card })
          delete msg.card
        }
      }
      messages.value = flat
      terminated.value = raw.length >= 100
      loadSearchResults(raw)
    }
  } catch {}
}

function newConversation() {
  cleanup()
  pendingPickCard.value = null
  currentConvId.value = null
  messages.value = []
  terminated.value = false
  stoppedByUser.value = false
  router.push('/')
}

function welcomeAction(_label: string, prompt: string) {
  if (!auth.isLoggedIn) {
    emit('login')
    return
  }
  sendMessage(prompt)
}

// ── Random pick modal callbacks ──
function onPickModalSkip() {
  if (!pendingPickCard.value) return
  const card = pendingPickCard.value
  messages.value.splice(messages.value.length - 1, 0, { role: 'card' as any, card } as any)
  pendingPickCard.value = null
}

function onPickModalDone(_cardData: PendingPickCard) {
  if (!pendingPickCard.value) return
  console.log('[morph] onPickModalDone START')
  const card = pendingPickCard.value
  const cardIndex = messages.value.length - 1

  // Clone modal results NOW while modal is still in DOM
  const allModalResults = document.querySelectorAll('.rp-modal-results')
  const modalResults = allModalResults[allModalResults.length - 1] as HTMLElement | null
  const sourceRect = modalResults?.getBoundingClientRect() ?? null
  console.log('[morph] source found:', !!sourceRect, '| modalResults exists:', !!modalResults)

  // Create flying clone BEFORE hiding modal
  let clone: HTMLElement | null = null
  if (sourceRect && modalResults) {
    clone = modalResults.cloneNode(true) as HTMLElement
    clone.style.cssText = `position:fixed;left:${sourceRect.left}px;top:${sourceRect.top}px;width:${sourceRect.width}px;z-index:1001;pointer-events:none;`
    document.body.appendChild(clone)
    console.log('[morph] clone created and appended to body')
  }

  // Insert compact card inline (hidden initially)
  messages.value.splice(cardIndex, 0, { role: 'card' as any, card, _morphing: true } as any)

  // Hide modal AFTER cloning
  pendingPickCard.value = null

  nextTick(() => {
    console.log('[morph] nextTick', { hasClone: !!clone, hasSourceRect: !!sourceRect })

    if (!clone || !sourceRect) {
      console.log('[morph] abort: no clone or sourceRect')
      messages.value[cardIndex] = { ...messages.value[cardIndex], _morphing: false } as any
      if (clone) clone.remove()
      return
    }

    const cardMsgs = document.querySelectorAll('.card-msg')
    console.log('[morph] cardMsgs count:', cardMsgs.length)
    const lastCard = cardMsgs[cardMsgs.length - 1]
    const targetEl = lastCard?.querySelector('.rp-results') as HTMLElement | null
    console.log('[morph] targetEl:', !!targetEl)
    const targetRect = targetEl?.getBoundingClientRect() ?? null
    console.log('[morph] sourceRect:', sourceRect.left, sourceRect.top, sourceRect.width, sourceRect.height)
    console.log('[morph] targetRect:', targetRect?.left, targetRect?.top, targetRect?.width, targetRect?.height)

    if (!targetRect) {
      console.log('[morph] abort: no targetRect')
      messages.value[cardIndex] = { ...messages.value[cardIndex], _morphing: false } as any
      clone.remove()
      return
    }

    const dx = targetRect.left - sourceRect.left
    const dy = targetRect.top - sourceRect.top
    const scaleX = targetRect.width / (sourceRect.width || 1)
    console.log('[morph] animating dx:', dx, 'dy:', dy, 'scaleX:', scaleX)

    clone.animate([
      { transform: 'translate(0, 0) scale(1, 1)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, 1)`, opacity: 0.5 }
    ], {
      duration: 400,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      fill: 'forwards'
    }).onfinish = () => {
      console.log('[morph] animation finished, revealing card')
      clone!.remove()
      messages.value[cardIndex] = { ...messages.value[cardIndex], _morphing: false } as any
    }
  })
}

let sending = false

async function sendMessage(content: string, isDeepThink?: boolean, isWebSearch?: boolean, fileIds?: number[]) {
  if (streaming.value || sending || terminated.value) return
  pendingPickCard.value = null  // Dismiss any pending pick modal
  sending = true

  // Lazy create conversation on first message
  if (!currentConvId.value) {
    // Lazy config check
    if (!hasConfig.value) {
      try {
        const config = await api.get<any>('/chat/config')
        hasConfig.value = !!config
      } catch {}
      if (!hasConfig.value) { sending = false; router.push('/teacher/settings'); return }
    }
    try {
      const title = content.slice(0, 20) + (content.length > 20 ? '...' : '')
      const res = await api.post<any>('/chat/conversations', { title })
      currentConvId.value = res.id
      router.replace('/chat/' + btoa(String(res.id)))
      sidebarRef.value?.load()
    } catch {
      sending = false
      return
    }
  }

  messages.value.push({ role: 'user', content })
  messages.value.push({ role: 'assistant', content: '' })
  const convId = currentConvId.value
  stoppedByUser.value = false
  streaming.value = true
  abortCtrl = new AbortController()

  let queue = ''
  let done = false

  function tick() {
    if (currentConvId.value !== convId) return
    if (!queue) {
      if (done) {
        streaming.value = false
        streamTimer = 0
        if (abortCtrl) abortCtrl = null
        // Remove stale empty assistant messages
        messages.value = messages.value.filter(m => !(m.role === 'assistant' && !m.content))
        sidebarRef.value?.load()
      }
      return
    }
    const chars = queue.slice(0, STREAM_CONFIG.CHARS_PER_TICK)
    queue = queue.slice(chars.length)
    if (currentConvId.value === convId) {
      for (let j = messages.value.length - 1; j >= 0; j--) {
        if (messages.value[j]!.role === 'assistant') {
          const msg = messages.value[j] as any
          msg.content += chars
          if (!msg._streamTimestamps) msg._streamTimestamps = []
          msg._streamTimestamps.push(performance.now())
          break
        }
      }
    }
    streamTimer = window.setTimeout(tick, STREAM_CONFIG.TICK_INTERVAL_MS)
  }

  try {
    const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
    const response = await fetch(`/api/chat/conversations/${currentConvId.value}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        message: content,
        thinking: isDeepThink ?? deepThink.value,
        web_search: isWebSearch ?? webSearch.value,
        ...(fileIds?.length ? { file_ids: fileIds } : {}),
      }),
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
          } else if (data.type === 'thinking_start') {
            if (currentConvId.value === convId) {
              messages.value.splice(messages.value.length - 1, 0, { role: "tool" as any, content: "\xe6\xb7\xb1\xe5\xba\xa6\xe6\x80\x9d\xe8\x80\x83\xe4\xb8\xad...", toolStatus: "running" } as any)
            }
          } else if (data.type === 'thinking') {
            if (currentConvId.value === convId) {
              for (let j = messages.value.length - 1; j >= 0; j--) {
                const m = messages.value[j] as any
                if (m.role === "tool" && m.content === "\xe6\xb7\xb1\xe5\xba\xa6\xe6\x80\x9d\xe8\x80\x83\xe4\xb8\xad...") {
                  m.content = "\xe6\x80\x9d\xe8\x80\x83\xe4\xb8\xad " + data.content.slice(0, 20) + "..."
                  break
                }
              }
            }
          } else if (data.type === 'thinking_done') {
            if (currentConvId.value === convId) {
              for (let j = messages.value.length - 1; j >= 0; j--) {
                const m = messages.value[j] as any
                if (m.role === "tool" && m.toolStatus === "running" && m.content?.includes("\xe6\x80\x9d\xe8\x80\x83")) {
                  m.toolStatus = "done"
                  m.toolResult = "\xe6\xb7\xb1\xe5\xba\xa6\xe6\x80\x9d\xe8\x80\x83\xe5\xae\x8c\xe6\x88\x90"
                  break
                }
              }
            }
          } else if (data.type === 'tool_start') {
            if (currentConvId.value === convId) {
              // Insert before the pre-pushed assistant message
              messages.value.splice(messages.value.length - 1, 0, { role: 'tool' as any, content: data.label, toolStatus: 'running' } as any)
            }
          } else if (data.type === 'tool_result') {
            if (currentConvId.value === convId) {
              // Find the last running tool message, mark done and store result
              let found = false
              for (let j = messages.value.length - 1; j >= 0; j--) {
                const m = messages.value[j] as any
                if (m.role === 'tool' && m.toolStatus === 'running') {
                  m.toolStatus = 'done'
                  m.toolResult = data.summary
                  found = true
                  break
                }
              }
              if (!found) {
                messages.value.splice(messages.value.length - 1, 0, { role: 'tool' as any, toolStatus: 'done' } as any)
              }
            }
          } else if (data.type === 'tool_card') {
            if (currentConvId.value === convId) {
              if (data.card?.type === 'random_pick') {
                // Show modal instead of inline card during live streaming
                pendingPickCard.value = data.card as PendingPickCard
              } else {
                messages.value.splice(messages.value.length - 1, 0, { role: 'card' as any, card: data.card } as any)
              }
            }
          } else if (data.type === 'search_results') {
            if (currentConvId.value === convId && Array.isArray(data.results)) {
              setSearchResults(data.results)
            }
          } else if (data.type === 'error') {
            if (currentConvId.value === convId) {
              for (let j = messages.value.length - 1; j >= 0; j--) {
                if (messages.value[j]!.role === 'assistant') {
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
    done = true
    // Cleanup empty assistants even when tick never ran (tool-only responses)
    messages.value = messages.value.filter(m => !(m.role === 'assistant' && !m.content))
  } catch (e: any) {
    clearTimeout(streamTimer)
    streamTimer = 0
    const isLimit = e.message?.includes('轮上限')
    if (e.name !== 'AbortError' && currentConvId.value === convId) {
      for (let j = messages.value.length - 1; j >= 0; j--) {
        if (messages.value[j]!.role === 'assistant') {
          (messages.value[j] as any).content = isLimit
            ? `⚠️ 此对话已达上限（50轮），无法继续发送消息。请「新对话」继续使用。`
            : `错误: ${e.message || '连接失败'}`
          break
        }
      }
    }
    if (isLimit) terminated.value = true
    if (currentConvId.value === convId) {
      streaming.value = false
    }
    if (abortCtrl) abortCtrl = null
    messages.value = messages.value.filter(m => !(m.role === 'assistant' && !m.content))
    sidebarRef.value?.load()
  }
  sending = false
}

defineExpose({ toggleSearch() { sidebarRef.value?.toggleSearch() }, closeSearch() { sidebarRef.value?.closeSearch() } })


function stopStream() {
  cleanup()
  stoppedByUser.value = true
  sending = false
}

async function continueGeneration() {
  if (!currentConvId.value || streaming.value || sending) return
  sending = true
  stoppedByUser.value = false
  streaming.value = true
  abortCtrl = new AbortController()
  const convId = currentConvId.value

  let queue = ''
  let done = false

  // Reuse tick for character animation
  const tick = () => {
    if (currentConvId.value !== convId) return
    if (!queue) {
      if (done) {
        streaming.value = false
        streamTimer = 0
        if (abortCtrl) abortCtrl = null
        messages.value = messages.value.filter(m => !(m.role === 'assistant' && !m.content))
        sidebarRef.value?.load()
      }
      return
    }
    const chars = queue.slice(0, STREAM_CONFIG.CHARS_PER_TICK)
    queue = queue.slice(chars.length)
    if (currentConvId.value === convId) {
      for (let j = messages.value.length - 1; j >= 0; j--) {
        if (messages.value[j]!.role === 'assistant') {
          const msg = messages.value[j] as any
          msg.content += chars
          if (!msg._streamTimestamps) msg._streamTimestamps = []
          msg._streamTimestamps.push(performance.now())
          break
        }
      }
    }
    streamTimer = window.setTimeout(tick, STREAM_CONFIG.TICK_INTERVAL_MS)
  }

  try {
    const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
    const response = await fetch(`/api/chat/conversations/${currentConvId.value}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ continue: true }),
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
            messages.value.splice(messages.value.length - 1, 0, { role: 'tool' as any, content: data.label, toolStatus: 'running' } as any)
          } else if (data.type === 'tool_result') {
            for (let j = messages.value.length - 1; j >= 0; j--) {
              const m = messages.value[j] as any
              if (m.role === 'tool' && m.toolStatus === 'running') {
                m.toolStatus = 'done'; break
              }
            }
          } else if (data.type === 'tool_card') {
            if (data.card?.type === 'random_pick') {
              pendingPickCard.value = data.card as PendingPickCard
            } else {
              messages.value.splice(messages.value.length - 1, 0, { role: 'card' as any, card: data.card } as any)
            }
          } else if (data.type === 'error') {
            if (currentConvId.value === convId) {
              for (let j = messages.value.length - 1; j >= 0; j--) {
                if (messages.value[j]!.role === 'assistant') {
                  (messages.value[j] as any).content += `\n\n[错误: ${data.content}]`; break
                }
              }
            }
          } else if (data.type === 'done') {
            done = true
          }
        } catch {}
      }
    }
    done = true
    sending = false
  } catch (e: any) {
    cleanup()
    stoppedByUser.value = true
    sending = false
    // Don't show abort error when user intentionally stopped
    if (e.name !== 'AbortError' && currentConvId.value === convId) {
      for (let j = messages.value.length - 1; j >= 0; j--) {
        if (messages.value[j]!.role === 'assistant') {
          (messages.value[j] as any).content += `\n\n[错误: ${e.message || '连接失败'}]`
          break
        }
      }
    }
  }
}

// ── scroll ───────────────────────────────────────────────────────────────
const threadRef = ref<HTMLElement | null>(null)
function isNearBottom(): boolean {
  if (!threadRef.value) return true
  const el = threadRef.value
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80
}
function scrollToBottom() {
  nextTick(() => {
    if (threadRef.value && isNearBottom()) {
      threadRef.value.scrollTop = threadRef.value.scrollHeight
    }
  })
}
watch(() => messages.value.length, scrollToBottom)
watch(() => messages.value[messages.value.length - 1]?.content, scrollToBottom)
</script>

<template>
  <ChatLayout :sidebar-open="props.sidebarOpen" @close-sidebar="emit('closeSidebar')">
    <template #sidebar>
      <ChatSidebar
        ref="sidebarRef"
        :selected-id="currentConvId"
        @select="selectConversation"
        @new="newConversation"
        @close-sidebar="emit('closeSidebar')"
        @login="emit('login')"
      />
    </template>
    <template #main>
      <div class="chat-main-area">
      <div class="chat-thread-area">
      <div ref="threadRef" class="flex-1 overflow-y-auto" style="background: var(--ground)" >
        <div class="chat-scroll-inner">
        <!-- Welcome empty state -->
        <div v-if="!currentConvId && messages.length === 0 && !streaming" class="welcome">
          <div class="welcome-label"><span>/</span>Welcome to OurClass</div>
          <h1 class="welcome-title">班级管理系统</h1>
          <div class="welcome-btns">
            <button class="welcome-btn" @click="welcomeAction('积分管理', '查询我的积分概况')"><Star :size="14" />积分管理</button>
            <button class="welcome-btn" @click="welcomeAction('成绩分析', '查询最近的成绩排名')"><BarChart3 :size="14" />成绩分析</button>
            <button class="welcome-btn" @click="welcomeAction('作业管理', '查询最近的作业')"><FileText :size="14" />作业管理</button>
          </div>
        </div>

        <div v-for="group in messageGroups" :key="group.id" class="msg-group">
          <ChatMessage
            v-for="(m, i) in group.messages"
            :key="group.id + '-' + i"
            :role="m.role as 'user' | 'assistant' | 'card' | 'tool'"
            :content="m.content"
            :streaming="streaming && m.role === 'assistant' && !group.messages.slice(i + 1).some(x => x.role === 'assistant')"
            :no-copy="stoppedByUser"
            :tool-status="m.toolStatus"
            :tool-result="m.toolResult"
            :card="m.card"
            :_morphing="(m as any)._morphing"
            :stream-timestamps="(m as any)._streamTimestamps"
            :file-info="(m as any).fileInfo"
          />
        </div>
        </div>
        <div v-if="terminated" class="terminated-banner">
          ⚠️ 此对话已达 50 轮上限，无法继续发送消息。请「新对话」继续使用。
        </div>
        <div v-if="stoppedByUser && !terminated" class="continue-bar">
          <button class="continue-btn" @click="continueGeneration">继续生成</button>
        </div>
      </div>
      <ChatInput
        :loading="streaming"
        :disabled="terminated"
        :enable-deep-think="settings.enable_deep_think"
        :enable-file-upload="settings.enable_file_upload"
        :conv-id="currentConvId"
        :deep-think="deepThink"
        :web-search="webSearch"
        @update:deep-think="deepThink = $event"
        @update:web-search="webSearch = $event"
        @send="sendMessage"
        @stop="stopStream"
        @login="emit('login')"
      />
        </div>
        <SearchPanel class="search-sidebar" />
      </div>
    </template>
  </ChatLayout>

  <!-- Random pick modal overlay (teleported to body) -->
  <RandomPickModal
    v-if="pendingPickCard"
    :card="pendingPickCard"
    :visible="!!pendingPickCard"
    @skip="onPickModalSkip"
    @done="onPickModalDone"
  />
</template>

<style>
/* unscoped — TransitionGroup classes are applied to child component roots */

.chat-main-area {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.chat-thread-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.chat-scroll-inner {
  max-width: 768px;
  margin: 0 auto;
  padding: 0;
}

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
  color: var(--text-muted);
}
.welcome-label span { color: var(--accent); }
.welcome-title {
  font-family: 'Inter Tight', sans-serif;
  font-size: 40px; font-weight: 600;
  color: var(--text-primary); margin-bottom: 32px;
  letter-spacing: -0.02em;
}
.welcome-btns {
  display: flex; flex-wrap: wrap; align-items: center;
  justify-content: center; gap: 8px;
}
.welcome-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 16px;
  border-radius: 6px;
  border: 1px solid var(--hairline);
  font-size: 13px; font-weight: 500;
  color: var(--text-secondary);
  background: var(--surface-1);
  cursor: pointer;
  transition: all .12s;
  font-family: inherit;
  user-select: none;
}
.welcome-btn:hover {
  color: var(--text-primary);
  border-color: var(--hairline-strong);
  background: var(--surface-2);
}
.welcome-btn:active {
  transform: scale(0.96);
  border-color: var(--accent);
  background: var(--accent-glow);
  color: var(--accent-text);
}
.welcome-btn {
  transition: all .12s, transform .12s cubic-bezier(.4,0,.2,1);
}

.terminated-banner {
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
  padding: 12px 24px;
  margin: 12px auto;
  max-width: 400px;
  border-radius: 8px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
}

.continue-bar {
  display: flex;
  justify-content: center;
  padding: 4px 24px 16px;
}
.continue-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 18px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--accent-text);
  background: transparent;
  border: 1px solid var(--hairline);
  cursor: pointer;
  font-family: inherit;
  transition: all .15s;
}
.continue-btn:hover {
  border-color: var(--accent);
  background: var(--accent-glow);
}
.continue-btn:active {
  transform: scale(0.96);
}

</style>


