<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { api } from '@/api/client'
import { useMessage } from 'naive-ui'
import {
  NModal, NButton, NSpin, NEmpty, NText, NSpace, NCheckbox, NTag,
  NInput, NForm, NFormItem,
} from 'naive-ui'
import {
  Folder, File, FileText, FileImage, FileSpreadsheet, FileType, Archive,
  Image, Music, Video, ChevronRight, CheckSquare, Upload, Plus, Trash2,
  RefreshCw, X,
} from '@lucide/vue'
import { useUploadManager } from '@/composables/useUploadManager'
import UploadPanel from '@/components/chat/UploadPanel.vue'

interface DiskEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  size_display: string
  modified: string
  icon: string
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

// ── State ──────────────────────────────────────────────────────────────────

const loading = ref(false)
const currentPath = ref('')
const entries = ref<DiskEntry[]>([])
const selectedPaths = ref<Set<string>>(new Set())
const selectedFiles = ref<Map<string, DiskEntry>>(new Map())

// 新建文件夹
const showMkdirModal = ref(false)
const mkdirName = ref('')

// 文件上传
const fileInput = ref<HTMLInputElement | null>(null)
let dragCounter = 0

// ── Accept set ─────────────────────────────────────────────────────────────

const acceptAll = computed(() => props.accept.includes('*'))
const acceptExts = computed(() => new Set(props.accept.map(e => e.toLowerCase())))

function isAcceptable(entry: DiskEntry): boolean {
  if (entry.is_dir) return true
  if (acceptAll.value) return true
  const ext = '.' + entry.name.split('.').pop()?.toLowerCase()
  return acceptExts.value.has(ext)
}

// ── Breadcrumb ─────────────────────────────────────────────────────────────

const breadcrumbs = computed(() => {
  if (!currentPath.value) return [{ label: '根目录', path: '' }]
  const parts = currentPath.value.split('/')
  const items = [{ label: '根目录', path: '' }]
  let acc = ''
  for (const p of parts) {
    acc = acc ? `${acc}/${p}` : p
    items.push({ label: p, path: acc })
  }
  return items
})

// ── Load ───────────────────────────────────────────────────────────────────

async function loadDir(path: string = '') {
  loading.value = true
  currentPath.value = path
  try {
    const r = await api.get<{ entries: DiskEntry[] }>(`/storage/list?path=${encodeURIComponent(path)}`)
    entries.value = r.entries.filter(isAcceptable)
  } catch {
    entries.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.show, (val) => {
  if (val) {
    selectedPaths.value = new Set()
    selectedFiles.value = new Map()
    loadDir('')
  }
})

// ── Navigation ─────────────────────────────────────────────────────────────

function enterDir(entry: DiskEntry) {
  if (entry.is_dir) loadDir(entry.path)
}

function navigateTo(path: string) {
  if (path !== currentPath.value) loadDir(path)
}

// ── Selection ──────────────────────────────────────────────────────────────

function toggleSelect(entry: DiskEntry) {
  if (entry.is_dir) return
  const s = new Set(selectedPaths.value)
  const m = new Map(selectedFiles.value)
  if (s.has(entry.path)) {
    s.delete(entry.path)
    m.delete(entry.path)
  } else {
    if (!props.multiple) {
      s.clear()
      m.clear()
    }
    s.add(entry.path)
    m.set(entry.path, entry)
  }
  selectedPaths.value = s
  selectedFiles.value = m
}

function toggleSelectAll() {
  const files = entries.value.filter(e => !e.is_dir)
  const s = new Set(selectedPaths.value)
  const m = new Map(selectedFiles.value)
  if (files.every(f => s.has(f.path))) {
    for (const f of files) {
      s.delete(f.path)
      m.delete(f.path)
    }
  } else {
    for (const f of files) {
      s.add(f.path)
      m.set(f.path, f)
    }
  }
  selectedPaths.value = s
  selectedFiles.value = m
}

// ── Confirm ────────────────────────────────────────────────────────────────

function confirm() {
  const files = Array.from(selectedFiles.value.values()).map(e => ({
    name: e.name,
    path: e.path,
    size: e.size,
    size_display: e.size_display,
  }))
  emit('confirm', files)
}

function cancel() {
  emit('update:show', false)
}

// ── Upload ─────────────────────────────────────────────────────────────────

function handleFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    startUpload(file, currentPath.value)
  }
  input.value = ''
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

function onDragOver(e: DragEvent) { e.preventDefault() }
function onDragEnter(e: DragEvent) { e.preventDefault(); dragCounter++; if (dragCounter === 1) (e.currentTarget as HTMLElement)?.classList.add('drag-over') }
function onDragLeave(e: DragEvent) { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; (e.currentTarget as HTMLElement)?.classList.remove('drag-over') } }
async function onDrop(e: DragEvent) {
  e.preventDefault(); dragCounter = 0; (e.currentTarget as HTMLElement)?.classList.remove('drag-over')
  const items = e.dataTransfer?.items; if (!items?.length) return
  const fileList: { file: File; path: string }[] = []
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) {
      if (entry.isFile) {
        const f = item.getAsFile(); if (f) fileList.push({ file: f, path: currentPath.value })
      } else {
        await traverseFiles(entry, currentPath.value ? `${currentPath.value}/${entry.name}` : entry.name, fileList)
      }
    } else if (item.kind === 'file') { const f = item.getAsFile(); if (f) fileList.push({ file: f, path: currentPath.value }) }
  }
  if (fileList.length === 0 && e.dataTransfer?.files.length) {
    for (const f of Array.from(e.dataTransfer.files)) fileList.push({ file: f, path: currentPath.value })
  }
  for (const { file, path } of fileList) startUpload(file, path)
  if (fileList.length > 0) message.success(`已添加 ${fileList.length} 个文件到上传队列`)
}

// ── Create folder ──────────────────────────────────────────────────────────

async function createFolder() {
  if (!mkdirName.value.trim()) { message.warning('请输入文件夹名称'); return }
  try {
    await api.post('/storage/mkdir', { path: currentPath.value ? `${currentPath.value}/${mkdirName.value}` : mkdirName.value })
    message.success('文件夹已创建')
    showMkdirModal.value = false
    mkdirName.value = ''
    await loadDir(currentPath.value)
  } catch (e: any) { message.error(e.message || '创建失败') }
}

// ── Icon ───────────────────────────────────────────────────────────────────

function fileIconComponent(icon: string) {
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
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="选择文件"
    style="width: 600px"
    :mask-closable="false"
    @update:show="(val: boolean) => emit('update:show', val)"
  >
    <!-- 已选计数 + 操作栏 -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;flex-wrap:wrap;">
        <span v-if="selectedFiles.size > 0" style="display:flex;align-items:center;gap:4px;color:var(--accent);font-weight:500;">
          <CheckSquare :size="15" /> 已选 {{ selectedFiles.size }} 项
        </span>
        <span v-else style="color:var(--text-muted);">请选择文件</span>
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <NButton size="tiny" quaternary round @click="loadDir(currentPath)" title="刷新">
          <template #icon><RefreshCw :size="13" /></template>
        </NButton>
        <NButton size="tiny" secondary round @click="showMkdirModal = true">
          <template #icon><Plus :size="13" /></template>新建文件夹
        </NButton>
        <NButton size="tiny" secondary round @click="fileInput?.click()">
          <template #icon><Upload :size="13" /></template>上传
        </NButton>
        <input ref="fileInput" type="file" multiple style="display:none" @change="handleFileSelected" />
        <div v-if="!acceptAll && accept.length > 0" style="display:flex;gap:2px;flex-wrap:wrap;margin-left:4px;">
          <NTag v-for="ext in accept" :key="ext" size="tiny" :bordered="false" round style="font-size:10px;">{{ ext }}</NTag>
        </div>
      </div>
    </div>

    <!-- 地址栏 -->
    <div style="display:flex;align-items:center;gap:4px;margin-bottom:10px;font-size:13px;flex-wrap:wrap;">
      <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
        <span v-if="i > 0" style="color:var(--text-muted);font-size:12px;"><ChevronRight :size="13" /></span>
        <span
          @click="navigateTo(crumb.path)"
          style="cursor:pointer;padding:2px 6px;border-radius:4px;font-weight:500;"
          :style="{
            color: i === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--accent)',
            fontSize: '13px',
          }"
          @mouseenter="(e:any)=>e.currentTarget.style.background='var(--surface-2)'"
          @mouseleave="(e:any)=>e.currentTarget.style.background='transparent'"
        >{{ crumb.label }}</span>
      </template>
    </div>

    <!-- 文件列表（支持拖拽） -->
    <div
      style="border:1px solid var(--hairline);border-radius:6px;overflow:hidden;position:relative;min-height:180px;"
      @dragover="onDragOver" @dragenter="onDragEnter" @dragleave="onDragLeave" @drop="onDrop"
    >
      <n-spin :show="loading" style="min-height:180px;">
        <!-- 全选表头 -->
        <div
          v-if="entries.length > 0"
          style="display:flex;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--hairline);font-size:12px;color:var(--text-muted);cursor:pointer;user-select:none;"
          @click="toggleSelectAll"
        >
          <div style="width:28px;display:flex;align-items:center;justify-content:center;">
            <NCheckbox
              :checked="entries.filter(e=>!e.is_dir).length > 0 && entries.filter(e=>!e.is_dir).every(e => selectedPaths.has(e.path))"
            />
          </div>
          <div style="width:28px" />
          <div style="flex:1;min-width:0;">名称</div>
          <div style="width:70px;text-align:right;">大小</div>
        </div>

        <!-- 列表 -->
        <div v-if="entries.length > 0" style="max-height:240px;overflow-y:auto;">
          <div
            v-for="entry in entries" :key="entry.path"
            style="display:flex;align-items:center;gap:4px;padding:5px 8px;border-bottom:1px solid var(--hairline);cursor:default;font-size:13px;transition:background .1s;border-radius:2px;"
            :style="{ background: selectedPaths.has(entry.path) ? 'rgba(94,106,210,0.07)' : 'transparent' }"
            @mouseenter="(e:any)=>{if(!selectedPaths.has(entry.path))e.currentTarget.style.background='var(--surface-2)'}"
            @mouseleave="(e:any)=>{if(!selectedPaths.has(entry.path))e.currentTarget.style.background='transparent'}"
          >
            <div style="width:28px;display:flex;align-items:center;justify-content:center;" @click.stop="toggleSelect(entry)">
              <NCheckbox v-if="!entry.is_dir" :checked="selectedPaths.has(entry.path)" />
            </div>
            <div style="width:28px;display:flex;align-items:center;justify-content:center;" @click.stop="enterDir(entry)">
              <component :is="fileIconComponent(entry.icon)" :size="18" :stroke-width="1.5" :style="{color:iconColor(entry.icon)}" />
            </div>
            <div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" @click.stop="entry.is_dir ? enterDir(entry) : toggleSelect(entry)">
              <span style="cursor:pointer;font-weight:500;">{{ entry.name }}</span>
            </div>
            <div style="width:70px;text-align:right;color:var(--text-muted);font-size:12px;">
              <span v-if="!entry.is_dir">{{ entry.size_display }}</span>
              <span v-else style="font-size:11px;">文件夹</span>
            </div>
          </div>
        </div>

        <!-- 空状态（支持拖拽提示） -->
        <div v-if="!loading && entries.length === 0"
          style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:180px;gap:8px;padding:24px;"
        >
          <Upload :size="32" style="color:var(--text-muted);opacity:0.4;" />
          <NText depth="3" style="font-size:13px;">此文件夹为空</NText>
          <NText depth="3" style="font-size:11px;">拖拽文件到此处上传</NText>
        </div>
      </n-spin>

      <!-- 拖拽高亮遮罩 -->
      <div class="drop-overlay" style="display:none;">释放以上传文件</div>
    </div>

    <!-- 新建文件夹 Modal -->
    <n-modal v-model:show="showMkdirModal" preset="card" title="新建文件夹" style="width:360px;" :mask-closable="false">
      <n-form><n-form-item label="文件夹名称"><n-input v-model:value="mkdirName" placeholder="输入名称" @keyup.enter="createFolder" /></n-form-item></n-form>
      <template #footer><NSpace justify="end"><NButton quaternary @click="showMkdirModal = false">取消</NButton><NButton type="primary" @click="createFolder" :disabled="!mkdirName.trim()" round>创建</NButton></NSpace></template>
    </n-modal>

    <!-- Footer -->
    <template #footer>
      <div style="display:flex;align-items:center;gap:8px;">
        <NText depth="3" style="font-size:11px;flex:1;">拖拽文件到列表区域即可上传</NText>
        <NSpace justify="end">
          <NButton quaternary @click="cancel">取消</NButton>
          <NButton type="primary" @click="confirm" :disabled="selectedFiles.size === 0" round>
            确认选择{{ selectedFiles.size > 0 ? `（${selectedFiles.size}）` : '' }}
          </NButton>
        </NSpace>
      </div>
    </template>

    <UploadPanel />
  </n-modal>
</template>

<style scoped>
.drag-over .drop-overlay {
  display: flex !important;
  position: absolute;
  inset: 0;
  background: rgba(94, 106, 210, 0.06);
  backdrop-filter: blur(2px);
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: var(--accent);
  font-weight: 600;
  z-index: 10;
  border-radius: 6px;
  pointer-events: none;
}
</style>
