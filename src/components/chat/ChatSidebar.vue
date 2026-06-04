<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import { Plus, MessageSquare, Trash2, Search, Sun, Moon, LogOut, X } from '@lucide/vue'
import Logo from '@/components/Logo.vue'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{ selectedId?: number | null }>()
const router = useRouter()
const auth = useAuthStore()
const emit = defineEmits<{ select: [id: number]; new: []; login: []; closeSidebar: [] }>()
const { isDark, toggle: toggleTheme } = useTheme()

function handleUserClick() {
  if (auth.isLoggedIn) {
    router.push(auth.isTeacher ? '/teacher/points' : '/student/points')
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
const filtered = computed(() => {
  if (!searchQuery.value) return conversations.value
  const q = searchQuery.value.toLowerCase()
  return conversations.value.filter(c => c.title.toLowerCase().includes(q))
})

function dateLabel(d: string): string {
  const conv = new Date(d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const convDay = new Date(conv.getFullYear(), conv.getMonth(), conv.getDate())
  const days = ['周日','周一','周二','周三','周四','周五','周六']
  if (convDay.getTime() === today.getTime()) return '今天'
  if (convDay.getTime() === yesterday.getTime()) return '昨天'
  if (convDay.getTime() > today.getTime() - 7 * 86400000) return days[convDay.getDay()]
  return `${convDay.getMonth() + 1}月${convDay.getDate()}日`
}

const grouped = computed(() => {
  const list = searchQuery.value ? filtered.value : conversations.value
  const groups: { label: string; items: Conversation[] }[] = []
  let last = ''
  for (const c of list) {
    const l = dateLabel(c.updated_at)
    if (l !== last) { groups.push({ label: l, items: [] }); last = l }
    groups[groups.length - 1].items.push(c)
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
  emit('select', id)
  if (window.innerWidth <= 768) emit('closeSidebar')
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

onMounted(load)
defineExpose({ load, toggleSearch })
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
      <button class="search-bar-close" @click="toggleSearch()" title="关闭搜索">
        <X :size="14" />
      </button>
    </div>
    <button v-else class="new-btn" @click="emit('new')">
      <Plus :size="15" stroke-width="2.5" /> 新对话
    </button>

    <div class="list">
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
      <button class="theme-btn" title="退出登录" @click="handleLogout">
        <LogOut :size="15" />
      </button>
      <button class="theme-btn" @click="toggleTheme" :title="isDark ? '浅色模式' : '深色模式'">
        <Sun v-if="isDark" :size="15" />
        <Moon v-else :size="15" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex; flex-direction: column;
  background: var(--surface-1);
  border-right: 1px solid var(--hairline);
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
.sidebar-logo :deep(svg) {
  display: block;
  margin-top: -2px;
}
.sidebar-logo:hover { background: transparent; }

.sidebar-logo-text {
  font-family: var(--font-orbix);
  font-weight: 600; font-size: 18px;
  line-height: 1;
  color: var(--accent);
  letter-spacing: -0.03em;
  margin-left: 4px;
}

/* ── New chat button ────────────────── */
.search-bar {
  display: flex; align-items: center; gap: 8px;
  margin: 8px 12px 12px;
  padding: 0 4px 0 14px;
  height: 34px;
  border-radius: 8px;
  background: var(--ground);
  border: 1px solid var(--hairline);
  transition: border-color .15s, box-shadow .15s;
}
.search-bar:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}
.search-bar-icon { flex-shrink: 0; color: var(--text-muted); }
.search-bar-input {
  flex: 1; min-width: 0; height: 100%;
  border: none; outline: none; background: transparent;
  font-size: 13px; color: var(--text-primary);
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
  transition: all .12s;
}
.search-bar-close:hover { background: var(--surface-2); color: var(--text-primary); }

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
.new-btn:hover { background: var(--surface-3); }

/* ── Section label ──────────────────── */
.section-label {
  color: var(--text-muted);
  font-size: 10px; font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 16px 6px;
  line-height: 1;
  user-select: none;
  position: sticky; top: 0;
  background: var(--surface-1);
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
  font-size: 13px; color: var(--text-secondary);
  background: none; border: none;
  cursor: pointer; transition: all .12s;
  font-family: inherit;
  margin-bottom: 1px;
  user-select: none;
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
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--accent);
  background: var(--ground);
  font-size: 13px; color: var(--text-primary);
  outline: none; font-family: inherit;
}

.item-del {
  flex-shrink: 0; opacity: 0;
  color: inherit; cursor: pointer;
  padding: 2px; border-radius: 4px;
  transition: opacity .12s;
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
  background: linear-gradient(180deg, transparent 0%, var(--surface-1) 80%);
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
  transition: all .12s;
}
.theme-btn:hover { background: var(--surface-2); color: var(--text-primary); }
.theme-btn:active { background: var(--surface-3); transform: scale(0.92); }
</style>
