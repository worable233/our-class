<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/client'
import { useMessage, useDialog } from 'naive-ui'
import {
  NCard, NButton, NProgress, NModal, NForm, NFormItem, NInput, NInputNumber,
  NSpace, NSpin, NEmpty, NText, NCheckbox, NTag,
  NRadioGroup, NRadioButton,
} from 'naive-ui'
import { useUploadManager } from '@/composables/useUploadManager'
import UploadPanel from '@/components/chat/UploadPanel.vue'
import {
  Folder, File, FileText, FileImage, FileSpreadsheet, FileType, Archive,
  Image, Music, Video, ChevronRight, Upload, Plus, Trash2, Download, Edit3,
  HardDrive, RefreshCw, MoveRight, CheckSquare, Replace,
} from '@lucide/vue'

const message = useMessage()
const dialog = useDialog()
const { startUpload, onUploadDone } = useUploadManager()
onUploadDone(() => { loadList(currentPath.value); loadInfo() })

interface FileEntry { name: string; path: string; is_dir: boolean; size: number; size_display: string; modified: string; icon: string }
interface StorageInfo { storage_limit: number; storage_used: number; used_percent: number; used_display: string; limit_display: string }

const storageInfo = ref<StorageInfo | null>(null)
const currentPath = ref('')
const entries = ref<FileEntry[]>([])
const loading = ref(false)
const selectedFile = ref<FileEntry | null>(null)
const selectedPaths = ref<Set<string>>(new Set())
const showMkdirModal = ref(false); const mkdirName = ref('')
const showRenameModal = ref(false); const renameTarget = ref<FileEntry | null>(null); const renameValue = ref('')
const showMoveModal = ref(false); const moveTargets = ref<string[]>([]); const moveDir = ref(''); const moveDirs = ref<string[]>([])
const showBatchRenameModal = ref(false)
const batchRenameMode = ref<'replace' | 'prefix' | 'suffix' | 'number'>('replace')
const batchRenameFind = ref(''); const batchRenameReplace = ref('')
const batchRenameText = ref(''); const batchRenamePattern = ref('_{n}'); const batchRenameStart = ref(1)

async function openBatchRename() {
  const p = Array.from(selectedPaths.value); if (!p.length) { message.warning('请选择文件'); return }
  batchRenameMode.value = 'replace'; batchRenameFind.value = ''; batchRenameReplace.value = ''
  batchRenameText.value = ''; batchRenamePattern.value = '_{n}'; batchRenameStart.value = 1
  showBatchRenameModal.value = true
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
  if (!paths.length) { message.warning('请选择文件'); return }
  try {
    const body: any = { paths, mode: batchRenameMode.value }
    switch (batchRenameMode.value) {
      case 'replace': body.find = batchRenameFind.value; body.replace = batchRenameReplace.value; if (!batchRenameFind.value) { message.warning('请输入查找内容'); return }; break
      case 'prefix': case 'suffix': body.text = batchRenameText.value; if (!batchRenameText.value) { message.warning('请输入文本内容'); return }; break
      case 'number': body.pattern = batchRenamePattern.value; body.start = batchRenameStart.value; if (!batchRenamePattern.value.includes('{n}')) { message.warning('序号模式需要包含 {n} 占位符'); return }; break
    }
    const r = await api.post<{ renamed: number }>('/storage/batch-rename', body)
    message.success(`已重命名 ${r.renamed} 个项目`); showBatchRenameModal.value = false
    selectedPaths.value = new Set(); await loadList(currentPath.value)
  } catch (e: any) { message.error(e.message || '批量重命名失败') }
}

const breadcrumbs = computed(() => {
  if (!currentPath.value) return [{ label: '根目录', path: '' }]
  const parts = currentPath.value.split('/')
  const items = [{ label: '根目录', path: '' }]; let acc = ''
  for (const p of parts) { acc = acc ? `${acc}/${p}` : p; items.push({ label: p, path: acc }) }
  return items
})

async function loadInfo() { try { storageInfo.value = await api.get<StorageInfo>('/storage/info') } catch {} }
async function loadList(path: string = '') {
  loading.value = true; currentPath.value = path; selectedFile.value = null; selectedPaths.value = new Set()
  try { const r = await api.get<{ entries: FileEntry[] }>(`/storage/list?path=${encodeURIComponent(path)}`); entries.value = r.entries }
  catch { entries.value = [] } finally { loading.value = false }
}
async function refresh() { await Promise.all([loadInfo(), loadList(currentPath.value)]) }
onMounted(refresh)
function enterDir(entry: FileEntry) { if (entry.is_dir) loadList(entry.path) }
function navigateTo(path: string) { if (path !== currentPath.value) loadList(path) }
function toggleSelect(path: string) { const s = new Set(selectedPaths.value); if (s.has(path)) s.delete(path); else s.add(path); selectedPaths.value = s }
function toggleSelectAll() { if (selectedPaths.value.size === entries.value.length) selectedPaths.value = new Set(); else selectedPaths.value = new Set(entries.value.map(e => e.path)) }

async function createFolder() {
  if (!mkdirName.value.trim()) { message.warning('请输入文件夹名称'); return }
  try { await api.post('/storage/mkdir', { path: currentPath.value ? `${currentPath.value}/${mkdirName.value}` : mkdirName.value }); message.success('文件夹已创建'); showMkdirModal.value = false; mkdirName.value = ''; await loadList(currentPath.value); await loadInfo() }
  catch (e: any) { message.error(e.message || '创建失败') }
}

function triggerUpload() {
  const input = document.createElement('input'); input.type = 'file'; input.multiple = true
  input.onchange = () => { for (const file of Array.from(input.files || [])) startUpload(file, currentPath.value) }; input.click()
}
function traverseFiles(entry: any, path: string, files: { file: File; path: string }[]): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) { entry.file((f: File) => { files.push({ file: f, path }); resolve() }) }
    else if (entry.isDirectory) { const r = entry.createReader(); const readAll = () => { r.readEntries(async (es: any[]) => { if (es.length === 0) { resolve(); return }; for (const e of es) await traverseFiles(e, path ? `${path}/${e.name}` : e.name, files); readAll() }) }; readAll() }
    else resolve()
  })
}
let dragCounter = 0
function onDragOver(e: DragEvent) { e.preventDefault() }
function onDragEnter(e: DragEvent) { e.preventDefault(); dragCounter++; if (dragCounter === 1) (e.currentTarget as HTMLElement)?.classList.add('drag-over') }
function onDragLeave(e: DragEvent) { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dragCounter = 0; (e.currentTarget as HTMLElement)?.classList.remove('drag-over') } }
async function onDrop(e: DragEvent) {
  e.preventDefault(); dragCounter = 0; (e.currentTarget as HTMLElement)?.classList.remove('drag-over')
  const items = e.dataTransfer?.items; if (!items?.length) return
  const fileList: { file: File; path: string }[] = []
  for (const item of Array.from(items)) {
    const en = item.webkitGetAsEntry?.()
    if (en) {
      if (en.isFile) {
        const f = item.getAsFile(); if (f) fileList.push({ file: f, path: currentPath.value })
      } else {
        await traverseFiles(en, currentPath.value ? `${currentPath.value}/${en.name}` : en.name, fileList)
      }
    } else if (item.kind === 'file') { const f = item.getAsFile(); if (f) fileList.push({ file: f, path: currentPath.value }) }
  }
  if (fileList.length === 0 && e.dataTransfer?.files.length) { for (const f of Array.from(e.dataTransfer.files)) fileList.push({ file: f, path: currentPath.value }) }
  for (const { file, path } of fileList) startUpload(file, path)
  if (fileList.length > 0) message.success(`已添加 ${fileList.length} 个文件到上传队列`)
}

function openRename(entry: FileEntry) { renameTarget.value = entry; renameValue.value = entry.name; showRenameModal.value = true }
async function confirmRename() {
  if (!renameTarget.value || !renameValue.value.trim()) return
  try { await api.put('/storage/rename', { path: renameTarget.value.path, new_name: renameValue.value.trim() }); message.success('已重命名'); showRenameModal.value = false; renameTarget.value = null; await loadList(currentPath.value) }
  catch (e: any) { message.error(e.message || '重命名失败') }
}
function confirmDelete(entry: FileEntry) { dialog.warning({ title: '确认删除', content: `确定删除「${entry.name}」${entry.is_dir ? '及其所有内容' : ''}？`, positiveText: '删除', negativeText: '取消', onPositiveClick: async () => { try { await api.delete(`/storage/delete?path=${encodeURIComponent(entry.path)}`); message.success('已删除'); await loadList(currentPath.value); await loadInfo() } catch (e: any) { message.error(e.message || '删除失败') } } }) }
function batchDelete() { const p = Array.from(selectedPaths.value); if (!p.length) { message.warning('请选择文件'); return }; dialog.warning({ title: '批量删除', content: `确定删除选中的 ${p.length} 个项目？`, positiveText: '删除', negativeText: '取消', onPositiveClick: async () => { try { const r = await api.post<{ deleted: number }>('/storage/batch-delete', { paths: p }); message.success(`已删除 ${r.deleted} 个项目`); selectedPaths.value = new Set(); await loadList(currentPath.value); await loadInfo() } catch (e: any) { message.error(e.message || '删除失败') } } }) }
async function openMove() { const p = Array.from(selectedPaths.value); if (!p.length) { message.warning('请选择文件'); return }; moveTargets.value = p; moveDir.value = ''; await loadMoveDirs(); showMoveModal.value = true }
async function loadMoveDirs() { try { const r = await api.get<{ entries: FileEntry[] }>(`/storage/list?path=${encodeURIComponent(moveDir.value)}`); moveDirs.value = r.entries.filter(e => e.is_dir).map(e => e.name) } catch { moveDirs.value = [] } }
function enterMoveDir(name: string) { moveDir.value = moveDir.value ? `${moveDir.value}/${name}` : name; loadMoveDirs() }
async function confirmMove() { try { const r = await api.post<{ moved: number }>('/storage/move', { paths: moveTargets.value, target: moveDir.value }); message.success(`已移动 ${r.moved} 个项目`); showMoveModal.value = false; selectedPaths.value = new Set(); await loadList(currentPath.value); await loadInfo() } catch (e: any) { message.error(e.message || '移动失败') } }
function downloadFile(entry: FileEntry) { if (entry.is_dir) { message.warning('暂不支持直接下载文件夹'); return }; const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''; const a = document.createElement('a'); a.href = `/api/storage/download?path=${encodeURIComponent(entry.path)}&token=${token}`; a.download = entry.name; a.click() }
async function batchDownload() {
  const files = entries.value.filter(e => selectedPaths.has(e.path) && !e.is_dir)
  if (files.length === 0) { message.warning('请至少选择一个文件（文件夹暂不支持批量下载）'); return }
  const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
  message.info(`开始下载 ${files.length} 个文件`)
  for (const f of files) {
    const a = document.createElement('a')
    a.href = `/api/storage/download?path=${encodeURIComponent(f.path)}&token=${token}`
    a.download = f.name; a.click()
    await new Promise(r => setTimeout(r, 300))
  }
}

function fileIconComponent(icon: string) { const m: Record<string, any> = { folder: Folder, image: Image, video: Video, audio: Music, pdf: FileType, doc: FileText, excel: FileSpreadsheet, ppt: File, archive: Archive, text: FileText, code: File }; return m[icon] || File }
function iconColor(icon: string): string { const m: Record<string, string> = { folder: '#f0a020', image: '#18a058', video: '#a050dc', audio: '#5E6AD2', pdf: '#d03050', doc: '#5E6AD2', excel: '#18a058', ppt: '#d03050', archive: '#f0a020', text: '#888', code: '#5E6AD2' }; return m[icon] || '#888' }
function fmtDate(iso: string) { const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}` }
function fmtPercent(pct: number): 'default' | 'success' | 'warning' | 'error' { if (pct > 90) return 'error'; if (pct > 70) return 'warning'; if (pct > 30) return 'default'; return 'success' }
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:16px;">
    <div><NText tag="h1" depth="1" style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;">我的网盘</NText><NText depth="3" style="margin-top:4px;display:block;font-size:13px;">个人文件存储与管理</NText></div>

    <n-card :bordered="true" size="small" style="padding:4px 0;">
      <div style="display:flex;align-items:center;gap:16px;">
        <HardDrive :size="18" style="color:var(--accent);flex-shrink:0;" />
        <NProgress v-if="storageInfo" :value="storageInfo.used_percent" :indicator-placement="'inside'" :height="20" :border-radius="6" :type="fmtPercent(storageInfo.used_percent)" style="flex:1;min-width:100px;" />
        <span v-if="storageInfo" style="font-size:12px;color:var(--text-muted);white-space:nowrap;flex-shrink:0;">{{ storageInfo.used_display }} / {{ storageInfo.limit_display }}</span>
      </div>
    </n-card>

    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:4px;flex:1;min-width:0;flex-wrap:wrap;">
        <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
          <span v-if="i > 0" style="color:var(--text-muted);font-size:12px;flex-shrink:0;"><ChevronRight :size="14" /></span>
          <span @click="navigateTo(crumb.path)" class="crumb-link" :style="{fontSize:'13px',cursor:'pointer',fontWeight:i===breadcrumbs.length-1?600:400,color:i===breadcrumbs.length-1?'var(--text-primary)':'var(--accent)',padding:'2px 6px',borderRadius:'4px'}">{{ crumb.label }}</span>
        </template>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <NButton size="tiny" quaternary @click="refresh" round><template #icon><RefreshCw :size="14" /></template></NButton>
        <NButton size="tiny" @click="showMkdirModal = true" secondary round><template #icon><Plus :size="14" /></template>新建文件夹</NButton>
        <NButton size="tiny" type="primary" @click="triggerUpload" round><template #icon><Upload :size="14" /></template>上传文件</NButton>
      </div>
    </div>

    <div v-if="selectedPaths.size > 0" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--surface-2);border-radius:6px;font-size:13px;">
      <CheckSquare :size="15" style="color:var(--accent);" /><span style="color:var(--text-primary);font-weight:500;">已选 {{ selectedPaths.size }} 项</span>
      <div style="flex:1" />
      <NButton size="tiny" secondary @click="batchDownload" round><template #icon><Download :size="13" /></template>批量下载</NButton>
      <NButton size="tiny" secondary @click="openBatchRename" round><template #icon><Replace :size="13" /></template>批量重命名</NButton>
      <NButton size="tiny" secondary @click="openMove" round><template #icon><MoveRight :size="13" /></template>移动到</NButton>
      <NButton size="tiny" secondary type="error" @click="batchDelete" round><template #icon><Trash2 :size="13" /></template>批量删除</NButton>
      <NButton size="tiny" quaternary @click="selectedPaths = new Set()" round>取消选择</NButton>
    </div>

    <n-card :bordered="true" size="small" style="flex:1;min-height:300px;padding:0;overflow:hidden;" @dragover="onDragOver" @dragenter="onDragEnter" @dragleave="onDragLeave" @drop="onDrop">
      <n-spin :show="loading" style="min-height:200px;">
        <template v-if="entries.length > 0">
          <div class="list-header" @click="toggleSelectAll">
            <div style="width:36px;display:flex;align-items:center;justify-content:center;"><NCheckbox :checked="selectedPaths.size === entries.length && entries.length > 0" /></div>
            <div class="col-icon" style="width:32px" /><div class="col-name" style="flex:1;min-width:0;">名称</div>
            <div class="col-size" style="width:80px;text-align:right;">大小</div><div class="col-date" style="width:130px;">修改日期</div>
            <div class="col-actions" style="width:80px;text-align:right;">操作</div>
          </div>
          <div v-for="entry in entries" :key="entry.path"
            class="list-row" :class="{ selected: selectedFile?.path === entry.path, 'row-selected': selectedPaths.has(entry.path) }"
            @click="selectedFile = entry" @dblclick="enterDir(entry)"
          >
            <div style="width:36px;display:flex;align-items:center;justify-content:center;" @click.stop="toggleSelect(entry.path)"><NCheckbox :checked="selectedPaths.has(entry.path)" /></div>
            <div class="col-icon" style="width:32px;" @click.stop="enterDir(entry)"><component :is="fileIconComponent(entry.icon)" :size="20" :stroke-width="1.5" :style="{color:iconColor(entry.icon)}" /></div>
            <div class="col-name" style="flex:1;min-width:0;font-weight:500;" @click.stop="enterDir(entry)"><span style="cursor:pointer;">{{ entry.name }}</span></div>
            <div class="col-size" style="width:80px;text-align:right;color:var(--text-muted);font-size:12px;"><span v-if="!entry.is_dir">{{ entry.size_display }}</span><span v-else style="color:var(--text-muted);font-size:12px;">文件夹</span></div>
            <div class="col-date" style="width:130px;color:var(--text-muted);font-size:12px;">{{ fmtDate(entry.modified) }}</div>
            <div class="col-actions" style="width:80px;text-align:right;display:flex;gap:2px;justify-content:flex-end;" @click.stop>
              <NButton size="tiny" quaternary @click="openRename(entry)" round><template #icon><Edit3 :size="12" /></template></NButton>
              <NButton v-if="!entry.is_dir" size="tiny" quaternary @click="downloadFile(entry)" round><template #icon><Download :size="12" /></template></NButton>
              <NButton size="tiny" quaternary type="error" @click="confirmDelete(entry)" round><template #icon><Trash2 :size="12" /></template></NButton>
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

    <n-modal v-model:show="showMoveModal" preset="card" title="移动到" style="width:420px;" :mask-closable="false">
      <div style="margin-bottom:12px;"><span style="font-size:13px;color:var(--text-muted);">移动 {{ moveTargets.length }} 个项目到：</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">
        <NTag size="small" :bordered="false" round closable @close="moveDir = ''" style="cursor:pointer;">根目录</NTag>
        <template v-if="moveDir"><span style="color:var(--text-muted);font-size:12px;line-height:24px;">/</span><span style="font-size:13px;color:var(--text-primary);font-weight:500;line-height:24px;">{{ moveDir }}</span></template>
      </div>
      <div style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
        <div v-for="name in moveDirs" :key="name" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:13px;" @click="enterMoveDir(name)" @mouseenter="(e:any)=>e.currentTarget.style.background='var(--surface-2)'" @mouseleave="(e:any)=>e.currentTarget.style.background='transparent'">
          <Folder :size="16" style="color:#f0a020;flex-shrink:0;" /><span style="color:var(--text-primary);">{{ name }}</span>
        </div>
        <div v-if="moveDirs.length === 0" style="color:var(--text-muted);font-size:12px;padding:12px;text-align:center;">{{ moveDir ? '此文件夹为空' : '根目录下无文件夹' }}</div>
      </div>
      <template #footer><NSpace justify="end"><NButton quaternary @click="showMoveModal = false">取消</NButton><NButton type="primary" @click="confirmMove" round>移动到此处</NButton></NSpace></template>
    </n-modal>

    <!-- ═══ 批量重命名 Modal ═══ -->
    <n-modal v-model:show="showBatchRenameModal" preset="card" title="批量重命名" style="width:460px;" :mask-closable="false">
      <div style="margin-bottom:16px;font-size:13px;color:var(--text-muted);">已选 <strong>{{ selectedPaths.size }}</strong> 项</div>
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:500;margin-bottom:8px;color:var(--text-primary);">重命名模式</div>
        <NRadioGroup v-model:value="batchRenameMode">
          <div style="display:flex;gap:8px;"><NRadioButton value="replace" style="flex:1;">查找替换</NRadioButton><NRadioButton value="prefix" style="flex:1;">添加前缀</NRadioButton><NRadioButton value="suffix" style="flex:1;">添加后缀</NRadioButton><NRadioButton value="number" style="flex:1;">序号模式</NRadioButton></div>
        </NRadioGroup>
      </div>
      <n-form v-if="batchRenameMode === 'replace'" :show-label="true">
        <n-form-item label="查找"><n-input v-model:value="batchRenameFind" placeholder="输入要查找的文本" /></n-form-item>
        <n-form-item label="替换为"><n-input v-model:value="batchRenameReplace" placeholder="留空则删除" /></n-form-item>
      </n-form>
      <n-form v-if="batchRenameMode === 'prefix' || batchRenameMode === 'suffix'" :show-label="true">
        <n-form-item :label="batchRenameMode === 'prefix' ? '前缀文本' : '后缀文本'"><n-input v-model:value="batchRenameText" :placeholder="batchRenameMode === 'prefix' ? '添加在文件名前面' : '添加在文件名后面（扩展名前）'" /></n-form-item>
      </n-form>
      <n-form v-if="batchRenameMode === 'number'" :show-label="true">
        <n-form-item label="命名模板"><n-input v-model:value="batchRenamePattern" placeholder="例: 照片_{n}" /></n-form-item>
        <div style="font-size:12px;color:var(--text-muted);margin-top:-8px;margin-bottom:12px;">使用 <code style="background:var(--surface-2);padding:1px 5px;border-radius:3px;">{n}</code> 表示序号，自动补零</div>
        <n-form-item label="起始编号"><n-input-number v-model:value="batchRenameStart" :min="0" :max="9999" style="width:120px;" /></n-form-item>
      </n-form>
      <div v-if="batchRenameMode && selectedPaths.size > 0" style="margin-top:4px;">
        <div style="font-size:12px;font-weight:500;margin-bottom:6px;color:var(--text-muted);">预览（前 5 项）</div>
        <div style="max-height:120px;overflow-y:auto;background:var(--surface-2);border-radius:6px;padding:8px 12px;font-size:12px;display:flex;flex-direction:column;gap:4px;">
          <div v-for="(entry, i) in entries.filter(e => selectedPaths.has(e.path)).slice(0, 5)" :key="entry.path" style="display:flex;gap:8px;align-items:center;">
            <span style="color:var(--text-muted);flex-shrink:0;">{{ i + 1 }}.</span>
            <span style="color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">{{ entry.name }}</span>
            <span style="color:var(--text-muted);">→</span>
            <span style="color:var(--accent);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">{{ previewBatchName(entry.name, i) }}</span>
          </div>
        </div>
      </div>
      <template #footer><NSpace justify="end"><NButton quaternary @click="showBatchRenameModal = false">取消</NButton><NButton type="primary" @click="confirmBatchRename" round>开始重命名</NButton></NSpace></template>
    </n-modal>

    <UploadPanel />
  </div>
</template>

<style scoped>
.list-header { display:flex;align-items:center;gap:4px;padding:8px 12px;border-bottom:1px solid var(--hairline);font-size:12px;color:var(--text-muted);font-weight:500;cursor:pointer;user-select:none; }
.list-row { display:flex;align-items:center;gap:4px;padding:6px 12px;border-bottom:1px solid var(--hairline);transition:background .1s;cursor:default;font-size:13px; }
.list-row:hover { background:var(--surface-2); }
.list-row.selected { background:rgba(94,106,210,0.06); }
.list-row.row-selected { background:rgba(94,106,210,0.04); }
.col-icon { display:flex;align-items:center;justify-content:center;flex-shrink:0; }
.col-name { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.col-size { flex-shrink:0; }
.col-date { flex-shrink:0; }
.col-actions { flex-shrink:0;display:flex;gap:2px;justify-content:flex-end;opacity:0;transition:opacity .15s; }
.list-row:hover .col-actions { opacity:1; }
.crumb-link:hover { background:var(--surface-2); }
.drag-over { background:rgba(94,106,210,0.03); }
</style>
