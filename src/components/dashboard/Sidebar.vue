<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { computed, ref } from 'vue'
import { Star, List, Users, MessageSquare, Trophy, User, Shield, Bot, Settings, History, LayoutDashboard, Globe, BookOpen, ChevronDown, ChevronLeft, ChevronRight, X } from '@lucide/vue'
import Logo from '@/components/Logo.vue'
import { useTheme } from '@/composables/useTheme'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isDark } = useTheme()
const settingsOpen = ref(false)

const props = defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ 'update:collapsed': [boolean] }>()

const menuGroups = computed(() => {
  if (auth.isTeacher) {
    return [
      {
        label: '概览',
        items: [
          { icon: LayoutDashboard, label: '仪表盘', path: '/teacher/dashboard' },
        ],
      },
      {
        label: '学生管理',
        items: [
          { icon: Star, label: '积分管理', path: '/teacher/points' },
          { icon: List, label: '作业管理', path: '/teacher/assignments' },
          { icon: Users, label: '学生管理', path: '/teacher/students' },
          { icon: Star, label: '点评类型', path: '/teacher/review-types' },
        ],
      },
      {
        label: '系统设置',
        items: [
          { icon: Shield, label: '职位管理', path: '/teacher/roles' },
          { icon: Settings, label: '站点设置', expandable: true, children: [
            { icon: Bot, label: 'AI 配置', path: '/teacher/settings' },
            { icon: BookOpen, label: 'Skill 管理', path: '/teacher/skills' },
            { icon: History, label: '操作日志', path: '/teacher/logs' },
            { icon: Globe, label: '流量监控', path: '/teacher/traffic' },
          ]},
        ],
      },
    ]
  }
  return [
    {
      label: '学习管理',
      items: [
        { icon: Star, label: '我的积分', path: '/student/points' },
        { icon: Trophy, label: '积分排行', path: '/student/leaderboard' },
        { icon: List, label: '作业查询', path: '/student/assignments' },
      ],
    },
    {
      label: '个人',
      items: [
        { icon: User, label: '个人主页', path: '/student/profile' },
      ],
    },
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
  >
    <!-- Logo -->
    <div class="sidebar-logo" :class="{ collapsed }" @click="router.push('/')">
      <div class="sidebar-logo-inner">
        <Logo :size="28" :theme="isDark ? 'dark' : 'light'" class="shrink-0" />
        <div v-show="!collapsed" class="logo-text-area grid">
          <span class="text-swap-item active">OurClass</span>
          <span class="text-swap-item">返回首页</span>
        </div>
      </div>
      <button v-if="!collapsed" class="sidebar-close" @click.stop="emit('update:collapsed', !collapsed)" title="收起">
        <X :size="18" />
      </button>
    </div>

    <!-- Nav -->
    <nav class="sidebar-nav">
      <template v-for="group in menuGroups" :key="group.label">
        <div v-show="!collapsed" class="sidebar-label">{{ group.label }}</div>

        <template v-for="item in group.items" :key="item.label">
          <!-- Regular item -->
          <a
            v-if="!item.expandable"
            class="sidebar-item"
            :class="{ active: isActive(item.path || '') }"
            @click="go(item.path || '')"
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
      </template>
    </nav>

    <div class="sidebar-spacer" />

    <!-- Collapse toggle -->
    <button class="sidebar-toggle" @click="emit('update:collapsed', !collapsed)">
      <ChevronLeft v-if="!collapsed" :size="14" />
      <ChevronRight v-else :size="14" />
    </button>

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
  transition: width 0.2s var(--ease-out), opacity 0.2s var(--ease-out);
  overflow: hidden;
  z-index: 10;
  width: 220px;
}

.sidebar-root.collapsed {
  align-items: center;
  width: 60px;
}

/* ── Logo ─────────────────────────────── */

.sidebar-logo {
  padding: 14px 16px;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-close {
  display: none;
  background: none; border: none; color: var(--text-muted);
  cursor: pointer; padding: 4px; border-radius: 6px; flex-shrink: 0;
  transition: all .12s;
}
.sidebar-close:hover { background: var(--surface-2); color: var(--text-primary); }
@media (max-width: 768px) {
  .sidebar-root:not(.collapsed) .sidebar-close { display: flex; }
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
  padding: 4px 8px;
  border-radius: 6px;
  gap: 0;
  transition: background .2s;
}
.sidebar-logo-inner :deep(svg) { display: block; margin-top: 2px; }

.sidebar-logo.collapsed .sidebar-logo-inner {
  padding: 4px;
}

.logo-text-area {
  height: 28px; overflow: hidden; margin-left: 10px;
  display: grid; place-items: center start;
}

.text-swap-item {
  grid-column: 1; grid-row: 1;
  font-family: var(--font-orbix); white-space: nowrap;
  opacity: 0; transform: translateY(8px);
  transition: opacity .5s cubic-bezier(.4,0,.2,1),
              transform .5s cubic-bezier(.4,0,.2,1);
}

.text-swap-item.active {
  font-weight: 600; font-size: 20px; line-height: 1;
  color: var(--accent); letter-spacing: -0.03em;
  opacity: 1; transform: translateY(0);
  margin-top: 2px;
}

.sidebar-logo:not(.collapsed):hover .text-swap-item.active {
  opacity: 0; transform: translateY(-8px);
}

.sidebar-logo:not(.collapsed):hover .text-swap-item:not(.active) {
  font-weight: 500; font-size: 15px;
  color: var(--accent-text); letter-spacing: -0.01em;
  opacity: 1; transform: translateY(0);
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

@media (max-width: 768px) {
  .sidebar-root.collapsed {
    width: 0;
    opacity: 0;
    overflow: hidden;
    border-right: none;
    padding: 0;
  }
  .sidebar-root:not(.collapsed) {
    width: 100vw;
    box-shadow: 4px 0 20px rgba(0,0,0,.3);
  }
  .sidebar-logo-inner {
    width: 100%;
  }
}
</style>
