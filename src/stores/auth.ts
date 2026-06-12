import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setUnauthorizedHandler, invalidateTokenCache } from '@/api/client'
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

  // 注册全局 401 处理器
  setUnauthorizedHandler(() => {
    user.value = null
    localStorage.removeItem('ourclass_user')
    invalidateTokenCache()
  })

  // Tracks in-flight permission refresh
  let _permPromise: Promise<void> | null = null
  // 权限缓存时间戳，避免每次导航都请求服务器
  let _permsFetchedAt = 0
  const PERMS_CACHE_TTL = 60_000 // 60 秒内不重复请求

  function loadFromStorage() {
    const stored = localStorage.getItem('ourclass_user')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        user.value = data
        // If stored data lacks permissions but has a token, refresh from server
        if (data.token && (!data.permissions || data.permissions.length === 0)) {
          refreshPermissions()
        }
      } catch { localStorage.removeItem('ourclass_user') }
    }
  }

  async function refreshPermissions(): Promise<void> {
    if (_permPromise) return _permPromise // deduplicate concurrent calls
    _permPromise = (async () => {
      try {
        const perms = await api.get<string[]>('/auth/permissions')
        if (user.value) {
          user.value = { ...user.value, permissions: perms }
          localStorage.setItem('ourclass_user', JSON.stringify(user.value))
        }
        _permsFetchedAt = Date.now()
      } catch (e: any) {
        // 401 已由全局处理器处理，这里只需清理 promise
        if (e.status === 401) return
      }
    })()
    await _permPromise
    _permPromise = null
  }

  /** Call in router guard when route requires permissions that may not be loaded yet */
  function ensurePermissions(): Promise<void> {
    if (!user.value?.token) return Promise.resolve()
    // 有缓存且未过期，跳过请求
    if (user.value.permissions?.length && Date.now() - _permsFetchedAt < PERMS_CACHE_TTL) {
      return Promise.resolve()
    }
    return refreshPermissions()
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
        nickname: res.user.nickname,
        token: res.token,
        permissions: res.user.permissions || [],
      }
      user.value = userData
      localStorage.setItem('ourclass_user', JSON.stringify(userData))
      invalidateTokenCache()
      _permsFetchedAt = Date.now()
      return userData
    } finally {
      loading.value = false
    }
  }

  function logout() {
    user.value = null
    localStorage.removeItem('ourclass_user')
    invalidateTokenCache()
    _permsFetchedAt = 0
  }

  return { user, loading, isLoggedIn, isTeacher, isStudent, displayName, userClass, permissions, hasPermission, loadFromStorage, login, logout, ensurePermissions, refreshPermissions }
})
