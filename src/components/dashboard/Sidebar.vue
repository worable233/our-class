<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { computed, h, ref } from 'vue'
import type { MenuOption } from 'naive-ui'
import { NLayoutSider, NMenu, NIcon, NTooltip } from 'naive-ui'
import { Star, List, Users, Trophy, User, Shield, Bot, Settings, History, LayoutDashboard, Globe, BookOpen, ClipboardList, RefreshCw, HardDrive } from '@lucide/vue'
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
  '/teacher/dashboard': [],
  '/teacher/points': ['points.read'],
  '/teacher/assignments': ['assignments.write'],
  '/teacher/users': ['students.write'],
  '/teacher/review-types': ['points.write'],
  '/teacher/point-details': ['points.read'],
  '/teacher/roles': [],
  '/teacher/settings': ['chat.config'],
  '/teacher/site-data': ['students.write'],
  '/teacher/skills': ['chat.config'],
  '/teacher/logs': ['audit_logs.read'],
  '/teacher/update': ['chat.config'],
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
        label: '用户管理',
        key: 'students',
        children: [
          { key: '/teacher/points', label: '积分管理', icon: renderIcon(Star) },
          { key: '/teacher/point-details', label: '积分明细', icon: renderIcon(ClipboardList) },
          { key: '/teacher/assignments', label: '作业管理', icon: renderIcon(List) },
          { key: '/teacher/users', label: '用户管理', icon: renderIcon(Users) },
          { key: '/teacher/review-types', label: '点评类型', icon: renderIcon(Star) },
          { key: '/teacher/disk', label: '网盘空间', icon: renderIcon(HardDrive) },
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
              { key: '/teacher/site-data', label: '站点数据', icon: renderIcon(LayoutDashboard) },
              { key: '/teacher/update', label: '系统更新', icon: renderIcon(RefreshCw) },
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
        { key: '/student/disk', label: '网盘空间', icon: renderIcon(HardDrive) },
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
    class="sidebar-sider"
  >
    <div class="sidebar-inner">
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
        class="sidebar-menu"
      />

      <!-- Footer / Copyright -->
      <div v-show="!collapsed" class="sidebar-footer">
        <n-tooltip trigger="hover" placement="top">
          <template #trigger>
            <a href="https://github.com/worable233/our-class" target="_blank" class="sidebar-footer-link">
              <span class="sidebar-footer-copy">©</span>
              <span>OurClass</span>
              <span class="sidebar-footer-mit">MIT</span>
            </a>
          </template>
          github.com/worable233/our-class
        </n-tooltip>
      </div>
    </div>
  </NLayoutSider>
</template>

<style scoped>
.sidebar-sider {
  display: flex;
  flex-direction: column;
}
.sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.sidebar-menu {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.sidebar-menu::-webkit-scrollbar { display: none; }
.sidebar-menu { scrollbar-width: none; }

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

/* Sidebar footer */
.sidebar-footer {
  padding: 8px 16px 16px;
  text-align: center;
}
.sidebar-footer-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.2s;
}
.sidebar-footer-link:hover {
  color: var(--accent-text);
}
.sidebar-footer-copy {
  font-size: 13px;
}
.sidebar-footer-mit {
  font-size: 9px;
  font-weight: 700;
  background: var(--surface-3);
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.3px;
  line-height: 1.4;
}
</style>
