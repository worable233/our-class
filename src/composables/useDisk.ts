import { ref, computed } from 'vue'
import { api, BASE } from '@/api/client'

export interface DiskEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  modified: string
  ext?: string
}

export interface StorageInfo {
  used: number
  limit: number
}

export function useDisk() {
  // ── State ──
  const entries = ref<DiskEntry[]>([])
  const currentPath = ref('')
  const selectedPaths = ref(new Set<string>())
  const loading = ref(false)
  const storageInfo = ref<StorageInfo>({ used: 0, limit: 0 })
  const searchQuery = ref('')

  // Navigation history
  const pathHistory = ref<string[]>([''])
  const historyIndex = ref(0)

  // ── Computed ──
  const filteredEntries = computed(() => {
    let list = entries.value
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      list = list.filter(e => e.name.toLowerCase().includes(q))
    }
    // Directories first, then files, sorted by Chinese locale
    return [...list].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
  })

  const selectedCount = computed(() => selectedPaths.value.size)
  const selectedEntries = computed(() =>
    entries.value.filter(e => selectedPaths.value.has(e.path))
  )

  const breadcrumbs = computed(() => {
    const parts = currentPath.value.split('/').filter(Boolean)
    const result = [{ name: '根目录', path: '' }]
    let path = ''
    for (const part of parts) {
      path = path ? `${path}/${part}` : part
      result.push({ name: part, path })
    }
    return result
  })

  // ── API Methods ──
  async function loadList(path?: string) {
    loading.value = true
    try {
      const targetPath = path ?? currentPath.value
      const data = await api.get<{ path: string; parent: string | null; entries: DiskEntry[] }>(
        `/storage/list?path=${encodeURIComponent(targetPath)}`
      )
      entries.value = data.entries || []
      currentPath.value = data.path || ''
      selectedPaths.value = new Set()
      searchQuery.value = ''

      // Update history
      if (path !== undefined && path !== currentPath.value) {
        // Trim forward history
        pathHistory.value = pathHistory.value.slice(0, historyIndex.value + 1)
        pathHistory.value.push(path)
        historyIndex.value = pathHistory.value.length - 1
      }
    } catch (e: any) {
      throw new Error(e.message || '加载失败')
    } finally {
      loading.value = false
    }
  }

  async function loadStorageInfo() {
    try {
      const data = await api.get<StorageInfo>('/storage/info')
      storageInfo.value = data
    } catch {}
  }

  async function createFolder(name: string) {
    await api.post('/storage/mkdir', { path: currentPath.value ? `${currentPath.value}/${name}` : name })
    await loadList()
  }

  async function renameItem(oldPath: string, newName: string) {
    await api.put('/storage/rename', { path: oldPath, new_name: newName })
    await loadList()
  }

  async function moveItems(paths: string[], dest: string) {
    await api.post('/storage/move', { paths, dest })
    await loadList()
  }

  async function deleteItems(paths: string[]) {
    if (paths.length === 0) return
    if (paths.length === 1) {
      await api.delete(`/storage/delete?path=${encodeURIComponent(paths[0]!)}`)
    } else {
      await api.post('/storage/batch-delete', { paths })
    }
    await loadList()
    await loadStorageInfo()
  }

  async function batchRename(mode: string, options: Record<string, any>) {
    const paths = Array.from(selectedPaths.value)
    await api.post('/storage/batch-rename', { paths, mode, ...options })
    await loadList()
  }

  async function downloadFile(path: string, name?: string) {
    const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
    const resp = await fetch(`${BASE}/storage/download?path=${encodeURIComponent(path)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || '下载失败')
    }
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name || path.split('/').pop() || 'download'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function batchDownload() {
    const items = selectedEntries.value.filter(e => !e.is_dir)
    for (const item of items) {
      await downloadFile(item.path, item.name)
    }
  }

  // ── Navigation ──
  function goTo(path: string) {
    loadList(path)
  }

  function goUp() {
    const parts = currentPath.value.split('/').filter(Boolean)
    parts.pop()
    loadList(parts.join('/'))
  }

  function goBack() {
    if (historyIndex.value > 0) {
      historyIndex.value--
      loadList(pathHistory.value[historyIndex.value])
    }
  }

  function goForward() {
    if (historyIndex.value < pathHistory.value.length - 1) {
      historyIndex.value++
      loadList(pathHistory.value[historyIndex.value])
    }
  }

  function goHome() {
    loadList('')
  }

  // ── Selection ──
  function toggleSelect(path: string) {
    const newSet = new Set(selectedPaths.value)
    if (newSet.has(path)) {
      newSet.delete(path)
    } else {
      newSet.add(path)
    }
    selectedPaths.value = newSet
  }

  function selectAll() {
    selectedPaths.value = new Set(filteredEntries.value.map(e => e.path))
  }

  function clearSelection() {
    selectedPaths.value = new Set()
  }

  function isSelected(path: string) {
    return selectedPaths.value.has(path)
  }

  // ── Helpers ──
  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
  }

  function formatDate(iso: string): string {
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  function getFileIcon(entry: DiskEntry): string {
    if (entry.is_dir) return '📁'
    const ext = entry.ext || entry.name.split('.').pop()?.toLowerCase() || ''
    const iconMap: Record<string, string> = {
      pdf: '📄', doc: '📝', docx: '📝', txt: '📝', md: '📝',
      xls: '📊', xlsx: '📊', csv: '📊',
      ppt: '📽', pptx: '📽',
      jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', svg: '🖼', bmp: '🖼',
      mp3: '🎵', wav: '🎵', flac: '🎵', aac: '🎵',
      mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬', wmv: '🎬',
      zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
      js: '⚡', ts: '⚡', py: '🐍', java: '☕', cpp: '⚙', c: '⚙', go: '🔵', rs: '🦀',
      html: '🌐', css: '🎨', json: '📋', xml: '📋', yaml: '📋', yml: '📋',
      sql: '🗃', sh: '💻', bat: '💻', ps1: '💻',
    }
    return iconMap[ext] || '📄'
  }

  function canPreview(entry: DiskEntry): boolean {
    if (entry.is_dir) return false
    const ext = entry.ext || entry.name.split('.').pop()?.toLowerCase() || ''
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'txt', 'md', 'json', 'js', 'ts', 'py', 'html', 'css', 'sql', 'log', 'csv', 'xml', 'yaml', 'yml', 'pdf'].includes(ext)
  }

  return {
    // State
    entries,
    currentPath,
    selectedPaths,
    loading,
    storageInfo,
    searchQuery,
    pathHistory,
    historyIndex,
    // Computed
    filteredEntries,
    selectedCount,
    selectedEntries,
    breadcrumbs,
    // Methods
    loadList,
    loadStorageInfo,
    createFolder,
    renameItem,
    moveItems,
    deleteItems,
    batchRename,
    downloadFile,
    batchDownload,
    // Navigation
    goTo,
    goUp,
    goBack,
    goForward,
    goHome,
    // Selection
    toggleSelect,
    selectAll,
    clearSelection,
    isSelected,
    // Helpers
    formatSize,
    formatDate,
    getFileIcon,
    canPreview,
  }
}
