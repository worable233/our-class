import type { User } from '@/types'

export const BASE = '/api'

function getToken(): string {
  const stored = localStorage.getItem('ourclass_user')
  if (stored) {
    const user = JSON.parse(stored) as User
    return user.token || ''
  }
  return ''
}

interface ApiEnvelope<T> {
  success: boolean
  data: T
  error?: { code: string; message: string }
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
    throw new Error('请求过于频繁，请稍后再试')
  }

  if (!res.ok || body.success === false) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message || '请求失败'
    throw new Error(message)
  }

  return body.data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: any) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: any) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string, options?: { body?: any }) => request<T>(path, { method: 'DELETE', ...(options?.body ? { body: JSON.stringify(options.body) } : {}) }),
}
