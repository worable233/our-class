import { ref, computed, readonly } from 'vue'

const CHUNK_SIZE = 2 * 1024 * 1024 // 2MB per chunk

export interface UploadTask {
  id: string
  name: string
  path: string
  size: number
  progress: number      // 0-100
  status: 'pending' | 'uploading' | 'paused' | 'done' | 'error' | 'cancelled'
  error?: string
  created_at: string
  done_at?: string
  identifier: string   // unique chunk upload id
  total_chunks: number
  uploaded_chunks: number
  abort_ctrl?: AbortController
}

const HISTORY_KEY = 'ourclass_upload_history'
const MAX_HISTORY = 50

const uploads = ref<UploadTask[]>([])
const panelOpen = ref(false)
const activeTab = ref<'active' | 'history'>('active')

// 上传完成回调列表
const onDoneCallbacks: Array<() => void> = []

export function onUploadDone(cb: () => void) {
  onDoneCallbacks.push(cb)
}

function notifyDone() {
  onDoneCallbacks.forEach(cb => cb())
}

// 从 localStorage 加载历史
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const history = JSON.parse(raw) as UploadTask[]
      uploads.value = [...uploads.value.filter(u => u.status === 'uploading' || u.status === 'paused'), ...history]
    }
  } catch {}
}

// 保存历史到 localStorage
function saveHistory() {
  const done = uploads.value.filter(u => u.status === 'done' || u.status === 'error').slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(done))
}

// 生成唯一 ID
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// 生成分片标识符（含 userId 防跨用户冲突）
function makeIdentifier(file: File): string {
  const stored = localStorage.getItem('ourclass_user')
  const userId = stored ? (JSON.parse(stored).id || '0') : '0'
  return `${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// 获取当前用户 token
function getToken(): string {
  const stored = localStorage.getItem('ourclass_user')
  return stored ? JSON.parse(stored).token || '' : ''
}

function addUpload(file: File, targetPath: string): UploadTask {
  const totalChunks = Math.ceil(file.size / Math.max(CHUNK_SIZE, 1))
  const task: UploadTask = {
    id: uid(),
    name: file.name,
    path: targetPath,
    size: file.size,
    progress: 0,
    status: 'pending',
    created_at: new Date().toISOString(),
    identifier: makeIdentifier(file),
    total_chunks: totalChunks,
    uploaded_chunks: 0,
  }
  uploads.value.unshift(task)
  return task
}

async function startUpload(file: File, targetPath: string): Promise<void> {
  const task = addUpload(file, targetPath)
  const token = getToken()
  const totalChunks = task.total_chunks

  // 先查询服务端已有分片（断点续传）
  try {
    const infoRes = await fetch(`/api/storage/upload/chunk/${task.identifier}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const info = await infoRes.json()
    if (info.success) {
      task.uploaded_chunks = (info.data?.received || []).length
    }
  } catch {}

  task.status = 'uploading'
  task.abort_ctrl = new AbortController()

  for (let i = task.uploaded_chunks; i < totalChunks; i++) {
    if (task.status === 'paused' || task.status === 'done') break
    if (task.abort_ctrl?.signal.aborted) { task.status = 'paused'; return }

    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const chunk = file.slice(start, end)

    const fd = new FormData()
    fd.append('file', chunk)
    fd.append('identifier', task.identifier)
    fd.append('chunk_index', String(i))
    fd.append('total_chunks', String(totalChunks))
    fd.append('path', targetPath)
    fd.append('original_name', file.name)

    try {
      const res = await fetch('/api/storage/upload/chunk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
        signal: task.abort_ctrl.signal,
      })
      const body = await res.json()
      if (!res.ok || !body.success) throw new Error(body.error?.message || '分片上传失败')

      task.uploaded_chunks = i + 1
      task.progress = Math.round(((i + 1) / totalChunks) * 100)

      if (body.data?.done) {
        task.status = 'done'
        task.progress = 100
        task.done_at = new Date().toISOString()
        saveHistory()
        notifyDone()
        return
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        task.status = 'paused'
        return
      }
      task.status = 'error'
      task.error = e.message || '上传失败'
      saveHistory()
      return
    }
  }
  // 0 分片（空文件）视为完成
  if (totalChunks === 0) {
    task.status = 'done'
    task.progress = 100
    task.done_at = new Date().toISOString()
    saveHistory()
    notifyDone()
  }
}

function pauseUpload(taskId: string) {
  const task = uploads.value.find(u => u.id === taskId)
  if (!task || task.status !== 'uploading') return
  task.status = 'paused'
  task.abort_ctrl?.abort()
}

function resumeUpload(taskId: string) {
  const task = uploads.value.find(u => u.id === taskId)
  if (!task || task.status !== 'paused') return
  // 暂停后 File 对象在内存中丢失，无法恢复，需用户重新选择
  task.status = 'cancelled'
  uploads.value = uploads.value.filter(u => u.id !== taskId)
  saveHistory()
}

function cancelUpload(taskId: string) {
  const task = uploads.value.find(u => u.id === taskId)
  if (!task) return
  task.abort_ctrl?.abort()
  task.status = 'cancelled'
  // 从列表中移除
  uploads.value = uploads.value.filter(u => u.id !== taskId)
  saveHistory()
}

function clearHistory() {
  uploads.value = uploads.value.filter(u => u.status === 'uploading' || u.status === 'paused')
  localStorage.removeItem(HISTORY_KEY)
}

function removeHistoryItem(taskId: string) {
  uploads.value = uploads.value.filter(u => u.id !== taskId)
  saveHistory()
}

// 活跃上传
const activeUploads = computed(() =>
  uploads.value.filter(u => u.status === 'uploading' || u.status === 'paused' || u.status === 'pending')
)

// 已完成/失败
const historyUploads = computed(() =>
  uploads.value.filter(u => u.status === 'done' || u.status === 'error')
)

loadHistory()

export function useUploadManager() {
  return {
    uploads: readonly(uploads),
    activeUploads,
    historyUploads,
    panelOpen,
    activeTab,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    clearHistory,
    removeHistoryItem,
    onUploadDone,
  }
}
