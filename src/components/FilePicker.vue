<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { api } from '@/api/client'
import { useMessage } from 'naive-ui'
import {
  NButton, NSpin, NEmpty, NText, NSpace, NCheckbox, NInput, NModal,
} from 'naive-ui'
import {
  Folder, File, FileText, FileImage, FileSpreadsheet, FileType, Archive,
  Image, Music, Video, ChevronRight, Search, Upload, Plus, Trash2,
  RefreshCw, ArrowLeft, ArrowUp, Home, Download,
} from '@lucide/vue'
import { useUploadManager } from '@/composables/useUploadManager'
import UploadPanel from '@/components/chat/UploadPanel.vue'

interface DiskEntry {
  name: string; path: string; is_dir: boolean; size: number
  size_display: string; modified: string; icon: string
}

const message = useMessage()

const props = withDefaults(defineProps<{
  show: boolean
  accept?: string[]
  multiple?: boolean
}>(), {
  accept: () => ['*'],
  multiple: true,
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [files: { name: string; path: string; size: number; size_display: string }[]]
}>()

const { startUpload, onUploadDone } = useUploadManager()
onUploadDone(() => loadDir(currentPath.value))

// ── State ──

const loading = ref(false)
const currentPath = ref('')
const pathHistory = ref<string[]>([])
const historyIndex = ref(-1)
const entries = ref<DiskEntry[]>([])
const selectedPaths = ref<Set<string>>(new Set())
const selectedFiles = ref<Map<string, DiskEntry>>(new Map())
const searchQuery = ref('')

// 新建文件夹
const showMkdirModal = ref(false)
const mkdirName = ref('')

// ── Computed ──

const filteredEntries = computed(() => {
  if (!searchQuery.value.trim()) return entries.value
  const q = searchQuery.value.toLowerCase()
  return entries.value.filter(e => e.name.toLowerCase().includes(q))
})

const sortedEntries = computed(() => {
  const list = [...filteredEntries.value]
  // Directories first, then alphabetical
  list.sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return list
})

const acceptAll = computed(() => props.accept.includes('*'))
const acceptExts = computed(() => new Set(props.accept.map(e => e.toLowerCase())))

function isAcceptable(entry: DiskEntry): boolean {
  if (entry.is_dir) return true
  if (acceptAll.value) return true
  const ext = '.' + entry.name.split('.').pop()?.toLowerCase()
  return acceptExts.value.has(ext)
}

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

// Sidebar quick-access roots
const rootPaths = computed(() => {
  const dirs = new Set<string>()
  dirs.add('')
  // Collect top-level directories from entries
  for (const e of entries.value) {
    if (e.is_dir) {
      const top = e.path.split('/')[0]
      if (top) dirs.add(top)
    }
  }
  return Array.from(dirs).sort()
})

// ── Navigation ──

function pushHistory(path: string) {
  // Clear forward history
  pathHistory.value = pathHistory.value.slice(0, historyIndex.value + 1)
  pathHistory.value.push(path)
  historyIndex.value = pathHistory.value.length - 1
}

function goBack() {
  if (hasBack.value) {
    historyIndex.value--
    loadDir(pathHistory.value[historyIndex.value], false)
  }
}

function goForward() {
  if (hasForward.value) {
    historyIndex.value++
    loadDir(pathHistory.value[historyIndex.value], false)
  }
}

function goUp() {
  if (!currentPath.value) return
  const parent = currentPath.value.includes('/')
    ? currentPath.value.slice(0, currentPath.value.lastIndexOf('/'))
    : ''
  navigateTo(parent)
}

function goHome() {
  navigateTo('')
}

async function loadDir(path: string = '', push = true) {
  loading.value = true
  currentPath.value = path
  if (push) pushHistory(path)
  try {
    const r = await api.get<{ entries: DiskEntry[] }>(`/storage/list?path=${encodeURIComponent(path)}`)
    entries.value = r.entries.filter(isAcceptable)
  } catch { entries.value = [] }
  finally { loading.value = false }
}

function enterDir(entry: DiskEntry) {
  if (entry.is_dir) loadDir(entry.path)
}

function navigateTo(path: string) {
  if (path !== currentPath.value) loadDir(path)
}

watch(() => props.show, (val) => {
  if (val) {
    selectedPaths.value = new Set()
    selectedFiles.value = new Map()
    pathHistory.value = ['']
    historyIndex.value = 0
    loadDir('', false)
  }
})

// ── Selection ──

function toggleSelect(entry: DiskEntry) {
  if (entry.is_dir) return
  const s = new Set(selectedPaths.value)
  const m = new Map(selectedFiles.value)
  if (s.has(entry.path)) {
    s.delete(entry.path)
    m.delete(entry.path)
  } else {
    if (!props.multiple) { s.clear(); m.clear() }
    s.add(entry.path)
    m.set(entry.path, entry)
  }
  selectedPaths.value = s
  selectedFiles.value = m
}

// ── Drag & drop upload ──
let dragCounter = 0

function onDragOver(e: DragEvent) { e.preventDefault() }
function onDragEnter(e: DragEvent) {
  e.preventDefault(); dragCounter++
  if (dragCounter === 1) (e.currentTarget as HTMLElement)?.classList.add('fp-drag-over')
}
function onDragLeave(e: DragEvent) {
  e.preventDefault(); dragCounter--
  if (dragCounter <= 0) { dragCounter = 0; (e.currentTarget as HTMLElement)?.classList.remove('fp-drag-over') }
}
async function onDrop(e: DragEvent) {
  e.preventDefault(); dragCounter = 0
  const el = e.currentTarget as HTMLElement; el.classList.remove('fp-drag-over')
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
      const readAll = () => {
        dirReader.readEntries(async (entries: any[]) => {
          if (entries.length === 0) { resolve(); return }
          for (const e of entries) await traverseFiles(e, path ? `${path}/${e.name}` : e.name, files)
          readAll()
        })
      }
      readAll()
    } else resolve()
  })
}

function toggleSelectAll() {
  const files = sortedEntries.value.filter(e => !e.is_dir && isAcceptable(e))
  const s = new Set(selectedPaths.value)
  const m = new Map(selectedFiles.value)
  if (files.every(f => s.has(f.path))) {
    for (const f of files) { s.delete(f.path); m.delete(f.path) }
  } else {
    for (const f of files) { s.add(f.path); m.set(f.path, f) }
  }
  selectedPaths.value = s
  selectedFiles.value = m
}

function confirm() {
  const files = Array.from(selectedFiles.value.values()).map(e => ({
    name: e.name, path: e.path, size: e.size, size_display: e.size_display,
  }))
  emit('confirm', files)
}

function cancel() { emit('update:show', false) }

// ── Upload ──

const fileInputRef = ref<HTMLInputElement | null>(null)

function triggerUpload() { fileInputRef.value?.click() }

function handleFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) startUpload(file, currentPath.value)
  input.value = ''
}

// ── Create folder ──

async function createFolder() {
  if (!mkdirName.value.trim()) { message.warning('请输入文件夹名称'); return }
  try {
    await api.post('/storage/mkdir', { path: currentPath.value ? `${currentPath.value}/${mkdirName.value}` : mkdirName.value })
    message.success('文件夹已创建'); showMkdirModal.value = false; mkdirName.value = ''
    await loadDir(currentPath.value, false)
  } catch (e: any) { message.error(e.message || '创建失败') }
}

// ── Icon resolution ──

function fileIcon(icon: string) {
  const map: Record<string, any> = {
    folder: Folder, image: Image, video: Video, audio: Music,
    pdf: FileType, doc: FileText, excel: FileSpreadsheet, ppt: File,
    archive: Archive, text: FileText, code: File,
  }
  return map[icon] || File
}

function iconColor(icon: string): string {
  const map: Record<string, string> = {
    folder: '#f0a020', image: '#18a058', video: '#a050dc', audio: '#5E6AD2',
    pdf: '#d03050', doc: '#5E6AD2', excel: '#18a058', ppt: '#d03050',
    archive: '#f0a020', text: '#888', code: '#5E6AD2',
  }
  return map[icon] || '#888'
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="网盘文件选择"
    style="width:780px;max-width:96vw;"
    :mask-closable="false"
    :segmented="{ content: true, footer: true }"
    header-style="padding:16px 20px 0;font-size:16px;font-weight:600;"
    content-style="padding:0;"
    footer-style="padding:10px 16px;"
    @update:show="(val: boolean) => emit('update:show', val)"
  >
    <!-- ═══ 工具栏 ═══ -->
    <div class="fp-toolbar">
      <div class="fp-toolbar-left">
        <NButton size="tiny" quaternary :disabled="!hasBack" @click="goBack" round title="后退">
          <template #icon><ArrowLeft :size="15" /></template>
        </NButton>
        <NButton size="tiny" quaternary :disabled="!hasForward" @click="goForward" round title="前进">
          <template #icon><ChevronRight :size="15" /></template>
        </NButton>
        <NButton size="tiny" quaternary :disabled="!currentPath" @click="goUp" round title="上一级">
          <template #icon><ArrowUp :size="15" /></template>
        </NButton>
        <div class="fp-toolbar-divider" />
        <div class="fp-breadcrumb">
          <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
            <span v-if="i > 0" class="fp-breadcrumb-sep">/</span>
            <span
              class="fp-breadcrumb-item"
              :class="{ active: i === breadcrumbs.length - 1 }"
              @click="navigateTo(crumb.path)"
            >{{ crumb.label }}</span>
          </template>
        </div>
      </div>
      <div class="fp-toolbar-right">
        <div class="fp-search-box">
          <Search :size="13" class="fp-search-icon" />
          <input
            v-model="searchQuery"
            class="fp-search-input"
            placeholder="搜索文件..."
          />
        </div>
        <NButton size="tiny" quaternary @click="loadDir(currentPath, false)" round title="刷新">
          <template #icon><RefreshCw :size="14" /></template>
        </NButton>
        <NButton size="tiny" quaternary @click="showMkdirModal = true" round title="新建文件夹">
          <template #icon><Plus :size="14" /></template>
        </NButton>
        <NButton size="tiny" secondary @click="triggerUpload" round title="上传文件">
          <template #icon><Upload :size="14" /></template>
          上传
        </NButton>
        <input ref="fileInputRef" type="file" multiple style="display:none" @change="handleFileSelected" />
      </div>
    </div>

    <!-- ═══ 主体 ═══ -->
    <div class="fp-body">
      <!-- 左侧栏 -->
      <div class="fp-sidebar">
        <div class="fp-sidebar-section-title">位置</div>
        <div class="fp-sidebar-item" :class="{ active: currentPath === '' }" @click="goHome">
          <Home :size="15" /> 根目录
        </div>
        <div
          v-for="rp in rootPaths" :key="rp"
          v-show="rp !== ''"
          class="fp-sidebar-item"
          :class="{ active: currentPath === rp || currentPath.startsWith(rp + '/') }"
          @click="navigateTo(rp)"
        >
          <Folder :size="15" style="color:#f0a020;" /> {{ rp }}
        </div>
      </div>

      <!-- 文件列表（支持拖拽） -->
      <div class="fp-content" @dragover.prevent="onDragOver" @dragenter="onDragEnter" @dragleave="onDragLeave" @drop.prevent="onDrop">
        <NSpin :show="loading" style="min-height:240px;">
          <!-- 列头 -->
          <div v-if="sortedEntries.length > 0" class="fp-list-header">
            <div class="fp-col-select" @click="toggleSelectAll">
              <NCheckbox
                size="small"
                :checked="sortedEntries.filter(e=>!e.is_dir&&isAcceptable(e)).length > 0 &&
                  sortedEntries.filter(e=>!e.is_dir&&isAcceptable(e)).every(e => selectedPaths.has(e.path))"
              />
            </div>
            <div class="fp-col-icon" />
            <div class="fp-col-name">名称</div>
            <div class="fp-col-size">大小</div>
            <div class="fp-col-date">修改日期</div>
          </div>
          <!-- 行 -->
          <div v-if="sortedEntries.length > 0" class="fp-list-body">
            <div
              v-for="entry in sortedEntries" :key="entry.path"
              class="fp-list-row"
              :class="{
                selected: selectedPaths.has(entry.path),
                disabled: !entry.is_dir && !isAcceptable(entry),
              }"
              @click="entry.is_dir ? enterDir(entry) : toggleSelect(entry)"
              @dblclick="entry.is_dir ? null : toggleSelect(entry)"
            >
              <div class="fp-col-select" @click.stop="toggleSelect(entry)">
                <NCheckbox
                  v-if="!entry.is_dir"
                  size="small"
                  :checked="selectedPaths.has(entry.path)"
                  :disabled="!isAcceptable(entry)"
                />
              </div>
              <div class="fp-col-icon">
                <component :is="fileIcon(entry.icon)" :size="17" :stroke-width="1.5" :style="{color:iconColor(entry.icon)}" />
              </div>
              <div class="fp-col-name">
                <span class="fp-entry-name">{{ entry.name }}</span>
              </div>
              <div class="fp-col-size">
                <span v-if="!entry.is_dir">{{ entry.size_display }}</span>
                <span v-else class="fp-dir-label">文件夹</span>
              </div>
              <div class="fp-col-date">{{ fmtDate(entry.modified) }}</div>
            </div>
          </div>
          <div v-if="!loading && sortedEntries.length === 0" class="fp-empty">
            <Upload :size="32" style="color:var(--text-muted);opacity:0.35;" />
            <NText depth="3" style="font-size:13px;">
              {{ searchQuery ? '未找到匹配的文件' : '此文件夹为空' }}
            </NText>
            <NText depth="3" style="font-size:11px;">拖拽文件到此处上传</NText>
          </div>
        </NSpin>
      </div>
    </div>

    <!-- ═══ 页脚 ═══ -->
    <template #footer>
      <div class="fp-footer">
        <div class="fp-footer-left">
          <NText depth="3" style="font-size:12px;">
            {{ selectedFiles.size > 0 ? `已选 ${selectedFiles.size} 项` : `${sortedEntries.length} 个项目` }}
          </NText>
          <span style="color:var(--hairline);font-size:12px;margin:0 4px;">|</span>
          <NText depth="3" style="font-size:11px;font-family:monospace;">
            {{ acceptAll.value ? '*' : accept.join(', ') }}
          </NText>
        </div>
        <div class="fp-footer-right">
          <NButton size="tiny" quaternary @click="cancel" round>取消</NButton>
          <NButton
            size="tiny" type="primary"
            :disabled="selectedFiles.size === 0"
            @click="confirm" round
          >
            确认选择{{ selectedFiles.size > 0 ? ` (${selectedFiles.size})` : '' }}
          </NButton>
        </div>
      </div>
    </template>

    <!-- 新建文件夹 Modal -->
    <n-modal v-model:show="showMkdirModal" preset="card" title="新建文件夹" style="width:360px;" :mask-closable="false">
      <n-form><n-form-item label="文件夹名称"><n-input v-model:value="mkdirName" placeholder="输入名称" @keyup.enter="createFolder" /></n-form-item></n-form>
      <template #footer><NSpace justify="end"><NButton quaternary @click="showMkdirModal = false">取消</NButton><NButton type="primary" @click="createFolder" :disabled="!mkdirName.trim()" round>创建</NButton></NSpace></template>
    </n-modal>

    <UploadPanel />
  </n-modal>
</template>

<style scoped>
/* ═══════════════════════════════════════════
   Windows 11 风格文件选择器
   ═══════════════════════════════════════════ */

/* ── Toolbar ── */
.fp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  background: var(--surface-1);
  border-bottom: 1px solid var(--hairline);
  min-height: 40px;
}
.fp-toolbar-left { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; }
.fp-toolbar-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.fp-toolbar-divider {
  width: 1px; height: 20px;
  background: var(--hairline);
  margin: 0 4px; flex-shrink: 0;
}

/* Breadcrumb */
.fp-breadcrumb {
  display: flex; align-items: center; gap: 2px;
  font-size: 12px; color: var(--text-primary);
  overflow: hidden; flex: 1; min-width: 0;
}
.fp-breadcrumb-sep { color: var(--text-muted); font-size: 11px; flex-shrink: 0; }
.fp-breadcrumb-item {
  padding: 2px 6px; border-radius: 3px; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
  transition: background .1s;
}
.fp-breadcrumb-item:hover { background: var(--surface-2); }
.fp-breadcrumb-item.active { font-weight: 600; }

/* Search */
.fp-search-box {
  position: relative; display: flex; align-items: center;
  width: 160px;
}
.fp-search-icon {
  position: absolute; left: 7px; top: 50%; transform: translateY(-50%);
  color: var(--text-muted); pointer-events: none;
}
.fp-search-input {
  width: 100%; height: 26px; padding: 0 8px 0 26px;
  border: 1px solid var(--hairline); border-radius: 4px;
  background: var(--surface-2); color: var(--text-primary);
  font-size: 12px; outline: none;
  transition: border-color .15s;
}
.fp-search-input:focus { border-color: var(--accent); }
.fp-search-input::placeholder { color: var(--text-muted); }

/* ═══ Body (sidebar + content) ═══ */
.fp-body {
  display: flex;
  min-height: 320px;
  max-height: 460px;
}

/* ── Sidebar ── */
.fp-sidebar {
  width: 160px; flex-shrink: 0;
  background: var(--surface-2);
  border-right: 1px solid var(--hairline);
  padding: 6px 0;
  overflow-y: auto;
}
.fp-sidebar-section-title {
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.05em;
  padding: 6px 12px 4px;
}
.fp-sidebar-item {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 12px; margin: 1px 6px;
  border-radius: 4px; cursor: pointer;
  font-size: 13px; color: var(--text-primary);
  transition: background .1s;
}
.fp-sidebar-item:hover { background: var(--surface-1); }
.fp-sidebar-item.active { background: var(--accent-glow); color: var(--accent-text); }

/* ── Content (file list) ── */
.fp-content {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
}

/* Column headers */
.fp-list-header {
  display: flex; align-items: center;
  gap: 4px; padding: 5px 8px;
  border-bottom: 1px solid var(--hairline);
  font-size: 11px; font-weight: 600;
  color: var(--text-muted);
  user-select: none; flex-shrink: 0;
}

/* File rows */
.fp-list-body {
  flex: 1; overflow-y: auto;
  min-height: 200px;
}
.fp-list-row {
  display: flex; align-items: center;
  gap: 4px; padding: 4px 8px;
  border-bottom: 1px solid var(--hairline);
  cursor: default; font-size: 13px;
  transition: background .08s;
}
.fp-list-row:hover { background: var(--surface-2); }
.fp-list-row.selected { background: rgba(94,106,210,0.08); }
.fp-list-row.disabled { opacity: 0.4; }

/* Columns */
.fp-col-select { width: 28px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.fp-col-icon { width: 26px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.fp-col-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-col-size { width: 72px; text-align: right; color: var(--text-muted); font-size: 12px; flex-shrink: 0; }
.fp-col-date { width: 100px; color: var(--text-muted); font-size: 12px; flex-shrink: 0; }

.fp-entry-name { cursor: pointer; }
.fp-dir-label { font-size: 11px; color: var(--text-muted); }

/* Drag overlay with smooth animation */
.fp-content {
  position: relative;
  transition: background 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.fp-content.fp-drag-over {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
  background: rgba(94,106,210,0.06);
}
.fp-content::after {
  content: '拖拽文件到此处上传';
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 600;
  color: var(--accent);
  background: rgba(94,106,210,0.04);
  backdrop-filter: blur(3px);
  border-radius: 6px;
  z-index: 5;
  opacity: 0;
  transition: opacity 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
              transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform: scale(0.96);
  pointer-events: none;
}
.fp-content.fp-drag-over::after {
  opacity: 1;
  transform: scale(1);
}

/* Empty state */
.fp-empty {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  min-height: 240px; gap: 6px; padding: 24px;
}

/* ── Footer ── */
.fp-footer {
  display: flex; align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.fp-footer-left { display: flex; align-items: center; gap: 8px; }
.fp-footer-right { display: flex; align-items: center; gap: 6px; }
</style>
