<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'
import { api } from '@/api/client'
import { useMessage, useDialog } from 'naive-ui'
import {
  NCard, NButton, NProgress, NModal, NForm, NFormItem, NInput, NInputNumber,
  NSpace, NSpin, NEmpty, NText, NCheckbox, NTag, NRadioGroup, NRadioButton,
} from 'naive-ui'
import { useUploadManager } from '@/composables/useUploadManager'
import UploadPanel from '@/components/chat/UploadPanel.vue'
import {
  Folder, File, FileText, FileImage, FileSpreadsheet, FileType, Archive,
  Image, Music, Video, ChevronRight, Upload, Plus, Trash2, Download, Edit3,
  HardDrive, RefreshCw, MoveRight, CheckSquare, Replace, Search,
  ArrowLeft, ArrowUp, Home,
} from '@lucide/vue'

const message = useMessage()
const dialog = useDialog()
const { startUpload, onUploadDone } = useUploadManager()
onUploadDone(() => { loadList(currentPath.value); loadInfo() })

// ── Types ──
interface FileEntry {
  name: string; path: string; is_dir: boolean; size: number
  size_display: string; modified: string; icon: string
}
interface StorageInfo {
  storage_limit: number; storage_used: number; used_percent: number
  used_display: string; limit_display: string
}

// ── State ──
const storageInfo = ref<StorageInfo | null>(null)
const currentPath = ref('')
const parentPath = ref<string | null>(null)
const entries = ref<FileEntry[]>([])
const loading = ref(false)
const selectedFile = ref<FileEntry | null>(null)
const selectedPaths = ref<Set<string>>(new Set())
const searchQuery = ref('')

// Navigation history
const pathHistory = ref<string[]>([])
const historyIndex = ref(-1)

// 创建文件夹
const showMkdirModal = ref(false)
const mkdirName = ref('')
// 重命名
const showRenameModal = ref(false)
const renameTarget = ref<FileEntry | null>(null)
const renameValue = ref('')
// 移动
const showMoveModal = ref(false)
const moveTargets = ref<string[]>([])
const moveDir = ref('')
const moveDirs = ref<string[]>([])
// 批量重命名
const showBatchRenameModal = ref(false)
const batchRenameMode = ref<'replace' | 'prefix' | 'suffix' | 'number'>('replace')
const batchRenameFind = ref('')
const batchRenameReplace = ref('')
const batchRenameText = ref('')
const batchRenamePattern = ref('_{n}')
const batchRenameStart = ref(1)

// ── Computed ──
const filteredEntries = computed(() => {
  if (!searchQuery.value.trim()) return entries.value
  const q = searchQuery.value.toLowerCase()
  return entries.value.filter(e => e.name.toLowerCase().includes(q))
})

const sortedEntries = computed(() => {
  const list = [...filteredEntries.value]
  list.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
  return list
})

const breadcrumbs = computed(() => {
  if (!currentPath.value) return [{ label: '根目录', path: '' }]
  const parts = currentPath.value.split('/')
  const items = [{ label: '根目录', path: '' }]
  let acc = ''
  for (const p of parts) { acc = acc ? `${acc}/${p}` : p; items.push({ label: p, path: acc }) }
  return items
})

const hasBack = computed(() => historyIndex.value > 0)
const hasForward = computed(() => historyIndex.value < pathHistory.value.length - 1)

// ── Navigation ──
function pushHistory(path: string) {
  pathHistory.value = pathHistory.value.slice(0, historyIndex.value + 1)
  pathHistory.value.push(path)
  historyIndex.value = pathHistory.value.length - 1
}
function goBack() { if (hasBack.value) { historyIndex.value--; loadList(pathHistory.value[historyIndex.value], false) } }
function goForward() { if (hasForward.value) { historyIndex.value++; loadList(pathHistory.value[historyIndex.value], false) } }
function goUp() {
  if (!currentPath.value) return
  const parent = currentPath.value.includes('/') ? currentPath.value.slice(0, currentPath.value.lastIndexOf('/')) : ''
  navigateTo(parent)
}
function goHome() { navigateTo('') }

// ── Load ──
async function loadInfo() { try { storageInfo.value = await api.get<StorageInfo>('/storage/info') } catch {} }

async function loadList(path: string = '', push = true) {
  loading.value = true; currentPath.value = path; selectedFile.value = null; selectedPaths.value = new Set()
  if (push) pushHistory(path)
  try {
    const res = await api.get<{ path: string; parent: string | null; entries: FileEntry[] }>(`/storage/list?path=${encodeURIComponent(path)}`)
    parentPath.value = res.parent; entries.value = res.entries
  } catch (e: any) { message.error(e.message || '加载失败'); entries.value = [] }
  finally { loading.value = false }
}

async function refresh() { await Promise.all([loadInfo(), loadList(currentPath.value, false)]) }

function enterDir(entry: FileEntry) { if (entry.is_dir) loadList(entry.path) }
function navigateTo(path: string) { if (path !== currentPath.value) loadList(path) }

// ── Selection ──
function toggleSelect(path: string) {
  const s = new Set(selectedPaths.value)
  if (s.has(path)) s.delete(path); else s.add(path)
  selectedPaths.value = s
}
function toggleSelectAll() {
  if (selectedPaths.value.size === sortedEntries.value.length) selectedPaths.value = new Set()
  else selectedPaths.value = new Set(sortedEntries.value.map(e => e.path))
}

// ── Create folder ──
async function createFolder() {
  if (!mkdirName.value.trim()) { message.warning('请输入文件夹名称'); return }
  try {
    await api.post('/storage/mkdir', { path: currentPath.value ? `${currentPath.value}/${mkdirName.value}` : mkdirName.value })
    message.success('文件夹已创建'); showMkdirModal.value = false; mkdirName.value = ''
    await loadList(currentPath.value, false); await loadInfo()
  } catch (e: any) { message.error(e.message || '创建失败') }
}

// ── Upload ──
const fileInputRef = ref<HTMLInputElement | null>(null)
function triggerUpload() { fileInputRef.value?.click() }

// ── Drag & drop ──
const dragging = ref(false)
let dragCounter = 0
function onDragOver(e: DragEvent) { e.preventDefault() }
function onDragEnter(e: DragEvent) { e.preventDefault(); dragCounter++; if (dragCounter === 1) dragging.value = true }
function onDragLeave(e: DragEvent) { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; dragging.value = false } }
async function onDrop(e: DragEvent) {
  e.preventDefault(); dragCounter = 0; dragging.value = false
  const items = e.dataTransfer?.items; if (!items?.length) return
  const fileList: { file: File; path: string }[] = []
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) {
      if (entry.isFile) { const f = item.getAsFile(); if (f) fileList.push({ file: f, path: currentPath.value }) }
      else { await traverseFiles(entry, currentPath.value ? `${currentPath.value}/${entry.name}` : entry.name, fileList) }
    } else if (item.kind === 'file') { const f = item.getAsFile(); if (f) fileList.push({ file: f, path: currentPath.value }) }
  }
  if (fileList.length === 0 && e.dataTransfer?.files.length) {
    for (const f of Array.from(e.dataTransfer.files)) fileList.push({ file: f, path: currentPath.value })
  }
  for (const { file, path } of fileList) startUpload(file, path)
  if (fileList.length > 0) message.success(`已添加 ${fileList.length} 个文件到上传队列`)
}
function traverseFiles(entry: any, path: string, files: { file: File; path: string }[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) { entry.file((f: File) => { files.push({ file: f, path }); resolve() }) }
    else if (entry.isDirectory) {
      const dirReader = entry.createReader()
      const readAll = () => { dirReader.readEntries(async (es: any[]) => { if (es.length === 0) { resolve(); return }; for (const e of es) await traverseFiles(e, path ? `${path}/${e.name}` : e.name, files); readAll() }) }; readAll()
    } else resolve()
  })
}

// ── Rename ──
function openRename(entry: FileEntry) { renameTarget.value = entry; renameValue.value = entry.name; showRenameModal.value = true }
async function confirmRename() {
  if (!renameTarget.value || !renameValue.value.trim()) return
  try { await api.put('/storage/rename', { path: renameTarget.value.path, new_name: renameValue.value.trim() }); message.success('已重命名'); showRenameModal.value = false; renameTarget.value = null; await loadList(currentPath.value, false) }
  catch (e: any) { message.error(e.message || '重命名失败') }
}
function confirmDelete(entry: FileEntry) {
  dialog.warning({ title: '确认删除', content: `确定删除「${entry.name}」${entry.is_dir ? '及其所有内容' : ''}？`, positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => { try { await api.delete(`/storage/delete?path=${encodeURIComponent(entry.path)}`); message.success('已删除'); await loadList(currentPath.value, false); await loadInfo() } catch (e: any) { message.error(e.message || '删除失败') } },
  })
}
function batchDelete() {
  const paths = Array.from(selectedPaths.value)
  if (paths.length === 0) { message.warning('请选择文件'); return }
  dialog.warning({ title: '批量删除', content: `确定删除选中的 ${paths.length} 个项目？`, positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => { try { const r = await api.post<{ deleted: number }>('/storage/batch-delete', { paths }); message.success(`已删除 ${r.deleted} 个项目`); selectedPaths.value = new Set(); await loadList(currentPath.value, false); await loadInfo() } catch (e: any) { message.error(e.message || '删除失败') } },
  })
}

// ── Move ──
async function openMove() {
  const paths = Array.from(selectedPaths.value)
  if (paths.length === 0) { message.warning('请选择文件'); return }
  moveTargets.value = paths; moveDir.value = ''; await loadMoveDirs(); showMoveModal.value = true
}
async function loadMoveDirs() { try { const r = await api.get<{ entries: FileEntry[] }>(`/storage/list?path=${encodeURIComponent(moveDir.value)}`); moveDirs.value = r.entries.filter(e => e.is_dir).map(e => e.name) } catch { moveDirs.value = [] } }
function enterMoveDir(name: string) { moveDir.value = moveDir.value ? `${moveDir.value}/${name}` : name; loadMoveDirs() }
async function confirmMove() { try { const r = await api.post<{ moved: number }>('/storage/move', { paths: moveTargets.value, target: moveDir.value }); message.success(`已移动 ${r.moved} 个项目`); showMoveModal.value = false; selectedPaths.value = new Set(); await loadList(currentPath.value, false); await loadInfo() } catch (e: any) { message.error(e.message || '移动失败') } }

// ── Download ──
function downloadFile(entry: FileEntry) {
  if (entry.is_dir) { message.warning('暂不支持直接下载文件夹'); return }
  const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
  const a = document.createElement('a'); a.href = `/api/storage/download?path=${encodeURIComponent(entry.path)}&token=${token}`; a.download = entry.name; a.click()
}

// ── Batch rename ──
async function openBatchRename() {
  const paths = Array.from(selectedPaths.value)
  if (paths.length === 0) { message.warning('请选择文件'); return }
  batchRenameMode.value = 'replace'; batchRenameFind.value = ''; batchRenameReplace.value = ''; batchRenameText.value = ''; batchRenamePattern.value = '_{n}'; batchRenameStart.value = 1; showBatchRenameModal.value = true
}
function previewBatchName(oldName: string, index: number): string {
  const ext = oldName.includes('.') ? oldName.substring(oldName.lastIndexOf('.')) : ''
  const base = ext ? oldName.substring(0, oldName.lastIndexOf('.')) : oldName
  switch (batchRenameMode.value) {
    case 'replace': return oldName.replaceAll(batchRenameFind.value, batchRenameReplace.value)
    case 'prefix': return (batchRenameText.value || '') + oldName
    case 'suffix': return base + (batchRenameText.value || '') + ext
    case 'number': { const num = (batchRenameStart.value || 1) + index; return batchRenamePattern.value.replace(/\{n\}/g, String(num).padStart(String(selectedPaths.value.size).length, '0')) }
    default: return oldName
  }
}
async function confirmBatchRename() {
  const paths = Array.from(selectedPaths.value)
  if (paths.length === 0) { message.warning('请选择文件'); return }
  try {
    const body: any = { paths, mode: batchRenameMode.value }
    switch (batchRenameMode.value) {
      case 'replace': body.find = batchRenameFind.value; body.replace = batchRenameReplace.value; if (!batchRenameFind.value) { message.warning('请输入查找内容'); return }; break
      case 'prefix': case 'suffix': body.text = batchRenameText.value; if (!batchRenameText.value) { message.warning('请输入文本内容'); return }; break
      case 'number': body.pattern = batchRenamePattern.value; body.start = batchRenameStart.value; if (!batchRenamePattern.value.includes('{n}')) { message.warning('序号模式需要包含 {n} 占位符'); return }; break
    }
    const r = await api.post<{ renamed: number }>('/storage/batch-rename', body)
    message.success(`已重命名 ${r.renamed} 个项目`); showBatchRenameModal.value = false; selectedPaths.value = new Set(); await loadList(currentPath.value, false)
  } catch (e: any) { message.error(e.message || '批量重命名失败') }
}

// ── Right-click context menu ──
const ctxMenu = ref<{ show: boolean; x: number; y: number; entry: FileEntry | null }>({ show: false, x: 0, y: 0, entry: null })
function onContextMenu(e: MouseEvent, entry: FileEntry | null = null) { e.preventDefault(); ctxMenu.value = { show: true, x: e.clientX, y: e.clientY, entry } }
function closeCtxMenu() { ctxMenu.value.show = false }
function handleGlobalClick(e: MouseEvent) { const el = e.target as HTMLElement; if (!el.closest('.dm-ctx-menu')) closeCtxMenu() }
onMounted(() => { refresh(); document.addEventListener('click', handleGlobalClick) })
onUnmounted(() => document.removeEventListener('click', handleGlobalClick))

// ── Icon ──
function fileIcon(icon: string) { const map: Record<string, any> = { folder: Folder, image: Image, video: Video, audio: Music, pdf: FileType, doc: FileText, excel: FileSpreadsheet, ppt: File, archive: Archive, text: FileText, code: File }; return map[icon] || File }
function iconColor(icon: string): string { const map: Record<string, string> = { folder: '#f0a020', image: '#18a058', video: '#a050dc', audio: '#5E6AD2', pdf: '#d03050', doc: '#5E6AD2', excel: '#18a058', ppt: '#d03050', archive: '#f0a020', text: '#888', code: '#5E6AD2' }; return map[icon] || '#888' }
function fmtDate(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function fmtPercent(pct: number): 'default' | 'success' | 'warning' | 'error' { if (pct > 90) return 'error'; if (pct > 70) return 'warning'; if (pct > 30) return 'default'; return 'success' }

// ── Column resizing ──
const COL_KEYS = ['select', 'icon', 'name', 'size', 'date', 'actions'] as const
type ColKey = typeof COL_KEYS[number]

const colWidths = reactive<Record<ColKey, number>>({
  select: 36, icon: 32, name: 280, size: 88, date: 116, actions: 82,
})

const activeResize = ref<{ key: ColKey; startX: number; startW: number } | null>(null)

function onColResizeStart(key: ColKey, e: MouseEvent) {
  activeResize.value = { key, startX: e.clientX, startW: colWidths[key] }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  e.preventDefault()
}

function onColResizeMove(e: MouseEvent) {
  if (!activeResize.value) return
  const diff = e.clientX - activeResize.value.startX
  colWidths[activeResize.value.key] = Math.max(32, activeResize.value.startW + diff)
}

function onColResizeEnd() {
  if (activeResize.value) {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    activeResize.value = null
  }
}

onMounted(() => {
  document.addEventListener('mousemove', onColResizeMove)
  document.addEventListener('mouseup', onColResizeEnd)
})
onUnmounted(() => {
  document.removeEventListener('mousemove', onColResizeMove)
  document.removeEventListener('mouseup', onColResizeEnd)
})
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:16px;">
    <!-- ═══ 页面标题 ═══ -->
    <div>
      <NText tag="h1" depth="1" style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;">网盘空间</NText>
      <NText depth="3" style="margin-top:4px;display:block;font-size:13px;">个人文件存储与管理</NText>
    </div>

    <!-- ═══ 存储容量 ═══ -->
    <NCard :bordered="true" size="small" style="padding:4px 0;">
      <div style="display:flex;align-items:center;gap:16px;">
        <HardDrive :size="18" style="color:var(--accent);flex-shrink:0;" />
        <NProgress v-if="storageInfo" :value="storageInfo.used_percent" :indicator-placement="'inside'" :height="20" :border-radius="6" :type="fmtPercent(storageInfo.used_percent)" style="flex:1;min-width:100px;" />
        <span v-if="storageInfo" style="font-size:12px;color:var(--text-muted);white-space:nowrap;flex-shrink:0;">{{ storageInfo.used_display }} / {{ storageInfo.limit_display }}</span>
      </div>
    </NCard>

    <!-- ═══ 工具栏 ═══ -->
    <div class="dm-toolbar">
      <div class="dm-toolbar-left">
        <NButton size="tiny" quaternary :disabled="!hasBack" @click="goBack" round title="后退"><template #icon><ArrowLeft :size="15" /></template></NButton>
        <NButton size="tiny" quaternary :disabled="!hasForward" @click="goForward" round title="前进"><template #icon><ChevronRight :size="15" /></template></NButton>
        <NButton size="tiny" quaternary :disabled="!currentPath" @click="goUp" round title="上一级"><template #icon><ArrowUp :size="15" /></template></NButton>
        <div class="dm-toolbar-divider" />
        <div class="dm-breadcrumb">
          <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
            <span v-if="i > 0" class="dm-breadcrumb-sep">/</span>
            <span class="dm-breadcrumb-item" :class="{ active: i === breadcrumbs.length - 1 }" @click="navigateTo(crumb.path)">{{ crumb.label }}</span>
          </template>
        </div>
      </div>
      <div class="dm-toolbar-right">
        <div class="dm-search-box">
          <Search :size="13" class="dm-search-icon" />
          <input v-model="searchQuery" class="dm-search-input" placeholder="筛选文件..." />
        </div>
        <NButton size="tiny" quaternary @click="refresh" round title="刷新"><template #icon><RefreshCw :size="14" /></template></NButton>
        <NButton size="tiny" quaternary @click="showMkdirModal = true" round title="新建文件夹"><template #icon><Plus :size="14" /></template></NButton>
        <NButton size="tiny" secondary @click="triggerUpload" round title="上传文件"><template #icon><Upload :size="14" /></template>上传</NButton>
        <input ref="fileInputRef" type="file" multiple style="display:none" @change="(e) => { const i = e.target as HTMLInputElement; if (i.files) { for (const f of Array.from(i.files)) startUpload(f, currentPath.value) }; i.value = '' }" />
      </div>
    </div>

    <!-- ═══ 批量操作栏 ═══ -->
    <div v-if="selectedPaths.size > 0" class="dm-batch-bar">
      <CheckSquare :size="15" style="color:var(--accent);" />
      <span style="color:var(--text-primary);font-weight:500;">已选 {{ selectedPaths.size }} 项</span>
      <div style="flex:1" />
      <NButton size="tiny" secondary @click="openBatchRename" round><template #icon><Replace :size="13" /></template>批量重命名</NButton>
      <NButton size="tiny" secondary @click="openMove" round><template #icon><MoveRight :size="13" /></template>移动到</NButton>
      <NButton size="tiny" secondary type="error" @click="batchDelete" round><template #icon><Trash2 :size="13" /></template>批量删除</NButton>
      <NButton size="tiny" quaternary @click="selectedPaths = new Set()" round>取消选择</NButton>
    </div>

    <!-- ═══ 文件列表（Windows 风格） ═══ -->
    <div class="dm-card" @dragover.prevent="onDragOver" @dragenter="onDragEnter" @dragleave="onDragLeave" @drop.prevent="onDrop">
      <NSpin :show="loading" style="min-height:200px;">
        <!-- Drop overlay -->
        <div class="dm-drag-layer" :class="{ show: dragging }">+ 拖拽文件到此处上传</div>

        <!-- 可横向滚动的列表容器 -->
        <div class="dm-table-wrap"
          :style="{
            '--col-select': colWidths.select + 'px',
            '--col-icon': colWidths.icon + 'px',
            '--col-name': colWidths.name + 'px',
            '--col-size': colWidths.size + 'px',
            '--col-date': colWidths.date + 'px',
            '--col-actions': colWidths.actions + 'px',
          }"
        >
        <template v-if="sortedEntries.length > 0">
          <!-- 表头（可拖拽调整列宽） -->
          <div class="dm-list-header">
            <div class="dm-col dm-col-select" @click="toggleSelectAll">
              <NCheckbox size="small" :checked="sortedEntries.length > 0 && sortedEntries.every(e => selectedPaths.has(e.path))" />
              <div class="dm-col-grip" @mousedown.stop="onColResizeStart('select', $event)" />
            </div>
            <div class="dm-col dm-col-icon">
              <div class="dm-col-grip" @mousedown.stop="onColResizeStart('icon', $event)" />
            </div>
            <div class="dm-col dm-col-name">名称
              <div class="dm-col-grip" @mousedown.stop="onColResizeStart('name', $event)" />
            </div>
            <div class="dm-col dm-col-size">大小
              <div class="dm-col-grip" @mousedown.stop="onColResizeStart('size', $event)" />
            </div>
            <div class="dm-col dm-col-date">修改日期
              <div class="dm-col-grip" @mousedown.stop="onColResizeStart('date', $event)" />
            </div>
            <div class="dm-col dm-col-actions">操作
              <div class="dm-col-grip" @mousedown.stop="onColResizeStart('actions', $event)" />
            </div>
          </div>
          <!-- 行 -->
          <div class="dm-list-body" @scroll="closeCtxMenu" @contextmenu="(e) => onContextMenu(e, null)">
            <div v-for="entry in sortedEntries" :key="entry.path"
              class="dm-list-row"
              :class="{ selected: selectedPaths.has(entry.path) }"
              @click="toggleSelect(entry.path)"
              @dblclick="enterDir(entry)"
              @contextmenu="(e) => onContextMenu(e, entry)"
            >
              <div class="dm-col dm-col-select" @click.stop="toggleSelect(entry.path)">
                <NCheckbox size="small" :checked="selectedPaths.has(entry.path)" />
              </div>
              <div class="dm-col dm-col-icon" @click.stop="enterDir(entry)">
                <component :is="fileIcon(entry.icon)" :size="17" :stroke-width="1.5" :style="{color:iconColor(entry.icon)}" />
              </div>
              <div class="dm-col dm-col-name" @click.stop="entry.is_dir ? enterDir(entry) : null">
                <span class="dm-entry-name">{{ entry.name }}</span>
              </div>
              <div class="dm-col dm-col-size">
                <span v-if="!entry.is_dir">{{ entry.size_display }}</span>
                <span v-else class="dm-dir-label">文件夹</span>
              </div>
              <div class="dm-col dm-col-date">{{ fmtDate(entry.modified) }}</div>
              <div class="dm-col dm-col-actions" @click.stop>
                <NButton size="tiny" quaternary @click="openRename(entry)" round><template #icon><Edit3 :size="12" /></template></NButton>
                <NButton v-if="!entry.is_dir" size="tiny" quaternary @click="downloadFile(entry)" round><template #icon><Download :size="12" /></template></NButton>
                <NButton size="tiny" quaternary type="error" @click="confirmDelete(entry)" round><template #icon><Trash2 :size="12" /></template></NButton>
              </div>
            </div>
          </div>
        </template>
        <NEmpty v-else-if="!loading" :description="searchQuery ? '未找到匹配的文件' : '此文件夹为空'" style="padding:60px 0;" />
        </div><!-- /dm-table-wrap -->
      </NSpin>
    </div>

    <!-- ═══ 右键菜单 ═══ -->
    <div v-if="ctxMenu.show" class="dm-ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
      <div class="dm-ctx-item" @click="closeCtxMenu(); refresh()"><RefreshCw :size="14" /> 刷新</div>
      <div class="dm-ctx-divider" />
      <div class="dm-ctx-item" @click="closeCtxMenu(); showMkdirModal = true"><Plus :size="14" /> 新建文件夹</div>
      <div class="dm-ctx-item" @click="closeCtxMenu(); triggerUpload()"><Upload :size="14" /> 上传文件</div>
      <div class="dm-ctx-divider" />
      <div v-if="ctxMenu.entry?.is_dir" class="dm-ctx-item" @click="closeCtxMenu(); ctxMenu.entry && enterDir(ctxMenu.entry)"><ArrowUp :size="14" /> 打开</div>
      <div v-if="ctxMenu.entry && !ctxMenu.entry.is_dir" class="dm-ctx-item" @click="closeCtxMenu(); ctxMenu.entry && toggleSelect(ctxMenu.entry.path)"><CheckSquare :size="14" /> 选择</div>
      <div v-if="ctxMenu.entry" class="dm-ctx-item" @click="closeCtxMenu(); ctxMenu.entry && openRename(ctxMenu.entry)"><Edit3 :size="14" /> 重命名</div>
      <div v-if="ctxMenu.entry && !ctxMenu.entry.is_dir" class="dm-ctx-item" @click="closeCtxMenu(); ctxMenu.entry && downloadFile(ctxMenu.entry)"><Download :size="14" /> 下载</div>
      <div class="dm-ctx-divider" />
      <div class="dm-ctx-item" @click="closeCtxMenu(); toggleSelectAll()"><CheckSquare :size="14" /> 全选</div>
    </div>

    <!-- ═══ Modals (保持原有功能) ═══ -->
    <n-modal v-model:show="showMkdirModal" preset="card" title="新建文件夹" style="width:380px;" :mask-closable="false">
      <n-form><n-form-item label="文件夹名称"><n-input v-model:value="mkdirName" placeholder="输入名称" @keyup.enter="createFolder" /></n-form-item></n-form>
      <template #footer><NSpace justify="end"><NButton quaternary @click="showMkdirModal = false">取消</NButton><NButton type="primary" @click="createFolder" :disabled="!mkdirName.trim()" round>创建</NButton></NSpace></template>
    </n-modal>

    <n-modal v-model:show="showRenameModal" preset="card" title="重命名" style="width:380px;" :mask-closable="false">
      <n-form><n-form-item label="新名称"><n-input v-model:value="renameValue" placeholder="输入新名称" @keyup.enter="confirmRename" /></n-form-item></n-form>
      <template #footer><NSpace justify="end"><NButton quaternary @click="showRenameModal = false">取消</NButton><NButton type="primary" @click="confirmRename" :disabled="!renameValue.trim()" round>确定</NButton></NSpace></template>
    </n-modal>

    <n-modal v-model:show="showMoveModal" preset="card" title="移动到" style="width:420px;" :mask-closable="false">
      <div style="margin-bottom:12px;"><span style="font-size:13px;color:var(--text-muted);">移动 {{ moveTargets.length }} 个项目到：</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">
        <NTag size="small" :bordered="false" round closable @close="moveDir = ''" style="cursor:pointer;">根目录</NTag>
        <template v-if="moveDir"><span style="color:var(--text-muted);font-size:12px;line-height:24px;">/</span><span style="font-size:13px;color:var(--text-primary);font-weight:500;line-height:24px;">{{ moveDir }}</span></template>
      </div>
      <div style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
        <div v-for="name in moveDirs" :key="name" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:13px;" @click="enterMoveDir(name)" @mouseenter="(e:any)=>e.currentTarget.style.background='var(--surface-2)'" @mouseleave="(e:any)=>e.currentTarget.style.background='transparent'"><Folder :size="16" style="color:#f0a020;flex-shrink:0;" /><span style="color:var(--text-primary);">{{ name }}</span></div>
        <div v-if="moveDirs.length === 0" style="color:var(--text-muted);font-size:12px;padding:12px;text-align:center;">{{ moveDir ? '此文件夹为空' : '根目录下无文件夹' }}</div>
      </div>
      <template #footer><NSpace justify="end"><NButton quaternary @click="showMoveModal = false">取消</NButton><NButton type="primary" @click="confirmMove" round>移动到此处</NButton></NSpace></template>
    </n-modal>

    <n-modal v-model:show="showBatchRenameModal" preset="card" title="批量重命名" style="width:460px;" :mask-closable="false">
      <div style="margin-bottom:16px;font-size:13px;color:var(--text-muted);">已选 <strong>{{ selectedPaths.size }}</strong> 项</div>
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:500;margin-bottom:8px;color:var(--text-primary);">重命名模式</div>
        <NRadioGroup v-model:value="batchRenameMode"><div style="display:flex;gap:8px;"><NRadioButton value="replace" style="flex:1;">查找替换</NRadioButton><NRadioButton value="prefix" style="flex:1;">添加前缀</NRadioButton><NRadioButton value="suffix" style="flex:1;">添加后缀</NRadioButton><NRadioButton value="number" style="flex:1;">序号模式</NRadioButton></div></NRadioGroup>
      </div>
      <n-form v-if="batchRenameMode === 'replace'" :show-label="true"><n-form-item label="查找"><n-input v-model:value="batchRenameFind" placeholder="输入要查找的文本" /></n-form-item><n-form-item label="替换为"><n-input v-model:value="batchRenameReplace" placeholder="留空则删除" /></n-form-item></n-form>
      <n-form v-if="batchRenameMode === 'prefix' || batchRenameMode === 'suffix'" :show-label="true"><n-form-item :label="batchRenameMode === 'prefix' ? '前缀文本' : '后缀文本'"><n-input v-model:value="batchRenameText" :placeholder="batchRenameMode === 'prefix' ? '添加在文件名前面' : '添加在文件名后面（扩展名前）'" /></n-form-item></n-form>
      <n-form v-if="batchRenameMode === 'number'" :show-label="true"><n-form-item label="命名模板"><n-input v-model:value="batchRenamePattern" placeholder="例: 照片_{n}" /></n-form-item><div style="font-size:12px;color:var(--text-muted);margin-top:-8px;margin-bottom:12px;">使用 <code style="background:var(--surface-2);padding:1px 5px;border-radius:3px;">{n}</code> 表示序号，自动补零</div><n-form-item label="起始编号"><n-input-number v-model:value="batchRenameStart" :min="0" :max="9999" style="width:120px;" /></n-form-item></n-form>
      <div v-if="batchRenameMode && selectedPaths.size > 0" style="margin-top:4px;">
        <div style="font-size:12px;font-weight:500;margin-bottom:6px;color:var(--text-muted);">预览（前 5 项）</div>
        <div style="max-height:120px;overflow-y:auto;background:var(--surface-2);border-radius:6px;padding:8px 12px;font-size:12px;display:flex;flex-direction:column;gap:4px;">
          <div v-for="(entry, i) in entries.filter(e => selectedPaths.has(e.path)).slice(0, 5)" :key="entry.path" style="display:flex;gap:8px;align-items:center;"><span style="color:var(--text-muted);flex-shrink:0;">{{ i + 1 }}.</span><span style="color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">{{ entry.name }}</span><span style="color:var(--text-muted);">→</span><span style="color:var(--accent);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">{{ previewBatchName(entry.name, i) }}</span></div>
        </div>
      </div>
      <template #footer><NSpace justify="end"><NButton quaternary @click="showBatchRenameModal = false">取消</NButton><NButton type="primary" @click="confirmBatchRename" round>开始重命名</NButton></NSpace></template>
    </n-modal>

    <UploadPanel />
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════
   Windows 11 风格网盘管理器
   ═══════════════════════════════════════════ */

/* ── Toolbar ── */
.dm-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 6px 12px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 6px;
  min-height: 40px;
}
.dm-toolbar-left { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; }
.dm-toolbar-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.dm-toolbar-divider { width: 1px; height: 20px; background: var(--hairline); margin: 0 4px; flex-shrink: 0; }

.dm-breadcrumb { display: flex; align-items: center; gap: 2px; font-size: 12px; color: var(--text-primary); overflow: hidden; flex: 1; min-width: 0; }
.dm-breadcrumb-sep { color: var(--text-muted); font-size: 11px; flex-shrink: 0; }
.dm-breadcrumb-item { padding: 2px 6px; border-radius: 3px; cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: background .1s; }
.dm-breadcrumb-item:hover { background: var(--surface-2); }
.dm-breadcrumb-item.active { font-weight: 600; }

.dm-search-box { position: relative; display: flex; align-items: center; width: 160px; }
.dm-search-icon { position: absolute; left: 7px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.dm-search-input { width: 100%; height: 26px; padding: 0 8px 0 26px; border: 1px solid var(--hairline); border-radius: 4px; background: var(--surface-2); color: var(--text-primary); font-size: 12px; outline: none; transition: border-color .15s; }
.dm-search-input:focus { border-color: var(--accent); }
.dm-search-input::placeholder { color: var(--text-muted); }

/* ── Batch bar ── */
.dm-batch-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; background: var(--surface-2);
  border-radius: 6px; font-size: 13px;
}

/* ── File list card ── */
.dm-card {
  position: relative;
  border: 1px solid var(--hairline);
  border-radius: 6px;
  background: var(--surface-1);
  min-height: 240px;
  overflow: hidden;
}

/* Drag overlay */
.dm-drag-layer {
  position: absolute; inset: 0; border-radius: 6px; z-index: 10;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 600; color: var(--accent);
  background: rgba(94,106,210,0.05);
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  border: 2px dashed var(--accent);
  opacity: 0; transform: scale(0.96);
  transition: opacity 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
}
.dm-drag-layer.show { opacity: 1; transform: scale(1); }

/* ── List header ── */
.dm-list-header {
  display: flex; align-items: center;
  padding: 6px 0; border-bottom: 1px solid var(--hairline);
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  user-select: none; flex-shrink: 0;
}
.dm-list-header .dm-col { padding: 0 6px; }
.dm-list-header .dm-col:first-child { padding-left: 10px; }
.dm-list-header .dm-col:last-child { padding-right: 10px; }
.dm-list-body { max-height: 480px; overflow-y: auto; min-height: 180px; }
.dm-list-row {
  display: flex; align-items: center;
  padding: 5px 0; border-bottom: 1px solid var(--hairline);
  cursor: default; font-size: 13px; transition: background .08s;
}
.dm-list-row .dm-col { padding: 0 6px; }
.dm-list-row .dm-col:first-child { padding-left: 10px; }
.dm-list-row .dm-col:last-child { padding-right: 10px; }
.dm-list-row:hover { background: var(--surface-2); }
.dm-list-row.selected { background: rgba(94,106,210,0.08); }

/* ── Column sizing via CSS variables ── */
.dm-list-header .dm-col,
.dm-list-row .dm-col {
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dm-col-select { width: var(--col-select, 36px); min-width: var(--col-select, 36px); display:flex; align-items:center; justify-content:center; }
.dm-col-icon { width: var(--col-icon, 32px); min-width: var(--col-icon, 32px); display:flex; align-items:center; justify-content:center; }
.dm-col-name { width: var(--col-name, 280px); min-width: var(--col-name, 280px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dm-col-size { width: var(--col-size, 88px); min-width: var(--col-size, 88px); text-align: right; color: var(--text-muted); font-size: 12px; }
.dm-col-date { width: var(--col-date, 116px); min-width: var(--col-date, 116px); color: var(--text-muted); font-size: 12px; }
.dm-col-actions { width: var(--col-actions, 82px); min-width: var(--col-actions, 82px); text-align: right; display: flex; gap: 2px; justify-content: flex-end; opacity: 0; transition: opacity .15s; }

/* ── Column resize grip ── */
.dm-col { position: relative; }
.dm-col-grip {
  position: absolute; top: 0; right: -3px;
  width: 7px; height: 100%;
  cursor: col-resize; z-index: 5;
  background: transparent;
  transition: background .12s;
}
.dm-col-grip::after {
  content: '';
  position: absolute; top: 8px; bottom: 8px; left: 3px;
  width: 1px;
  background: var(--hairline);
  transition: background .12s;
}
.dm-col-grip:hover::after,
.dm-col-grip:active::after { background: var(--accent); }
.dm-col-grip:hover,
.dm-col-grip:active { background: rgba(94,106,210,0.08); }
.dm-col:last-child .dm-col-grip { display: none; }
.dm-list-row:hover .dm-col-actions { opacity: 1; }
.dm-list-row .dm-col-actions { display: flex; gap: 2px; justify-content: flex-end; }

.dm-entry-name { cursor: pointer; }
.dm-dir-label { font-size: 11px; color: var(--text-muted); }

/* ── Right-click context menu ── */
.dm-ctx-menu {
  position: fixed; z-index: 1000;
  min-width: 180px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 8px; padding: 4px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06);
  animation: ctxFadeIn 0.12s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes ctxFadeIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
.dm-ctx-item { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 4px; font-size: 13px; color: var(--text-primary); cursor: pointer; transition: background .1s; }
.dm-ctx-item:hover { background: var(--surface-2); }
.dm-ctx-item:active { background: var(--surface-3); }
.dm-ctx-divider { height: 1px; background: var(--hairline); margin: 3px 8px; }

/* ── Mobile ── */
@media (max-width: 768px) {
  .dm-toolbar { flex-direction: column; align-items: stretch; padding: 6px 8px; gap: 4px; }
  .dm-toolbar-left { gap: 2px; width: 100%; }
  .dm-toolbar-left .n-button { transform: scale(1.1); flex-shrink: 0; }
  .dm-toolbar-divider { display: none; }
  .dm-breadcrumb { font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .dm-toolbar-right { width: 100%; justify-content: space-between; }
  .dm-search-box { flex: 1; max-width: none; }

  /* 可横向滚动 */
  .dm-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .dm-list-header, .dm-list-body { min-width: max-content; }
  .dm-list-row { padding: 5px 10px; font-size: 12px; }
  .dm-col-actions { opacity: 1; }
}
</style>
