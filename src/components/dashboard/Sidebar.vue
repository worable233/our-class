<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { computed, h, ref } from 'vue'
import type { MenuOption } from 'naive-ui'
import { NLayoutSider, NMenu, NIcon } from 'naive-ui'
import { Star, List, Users, Trophy, User, Shield, Bot, Settings, History, LayoutDashboard, Globe, BookOpen } from '@lucide/vue'
import Logo from '@/components/Logo.vue'
import { useTheme } from '@/composables/useTheme'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { isDark } = useTheme()

const props = defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ 'update:collapsed': [boolean] }>()

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

// Permission requirements per route (mirrors router meta.permissions)
const ROUTE_PERMS: Record<string, string[]> = {
  '/teacher/points': ['points.read'],
  '/teacher/assignments': ['assignments.read'],
  '/teacher/students': ['students.read'],
  '/teacher/review-types': ['points.write'],
  '/teacher/roles': ['roles.manage'],
  '/teacher/settings': ['chat.config'],
  '/teacher/skills': ['chat.skills', 'chat.config'],
  '/teacher/logs': ['audit_logs.read'],
}

function hasRouteAccess(path: string): boolean {
  const perms = ROUTE_PERMS[path]
  if (!perms || perms.length === 0) return true
  return perms.some(p => auth.permissions.includes(p))
}

// Recursively filter menu children by permission
function filterChildren(children: any[]): any[] {
  return children.filter(child => {
    if (child.children) {
      child.children = filterChildren(child.children)
      return child.children.length > 0
    }
    return !child.key || !ROUTE_PERMS[child.key] || hasRouteAccess(child.key)
  })
}

const menuOptions = computed<MenuOption[]>(() => {
  if (auth.isTeacher) {
    return filterChildren([
      {
        type: 'group',
        label: '概览',
        key: 'overview',
        children: [
          { key: '/teacher/dashboard', label: '仪表盘', icon: renderIcon(LayoutDashboard) },
        ],
      },
      {
        type: 'group',
        label: '学生管理',
        key: 'students',
        children: [
          { key: '/teacher/points', label: '积分管理', icon: renderIcon(Star) },
          { key: '/teacher/assignments', label: '作业管理', icon: renderIcon(List) },
          { key: '/teacher/students', label: '学生管理', icon: renderIcon(Users) },
          { key: '/teacher/review-types', label: '点评类型', icon: renderIcon(Star) },
        ],
      },
      {
        type: 'group',
        label: '系统设置',
        key: 'settings',
        children: [
          { key: '/teacher/roles', label: '职位管理', icon: renderIcon(Shield) },
          {
            key: 'site-settings',
            label: '站点设置',
            icon: renderIcon(Settings),
            children: [
              { key: '/teacher/settings', label: 'AI 配置', icon: renderIcon(Bot) },
              { key: '/teacher/skills', label: 'Skill 管理', icon: renderIcon(BookOpen) },
              { key: '/teacher/logs', label: '操作日志', icon: renderIcon(History) },
              { key: '/teacher/traffic', label: '流量监控', icon: renderIcon(Globe) },
            ],
          },
        ],
      },
    ])
  }
  return [
    {
      type: 'group',
      label: '学习管理',
      key: 'study',
      children: [
        { key: '/student/points', label: '我的积分', icon: renderIcon(Star) },
        { key: '/student/leaderboard', label: '积分排行', icon: renderIcon(Trophy) },
        { key: '/student/assignments', label: '作业查询', icon: renderIcon(List) },
      ],
    },
    {
      type: 'group',
      label: '个人',
      key: 'personal',
      children: [
        { key: '/student/profile', label: '个人主页', icon: renderIcon(User) },
      ],
    },
  ]
})

const activeKey = computed(() => route.path)

function handleUpdateValue(key: string) {
  if (key && !key.startsWith('site-') && key !== 'overview' && key !== 'students' && key !== 'settings' && key !== 'study' && key !== 'personal') {
    router.push(key)
  }
}
</script>

<template>
  <NLayoutSider
    :collapsed="collapsed"
    :collapsed-width="52"
    :width="220"
    bordered
    collapse-mode="width"
    show-trigger
    @collapse="emit('update:collapsed', true)"
    @expand="emit('update:collapsed', false)"
    style="background:var(--surface-1)"
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
    </div>

    <!-- Nav -->
    <NMenu
      :collapsed="collapsed"
      :collapsed-width="52"
      :collapsed-icon-size="20"
      :options="menuOptions"
      :value="activeKey"
      @update:value="handleUpdateValue"
      :indent="14"
    />
  </NLayoutSider>
</template>

<style scoped>
/* ── Logo ─────────────────────────────── */

.sidebar-logo {
  padding: 14px 16px;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.sidebar-logo:not(.collapsed):hover .sidebar-logo-inner {
  background: var(--surface-2);
}

.sidebar-logo.collapsed {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.sidebar-logo-inner {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background .2s;
}
.sidebar-logo-inner :deep(svg) { display: block; margin-top: 2px; }

.sidebar-logo.collapsed .sidebar-logo-inner {
  padding: 2px;
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

@media (max-width: 768px) {
  .sidebar-logo-inner {
    width: 100%;
  }
}
</style>

<style>
/* 折叠时隐藏 NMenu 组标题 */
.n-layout-sider--collapsed .n-menu-item-group-title {
  opacity: 0 !important;
  overflow: hidden;
  pointer-events: none;
  height: 0;
  margin: 0;
  padding: 0 !important;
  display: none;
}

/* 折叠时菜单项图标居中 */
.n-layout-sider--collapsed .n-menu-item-content {
  padding: 0 16px !important;
}
</style>
