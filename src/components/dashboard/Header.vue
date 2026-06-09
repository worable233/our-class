<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { computed, inject } from 'vue'
import { NLayoutHeader, NButton, NText, NTag } from 'naive-ui'
import { Sun, Moon, Menu, RotateCw } from '@lucide/vue'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{ isMobile?: boolean }>()
const emit = defineEmits<{ toggleSidebar: [] }>()

const auth = useAuthStore()
const router = useRouter()
const { isDark, toggle: toggleTheme } = useTheme()
const refreshContent = inject('refreshContent') as (() => void) | undefined

const pageTitle = computed(() => {
  const path = router.currentRoute.value.path
  const titles: Record<string, string> = {
    '/teacher/dashboard': '仪表盘',
    '/teacher/points': '积分管理',
    '/teacher/assignments': '作业管理',
    '/teacher/users': '用户管理',
    '/teacher/roles': '职位管理',
    '/teacher/review-types': '点评类型',
    '/teacher/point-details': '积分明细',
    '/teacher/logs': '操作日志',
    '/teacher/traffic': '流量监控',
    '/teacher/settings': '站点设置',
    '/teacher/site-data': '站点数据',
    '/teacher/update': '系统更新',
    '/student/points': '我的积分',
    '/student/leaderboard': '积分排行',
    '/student/assignments': '作业查询',
    '/student/profile': '个人主页',
  }
  return titles[path] || 'OurClass'
})

</script>

<template>
  <n-layout-header bordered class="dash-header">
    <div class="header-left">
      <n-button v-if="props.isMobile" quaternary circle size="small" @click="emit('toggleSidebar')">
        <Menu :size="18" />
      </n-button>
      <n-text class="header-title">{{ pageTitle }}</n-text>
    </div>
    <div class="header-right">
      <div class="header-user">
        <n-text class="user-name">{{ auth.displayName }}</n-text>
        <n-tag size="small">{{ auth.isTeacher ? '教师' : '学生' }}</n-tag>
      </div>
      <n-button quaternary circle size="small" @click="toggleTheme" :title="isDark ? '浅色' : '深色'">
        <Sun v-if="isDark" :size="16" />
        <Moon v-else :size="16" />
      </n-button>
      <n-button quaternary circle size="small" @click="refreshContent?.()" title="刷新">
        <RotateCw :size="16" />
      </n-button>
    </div>
  </n-layout-header>
</template>

<style scoped>
.dash-header {
  height: var(--nav-height);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--space-2xl);
  background: var(--ground); flex-shrink: 0;
}
.header-left { display: flex; align-items: center; gap: 8px; }
.header-title {
  font-family: 'Inter Tight', sans-serif;
  font-weight: 700; font-size: 20px;
  letter-spacing: -0.02em;
}
.header-right { display: flex; align-items: center; gap: 16px; }
.header-user { display: flex; align-items: center; gap: var(--space-sm); }
.user-name { font-size: 14px; font-weight: 500; color: var(--text-secondary); }

@media (max-width: 768px) {
  .dash-header { padding: 0 12px; }
  .header-title { font-size: 16px; }
  .header-right { gap: 8px; }
  .user-name { display: none; }
}
</style>
