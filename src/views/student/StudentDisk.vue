<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/client'
import { useMessage, useDialog } from 'naive-ui'
import { useUploadManager } from '@/composables/useUploadManager'
import UploadPanel from '@/components/chat/UploadPanel.vue'
import {
  NCard, NButton, NModal, NForm, NFormItem, NInput,
  NSpace, NSpin, NEmpty, NText, NEllipsis,
} from 'naive-ui'
import {
  Folder, File, FileText, FileImage, FileSpreadsheet, FileType, Archive,
  Image, Music, Video, ChevronRight, Upload, Plus, Trash2, Download, Edit3,
  HardDrive, RefreshCw,
} from '@lucide/vue'

const message = useMessage()
const dialog = useDialog()
const { startUpload } = useUploadManager()

interface FileEntry {
  name: string; path: string; is_dir: boolean; size: number
  size_display: string; modified: string; icon: string
}
interface StorageInfo {
  storage_limit: number; storage_used: number; used_percent: number
  used_display: string; limit_display: string
}

const storageInfo = ref<StorageInfo | null>(null)
const currentPath = ref('')
const entries = ref<FileEntry[]>([])
const loading = ref(false)
const selectedFile = ref<FileEntry | null>(null)
const showMkdirModal = ref(false)
const mkdirName = ref('')
const showRenameModal = ref(false)
const renameTarget = ref<FileEntry | null>(null)
const renameValue = ref('')
const breadcrumbs = computed(() => {
  if (!currentPath.value) return [{ label: '根目录', path: '' }]
  const parts = currentPath.value.split('/')
  const items = [{ label: '根目录', path: '' }]
  let acc = ''
  for (const p of parts) { acc = acc ? `${acc}/${p}` : p; items.push({ label: p, path: acc }) }
  return items
})

async function loadInfo() {
  try { storageInfo.value = await api.get<StorageInfo>('/storage/info') } catch {}
}
async function loadList(path: string = '') {
  loading.value = true; currentPath.value = path; selectedFile.value = null
  try {
    const res = await api.get<{ entries: FileEntry[] }>(`/storage/list?path=${encodeURIComponent(path)}`)
    entries.value = res.entries
  } catch { entries.value = [] } finally { loading.value = false }
}
async function refresh() { await Promise.all([loadInfo(), loadList(currentPath.value)]) }
onMounted(refresh)

function enterDir(entry: FileEntry) { if (entry.is_dir) loadList(entry.path) }
function navigateTo(path: string) { if (path !== currentPath.value) loadList(path) }

async function createFolder() {
  if (!mkdirName.value.trim()) { message.warning('请输入文件夹名称'); return }
  try {
    await api.post('/storage/mkdir', { path: currentPath.value ? `${currentPath.value}/${mkdirName.value}` : mkdirName.value })
    message.success('文件夹已创建'); showMkdirModal.value = false; mkdirName.value = ''
    await loadList(currentPath.value); await loadInfo()
  } catch (e: any) { message.error(e.message || '创建失败') }
}

function triggerUpload() {
  const input = document.createElement('input')
  input.type = 'file'; input.multiple = true
  input.onchange = () => { for (const file of Array.from(input.files || [])) startUpload(file, currentPath.value) }
  input.click()
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

let dragCounter = 0
function onDragOver(e: DragEvent) { e.preventDefault() }
function onDragEnter(e: DragEvent) { e.preventDefault(); dragCounter++; if (dragCounter === 1) (e.currentTarget as HTMLElement)?.classList.add('drag-over') }
function onDragLeave(e: DragEvent) { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; (e.currentTarget as HTMLElement)?.classList.remove('drag-over') } }
async function onDrop(e: DragEvent) {
  e.preventDefault(); dragCounter = 0; (e.currentTarget as HTMLElement)?.classList.remove('drag-over')
  const items = e.dataTransfer?.items
  if (!items?.length) return
  const fileList: { file: File; path: string }[] = []
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) await traverseFiles(entry, currentPath.value ? `${currentPath.value}/${entry.name}` : entry.name, fileList)
    else if (item.kind === 'file') { const f = item.getAsFile(); if (f) fileList.push({ file: f, path: currentPath.value }) }
  }
  for (const { file, path } of fileList) startUpload(file, path)
  message.success(`已添加 ${fileList.length} 个文件到上传队列`)
}

function openRename(entry: FileEntry) { renameTarget.value = entry; renameValue.value = entry.name; showRenameModal.value = true }
async function confirmRename() {
  if (!renameTarget.value || !renameValue.value.trim()) return
  try {
    await api.put('/storage/rename', { path: renameTarget.value.path, new_name: renameValue.value.trim() })
    message.success('已重命名'); showRenameModal.value = false; renameTarget.value = null
    await loadList(currentPath.value)
  } catch (e: any) { message.error(e.message || '重命名失败') }
}

function confirmDelete(entry: FileEntry) {
  dialog.warning({
    title: '确认删除', content: `确定删除「${entry.name}」${entry.is_dir ? '及其所有内容' : ''}？此操作不可撤销。`,
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try { await api.delete(`/storage/delete?path=${encodeURIComponent(entry.path)}`); message.success('已删除'); await loadList(currentPath.value); await loadInfo() }
      catch (e: any) { message.error(e.message || '删除失败') }
    },
  })
}

function downloadFile(entry: FileEntry) {
  if (entry.is_dir) { message.warning('暂不支持直接下载文件夹'); return }
  const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
  const a = document.createElement('a')
  a.href = `/api/storage/download?path=${encodeURIComponent(entry.path)}&token=${token}`; a.download = entry.name; a.click()
}

function fileIconComponent(icon: string) {
  const map: Record<string, any> = { folder: Folder, image: Image, video: Video, audio: Music, pdf: FileType, doc: FileText, excel: FileSpreadsheet, ppt: File, archive: Archive, text: FileText, code: File }
  return map[icon] || File
}

function fmtDate(iso: string) { const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}` }
function fmtPercent(pct: number): 'default' | 'success' | 'warning' | 'error' {
  if (pct > 90) return 'error'; if (pct > 70) return 'warning'; if (pct > 30) return 'default'; return 'success'
}
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:16px;">
    <div>
      <NText tag="h1" depth="1" style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;">我的网盘</NText>
      <NText depth="3" style="margin-top:4px;display:block;font-size:13px;">个人文件存储与管理</NText>
    </div>

    <n-card :bordered="true" size="small" style="padding:4px 0;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;"><HardDrive :size="18" style="color:var(--accent);" /><span style="font-size:13px;font-weight:500;color:var(--text-primary);">存储空间</span></div>
        <NProgress v-if="storageInfo" :value="storageInfo.used_percent" :indicator-placement="'inside'" :height="20" :border-radius="6" :type="fmtPercent(storageInfo.used_percent)" style="flex:1;min-width:100px;" />
        <span v-if="storageInfo" style="font-size:12px;color:var(--text-muted);white-space:nowrap;flex-shrink:0;">{{ storageInfo.used_display }} / {{ storageInfo.limit_display }}</span>
      </div>
    </n-card>

    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:4px;flex:1;min-width:0;flex-wrap:wrap;">
        <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
          <span v-if="i > 0" style="color:var(--text-muted);font-size:12px;flex-shrink:0;"><ChevronRight :size="14" /></span>
          <span @click="navigateTo(crumb.path)" :style="{fontSize:'13px',cursor:'pointer',fontWeight:i===breadcrumbs.length-1?600:400,color:i===breadcrumbs.length-1?'var(--text-primary)':'var(--accent)',padding:'2px 6px',borderRadius:'4px'}" class="crumb-link">{{ crumb.label }}</span>
        </template>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <NButton size="tiny" quaternary @click="refresh" round><template #icon><RefreshCw :size="14" /></template></NButton>
        <NButton size="tiny" @click="showMkdirModal = true" secondary round><template #icon><Plus :size="14" /></template>新建文件夹</NButton>
        <NButton size="tiny" type="primary" @click="triggerUpload" round><template #icon><Upload :size="14" /></template>上传文件</NButton>
      </div>
    </div>

    <n-card :bordered="true" size="small" style="flex:1;min-height:300px;" @dragover="onDragOver" @dragenter="onDragEnter" @dragleave="onDragLeave" @drop="onDrop">
      <n-spin :show="loading" style="min-height:200px;">
        <template v-if="entries.length > 0">
          <div class="file-grid">
            <div v-for="entry in entries" :key="entry.path"
              class="file-item" :class="{ selected: selectedFile?.path === entry.path }"
              @click="selectedFile = entry"
              @dblclick="enterDir(entry)"
            >
              <div class="file-icon"><component :is="fileIconComponent(entry.icon)" :size="28" :stroke-width="1.5" /></div>
              <NEllipsis class="file-name" :class="{ 'dir-name': entry.is_dir }" :line-clamp="1">{{ entry.name }}</NEllipsis>
              <span v-if="!entry.is_dir" class="file-size">{{ entry.size_display }}</span>
              <span class="file-modified">{{ fmtDate(entry.modified) }}</span>
              <div v-if="selectedFile?.path === entry.path" class="file-actions" @click.stop>
                <NButton size="tiny" quaternary @click="openRename(entry)" round><template #icon><Edit3 :size="13" /></template></NButton>
                <NButton v-if="!entry.is_dir" size="tiny" quaternary @click="downloadFile(entry)" round><template #icon><Download :size="13" /></template></NButton>
                <NButton size="tiny" quaternary type="error" @click="confirmDelete(entry)" round><template #icon><Trash2 :size="13" /></template></NButton>
              </div>
            </div>
          </div>
        </template>
        <NEmpty v-else-if="!loading" description="此文件夹为空" />
      </n-spin>
    </n-card>

    <n-modal v-model:show="showMkdirModal" preset="card" title="新建文件夹" style="width:380px;" :mask-closable="false">
      <n-form><n-form-item label="文件夹名称"><n-input v-model:value="mkdirName" placeholder="输入名称" @keyup.enter="createFolder" /></n-form-item></n-form>
      <template #footer><NSpace justify="end"><NButton quaternary @click="showMkdirModal = false">取消</NButton><NButton type="primary" @click="createFolder" :disabled="!mkdirName.trim()" round>创建</NButton></NSpace></template>
    </n-modal>

    <n-modal v-model:show="showRenameModal" preset="card" title="重命名" style="width:380px;" :mask-closable="false">
      <n-form><n-form-item label="新名称"><n-input v-model:value="renameValue" placeholder="输入新名称" @keyup.enter="confirmRename" /></n-form-item></n-form>
      <template #footer><NSpace justify="end"><NButton quaternary @click="showRenameModal = false">取消</NButton><NButton type="primary" @click="confirmRename" :disabled="!renameValue.trim()" round>确定</NButton></NSpace></template>
    </n-modal>

    <UploadPanel />
  </div>
</template>

<style scoped>
.file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; }
.file-item { display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px 10px;border-radius:8px;cursor:pointer;transition:all .15s ease;border:1px solid transparent;position:relative;background:var(--surface-1);}
.file-item:hover { background:var(--surface-2);border-color:var(--hairline);}
.file-item.selected { background:rgba(94,106,210,0.08);border-color:rgba(94,106,210,0.25);}
.file-icon { color:var(--text-muted);margin-bottom:2px;}
.file-item.selected .file-icon { color:var(--accent);}
.file-name { font-size:12px;text-align:center;max-width:100%;color:var(--text-primary);line-height:1.3;}
.dir-name { font-weight:500;}
.file-size, .file-modified { font-size:10px;color:var(--text-muted);}
.file-actions { position:absolute;top:4px;right:4px;display:flex;gap:2px;background:var(--surface-2);border-radius:6px;padding:2px;border:1px solid var(--hairline);}
.crumb-link:hover { background:var(--surface-2);}
.n-card.drag-over { background:rgba(94,106,210,0.05);}
.fade-enter-active, .fade-leave-active { transition:opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity:0; }
</style>
