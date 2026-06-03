<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { computed, ref } from 'vue'
import { Star, List, Users, MessageSquare, Trophy, User, Shield, Bot, Settings, ChevronDown, ChevronLeft, ChevronRight } from '@lucide/vue'
import Logo from '@/components/Logo.vue'
import { useTheme } from '@/composables/useTheme'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isDark } = useTheme()
const settingsOpen = ref(false)

const props = defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ 'update:collapsed': [boolean] }>()

const menuItems = computed(() => {
  if (auth.isTeacher) {
    return [
      { icon: Star, label: '积分管理', path: '/teacher/points' },
      { icon: List, label: '作业管理', path: '/teacher/assignments' },
      { icon: Users, label: '学生管理', path: '/teacher/students' },
      { icon: Shield, label: '权限管理', path: '/teacher/roles' },
      { icon: Settings, label: '站点设置', expandable: true, children: [
        { icon: Bot, label: 'AI 配置', path: '/teacher/settings' },
      ]},
    ]
  }
  return [
    { icon: Star, label: '我的积分', path: '/student/points' },
    { icon: Trophy, label: '积分排行', path: '/student/leaderboard' },
    { icon: List, label: '作业查询', path: '/student/assignments' },
    { icon: User, label: '个人主页', path: '/student/profile' },
  ]
})

function isActive(path: string) {
  return route.path === path
}

function go(path: string) {
  router.push(path)
}
</script>

<template>
  <aside
    class="sidebar-root"
    :class="{ collapsed }"
    :style="{ width: collapsed ? '60px' : '220px' }"
  >
    <!-- Logo -->
    <div class="sidebar-logo" :class="{ collapsed }" @click="router.push('/')">
      <div class="sidebar-logo-inner">
        <Logo :size="32" :theme="isDark ? 'dark' : 'light'" class="shrink-0" />
        <div v-show="!collapsed" class="logo-text-area grid">
          <span class="text-swap-item active">OurClass</span>
          <span class="text-swap-item">返回首页</span>
        </div>
      </div>
    </div>

    <!-- Nav -->
    <nav class="sidebar-nav">
      <div v-show="!collapsed" class="sidebar-label">
        {{ auth.isTeacher ? '教师端' : '学生端' }}
      </div>

      <template v-for="item in menuItems" :key="item.label">
        <!-- Regular item -->
        <a
          v-if="!item.expandable"
          class="sidebar-item"
          :class="{ active: isActive(item.path) }"
          @click="go(item.path)"
        >
          <span class="sidebar-item-icon">
            <component :is="item.icon" :size="16" />
          </span>
          <span v-show="!collapsed" class="sidebar-item-label">{{ item.label }}</span>
        </a>

        <!-- Expandable item -->
        <div v-else>
          <button class="sidebar-item w-full" @click="settingsOpen = !settingsOpen">
            <span class="sidebar-item-icon">
              <component :is="item.icon" :size="16" />
            </span>
            <span v-show="!collapsed" class="sidebar-item-label">{{ item.label }}</span>
            <span v-show="!collapsed" class="sidebar-chevron">
              <ChevronDown :size="12" :class="{ open: settingsOpen }" />
            </span>
          </button>
          <div v-if="settingsOpen && !collapsed" class="sidebar-sub">
            <button
              v-for="child in item.children"
              :key="child.label"
              class="sidebar-item sub"
              @click="go(child.path)"
            >
              <span class="sidebar-item-icon">
                <component :is="child.icon" :size="14" />
              </span>
              <span class="sidebar-item-label">{{ child.label }}</span>
            </button>
          </div>
        </div>
      </template>
    </nav>

    <div class="sidebar-spacer" />

    <!-- Collapse toggle -->
    <button class="sidebar-toggle" @click="emit('update:collapsed', !collapsed)">
      <ChevronLeft v-if="!collapsed" :size="14" />
      <ChevronRight v-else :size="14" />
    </button>

    <!-- Footer -->
    <div class="sidebar-footer" :class="{ collapsed }" @click="auth.isStudent && router.push('/student/profile')">
      <div class="sidebar-avatar">{{ auth.displayName.charAt(0) }}</div>
      <div v-show="!collapsed" class="sidebar-user">
        <div class="sidebar-user-name">{{ auth.displayName }}</div>
        <div class="sidebar-user-role">{{ auth.isTeacher ? '教师' : '学生' }}</div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-root {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface-1);
  border-right: 1px solid var(--hairline);
  transition: width 0.2s var(--ease-out);
  overflow: hidden;
  z-index: 10;
}

.sidebar-root.collapsed {
  align-items: center;
}

/* ── Logo ─────────────────────────────── */

.sidebar-logo {
  padding: 14px 16px;
  cursor: pointer;
  overflow: hidden;
}

.sidebar-logo:not(.collapsed):hover .sidebar-logo-inner {
  background: var(--surface-2);
}

.sidebar-logo.collapsed {
  padding: 14px 0;
  display: flex;
  justify-content: center;
}

.sidebar-logo-inner {
  position: relative;
  display: flex;
  align-items: center;
  height: 40px;
  padding: 4px 12px;
  border-radius: 6px;
  transition: background 0.2s var(--ease-out);
}

.sidebar-logo.collapsed .sidebar-logo-inner {
  padding: 4px;
}

/* ── Logo text swap animation ──────────── */

.logo-text-area {
  height: 22px;
  overflow: hidden;
  margin-left: 10px;
}

.text-swap-item {
  grid-column: 1; grid-row: 1;
  font-family: 'Inter Tight', sans-serif;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity .5s cubic-bezier(.4,0,.2,1),
              transform .5s cubic-bezier(.4,0,.2,1);
}

.text-swap-item.active {
  font-weight: 700;
  font-size: 17px;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  opacity: 1;
  transform: translateY(0);
}

.sidebar-logo:not(.collapsed):hover .text-swap-item.active {
  opacity: 0;
  transform: translateY(-8px);
}

.sidebar-logo:not(.collapsed):hover .text-swap-item:not(.active) {
  font-weight: 600;
  font-size: 15px;
  color: var(--accent-text);
  letter-spacing: -0.01em;
  opacity: 1;
  transform: translateY(0);
}

/* ── Nav ──────────────────────────────── */

.sidebar-nav {
  flex: 0 0 auto;
  padding: 4px 8px;
}

.sidebar-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 12px 8px;
}

/* ── Items ────────────────────────────── */

.sidebar-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s var(--ease-out);
  text-decoration: none;
  background: none;
  border: none;
  font-family: inherit;
  text-align: left;
}

.sidebar-item:hover {
  color: var(--text-primary);
  background: var(--surface-2);
}

.sidebar-item.active {
  color: var(--accent-text);
  background: var(--accent-glow);
}

.sidebar-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--accent-text);
  border-radius: 0 2px 2px 0;
}

.sidebar-item-icon {
  width: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sidebar-item-label {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.sidebar-chevron {
  margin-left: auto;
  display: flex;
  align-items: center;
}

.sidebar-chevron svg {
  transition: transform 0.15s;
}

.sidebar-chevron svg.open {
  transform: rotate(180deg);
}

/* ── Sub items ────────────────────────── */

.sidebar-sub {
  padding-left: 20px;
}

.sidebar-sub .sidebar-item.sub {
  padding-left: 20px;
}

.sidebar-item.sub .sidebar-item-label {
  font-size: 13px;
}

/* ── Spacer ───────────────────────────── */

.sidebar-spacer {
  flex: 1;
}

/* ── Toggle ───────────────────────────── */

.sidebar-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  margin: 4px 8px;
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  background: none;
  border: none;
  transition: all 0.15s;
}

.sidebar-toggle:hover {
  color: var(--text-primary);
  background: var(--surface-2);
}

/* ── Footer / User ────────────────────── */

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--hairline);
  cursor: pointer;
  transition: background 0.15s;
}

.sidebar-footer:hover {
  background: var(--surface-2);
}

.sidebar-footer.collapsed {
  padding: 12px;
  justify-content: center;
}

.sidebar-avatar {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
}

.sidebar-user {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar-user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.sidebar-user-role {
  font-size: 11px;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .sidebar-root {
    box-shadow: 4px 0 20px rgba(0,0,0,.2);
  }
}
</style>
