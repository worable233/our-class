<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, BASE } from '@/api/client'
import { useDialog, useMessage } from 'naive-ui'
import {
  NButton, NCard, NText, NSpace, NSpin, NEmpty, NTag, NAlert,
  NModal, NList, NListItem, NThing, NIcon,
} from 'naive-ui'
import { Download, Upload, Trash2, Database, FileArchive, AlertTriangle, CheckCircle, RefreshCw } from '@lucide/vue'

interface BackupFile {
  name: string
  size: number
  created_at: string
}

const dialog = useDialog()
const message = useMessage()

const backups = ref<BackupFile[]>([])
const loading = ref(false)
const exporting = ref(false)
const importing = ref(false)
const importResult = ref<{ tables_restored: number; records_total: number; files_restored: number; errors?: string[] } | null>(null)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function load() {
  loading.value = true
  try {
    backups.value = await api.get<BackupFile[]>('/backup/list')
  } catch { message.error('加载备份列表失败') }
  finally { loading.value = false }
}

async function doExport() {
  exporting.value = true
  try {
    const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
    const resp = await fetch(`${BASE}/backup/export`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) { message.error('导出失败'); return }
    const blob = await resp.blob()
    const disposition = resp.headers.get('content-disposition') || ''
    const match = disposition.match(/filename="?(.+?)"?$/)
    const filename = match?.[1] || `backup-${new Date().toISOString().slice(0, 10)}.zip`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
    message.success('备份已导出')
    load()
  } catch (e: any) {
    message.error(e.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

function triggerImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.zip'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    dialog.warning({
      title: '确认导入备份',
      content: `即将导入备份文件「${file.name}」（${formatSize(file.size)}）。当前所有数据将被替换！此操作不可撤销！`,
      positiveText: '确认导入',
      negativeText: '取消',
      positiveButtonProps: { type: 'error' as const },
      async onPositiveClick() {
        importResult.value = null
        importing.value = true
        try {
          const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
          const form = new FormData()
          form.append('backup', file)
          const resp = await fetch(`${BASE}/backup/import`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          })
          const data = await resp.json()
          if (data.success) {
            importResult.value = data.data
            message.success('备份导入成功')
          } else {
            message.error(data.error?.message || '导入失败')
          }
        } catch (e: any) {
          message.error(e.message || '导入失败')
        } finally {
          importing.value = false
        }
      },
    })
  }
  input.click()
}

function confirmDelete(b: BackupFile) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除备份文件「${b.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps: { type: 'error' as const },
    onPositiveClick: async () => {
      try {
        await api.delete(`/backup/${encodeURIComponent(b.name)}`)
        message.success('已删除')
        load()
      } catch (e: any) { message.error(e.message || '删除失败') }
    },
  })
}

function downloadBackup(b: BackupFile) {
  const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
  const a = document.createElement('a')
  a.href = `${BASE}/backup/download/${encodeURIComponent(b.name)}?token=${token}`
  a.download = b.name
  a.click()
}

onMounted(load)
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:20px;">
    <!-- ═══ 页面标题 ═══ -->
    <div>
      <NText tag="h1" depth="1" style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;">备份管理</NText>
      <NText depth="3" style="margin-top:4px;display:block;font-size:13px;">导出和导入系统完整备份（数据库 + 上传文件）</NText>
    </div>

    <!-- ═══ 操作区 ═══ -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      <NButton type="primary" @click="doExport" :loading="exporting" round size="large">
        <template #icon><Download :size="18" /></template>
        导出备份
      </NButton>
      <NButton @click="triggerImport" :loading="importing" secondary round size="large" type="error">
        <template #icon><Upload :size="18" /></template>
        导入备份
      </NButton>
    </div>

    <!-- ═══ 导入结果 ═══ -->
    <NAlert v-if="importResult" type="success" :bordered="false" closable @close="importResult = null">
      <template #header>导入完成</template>
      <div style="font-size:13px;">
        恢复了 {{ importResult.tables_restored }} 张表，共 {{ importResult.records_total }} 条记录，{{ importResult.files_restored }} 个文件
        <span v-if="importResult.errors?.length" style="color:var(--warning-color);display:block;margin-top:4px;">
          部分错误：{{ importResult.errors.join('; ') }}
        </span>
      </div>
    </NAlert>

    <!-- ═══ 备份列表 ═══ -->
    <NCard :bordered="true" size="small" title="服务端备份文件" style="flex:1;">
      <NSpin :show="loading" style="min-height:100px;">
        <NList v-if="backups.length > 0" hoverable style="background:transparent;">
          <NListItem v-for="b in backups" :key="b.name">
            <template #prefix>
              <FileArchive :size="24" style="color:var(--accent);" />
            </template>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-weight:500;font-size:13px;">{{ b.name }}</span>
              <NTag size="tiny" :bordered="false" round>{{ formatSize(b.size) }}</NTag>
              <span style="font-size:11px;color:var(--text-muted);">{{ formatDate(b.created_at) }}</span>
            </div>
            <template #suffix>
              <div style="display:flex;gap:4px;">
                <NButton size="tiny" quaternary type="primary" @click="downloadBackup(b)" round>
                  <template #icon><Download :size="13" /></template>
                </NButton>
                <NButton size="tiny" quaternary type="error" @click="confirmDelete(b)" round>
                  <template #icon><Trash2 :size="13" /></template>
                </NButton>
              </div>
            </template>
          </NListItem>
        </NList>
        <NEmpty v-else-if="!loading" description="暂无备份文件" style="padding:40px 0;" />
      </NSpin>
    </NCard>
  </div>
</template>

<style scoped>
</style>
