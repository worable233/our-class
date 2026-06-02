<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { computed } from 'vue'
import { NLayoutHeader, NButton, NText, NTag } from 'naive-ui'
import { Sun, Moon } from '@lucide/vue'
import { useTheme } from '@/composables/useTheme'

const auth = useAuthStore()
const router = useRouter()
const { isDark, toggle: toggleTheme } = useTheme()

const pageTitle = computed(() => {
  const path = router.currentRoute.value.path
  const titles: Record<string, string> = {
    '/teacher/points': '积分管理',
    '/teacher/assignments': '作业管理',
    '/teacher/students': '学生管理',
    '/teacher/posts': '班级圈',
    '/student/points': '我的积分',
    '/student/leaderboard': '积分排行',
    '/student/assignments': '作业查询',
    '/student/posts': '班级圈',
    '/student/profile': '个人主页',
  }
  return titles[path] || 'OurClass'
})

function handleLogout() {
  auth.logout()
  router.push('/')
}
</script>

<template>
  <n-layout-header
    bordered
    :style="{
      height: 'var(--nav-height)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 var(--space-2xl)',
      background: 'var(--ground)',
      flexShrink: 0,
    }"
  >
    <div>
      <n-text
        :style="{
          fontFamily: '\'Inter Tight\', sans-serif',
          fontWeight: 700,
          fontSize: '20px',
          letterSpacing: '-0.02em',
        }"
      >
        {{ pageTitle }}
      </n-text>
    </div>
    <div style="display: flex; align-items: center; gap: 24px;">
      <div :style="{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }">
        <n-text :style="{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }">
          {{ auth.displayName }}
        </n-text>
        <n-tag size="small">{{ auth.isTeacher ? '教师' : '学生' }}</n-tag>
      </div>
      <n-button quaternary circle size="small" @click="toggleTheme" :title="isDark ? '切换浅色模式' : '切换深色模式'">
        <Sun v-if="isDark" :size="16" />
        <Moon v-else :size="16" />
      </n-button>
      <n-button quaternary circle size="small" @click="handleLogout" title="退出登录">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M10 12l4-4-4-4" />
          <path d="M14 8H6" />
          <path d="M6 14H2V2h4" />
        </svg>
      </n-button>
    </div>
  </n-layout-header>
</template>
