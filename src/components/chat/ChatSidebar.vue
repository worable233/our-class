<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import { Plus, MessageSquare, Trash2, Search, Sun, Moon, LogOut, X } from '@lucide/vue'
import Logo from '@/components/Logo.vue'
import { NTooltip } from 'naive-ui'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{ selectedId?: number | null }>()
const router = useRouter()
const auth = useAuthStore()
const emit = defineEmits<{ select: [id: number]; new: []; login: []; closeSidebar: [] }>()
const { isDark, toggle: toggleTheme } = useTheme()

function handleUserClick() {
  if (auth.isLoggedIn) {
    router.push(auth.isTeacher ? '/teacher/dashboard' : '/student/points')
  } else {
    emit('login')
  }
}

function handleLogout() {
  auth.logout()
  router.push('/')
}

interface Conversation { id: number; title: string; model: string; updated_at: string }

const conversations = ref<Conversation[]>([])
const editingId = ref<number | null>(null)
const editTitle = ref('')
const searchQuery = ref('')
const searchActive = ref(false)

function toggleSearch() { searchActive.value = !searchActive.value; if (!searchActive.value) searchQuery.value = '' }
function closeSearch() { searchActive.value = false; searchQuery.value = '' }
const filtered = computed(() => {
  if (!searchQuery.value) return conversations.value
  const q = searchQuery.value.toLowerCase()
  return conversations.value.filter(c => c.title.toLowerCase().includes(q))
})

function dateLabel(d: string): string {
  const conv = new Date(d.replace(' ', 'T') + 'Z')
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const convDay = new Date(conv.getFullYear(), conv.getMonth(), conv.getDate())
  const days = ['周日','周一','周二','周三','周四','周五','周六']
  if (convDay.getTime() === today.getTime()) return '今天'
  if (convDay.getTime() === yesterday.getTime()) return '昨天'
  if (convDay.getTime() > today.getTime() - 7 * 86400000) return days[convDay.getDay()] || ''
  return `${convDay.getMonth() + 1}月${convDay.getDate()}日`
}

const grouped = computed(() => {
  const list = searchQuery.value ? filtered.value : conversations.value
  const groups: { label: string; items: Conversation[] }[] = []
  let last = ''
  for (const c of list) {
    const l = dateLabel(c.updated_at || '')
    if (l !== last) { groups.push({ label: l, items: [] }); last = l }
    const lastGroup = groups[groups.length - 1]
    if (lastGroup) lastGroup.items.push(c)
  }
  return groups
})

const loading = ref(true)

async function load() {
  if (!auth.isLoggedIn) { loading.value = false; return }
  loading.value = true
  try { conversations.value = (await api.get<Conversation[]>('/chat/conversations')) || [] }
  catch {}
  loading.value = false
}

function select(id: number) {
  if (props.selectedId === id) return
  cancelEdit()
  emit('select', id)
  if (window.innerWidth <= 768) { closeSearch(); emit('closeSidebar') }
  router.push('/chat/' + btoa(String(id)))
}

function startEdit(c: Conversation) {
  editingId.value = c.id
  editTitle.value = c.title
}
async function saveEdit(id: number) {
  if (!editTitle.value.trim()) return
  try { await api.put(`/chat/conversations/${id}/title`, { title: editTitle.value.trim() }) }
  catch {}
  const found = conversations.value.find(c => c.id === id)
  if (found) found.title = editTitle.value.trim()
  editingId.value = null
}
function cancelEdit() { editingId.value = null }

async function remove(id: number) {
  try {
    await api.delete(`/chat/conversations/${id}`)
    conversations.value = conversations.value.filter(c => c.id !== id)
  } catch {}
}

watch(() => auth.isLoggedIn, (loggedIn: boolean) => {
  if (!loggedIn) {
    conversations.value = []
  } else {
    load()
  }
})
onMounted(load)
defineExpose({ load, toggleSearch, closeSearch })
</script>

<template>
  <div class="sidebar">
    <!-- Header: logo + name -->
    <div class="sidebar-head">
      <div class="sidebar-logo" @click="router.push('/')">
        <Logo :size="28" :theme="isDark ? 'dark' : 'light'" />
        <span class="sidebar-logo-text">OurClass</span>
      </div>
    </div>

    <div v-if="searchActive" class="search-bar">
      <Search :size="14" class="search-bar-icon" />
      <input ref="searchInputRef" v-model="searchQuery" placeholder="搜索对话..." class="search-bar-input" />
      <NTooltip trigger="hover" placement="bottom">
        <template #trigger>
          <button class="search-bar-close" @click="toggleSearch()">
            <X :size="14" />
          </button>
        </template>
        关闭搜索
      </NTooltip>
    </div>
    <button v-else class="new-btn" @click="emit('new')">
      <Plus :size="15" stroke-width="2.5" /> 新对话
    </button>

    <div class="list" @click="cancelEdit">
      <template v-for="group in grouped" :key="group.label">
        <div class="section-label">{{ group.label }}</div>
        <div
          v-for="c in group.items"
          :key="c.id"
          class="item"
          :class="{ active: props.selectedId === c.id }"
          @click="select(c.id)"
        >
          <input
            v-if="editingId === c.id"
            v-model="editTitle"
            class="edit-input"
            @click.stop
            @keydown.enter="saveEdit(c.id)"
            @keydown.escape="cancelEdit"
            @blur="saveEdit(c.id)"
          />
          <span v-else class="item-text" @dblclick.stop="startEdit(c)">{{ c.title }}</span>
          <span class="item-del" @click.stop="remove(c.id)"><Trash2 :size="13" /></span>
        </div>
      </template>
      <div v-if="!loading && !conversations.length" class="empty">暂无对话</div>
    </div>

    <div class="list-fade" />

    <div class="user-section">
      <div class="user-bar" :class="{ pointer: auth.isLoggedIn }" @click="handleUserClick">
        <div class="user-avatar" :class="{ 'no-bg': !auth.isLoggedIn }">
          {{ auth.isLoggedIn ? auth.displayName.charAt(0) : '?' }}
        </div>
        <div class="user-text grid">
          <template v-if="auth.isLoggedIn">
            <span class="text-swap-item active">{{ auth.displayName }}</span>
            <span class="text-swap-item">进入后台</span>
          </template>
          <template v-else>
            <span class="text-swap-item active" style="opacity: 1; transform: none;">未登录</span>
          </template>
        </div>
      </div>
      <NTooltip v-if="auth.isLoggedIn" trigger="hover" placement="bottom">
        <template #trigger>
          <button class="theme-btn" @click="handleLogout">
            <LogOut :size="15" />
          </button>
        </template>
退出登录
      </NTooltip>
      <NTooltip trigger="hover" placement="bottom">
        <template #trigger>
          <button class="theme-btn" @click="toggleTheme">
            <Sun v-if="isDark" :size="15" />
            <Moon v-else :size="15" />
          </button>
        </template>
        {{ isDark ? '浅色模式' : '深色模式' }}
      </NTooltip>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex; flex-direction: column;
  background: var(--surface-2);
  position: relative;
  min-width: 0;
}

/* ── Logo ─────────────────────────────── */
.sidebar-head {
  padding: 14px 16px 14px 6px;
  overflow: hidden;
}

.sidebar-logo {
  display: flex; align-items: center;
  gap: 0;
  height: 40px;
  padding: 4px 12px;
  border-radius: 6px;
  transition: background 0.2s;
  cursor: pointer;
}
.sidebar-logo :deep(svg) { display: block; margin-top: 2px; }
.sidebar-logo:hover { background: transparent; }

.sidebar-logo-text {
  font-family: var(--font-orbix);
  font-weight: 600; font-size: 18px;
  line-height: 1;
  color: var(--accent);
  letter-spacing: -0.03em;
  margin-left: 4px;
  margin-top: 2px;
}

/* ── Search / New button ───────────── */
.search-bar {
  position: relative;
  display: flex; align-items: center; gap: 8px;
  margin: 8px 12px 12px;
  padding: 0 4px 0 12px;
  height: 34px;
  border-radius: 8px;
  background: var(--surface-1);
  transition: background-color .3s cubic-bezier(.4,0,.2,1);
}
.search-bar::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  border: 1px solid var(--hairline);
  transition: border-color .3s cubic-bezier(.4,0,.2,1),
              box-shadow .3s cubic-bezier(.4,0,.2,1);
}
html.dark .search-bar::before {
  border-color: transparent;
}
.search-bar:focus-within {
  background-color: rgba(94, 106, 210, 0.08);
}
.search-bar:focus-within::before {
  border-color: #7C7FDC;
  box-shadow: 0 0 8px 0 rgba(94, 106, 210, 0.3);
}
html:not(.dark) .search-bar:focus-within::before {
  box-shadow: 0 0 0 2px rgba(94, 106, 210, 0.2);
}
.search-bar:hover::before {
  border-color: #7C7FDC;
}
html:not(.dark) .search-bar:hover::before {
  border-color: var(--hairline-strong);
}
.search-bar-icon { flex-shrink: 0; color: var(--text-muted); }
.search-bar-input {
  flex: 1; min-width: 0; height: 100%;
  border: none; outline: none; background: transparent;
  font-size: 13px; line-height: 1.5;
  color: var(--text-primary);
  font-family: inherit;
}
.search-bar-input::placeholder { color: var(--text-muted); }
.search-bar-close {
  flex-shrink: 0;
  width: 28px; height: 28px;
  border-radius: 6px;
  border: none; background: transparent;
  color: var(--text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background-color .3s cubic-bezier(.4,0,.2,1),
              color .3s cubic-bezier(.4,0,.2,1),
              transform .3s cubic-bezier(.4,0,.2,1);
}
.search-bar-close:hover { background: var(--surface-2); color: var(--text-primary); }
.search-bar-close:active { transform: scale(0.88); }

.new-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin: 8px 12px 12px;
  height: 34px;
  padding: 0;
  border-radius: 8px;
  font-size: 14px; font-weight: 500;
  color: var(--text-primary);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  cursor: pointer;
  transition: background .15s;
  font-family: inherit;
}
.new-btn {
  transition: background-color .3s cubic-bezier(.4,0,.2,1),
              transform .3s cubic-bezier(.4,0,.2,1);
}
.new-btn:hover { background: var(--surface-3); }
.new-btn:active { transform: scale(0.97); }

/* ── Section label ──────────────────── */
.section-label {
  color: var(--text-muted);
  font-size: 12px; font-weight: 500;
  letter-spacing: 0.01em;
  padding: 8px 16px 6px;
  line-height: 1.5;
  user-select: none;
  position: sticky; top: 0;
  background: var(--surface-2);
  z-index: 2;
}

/* ── List ───────────────────────────── */
.list {
  flex: 1; overflow-y: auto;
  padding: 0 8px 8px;
}

.item {
  position: relative;
  display: flex; align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px; color: var(--text-secondary);
  background: none; border: none;
  cursor: pointer;
  font-family: inherit;
  margin-bottom: 1px;
  user-select: none;
  transition: background-color .3s cubic-bezier(.4,0,.2,1),
              color .3s cubic-bezier(.4,0,.2,1);
}
.item:hover { background: var(--surface-2); color: var(--text-primary); }
.item:active { background: var(--surface-3); }
.item.active {
  color: var(--accent-text);
  background: var(--accent-glow);
}
.item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--accent-text);
  border-radius: 0 2px 2px 0;
}

.item-text {
  flex: 1; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; text-align: left; line-height: 1.5;
}

.edit-input {
  flex: 1;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--accent);
  background: var(--surface-1);
  font-size: 13px; line-height: 1.5;
  color: var(--text-primary);
  outline: none; font-family: inherit;
  transition: border-color .3s cubic-bezier(.4,0,.2,1),
              box-shadow .3s cubic-bezier(.4,0,.2,1);
}
.edit-input:focus {
  border-color: #7C7FDC;
  box-shadow: 0 0 0 2px rgba(94, 106, 210, 0.2);
}

.item-del {
  flex-shrink: 0; opacity: 0;
  color: inherit; cursor: pointer;
  padding: 2px; border-radius: 4px;
  transition: opacity .3s cubic-bezier(.4,0,.2,1);
  display: flex; align-items: center;
}
.item:hover .item-del { opacity: 0.6; }
.item-del:hover { opacity: 1 !important; }
.item-del:active { transform: scale(0.88); }

.empty {
  text-align: center; font-size: 12px;
  color: var(--text-muted); padding: 24px 0;
}

/* ── Bottom fade ────────────────────── */
.list-fade {
  pointer-events: none;
  position: absolute; bottom: 56px; left: 0; right: 0;
  height: 48px;
  background: linear-gradient(180deg, transparent 0%, var(--surface-2) 80%);
}

/* ── User bar ───────────────────────── */
.user-section {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--hairline);
  flex-shrink: 0;
}

.user-bar {
  display: flex; align-items: center; gap: 10px;
  flex: 1; min-width: 0;
  padding: 6px 10px;
  border-radius: 6px;
  background: transparent;
  cursor: default;
  transition: background .12s;
}
.user-bar.pointer { cursor: pointer; }
.user-bar:hover { background: var(--surface-2); }
.user-bar:active { background: var(--surface-3); }

.user-avatar {
  width: 28px; height: 28px;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600;
  flex-shrink: 0;
}
.user-avatar.no-bg {
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 11px;
}

.user-text {
  flex: 1; min-width: 0;
  height: 18px;
  overflow: hidden;
}

.text-swap-item {
  grid-column: 1; grid-row: 1;
  font-size: 13px; font-weight: 500;
  white-space: nowrap;
  color: var(--text-primary);
  opacity: 0;
  transform: translateY(8px);
  transition: opacity .5s cubic-bezier(.4,0,.2,1),
              transform .5s cubic-bezier(.4,0,.2,1);
}
.text-swap-item.active {
  opacity: 1;
  transform: translateY(0);
}

.user-bar:hover .text-swap-item.active {
  opacity: 0;
  transform: translateY(-8px);
}
.user-bar:hover .text-swap-item:not(.active) {
  opacity: 1;
  transform: translateY(0);
  color: var(--accent-text);
  font-weight: 600;
}

.theme-btn {
  width: 28px; height: 28px;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none;
  color: var(--text-secondary);
  cursor: pointer; flex-shrink: 0;
  transition: background-color .3s cubic-bezier(.4,0,.2,1),
              color .3s cubic-bezier(.4,0,.2,1),
              transform .3s cubic-bezier(.4,0,.2,1);
}
.theme-btn:hover { background: var(--surface-2); color: var(--text-primary); }
.theme-btn:active { background: var(--surface-3); transform: scale(0.92); }
</style>
