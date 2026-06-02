<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import { Plus, MessageSquare, Trash2, Search, Sun, Moon } from '@lucide/vue'
import Logo from '@/components/Logo.vue'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{ selectedId?: number | null }>()
const router = useRouter()
const auth = useAuthStore()
const emit = defineEmits<{ select: [id: number]; new: [] }>()
const { isDark, toggle: toggleTheme } = useTheme()

interface Conversation { id: number; title: string; model: string; updated_at: string }

const conversations = ref<Conversation[]>([])
const editingId = ref<number | null>(null)
const editTitle = ref('')
const searchQuery = ref('')
const filtered = computed(() => {
  if (!searchQuery.value) return conversations.value
  const q = searchQuery.value.toLowerCase()
  return conversations.value.filter(c => c.title.toLowerCase().includes(q))
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
defineExpose({ load })
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

    <button class="new-btn" @click="emit('new')">
      <Plus :size="15" stroke-width="2.5" /> 新对话
    </button>

    <div class="section-label" v-if="!loading">对话列表</div>

    <div class="list">
      <div
        v-for="c in filtered"
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
      <div v-if="!loading && !conversations.length" class="empty">暂无对话</div>
    </div>

    <div class="list-fade" />

    <div class="user-section">
      <div class="user-bar" @click="router.push(auth.isTeacher ? '/teacher/points' : '/student/points')">
        <div class="user-avatar">{{ auth.displayName.charAt(0) }}</div>
        <div class="user-text grid">
          <span class="text-swap-item active">{{ auth.displayName }}</span>
          <span class="text-swap-item">进入后台</span>
        </div>
      </div>
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

/* ── Header ─────────────────────────── */
.sidebar-head {
  display: flex; align-items: center;
  padding: 20px 12px 20px;
  gap: 8px;
}

.sidebar-logo {
  display: flex; align-items: center; gap: 8px;
  cursor: pointer; flex: 1; min-width: 0;
}

.sidebar-logo-text {
  font-family: 'Inter Tight', sans-serif;
  font-weight: 700; font-size: 15px;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

/* ── New chat button ────────────────── */
.new-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin: 4px 12px 14px;
  padding: 10px 0;
  border-radius: 10px;
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
  font-size: 12px; font-weight: 500;
  padding: 4px 22px 6px;
  user-select: none;
  position: sticky; top: 0;
  background: var(--surface-1);
  z-index: 2;
}

/* ── List ───────────────────────────── */
.list {
  flex: 1; overflow-y: auto;
  padding: 0 12px 8px;
}

.item {
  display: flex; align-items: center;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px; color: var(--text-secondary);
  background: none; border: none;
  cursor: pointer; transition: background .12s;
  font-family: inherit;
  margin-bottom: 1px;
}
.item:hover { background: var(--surface-2); }
.item.active {
  background: #3964fe;
  color: #fff;
}

.item-text {
  flex: 1; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; text-align: left; line-height: 1.5;
}

.edit-input {
  flex: 1;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #3964fe;
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
  padding: 8px 12px;
  border-top: 1px solid var(--hairline);
  flex-shrink: 0;
}

.user-bar {
  display: flex; align-items: center; gap: 10px;
  flex: 1; min-width: 0;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--surface-2);
  cursor: pointer;
  transition: background .15s;
}
.user-bar:hover { background: var(--surface-3); }

.user-avatar {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #5E6AD2, #A78BFA);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 600;
  flex-shrink: 0;
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
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none;
  color: var(--text-secondary);
  cursor: pointer; flex-shrink: 0;
}
.theme-btn:hover { background: var(--surface-2); color: var(--text-primary); }
</style>
