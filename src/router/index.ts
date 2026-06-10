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
          meta: { permissions: ['points.read'] },
        },
        {
          path: 'assignments',
          name: 'teacher-assignments',
          component: () => import('@/views/teacher/AssignmentCollect.vue'),
          meta: { permissions: ['assignments.write'] },
        },
        {
          path: 'users',
          name: 'teacher-users',
          component: () => import('@/views/teacher/UserManage.vue'),
          meta: { permissions: ['students.write'] },
        },
        {
          path: 'roles',
          name: 'teacher-roles',
          component: () => import('@/views/teacher/RoleManage.vue'),
          meta: { permissions: ['roles.manage'] },
        },
        {
          path: 'review-types',
          name: 'teacher-review-types',
          component: () => import('@/views/teacher/ReviewTypeManage.vue'),
          meta: { permissions: ['points.write'] },
        },
        {
          path: 'articles',
          name: 'teacher-articles',
          component: () => import('@/views/teacher/Articles.vue'),
          meta: { permissions: ['articles.manage'] },
        },
        {
          path: 'point-details',
          name: 'teacher-point-details',
          component: () => import('@/views/teacher/PointDetails.vue'),
          meta: { permissions: ['points.read'] },
        },
        {
          path: 'settings',
          name: 'teacher-settings',
          component: () => import('@/views/teacher/SettingsPage.vue'),
          meta: { permissions: ['chat.config'] },
        },
        {
          path: 'site-general',
          name: 'teacher-site-general',
          component: () => import('@/views/teacher/SiteGeneralSettings.vue'),
          meta: { permissions: ['chat.config'] },
        },
        {
          path: 'site-data',
          name: 'teacher-site-data',
          component: () => import('@/views/teacher/SiteData.vue'),
          meta: { permissions: ['students.write'] },
        },
        {
          path: 'update',
          name: 'teacher-update',
          component: () => import('@/views/teacher/SystemUpdate.vue'),
          meta: { permissions: ['chat.config'] },
        },
        {
          path: 'skills',
          name: 'teacher-skills',
          component: () => import('@/views/teacher/SkillManage.vue'),
          meta: { permissions: ['chat.config'] },
        },
        {
          path: 'backup',
          name: 'teacher-backup',
          component: () => import('@/views/teacher/BackupManage.vue'),
          meta: { permissions: ['chat.config'] },
        },
        {
          path: 'logs',
          name: 'teacher-logs',
          component: () => import('@/views/teacher/AuditLogs.vue'),
          meta: { permissions: ['audit_logs.read'] },
        },
        {
          path: 'traffic',
          name: 'teacher-traffic',
          component: () => import('@/views/teacher/TrafficMonitor.vue'),
        },
        {
          path: 'disk',
          name: 'teacher-disk',
          component: () => import('@/views/teacher/DiskManage.vue'),
        },
        {
          path: 'courses',
          name: 'teacher-courses',
          component: () => import('@/views/teacher/CourseManage.vue'),
          meta: { permissions: ['points.read'] },
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
        {
          path: 'articles',
          name: 'student-articles',
          component: () => import('@/views/teacher/Articles.vue'),
          meta: { permissions: ['articles.read'] },
        },
        {
          path: 'disk',
          name: 'student-disk',
          component: () => import('@/views/student/StudentDisk.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore()
  auth.loadFromStorage()

  // Public pages (chat homepage)
  const publicPages = ['/']
  if (publicPages.includes(to.path)) { next(); return }

  // Must be logged in
  if (!auth.isLoggedIn) {
    next('/'); return
  }

  // Ensure permissions are loaded (handles localStorage cache miss after code update)
  await auth.ensurePermissions()

  // Check role
  const requiredRole = to.meta.role as string | undefined
  if (requiredRole && auth.user?.role !== requiredRole) {
    next('/'); return
  }

  // Check granular permissions
  const requiredPerms = to.meta.permissions as string[] | undefined
  if (requiredPerms && requiredPerms.length > 0) {
    const userPerms = auth.permissions
    const hasAny = requiredPerms.some(p => userPerms.includes(p))
    if (!hasAny) {
      // No permission — redirect to public homepage (chat)
      next('/')
      return
    }
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
