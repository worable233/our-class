<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/client'
import { useMessage, useDialog } from 'naive-ui'
import { useUploadManager } from '@/composables/useUploadManager'
import UploadPanel from '@/components/chat/UploadPanel.vue'
import {
  NCard, NButton, NProgress, NTag, NModal, NForm, NFormItem, NInput, NInputNumber,
  NSelect, NSpace, NSpin, NEmpty, NText, NIcon, NDivider, NButtonGroup,
  NEllipsis, NPopconfirm, NUpload, NUploadDragger,
} from 'naive-ui'
import {
  Folder, File, FileText, FileImage, FileSpreadsheet, FileType, Archive,
  Image, Music, Video, ChevronRight, Upload, Plus, Trash2, Download, Edit3,
  HardDrive, Settings, RefreshCw, ExternalLink,
} from '@lucide/vue'

const message = useMessage()
const dialog = useDialog()
const { startUpload } = useUploadManager()

// ── State ────────────────────────────────────────────────────────────
interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  size_display: string
  modified: string
  icon: string
}

interface StorageInfo {
  storage_limit: number
  storage_used: number
  used_percent: number
  used_display: string
  limit_display: string
}

const storageInfo = ref<StorageInfo | null>(null)
const currentPath = ref('')
const parentPath = ref<string | null>(null)
const entries = ref<FileEntry[]>([])
const loading = ref(false)
const selectedFile = ref<FileEntry | null>(null)
const contextMenu = ref<string | null>(null)

// 创建文件夹
const showMkdirModal = ref(false)
const mkdirName = ref('')

// 重命名
const showRenameModal = ref(false)
const renameTarget = ref<FileEntry | null>(null)
const renameValue = ref('')

// 配额管理
const showQuotaModal = ref(false)
const quotaGroups = ref<any[]>([])
const quotaForm = ref({ group_id: null as number | null, storage_limit: 104857600 })

// ── Breadcrumb ───────────────────────────────────────────────────────
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

// ── Load ─────────────────────────────────────────────────────────────
async function loadInfo() {
  try { storageInfo.value = await api.get<StorageInfo>('/storage/info') } catch {}
}

async function loadList(path: string = '') {
  loading.value = true
  currentPath.value = path
  selectedFile.value = null
  try {
    const res = await api.get<{ path: string; parent: string | null; entries: FileEntry[] }>(`/storage/list?path=${encodeURIComponent(path)}`)
    parentPath.value = res.parent
    entries.value = res.entries
  } catch (e: any) {
    message.error(e.message || '加载失败')
    entries.value = []
  } finally { loading.value = false }
}

async function refresh() {
  await Promise.all([loadInfo(), loadList(currentPath.value)])
}

onMounted(refresh)

// ── Navigation ───────────────────────────────────────────────────────
function enterDir(entry: FileEntry) {
  if (!entry.is_dir) return
  loadList(entry.path)
}

function navigateTo(path: string) {
  if (path === currentPath.value) return
  loadList(path)
}

// ── Create folder ────────────────────────────────────────────────────
async function createFolder() {
  if (!mkdirName.value.trim()) return
  try {
    await api.post('/storage/mkdir', { path: currentPath.value ? `${currentPath.value}/${mkdirName.value}` : mkdirName.value })
    message.success('文件夹已创建')
    showMkdirModal.value = false
    mkdirName.value = ''
    await loadList(currentPath.value)
    await loadInfo()
  } catch (e: any) { message.error(e.message || '创建失败') }
}

// ── Upload ────────────────────────────────────────────────────────────

function triggerUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.webkitdirectory = false
  input.onchange = () => {
    for (const file of Array.from(input.files || [])) startUpload(file, currentPath.value)
  }
  input.click()
}

/** 递归遍历拖拽的目录 */
function traverseFiles(entry: any, path: string, files: { file: File; path: string }[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((f: File) => {
        files.push({ file: f, path })
        resolve()
      })
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader()
      const readAll = () => {
        dirReader.readEntries(async (entries: any[]) => {
          if (entries.length === 0) { resolve(); return }
          for (const e of entries) await traverseFiles(e, path ? `${path}/${e.name}` : e.name, files)
          readAll() // 处理更多（目录可能分批返回）
        })
      }
      readAll()
    } else resolve()
  })
}

let dragCounter = 0

function onDragOver(e: DragEvent) {
  e.preventDefault()
}
function onDragEnter(e: DragEvent) {
  e.preventDefault()
  dragCounter++
  if (dragCounter === 1) (e.currentTarget as HTMLElement)?.classList.add('drag-over')
}
function onDragLeave(e: DragEvent) {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) { dragCounter = 0; (e.currentTarget as HTMLElement)?.classList.remove('drag-over') }
}
async function onDrop(e: DragEvent) {
  e.preventDefault()
  dragCounter = 0
  ;(e.currentTarget as HTMLElement)?.classList.remove('drag-over')
  const items = e.dataTransfer?.items
  if (!items?.length) return

  const fileList: { file: File; path: string }[] = []
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) {
      await traverseFiles(entry, currentPath.value ? `${currentPath.value}/${entry.name}` : entry.name, fileList)
    } else if (item.kind === 'file') {
      const f = item.getAsFile()
      if (f) fileList.push({ file: f, path: currentPath.value })
    }
  }
  for (const { file, path } of fileList) startUpload(file, path)
  message.success(`已添加 ${fileList.length} 个文件到上传队列`)
}

// ── Rename ────────────────────────────────────────────────────────────
function openRename(entry: FileEntry) {
  renameTarget.value = entry
  renameValue.value = entry.name
  showRenameModal.value = true
}

async function confirmRename() {
  if (!renameTarget.value || !renameValue.value.trim()) return
  try {
    await api.put('/storage/rename', { path: renameTarget.value.path, new_name: renameValue.value.trim() })
    message.success('已重命名')
    showRenameModal.value = false
    renameTarget.value = null
    await loadList(currentPath.value)
  } catch (e: any) { message.error(e.message || '重命名失败') }
}

// ── Delete ────────────────────────────────────────────────────────────
function confirmDelete(entry: FileEntry) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除「${entry.name}」${entry.is_dir ? '及其所有内容' : ''}？此操作不可撤销。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.delete(`/storage/delete?path=${encodeURIComponent(entry.path)}`)
        message.success('已删除')
        await loadList(currentPath.value)
        await loadInfo()
      } catch (e: any) { message.error(e.message || '删除失败') }
    },
  })
}

// ── Download ──────────────────────────────────────────────────────────
function downloadFile(entry: FileEntry) {
  if (entry.is_dir) {
    message.warning('暂不支持直接下载文件夹')
    return
  }
  const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
  const a = document.createElement('a')
  a.href = `/api/storage/download?path=${encodeURIComponent(entry.path)}&token=${token}`
  a.download = entry.name
  a.click()
}

// ── Icon mapping ──────────────────────────────────────────────────────
function fileIconComponent(icon: string) {
  const map: Record<string, any> = {
    folder: Folder,
    image: Image, video: Video, audio: Music,
    pdf: FileType, doc: FileText, excel: FileSpreadsheet, ppt: File,
    archive: Archive, text: FileText, code: File,
  }
  return map[icon] || File
}

// ── Quota management ─────────────────────────────────────────────────
async function loadQuotaGroups() {
  try { quotaGroups.value = await api.get<any[]>('/storage/groups') } catch {}
}

async function openQuota() {
  await loadQuotaGroups()
  quotaForm.value = { group_id: null, storage_limit: 104857600 }
  showQuotaModal.value = true
}

async function saveQuota() {
  if (!quotaForm.value.group_id) { message.warning('请选择权限组'); return }
  try {
    await api.put(`/storage/groups/${quotaForm.value.group_id}`, { storage_limit: quotaForm.value.storage_limit })
    message.success('配额已更新')
    await loadQuotaGroups()
    await loadInfo()
  } catch (e: any) { message.error(e.message || '保存失败') }
}

// ── Date formatting ──────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function fmtPercent(pct: number): 'default' | 'success' | 'warning' | 'error' {
  if (pct > 90) return 'error'
  if (pct > 70) return 'warning'
  if (pct > 30) return 'default'
  return 'success'
}
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:16px;">
    <!-- ═══ 页面标题 ═══ -->
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <NText tag="h1" depth="1" style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;">网盘空间</NText>
        <NText depth="3" style="margin-top:4px;display:block;font-size:13px;">个人文件存储与管理</NText>
      </div>
      <NButton quaternary size="small" @click="openQuota" round>
        <template #icon><Settings :size="15" /></template>
        配额设置
      </NButton>
    </div>

    <!-- ═══ 存储容量指示 ═══ -->
    <n-card :bordered="true" size="small" style="padding:4px 0;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <HardDrive :size="18" style="color:var(--accent);" />
          <span style="font-size:13px;font-weight:500;color:var(--text-primary);">存储空间</span>
        </div>
        <NProgress
          v-if="storageInfo"
          :value="storageInfo.used_percent"
          :indicator-placement="'inside'"
          :height="20"
          :border-radius="6"
          :type="fmtPercent(storageInfo.used_percent)"
          style="flex:1;min-width:100px;"
        />
        <span v-if="storageInfo" style="font-size:12px;color:var(--text-muted);white-space:nowrap;flex-shrink:0;">
          {{ storageInfo.used_display }} / {{ storageInfo.limit_display }}
        </span>
      </div>
    </n-card>

    <!-- ═══ 工具栏 ═══ -->
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <!-- Breadcrumb -->
      <div style="display:flex;align-items:center;gap:4px;flex:1;min-width:0;flex-wrap:wrap;">
        <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
          <span
            v-if="i > 0" style="color:var(--text-muted);font-size:12px;flex-shrink:0;"
          ><ChevronRight :size="14" /></span>
          <span
            @click="navigateTo(crumb.path)"
            :style="{
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
              color: i === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--accent)',
              padding: '2px 6px',
              borderRadius: '4px',
            }"
            class="crumb-link"
          >{{ crumb.label }}</span>
        </template>
      </div>

      <!-- Actions -->
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <NButton size="tiny" quaternary @click="refresh" round>
          <template #icon><RefreshCw :size="14" /></template>
        </NButton>
        <NButton size="tiny" @click="showMkdirModal = true" secondary round>
          <template #icon><Plus :size="14" /></template>
          新建文件夹
        </NButton>
        <NButton size="tiny" type="primary" @click="triggerUpload" round>
          <template #icon><Upload :size="14" /></template>
          上传文件
        </NButton>
      </div>
    </div>

    <!-- ═══ 文件列表 ═══ -->
    <n-card :bordered="true" size="small" style="flex:1;min-height:300px;"
      @dragover="onDragOver" @dragenter="onDragEnter" @dragleave="onDragLeave" @drop="onDrop"
    >
      <n-spin :show="loading" style="min-height:200px;">
        <template v-if="entries.length > 0">
            <div v-for="entry in entries" :key="entry.path"
              class="file-item"
              :class="{ selected: selectedFile?.path === entry.path }"
              @click="selectedFile = entry"
              @dblclick="enterDir(entry)"
            >
              <div class="file-icon">
                <component :is="fileIconComponent(entry.icon)" :size="28" :stroke-width="1.5" />
              </div>
              <NEllipsis class="file-name" :class="{ 'dir-name': entry.is_dir }" :line-clamp="1">
                {{ entry.name }}
              </NEllipsis>
              <span v-if="!entry.is_dir" class="file-size">{{ entry.size_display }}</span>
              <span class="file-modified">{{ fmtDate(entry.modified) }}</span>
              <!-- Actions -->
              <div v-if="selectedFile?.path === entry.path" class="file-actions" @click.stop>
                <NButton size="tiny" quaternary @click="openRename(entry)" round>
                  <template #icon><Edit3 :size="13" /></template>
                </NButton>
                <NButton v-if="!entry.is_dir" size="tiny" quaternary @click="downloadFile(entry)" round>
                  <template #icon><Download :size="13" /></template>
                </NButton>
                <NButton size="tiny" quaternary type="error" @click="confirmDelete(entry)" round>
                  <template #icon><Trash2 :size="13" /></template>
                </NButton>
              </div>
            </div>
          </div>
        </template>
        <NEmpty v-else-if="!loading" description="此文件夹为空" />
      </n-spin>
    </n-card>

    <!-- ═══ 创建文件夹 Modal ═══ -->
    <n-modal v-model:show="showMkdirModal" preset="card" title="新建文件夹" style="width:380px;" :mask-closable="false">
      <n-form>
        <n-form-item label="文件夹名称">
          <n-input v-model:value="mkdirName" placeholder="输入文件夹名称" @keyup.enter="createFolder" />
        </n-form-item>
      </n-form>
      <template #footer>
        <NSpace justify="end">
          <NButton quaternary @click="showMkdirModal = false">取消</NButton>
          <NButton type="primary" @click="createFolder" :disabled="!mkdirName.trim()" round>创建</NButton>
        </NSpace>
      </template>
    </n-modal>

    <!-- ═══ 重命名 Modal ═══ -->
    <n-modal v-model:show="showRenameModal" preset="card" title="重命名" style="width:380px;" :mask-closable="false">
      <n-form>
        <n-form-item label="新名称">
          <n-input v-model:value="renameValue" placeholder="输入新名称" @keyup.enter="confirmRename" />
        </n-form-item>
      </n-form>
      <template #footer>
        <NSpace justify="end">
          <NButton quaternary @click="showRenameModal = false">取消</NButton>
          <NButton type="primary" @click="confirmRename" :disabled="!renameValue.trim()" round>确定</NButton>
        </NSpace>
      </template>
    </n-modal>

    <!-- ═══ 配额设置 Modal ═══ -->
    <n-modal v-model:show="showQuotaModal" preset="card" title="存储配额设置" style="width:480px;" :mask-closable="false">
      <NText depth="3" style="font-size:13px;display:block;margin-bottom:16px;">
        设置各权限组的默认存储空间上限。仅父权限组可配置，子权限组继承父组的配额。
      </NText>

      <!-- 已有配额列表 -->
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
        <div v-for="g in quotaGroups" :key="g.id"
          style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:6px;background:var(--surface-2);font-size:13px;"
        >
          <span style="flex:1;font-weight:500;color:var(--text-primary);">{{ g.name }}</span>
          <NTag v-if="g.group_type && g.group_type !== 'custom'" size="tiny" :bordered="false" round>
            {{ g.group_type === 'teacher' ? '教师端' : '学生端' }}
          </NTag>
          <span style="color:var(--text-muted);font-size:12px;min-width:60px;text-align:right;">
            {{ (g.storage_limit / 1048576).toFixed(0) }} MB
          </span>
          <span style="color:var(--text-muted);font-size:12px;">· {{ g.user_count }} 人</span>
        </div>
      </div>

      <NDivider />
      <NText style="font-size:14px;font-weight:600;display:block;margin-bottom:12px;">修改配额</NText>
      <n-form>
        <n-form-item label="权限组">
          <n-select v-model:value="quotaForm.group_id" :options="quotaGroups.map(g => ({ label: g.name, value: g.id }))" placeholder="选择权限组" />
        </n-form-item>
        <n-form-item label="存储上限 (MB)">
          <n-input-number v-model:value="quotaForm.storage_limit" :min="1" :max="1073741824" :step="1048576" style="width:100%;" />
        </n-form-item>
      </n-form>
      <template #footer>
        <NSpace justify="end">
          <NButton quaternary @click="showQuotaModal = false">关闭</NButton>
          <NButton type="primary" @click="saveQuota" :disabled="!quotaForm.group_id" round>保存</NButton>
        </NSpace>
      </template>
    </n-modal>

    <!-- ═══ 上传浮动面板 ═══ -->
    <UploadPanel />
  </div>
</template>

<style scoped>
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px;
}
.file-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all .15s ease;
  border: 1px solid transparent;
  position: relative;
  background: var(--surface-1);
}
.file-item:hover {
  background: var(--surface-2);
  border-color: var(--hairline);
}
.file-item.selected {
  background: rgba(94, 106, 210, 0.08);
  border-color: rgba(94, 106, 210, 0.25);
}
.file-icon {
  color: var(--text-muted);
  margin-bottom: 2px;
}
.file-item.selected .file-icon {
  color: var(--accent);
}
.file-name {
  font-size: 12px;
  text-align: center;
  max-width: 100%;
  color: var(--text-primary);
  line-height: 1.3;
}
.dir-name {
  font-weight: 500;
}
.file-size, .file-modified {
  font-size: 10px;
  color: var(--text-muted);
}
.file-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 2px;
  background: var(--surface-2);
  border-radius: 6px;
  padding: 2px;
  border: 1px solid var(--hairline);
}
.crumb-link:hover {
  background: var(--surface-2);
}
.file-grid.drag-over {
  background: rgba(94,106,210,0.05);
  border-color: var(--accent);
}
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
