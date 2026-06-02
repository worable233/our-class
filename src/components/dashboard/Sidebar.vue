<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { computed } from 'vue'
import { NLayoutSider, NButton } from 'naive-ui'
import { Star, List, Users, MessageSquare, Trophy, User } from '@lucide/vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const props = defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ 'update:collapsed': [boolean] }>()

const iconMap: Record<string, any> = { star: Star, list: List, users: Users, comments: MessageSquare, trophy: Trophy, user: User }

const menuItems = computed(() => {
  if (auth.isTeacher) {
    return [
      { icon: 'star', label: '积分管理', path: '/teacher/points' },
      { icon: 'list', label: '作业管理', path: '/teacher/assignments' },
      { icon: 'users', label: '学生管理', path: '/teacher/students' },
      { icon: 'comments', label: '班级圈', path: '/teacher/posts' },
    ]
  }
  return [
    { icon: 'star', label: '我的积分', path: '/student/points' },
    { icon: 'trophy', label: '积分排行', path: '/student/leaderboard' },
    { icon: 'list', label: '作业查询', path: '/student/assignments' },
    { icon: 'comments', label: '班级圈', path: '/student/posts' },
    { icon: 'user', label: '个人主页', path: '/student/profile' },
  ]
})

function isActive(path: string) {
  return route.path === path
}
</script>

<template>
  <n-layout-sider
    bordered
    :collapsed="collapsed"
    :collapsed-width="60"
    :width="220"
    position="absolute"
  >
    <div class="sidebar-header" :class="{ collapsed }">
      <div class="sidebar-logo" @click="router.push('/')">
        <span class="logo-icon">O</span>
        <span v-show="!collapsed" class="logo-text">OurClass</span>
      </div>
    </div>

    <nav class="sidebar-nav">
      <div class="nav-section-label" v-show="!collapsed">
        {{ auth.isTeacher ? '教师端' : '学生端' }}
      </div>
      <a
        v-for="item in menuItems"
        :key="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
        @click="router.push(item.path)"
      >
        <span class="nav-icon">
          <component :is="iconMap[item.icon]" :size="15" />
        </span>
        <span v-show="!collapsed" class="nav-label">{{ item.label }}</span>
      </a>
    </nav>

    <div class="collapse-btn-wrap">
      <n-button
        quaternary
        size="small"
        class="collapse-btn"
        @click="emit('update:collapsed', !collapsed)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path v-if="!collapsed" d="M10 4L6 8l4 4" />
          <path v-else d="M6 4l4 4-4 4" />
        </svg>
      </n-button>
    </div>

    <div class="sidebar-footer">
      <div class="user-mini" @click="auth.isStudent && router.push('/student/profile')">
        <div class="user-avatar">{{ auth.displayName.charAt(0) }}</div>
        <div v-show="!collapsed" class="user-info">
          <div class="user-name">{{ auth.displayName }}</div>
          <div class="user-role">{{ auth.isTeacher ? '教师' : '学生' }}</div>
        </div>
      </div>
    </div>
  </n-layout-sider>
</template>

<style scoped>
.sidebar-header {
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  border-bottom: 1px solid var(--hairline);
  flex-shrink: 0;
  transition: padding 0.2s var(--ease-out);
}

.sidebar-header.collapsed {
  justify-content: center;
  padding: 0;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
}

.logo-icon {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent), var(--accent-text));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: white;
  font-weight: 700;
  flex-shrink: 0;
}

.logo-text {
  font-family: 'Inter Tight', sans-serif;
  font-weight: 700;
  font-size: 16px;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.collapse-btn-wrap {
  display: flex;
  justify-content: center;
  padding: var(--space-sm);
}

.collapse-btn {
  width: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-nav {
  flex: 1;
  padding: var(--space-md) var(--space-sm);
  overflow-y: auto;
}

.nav-section-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: var(--space-xs) var(--space-sm) var(--space-sm);
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s var(--ease-out);
  margin-bottom: 2px;
  text-decoration: none;
}

.nav-item:hover {
  color: var(--text-primary);
  background: var(--surface-2);
}

.nav-item.active {
  color: var(--accent-text);
  background: var(--surface-2);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5px;
  bottom: 5px;
  width: 2px;
  background: var(--accent-text);
  border-radius: 0 2px 2px 0;
}

.nav-icon {
  font-size: 15px;
  width: 22px;
  text-align: center;
  flex-shrink: 0;
}

.nav-label {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.sidebar-footer {
  border-top: 1px solid var(--hairline);
  padding: var(--space-md) var(--space-lg);
  flex-shrink: 0;
}

.user-mini {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
  padding: var(--space-xs) 0;
  border-radius: var(--radius-sm);
  transition: background 0.15s var(--ease-out);
}

.user-mini:hover {
  background: var(--surface-2);
}

.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.user-role {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
