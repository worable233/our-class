import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/components/HomePage.vue'),
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('@/views/Chat.vue'),
      meta: { requiresAuth: true, role: 'teacher' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
    },
    {
      path: '/teacher',
      component: () => import('@/layouts/DashboardLayout.vue'),
      meta: { role: 'teacher' },
      children: [
        { path: '', redirect: '/teacher/points' },
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
          path: 'posts',
          name: 'teacher-posts',
          component: () => import('@/views/teacher/TeacherPosts.vue'),
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
          path: 'posts',
          name: 'student-posts',
          component: () => import('@/views/student/SocialPosts.vue'),
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

  const publicPages = ['/', '/login']
  if (publicPages.includes(to.path)) { next(); return }
  if (!auth.isLoggedIn) {
    next('/login'); return
  }

  const requiredRole = to.meta.role as string | undefined
  if (requiredRole && auth.user?.role !== requiredRole) {
    next('/')
    return
  }
  next()
})

export default router
