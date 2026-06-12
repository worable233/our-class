import type { User } from '@/types'

export const BASE = '/api'

// 全局 401 处理回调（由 auth store 注册）
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

// Token 缓存，避免每次请求都解析 localStorage
let _cachedToken = ''
let _tokenChecked = false
function getToken(): string {
  if (!_tokenChecked) {
    _tokenChecked = true
    const stored = localStorage.getItem('ourclass_user')
    if (stored) {
      try { _cachedToken = (JSON.parse(stored) as User).token || '' } catch { _cachedToken = '' }
    }
  }
  return _cachedToken
}
export function invalidateTokenCache() {
  _cachedToken = ''
  _tokenChecked = false
}

interface ApiEnvelope<T> {
  success: boolean
  data: T
  error?: { code: string; message: string }
}

class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  const body = await res.json().catch(() => ({ success: false, error: { message: '请求失败' } }))

  // 限流提示
  if (res.status === 429) {
    throw new ApiError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试')
  }

  // 全局 401 处理
  if (res.status === 401) {
    if (onUnauthorized) onUnauthorized()
    throw new ApiError(401, 'UNAUTHORIZED', body.error?.message || '未登录或登录已过期')
  }

  if (!res.ok || body.success === false) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message || '请求失败'
    const code = body.error?.code || 'ERROR'
    throw new ApiError(res.status, code, message)
  }

  return body.data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: any) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: any) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: { body?: any }) => request<T>(path, { method: 'DELETE', ...(options?.body ? { body: JSON.stringify(options.body) } : {}) }),
}
