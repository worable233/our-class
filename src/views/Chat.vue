<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import ChatLayout from '@/components/chat/ChatLayout.vue'
import ChatSidebar from '@/components/chat/ChatSidebar.vue'
import ChatMessage from '@/components/chat/ChatMessage.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import type { ComponentPublicInstance } from 'vue'
import { Star, BarChart3, FileText, MessageSquare, Shuffle, Trophy, Sun, Upload, Newspaper, User, Calendar } from '@lucide/vue'
import SearchPanel from '@/components/chat/SearchPanel.vue'
import RandomPickModal from '@/components/chat/RandomPickModal.vue'
import { useSearchPanel } from '@/composables/useSearchPanel'
import { STREAM_CONFIG } from '@/composables/useStreamAnimation'
const { setResults: setSearchResults } = useSearchPanel()

interface ArticleItem {
  id: number; title: string; cover_url: string; author: string; created_at: string
}

const recentArticles = ref<ArticleItem[]>([])
const articlesLoading = ref(false)

async function loadRecentArticles() {
  articlesLoading.value = true
  try {
    const data = await api.get<ArticleItem[]>('/articles/recent')
    recentArticles.value = (data || []).slice(0, 4)
  } catch { recentArticles.value = [] }
  finally { articlesLoading.value = false }
}

// ── 自定义轮播（模仿 Naive UI 质感/动画） ──
const carouselIndex = ref(0)
const carouselTransition = ref(true)
let carouselTimer: ReturnType<typeof setInterval> | null = null
let dragState: { startY: number; startIdx: number; moved: boolean; offset: number } | null = null
let lastWheelTime = 0

function carouselGoTo(i: number) {
  const len = recentArticles.value.length
  if (len === 0) return
  carouselTransition.value = true
  carouselIndex.value = ((i % len) + len) % len
}
function carouselNext() { carouselGoTo(carouselIndex.value + 1) }
function carouselPrev() { carouselGoTo(carouselIndex.value - 1) }

function carouselWheel(e: WheelEvent) {
  if (recentArticles.value.length < 2) return
  const now = Date.now()
  if (now - lastWheelTime < 280) return
  lastWheelTime = now
  if (e.deltaY > 0) carouselNext()
  else carouselPrev()
}

function carouselPointerDown(e: PointerEvent) {
  if (recentArticles.value.length < 2) return
  dragState = { startY: e.clientY, startIdx: carouselIndex.value, moved: false, offset: 0 }
  // @ts-ignore
  e.target?.setPointerCapture?.(e.pointerId)
}
function carouselPointerMove(e: PointerEvent) {
  if (!dragState) return
  const diff = e.clientY - dragState.startY
  dragState.offset = diff
  if (Math.abs(diff) > 10) { dragState.moved = true; carouselTransition.value = false }
}
function carouselPointerUp(e: PointerEvent) {
  if (!dragState) return
  const diff = e.clientY - dragState.startY
  if (diff < -40) carouselGoTo(dragState.startIdx + 1)
  else if (diff > 40) carouselGoTo(dragState.startIdx - 1)
  else carouselGoTo(dragState.startIdx)
  dragState = null
  setTimeout(() => { carouselTransition.value = true }, 50)
}
function carouselPointerLeave(e: PointerEvent) {
  if (!dragState) return
  carouselPointerUp(e)
}

function startCarousel() {
  stopCarousel()
  if (recentArticles.value.length < 2) return
  carouselTimer = setInterval(carouselNext, 5000)
}
function stopCarousel() {
  if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null }
}

const carouselTrackStyle = computed(() => {
  const idx = carouselIndex.value
  const base = -idx * 240
  const offset = dragState?.offset ?? 0
  return {
    transform: `translateY(${base + (carouselTransition.value ? 0 : offset)}px)`,
    transition: carouselTransition.value ? 'transform .5s cubic-bezier(.16,1,.3,1)' : 'none',
  }
})

// 文章数据变化时重置轮播
watch(recentArticles, (arr) => {
  carouselIndex.value = 0
  if (arr.length > 0) startCarousel()
})

onUnmounted(stopCarousel)

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
  // Parse assistant messages with reasoning JSON (DeepSeek R1 style)
  if (m.role === 'assistant' && typeof m.content === 'string' && m.content.startsWith('{')) {
    try {
      const p = JSON.parse(m.content)
      if (p.text) return { role: m.role, content: p.text }
    } catch {}
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
const inputRef = ref<{ input: string; addExternalFile?: (f: File) => void } | null>(null)
const currentConvId = ref<number | null>(null)

// ── 拖拽上传 ──
const dragging = ref(false)
let dragTimer = 0

function onGlobalDragEnter(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('Files')) return
  e.preventDefault()
  dragging.value = true
}
function onGlobalDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes('Files')) return
  e.preventDefault()
}
function onGlobalDragLeave(e: DragEvent) {
  // 只有当真正离开窗口时才关闭
  if (e.clientX === 0 && e.clientY === 0) dragging.value = false
}
function onGlobalDrop(e: DragEvent) {
  e.preventDefault()
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  inputRef.value?.addExternalFile?.(file)
}

onMounted(() => {
  document.addEventListener('dragenter', onGlobalDragEnter)
  document.addEventListener('dragover', onGlobalDragOver)
  document.addEventListener('dragleave', onGlobalDragLeave)
  document.addEventListener('drop', onGlobalDrop)
})
onUnmounted(() => {
  document.removeEventListener('dragenter', onGlobalDragEnter)
  document.removeEventListener('dragover', onGlobalDragOver)
  document.removeEventListener('dragleave', onGlobalDragLeave)
  document.removeEventListener('drop', onGlobalDrop)
})
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
  } else {
    loadRecentArticles()
  }
})

onMounted(async () => {
  // Load recent articles for homepage carousel (public, no auth needed)
  loadRecentArticles()

  // Load AI feature settings early (needed on homepage too)
  if (auth.isLoggedIn) {
    try { const s = await api.get<any>('/chat/settings'); if (s) settings.value = s } catch {}
  }

  // Only load conversation if URL has an encoded ID
  const encoded = props.encodedId || route.params.encodedId
  if (!encoded) return  // homepage — just show welcome, no redirect

  if (!auth.isLoggedIn) { router.push('/login'); return }

  const seq = ++loadSeq
  // Check config before loading conversation (only for teachers)
  if (auth.isTeacher) {
    try {
      const config = await api.get<any>('/chat/config')
      if (loadSeq !== seq) return
      hasConfig.value = !!config
    } catch {}
    if (loadSeq !== seq) return
    if (!hasConfig.value) { router.push('/teacher/settings'); return }
  }

  try {
    const id = parseInt(atob((encoded as string).replace(/-/g, '+').replace(/_/g, '/')))
    if (!isNaN(id)) {
      if (loadSeq !== seq) return
      const res = await api.get<any>(`/chat/conversations/${id}`)
      if (loadSeq !== seq) return
      currentConvId.value = id
      fileMap.value = res?.file_map || {}
      const reasoningMap = res?.reasoning_map || {}
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
          // Restore persisted reasoning content BEFORE the message (first occurrence)
          if (m.role === 'assistant' && reasoningMap[m.id]) {
            flat.push({ role: 'tool' as any, content: '深度思考', toolStatus: 'done' as const, toolResult: reasoningMap[m.id].slice(0, 200) + (reasoningMap[m.id].length > 200 ? '...' : '') })
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
        // Restore persisted reasoning content BEFORE the message
        const reasoningMap2 = res?.reasoning_map || {}
        if (m.role === 'assistant' && reasoningMap2[m.id]) {
          flat.push({ role: 'tool' as any, content: '深度思考', toolStatus: 'done' as const, toolResult: reasoningMap2[m.id].slice(0, 200) + (reasoningMap2[m.id].length > 200 ? '...' : '') })
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

function formatDate(d: string) {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
}

function openArticleChat(art: ArticleItem) {
  if (!auth.isLoggedIn) { emit('login'); return }
  // Navigate to chat with article context
  welcomeAction(`搜索公众号文章「${art.title}」的内容，帮我总结`)
}

function welcomeAction(prompt: string) {
  if (!auth.isLoggedIn) {
    emit('login')
    return
  }
  if (inputRef.value) {
    inputRef.value.input = prompt
  }
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

async function sendMessage(content: string, isDeepThink?: boolean, isWebSearch?: boolean, files?: { ids: number[]; items: Array<{ id: number; name: string; url: string }> }) {
  if (streaming.value || sending || terminated.value) return
  pendingPickCard.value = null  // Dismiss any pending pick modal
  sending = true

  // Lazy create conversation on first message
  if (!currentConvId.value) {
    // Lazy config check — only teachers need to verify AI is configured
    if (auth.isTeacher && !hasConfig.value) {
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

  // 构建消息内容（带文件附件）
  const msgContent = files?.items?.length
    ? JSON.stringify({ text: content, files: files.ids })
    : content
  const msg: any = { role: 'user', content: msgContent }
  if (files?.items?.length) {
    msg.fileInfo = files.items.map(f => ({
      id: f.id,
      name: f.name,
      url: f.url, // 真实服务器 URL
      size: 0,
      mime_type: '',
    }))
  }
  messages.value.push(msg)
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
        ...(files?.ids?.length ? { file_ids: files.ids } : {}),
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
    let _thinkingAccum = ''

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
              messages.value.splice(messages.value.length - 1, 0, { role: "tool" as any, content: "深度思考中...", toolStatus: "running" } as any)
            }
          } else if (data.type === 'thinking') {
            if (currentConvId.value === convId) {
              _thinkingAccum += data.content
              for (let j = messages.value.length - 1; j >= 0; j--) {
                const m = messages.value[j] as any
                if (m.role === "tool" && m.content === "深度思考中...") {
                  m.content = "思考中 " + data.content.slice(0, 20) + "..."
                  break
                }
              }
            }
          } else if (data.type === 'thinking_done') {
            if (currentConvId.value === convId) {
              for (let j = messages.value.length - 1; j >= 0; j--) {
                const m = messages.value[j] as any
                if (m.role === "tool" && m.toolStatus === "running" && m.content?.includes("思考")) {
                  m.toolStatus = "done"
                  m.content = "深度思考"
                  m.toolResult = _thinkingAccum
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

defineExpose({ toggleSearch() { sidebarRef.value?.toggleSearch() }, closeSearch() { sidebarRef.value?.closeSearch() }, newConversation })


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
  let _thinkingAccum = ''

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
      body: JSON.stringify({ continue: true, thinking: deepThink.value }),
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
              messages.value.splice(messages.value.length - 1, 0, { role: "tool" as any, content: "深度思考中...", toolStatus: "running" } as any)
            }
          } else if (data.type === 'thinking') {
            if (currentConvId.value === convId) {
              _thinkingAccum += data.content
              for (let j = messages.value.length - 1; j >= 0; j--) {
                const m = messages.value[j] as any
                if (m.role === "tool" && m.content === "深度思考中...") {
                  m.content = "思考中 " + data.content.slice(0, 20) + "..."
                  break
                }
              }
            }
          } else if (data.type === 'thinking_done') {
            if (currentConvId.value === convId) {
              for (let j = messages.value.length - 1; j >= 0; j--) {
                const m = messages.value[j] as any
                if (m.role === "tool" && m.toolStatus === "running" && m.content?.includes("思考")) {
                  m.toolStatus = "done"
                  m.content = "深度思考"
                  m.toolResult = _thinkingAccum
                  break
                }
              }
            }
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
  <!-- 全局拖拽上传遮罩 -->
  <transition name="drag-fade">
    <div v-if="dragging" class="drag-overlay" @drop.prevent="onGlobalDrop" @dragover.prevent @dragleave.prevent="onGlobalDragLeave">
      <div class="drag-overlay-content">
        <Upload :size="40" stroke-width="1.5" />
        <div class="drag-overlay-title">拖拽到此处上传</div>
        <div class="drag-overlay-hint">支持图片、文档等文件，仅限单个文件</div>
      </div>
    </div>
  </transition>

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
      <div ref="threadRef" class="flex-1 overflow-y-auto chat-content-area" >
        <div class="chat-scroll-inner">
        <!-- Welcome empty state -->
        <div v-if="!currentConvId && messages.length === 0 && !streaming" class="welcome">
          <div class="welcome-label"><span>/</span>Welcome to OurClass</div>
          <h1 class="welcome-title">班级管理系统</h1>
          <div class="welcome-btns">
            <button class="welcome-btn" @click="welcomeAction('查询我的积分概况')"><Star :size="14" />积分概况</button>
            <button class="welcome-btn" @click="welcomeAction('查询最近的成绩排名')"><BarChart3 :size="14" />成绩排名</button>
            <button class="welcome-btn" @click="welcomeAction('查询最近的作业')"><FileText :size="14" />作业查询</button>
            <button class="welcome-btn" @click="welcomeAction('帮我随机抽取一名学生')"><Shuffle :size="14" />随机抽号</button>
            <button class="welcome-btn" @click="welcomeAction('全班学生的积分排行')"><Trophy :size="14" />积分排行</button>
            <button class="welcome-btn" @click="welcomeAction('今天天气怎么样')"><Sun :size="14" />查天气</button>
          </div>

          <!-- ═══ 最新公众号文章轮播（模仿 Naive UI 质感） ═══ -->
          <div v-if="recentArticles.length > 0" class="article-carousel"
            @wheel.prevent="carouselWheel"
            @pointerdown="carouselPointerDown"
            @pointermove="carouselPointerMove"
            @pointerup="carouselPointerUp"
            @pointerleave="carouselPointerLeave"
            @mouseenter="stopCarousel"
            @mouseleave="startCarousel">
            <div class="carousel-track" :style="carouselTrackStyle">
              <div v-for="art in recentArticles" :key="art.id" class="carousel-slide" @click="openArticleChat(art)">
                <img v-if="art.cover_url" :src="art.cover_url" class="carousel-img" :alt="art.title"
                  @error="($event.target as HTMLImageElement).style.display='none'" />
                <div v-else class="carousel-img-fallback">
                  <Newspaper :size="36" />
                  <span>{{ art.title }}</span>
                </div>
                <div class="carousel-overlay">
                  <div class="carousel-title carousel-clamp">{{ art.title }}</div>
                  <div class="carousel-meta">
                    <span v-if="art.author" class="carousel-author"><User :size="11" />{{ art.author }}</span>
                    <span class="carousel-date"><Calendar :size="11" />{{ formatDate(art.created_at) }}</span>
                  </div>
                </div>
              </div>
            </div>
            <!-- 指示点（Naive UI 风格） -->
            <div v-if="recentArticles.length > 1" class="carousel-dots">
              <button v-for="(_, i) in recentArticles" :key="i"
                :class="['carousel-dot', { active: i === carouselIndex }]"
                @click="carouselGoTo(i)" :aria-label="'第' + (i+1) + '张'" />
            </div>
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
      <ChatInput ref="inputRef"
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
        @conversation-created="selectConversation($event); sidebarRef?.load()"
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
  padding: 6px;
  gap: 0;
}
.chat-thread-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  background: var(--surface-1);
  border-radius: 8px;
  overflow: hidden;
}
.chat-content-area {
  background: var(--ground);
}
.chat-scroll-inner {
  max-width: 768px;
  margin: 0 auto;
  padding: 0;
}

.welcome {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding-top: 100px; padding-bottom: 40px;
  text-align: center;
}
.welcome-label {
  font-size: 12px;
  letter-spacing: 1px; margin-bottom: 12px;
  display: flex; align-items: center; gap: 4px;
  color: var(--text-muted);
}
.welcome-label span { color: var(--accent); }
.welcome-title {
  font-family: 'Inter Tight', sans-serif;
  font-size: 32px; font-weight: 500;
  color: var(--text-primary); margin-bottom: 32px;
  letter-spacing: -0.02em;
  line-height: 1.125;
}
.welcome-btns {
  display: flex; flex-wrap: wrap; align-items: center;
  justify-content: center; gap: 8px;
}
.welcome-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px;
  border-radius: 8px;
  border: 1px solid var(--hairline);
  font-size: 13px; font-weight: 500;
  line-height: 1.4;
  color: var(--text-secondary);
  background: var(--surface-2);
  cursor: pointer;
  transition: all .15s;
  font-family: inherit;
  user-select: none;
}
.welcome-btn:hover {
  color: var(--text-primary);
  border-color: var(--hairline-strong);
  background: var(--surface-3);
}
.welcome-btn:active {
  transform: scale(0.96);
  border-color: var(--accent);
  background: var(--accent-glow);
  color: var(--accent-text);
}
.welcome-btn svg {
  opacity: 0.7;
}
.welcome-btn:hover svg {
  opacity: 1;
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

/* ── 拖拽遮罩 ── */
.drag-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.drag-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #fff;
  padding: 48px;
  border: 2px dashed rgba(255,255,255,.3);
  border-radius: 16px;
}
.drag-overlay-title {
  font-size: 20px;
  font-weight: 600;
}
.drag-overlay-hint {
  font-size: 14px;
  opacity: .6;
}
.drag-fade-enter-active, .drag-fade-leave-active { transition: opacity .2s; }
.drag-fade-enter-from, .drag-fade-leave-to { opacity: 0; }

/* ═══ 公众号文章轮播（Naive UI 风格） ═══ */
.article-carousel {
  position: relative;
  margin: 28px 12px 8px;
  width: 100%;
  max-width: 500px;
  height: 240px;
  margin-left: auto;
  margin-right: auto;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 16px rgba(0,0,0,0.08);
  background: var(--surface-1);
  user-select: none;
  touch-action: none;
}
html.dark .article-carousel {
  box-shadow: 0 2px 20px rgba(0,0,0,0.35);
  border: 1px solid var(--hairline);
}
.carousel-track {
  display: flex;
  flex-direction: column;
  will-change: transform;
}
.carousel-slide {
  position: relative;
  width: 100%;
  height: 240px;
  flex-shrink: 0;
  cursor: pointer;
  overflow: hidden;
}
.carousel-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform .6s cubic-bezier(.22,1,.36,1);
}
.carousel-slide:hover .carousel-img {
  transform: scale(1.06);
}
.carousel-img-fallback {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px;
  background: var(--surface-2);
  color: var(--text-muted);
}
.carousel-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(rgba(0,0,0,0.01) 55%, rgba(0,0,0,0.75));
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 24px 16px 14px;
  text-align: left;
  pointer-events: none;
}
.carousel-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  line-height: 1.5;
  text-shadow: 0 1px 4px rgba(0,0,0,0.35);
  margin-bottom: 4px;
}
.carousel-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.carousel-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.carousel-author, .carousel-date {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  text-shadow: 0 1px 3px rgba(255,255,255,0.25);
}
.carousel-author {
  color: rgba(255,255,255,0.55);
}
.carousel-date {
  color: rgba(255,255,255,0.55);
}
.carousel-author svg,
.carousel-date svg {
  margin-right: 3px;
}
/* ── 指示点（Naive UI 风格右侧竖排） ── */
.carousel-dots {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.carousel-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.35);
  cursor: pointer;
  padding: 0;
  transition: background .3s ease, transform .3s ease, box-shadow .3s ease;
  position: relative;
}
.carousel-dot:hover { background: rgba(255,255,255,0.6); }
.carousel-dot.active {
  background: #fff;
  transform: scale(1.3);
  box-shadow: 0 0 6px rgba(255,255,255,0.3);
}
</style>


