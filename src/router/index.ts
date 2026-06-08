import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/ChatPage.vue'),
    },
    {
      path: '/chat/:encodedId',
      name: 'chat',
      component: () => import('@/views/ChatPage.vue'),
    },
    {
      path: '/teacher',
      component: () => import('@/layouts/DashboardLayout.vue'),
      meta: { role: 'teacher' },
      children: [
        { path: '', redirect: '/teacher/dashboard' },
        {
          path: 'dashboard',
          name: 'teacher-dashboard',
          component: () => import('@/views/teacher/DashboardHome.vue'),
        },
        {
          path: 'points',
          name: 'teacher-points',
          component: () => import('@/views/teacher/PointsManage.vue'),
        },
        {
          path: 'assignments',
          name: 'teacher-assignments',
          component: () => import('@/views/teacher/AssignmentCollect.vue'),
        },
        {
          path: 'students',
          name: 'teacher-students',
          component: () => import('@/views/teacher/StudentManage.vue'),
        },
        {
          path: 'roles',
          name: 'teacher-roles',
          component: () => import('@/views/teacher/RoleManage.vue'),
        },
        {
          path: 'review-types',
          name: 'teacher-review-types',
          component: () => import('@/views/teacher/ReviewTypeManage.vue'),
        },
        {
          path: 'settings',
          name: 'teacher-settings',
          component: () => import('@/views/teacher/SettingsPage.vue'),
        },
        {
          path: 'skills',
          name: 'teacher-skills',
          component: () => import('@/views/teacher/SkillManage.vue'),
        },
        {
          path: 'logs',
          name: 'teacher-logs',
          component: () => import('@/views/teacher/AuditLogs.vue'),
        },
        {
          path: 'traffic',
          name: 'teacher-traffic',
          component: () => import('@/views/teacher/TrafficMonitor.vue'),
        },
      ],
    },
    {
      path: '/student',
      component: () => import('@/layouts/DashboardLayout.vue'),
      meta: { role: 'student' },
      children: [
        { path: '', redirect: '/student/points' },
        {
          path: 'points',
          name: 'student-points',
          component: () => import('@/views/student/StudentPoints.vue'),
        },
        {
          path: 'leaderboard',
          name: 'student-leaderboard',
          component: () => import('@/views/student/Leaderboard.vue'),
        },
        {
          path: 'assignments',
          name: 'student-assignments',
          component: () => import('@/views/student/AssignmentQuery.vue'),
        },
        {
          path: 'profile',
          name: 'student-profile',
          component: () => import('@/views/student/Profile.vue'),
        },
      ],
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore()
  auth.loadFromStorage()

  const publicPages = ['/']
  if (publicPages.includes(to.path)) { next(); return }
  if (!auth.isLoggedIn) {
    next('/'); return
  }

  const requiredRole = to.meta.role as string | undefined
  if (requiredRole && auth.user?.role !== requiredRole) {
    next('/')
    return
  }
  next()
})

// Track page views after each navigation
router.afterEach((to) => {
  const token = localStorage.getItem('ourclass_user')
  if (!token) return
  try {
    const parsed = JSON.parse(token)
    fetch('/api/analytics/pv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parsed.token}` },
      body: JSON.stringify({ path: to.path }),
    }).catch(() => {})
  } catch {}
})

export default router
