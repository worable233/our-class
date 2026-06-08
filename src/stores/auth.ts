import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api/client'
import type { User } from '@/types'

interface LoginResponse {
  user: User & { token: string; permissions?: string[] }
  token: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(false)

  const isLoggedIn = computed(() => !!user.value)
  const isTeacher = computed(() => user.value?.role === 'teacher')
  const isStudent = computed(() => user.value?.role === 'student')
  const displayName = computed(() => user.value?.display_name || '')
  const userClass = computed(() => user.value?.class || '')
  const permissions = computed(() => user.value?.permissions || [])

  function hasPermission(code: string): boolean {
    return permissions.value.includes(code)
  }

  function loadFromStorage() {
    const stored = localStorage.getItem('ourclass_user')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        user.value = data
      } catch { localStorage.removeItem('ourclass_user') }
    }
  }

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const res = await api.post<LoginResponse>('/auth/login', { username, password })
      const userData: User = {
        id: res.user.id,
        username: res.user.username,
        display_name: res.user.display_name,
        role: res.user.role,
        class: res.user.class,
        avatar: res.user.avatar,
        token: res.token,
        permissions: res.user.permissions || [],
      }
      user.value = userData
      localStorage.setItem('ourclass_user', JSON.stringify(userData))
      return userData
    } finally {
      loading.value = false
    }
  }

  function logout() {
    user.value = null
    localStorage.removeItem('ourclass_user')
  }

  return { user, loading, isLoggedIn, isTeacher, isStudent, displayName, userClass, permissions, hasPermission, loadFromStorage, login, logout }
})
