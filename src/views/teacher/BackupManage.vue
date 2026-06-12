<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api, BASE } from '@/api/client'
import { useDialog, useMessage } from 'naive-ui'
import {
  NButton, NCard, NText, NSpace, NSpin, NEmpty, NTag, NAlert,
  NModal, NList, NListItem, NCheckboxGroup, NCheckbox, NDivider, NInput,
  NScrollbar, NButtonGroup,
} from 'naive-ui'
import {
  Download, Upload, Trash2, Database, FileArchive, AlertTriangle, CheckCircle,
  RefreshCw, Plus, Edit3, RotateCcw, HardDrive, Table,
} from '@lucide/vue'

const dialog = useDialog()
const message = useMessage()

interface BackupFile {
  name: string; size: number; created_at: string
}
interface TableStat {
  name: string; count: number
}
interface BackupStats {
  tables: TableStat[]
  uploads_size: number
  storage_size: number
}

const backups = ref<BackupFile[]>([])
const loading = ref(false)
const creating = ref(false)
const restoring = ref(false)

// ── 创建备份弹窗 ──
const showCreateModal = ref(false)
const stats = ref<BackupStats | null>(null)
const statsLoading = ref(false)
const selectedTables = ref<string[]>([])

const statsTotalRecords = computed(() => stats.value?.tables.reduce((s, t) => s + t.count, 0) || 0)
const statsTotalFiles = computed(() => {
  if (!stats.value) return 0
  return (stats.value.uploads_size > 0 ? 1 : 0) + (stats.value.storage_size > 0 ? 1 : 0)
})

// ── 重命名弹窗 ──
const showRenameModal = ref(false)
const renameTarget = ref<BackupFile | null>(null)
const renameValue = ref('')

// ── 恢复确认弹窗 ──
const showRestoreModal = ref(false)
const restoreTarget = ref<BackupFile | null>(null)
const restoreResult = ref<{ tables_restored: number; records_total: number; files_restored: number; errors?: string[] } | null>(null)
const restoreLoading = ref(false)

const TABLE_LABELS: Record<string, string> = {
  permission_groups: '权限组',
  permissions: '权限定义',
  group_permissions: '权限映射',
  rate_limits: '频率限制',
  chat_settings: 'AI 设置',
  api_keys: 'API 密钥',
  tool_configs: '工具配置',
  users: '用户',
  scores: '成绩',
  assignments: '作业',
  submissions: '作业提交',
  point_records: '积分记录',
  posts: '帖子',
  comments: '评论',
  conversations: 'AI 对话',
  messages: '对话消息',
  uploaded_files: '上传文件记录',
  audit_logs: '操作日志',
  page_views: '页面浏览',
  traffic_logs: '流量日志',
  review_types: '点评类型',
  articles: '公众号文章',
  site_settings: '站点设置',
  classes: '班级',
  storage_meta: '存储元数据',
  storage_quotas: '存储配额',
  courses: '课程',
}

function tableLabel(name: string): string {
  return TABLE_LABELS[name] || name
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

async function load() {
  loading.value = true
  try { backups.value = await api.get<BackupFile[]>('/backup/list') }
  catch { message.error('加载备份列表失败') }
  finally { loading.value = false }
}

// ── 打开创建弹窗 ──
async function openCreate() {
  showCreateModal.value = true
  statsLoading.value = true
  selectedTables.value = []
  try {
    const s = await api.get<BackupStats>('/backup/stats')
    stats.value = s
    selectedTables.value = s.tables.filter(t => t.count > 0).map(t => t.name)
  } catch { message.error('获取统计数据失败') }
  finally { statsLoading.value = false }
}

async function doCreate() {
  if (selectedTables.value.length === 0) { message.warning('请至少选择一张表'); return }
  creating.value = true
  try {
    const r = await api.post<{ name: string; size: number }>('/backup/create', { tables: selectedTables.value })
    message.success(`备份已创建：${r.name}`)
    showCreateModal.value = false
    await load()
  } catch (e: any) { message.error(e.message || '创建备份失败') }
  finally { creating.value = false }
}

// ── 导入到服务端 ──
function triggerUpload() {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.zip'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    // Validate file size (max 1GB)
    if (file.size > 1024 * 1024 * 1024) {
      message.error('备份文件过大，最大支持 1GB')
      return
    }
    // Validate file extension
    if (!file.name.endsWith('.zip')) {
      message.error('请选择 .zip 格式的备份文件')
      return
    }
    const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
    const fd = new FormData(); fd.append('backup', file)
    try {
      const resp = await fetch(`${BASE}/backup/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      })
      const body = await resp.json()
      if (body.success) { message.success(`备份已上传到服务端`); await load() }
      else throw new Error(body.error?.message || '上传失败')
    } catch (e: any) { message.error(e.message || '上传失败') }
  }
  input.click()
}

// ── 下载（POST + blob，避免 token 暴露在 URL）──
async function doDownload(b: BackupFile) {
  try {
    const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
    const resp = await fetch(`${BASE}/backup/download/${encodeURIComponent(b.name)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || '下载失败')
    }
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = b.name; a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    message.error(e.message || '下载失败')
  }
}

// ── 重命名 ──
function openRename(b: BackupFile) {
  renameTarget.value = b
  renameValue.value = b.name.replace(/\.zip$/, '')
  showRenameModal.value = true
}

async function confirmRename() {
  if (!renameTarget.value || !renameValue.value.trim()) return
  const newName = renameValue.value.trim() + '.zip'
  try {
    await api.put(`/backup/${encodeURIComponent(renameTarget.value.name)}`, { name: newName })
    message.success('已重命名')
    showRenameModal.value = false
    await load()
  } catch (e: any) { message.error(e.message || '重命名失败') }
}

// ── 删除 ──
function confirmDelete(b: BackupFile) {
  dialog.warning({
    title: '确认删除', content: `确定删除备份「${b.name}」？`,
    positiveText: '删除', negativeText: '取消',
    positiveButtonProps: { type: 'error' as const },
    onPositiveClick: async () => {
      try { await api.delete(`/backup/${encodeURIComponent(b.name)}`); message.success('已删除'); await load() }
      catch (e: any) { message.error(e.message || '删除失败') }
    },
  })
}

// ── 恢复 ──
function openRestore(b: BackupFile) {
  restoreTarget.value = b
  restoreResult.value = null
  showRestoreModal.value = true
}

async function doRestore() {
  if (!restoreTarget.value) return
  dialog.warning({
    title: '确认恢复备份',
    content: `即将从「${restoreTarget.value.name}」恢复数据。当前所有数据将被替换！此操作不可撤销！`,
    positiveText: '确认恢复',
    negativeText: '取消',
    positiveButtonProps: { type: 'error' as const },
    onPositiveClick: async () => {
      restoreLoading.value = true
      try {
        const r = await api.post<{ tables_restored: number; records_total: number; files_restored: number; errors?: string[] }>(`/backup/restore/${encodeURIComponent(restoreTarget.value!.name)}`)
        restoreResult.value = r
        message.success('备份恢复成功，3 秒后刷新页面...')
        // Reload page after restore to reflect new data
        setTimeout(() => window.location.reload(), 3000)
      } catch (e: any) { message.error(e.message || '恢复失败') }
      finally { restoreLoading.value = false }
    },
  })
}

onMounted(load)
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:20px;">

    <!-- ═══ 页面标题 ═══ -->
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div>
        <NText tag="h1" depth="1" style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;">备份管理</NText>
        <NText depth="3" style="margin-top:4px;display:block;font-size:13px;">创建、导入和恢复系统完整备份</NText>
      </div>
      <NSpace size="small">
        <NButton @click="triggerUpload" secondary round size="small">
          <template #icon><Upload :size="14" /></template>
          上传备份
        </NButton>
        <NButton type="primary" @click="openCreate" round size="small">
          <template #icon><Plus :size="14" /></template>
          创建备份
        </NButton>
      </NSpace>
    </div>

    <!-- ═══ 备份列表 ═══ -->
    <NCard :bordered="true" size="small" style="flex:1;">
      <template #header>
        <div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;">
          <FileArchive :size="15" style="color:var(--text-muted);" /> 服务端备份文件
        </div>
      </template>
      <NSpin :show="loading" style="min-height:100px;">
        <div v-if="backups.length > 0" style="display:flex;flex-direction:column;gap:4px;">
          <div v-for="b in backups" :key="b.name"
            style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;background:var(--surface-1);border:1px solid var(--hairline);font-size:13px;"
          >
            <FileArchive :size="20" style="color:var(--accent);flex-shrink:0;" />
            <div style="flex:1;min-width:0;">
              <div style="font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ b.name }}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                <NTag size="tiny" :bordered="false" round style="font-size:10px;">{{ formatSize(b.size) }}</NTag>
                <span style="margin-left:6px;">{{ formatDate(b.created_at) }}</span>
              </div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
              <NButton size="tiny" quaternary @click="openRename(b)" round><template #icon><Edit3 :size="12" /></template></NButton>
              <NButton size="tiny" quaternary @click="doDownload(b)" round><template #icon><Download :size="12" /></template></NButton>
              <NButton size="tiny" quaternary type="error" @click="confirmDelete(b)" round><template #icon><Trash2 :size="12" /></template></NButton>
              <NButton size="tiny" secondary @click="openRestore(b)" round><template #icon><RotateCcw :size="12" /></template>恢复</NButton>
            </div>
          </div>
        </div>
        <NEmpty v-else-if="!loading" description="暂无备份文件" style="padding:40px 0;" />
      </NSpin>
    </NCard>

    <!-- ═══ 创建备份 Modal ═══ -->
    <NModal v-model:show="showCreateModal" preset="card" title="创建备份" style="width:520px;max-width:92vw;" :mask-closable="false" header-style="font-size:16px;font-weight:600;">
      <NSpin :show="statsLoading" style="min-height:200px;">
        <template v-if="stats">

          <!-- 汇总 -->
          <div style="display:flex;gap:16px;margin-bottom:16px;">
            <div style="flex:1;text-align:center;padding:12px;border-radius:8px;background:var(--surface-2);">
              <div style="font-size:20px;font-weight:700;color:var(--accent);">{{ statsTotalRecords }}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">数据库记录</div>
            </div>
            <div style="flex:1;text-align:center;padding:12px;border-radius:8px;background:var(--surface-2);">
              <div style="font-size:20px;font-weight:700;color:var(--accent);">{{ formatSize(stats.uploads_size + stats.storage_size) }}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">文件存储</div>
            </div>
          </div>

          <!-- 表选择 -->
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">选择要备份的数据</div>
          <div style="max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;border:1px solid var(--hairline);border-radius:6px;padding:4px;">
            <label v-for="t in stats.tables" :key="t.name"
              style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:4px;cursor:pointer;font-size:13px;transition:background .1s;"
              :style="{ background: selectedTables.includes(t.name) ? 'var(--surface-2)' : 'transparent' }"
              @mouseenter="(e:any)=>e.currentTarget.style.background='var(--surface-3)'"
              @mouseleave="(e:any)=>e.currentTarget.style.background=selectedTables.includes(t.name)?'var(--surface-2)':'transparent'"
            >
              <NCheckbox :checked="selectedTables.includes(t.name)" @update:checked="(v:boolean)=>v?selectedTables.push(t.name):selectedTables=selectedTables.filter(x=>x!==t.name)" />
              <span style="flex:1;color:var(--text-primary);font-weight:500;">{{ tableLabel(t.name) }}</span>
              <NTag size="tiny" :bordered="false" round>{{ t.count }} 条</NTag>
            </label>
          </div>
        </template>
      </NSpin>
      <template #footer>
        <NSpace justify="end">
          <NButton quaternary @click="showCreateModal = false" :disabled="creating">取消</NButton>
          <NButton type="primary" @click="doCreate" :loading="creating" :disabled="selectedTables.length === 0" round>
            <template #icon><Database :size="14" /></template>
            开始备份
          </NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- ═══ 重命名 Modal ═══ -->
    <NModal v-model:show="showRenameModal" preset="card" title="重命名备份" style="width:400px;" :mask-closable="false">
      <NInput v-model:value="renameValue" placeholder="输入新名称（不含扩展名）" @keyup.enter="confirmRename" />
      <template #footer>
        <NSpace justify="end">
          <NButton quaternary @click="showRenameModal = false">取消</NButton>
          <NButton type="primary" @click="confirmRename" :disabled="!renameValue.trim()" round>确定</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- ═══ 恢复 Modal ═══ -->
    <NModal v-model:show="showRestoreModal" preset="card" title="恢复备份" style="width:480px;" :mask-closable="false">
      <template v-if="restoreTarget">
        <div style="margin-bottom:16px;">
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">即将恢复的备份文件：</div>
          <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:6px;background:var(--surface-2);">
            <FileArchive :size="20" style="color:var(--accent);" />
            <div>
              <div style="font-weight:500;font-size:13px;color:var(--text-primary);">{{ restoreTarget.name }}</div>
              <div style="font-size:11px;color:var(--text-muted);">{{ formatSize(restoreTarget.size) }} · {{ formatDate(restoreTarget.created_at) }}</div>
            </div>
          </div>
        </div>

        <NAlert type="warning" :bordered="false" style="font-size:13px;">
          <template #header>⚠️ 重要提示</template>
          恢复将替换当前所有数据，此操作不可撤销。建议先在「创建备份」中备份当前数据。
        </NAlert>

        <!-- 恢复结果 -->
        <NAlert v-if="restoreResult" type="success" :bordered="false" style="font-size:13px;margin-top:12px;" closable @close="restoreResult=null">
          <template #header>恢复完成</template>
          恢复了 {{ restoreResult.tables_restored }} 张表，共 {{ restoreResult.records_total }} 条记录，{{ restoreResult.files_restored }} 个文件
          <span v-if="restoreResult.errors?.length" style="color:var(--warning-color);display:block;margin-top:4px;">错误：{{ restoreResult.errors.join('; ') }}</span>
        </NAlert>
      </template>

      <template #footer>
        <NSpace justify="end">
          <NButton quaternary @click="showRestoreModal = false" :disabled="restoreLoading">关闭</NButton>
          <NButton v-if="!restoreResult" type="error" @click="doRestore" :loading="restoreLoading" round>
            <template #icon><RotateCcw :size="14" /></template>
            确认恢复
          </NButton>
        </NSpace>
      </template>
    </NModal>

  </div>
</template>
