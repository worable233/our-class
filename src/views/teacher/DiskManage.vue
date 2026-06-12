<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMessage, useDialog, NCard, NProgress, NButton, NModal, NInput, NInputNumber, NSpace, NRadioGroup, NRadioButton, NText } from 'naive-ui'
import { HardDrive } from '@lucide/vue'
import { useDisk, type DiskEntry } from '@/composables/useDisk'
import DiskList from '@/components/disk/DiskList.vue'
import DiskToolbar from '@/components/disk/DiskToolbar.vue'
import DiskPreview from '@/components/disk/DiskPreview.vue'
import DiskMoveModal from '@/components/disk/DiskMoveModal.vue'
import DiskRenameModal from '@/components/disk/DiskRenameModal.vue'

const message = useMessage()
const dialog = useDialog()

const disk = useDisk()

// ── Modals ──
const showNewFolder = ref(false)
const newFolderName = ref('')
const showRename = ref(false)
const renameTarget = ref<DiskEntry | null>(null)
const showMove = ref(false)
const moveTargets = ref<DiskEntry[]>([])
const showPreview = ref(false)
const previewEntry = ref<DiskEntry | null>(null)

// ── Batch rename ──
const showBatchRename = ref(false)
const batchRenameMode = ref<'replace' | 'prefix' | 'suffix' | 'number'>('replace')
const batchRenameFind = ref('')
const batchRenameReplace = ref('')
const batchRenamePrefix = ref('')
const batchRenameSuffix = ref('')
const batchRenameStart = ref(1)

// ── Upload ──
const fileInputRef = ref<HTMLInputElement | null>(null)

function triggerUpload() {
  fileInputRef.value?.click()
}

async function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  for (const file of Array.from(input.files)) {
    await uploadFile(file)
  }
  input.value = ''
  await disk.loadList()
  await disk.loadStorageInfo()
}

async function uploadFile(file: File) {
  const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
  const fd = new FormData()
  fd.append('file', file)
  fd.append('path', disk.currentPath.value)
  const resp = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/storage/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error?.message || '上传失败')
  }
}

// ── Handlers ──
function onOpen(entry: DiskEntry) {
  if (entry.is_dir) {
    disk.goTo(entry.path)
  } else {
    previewEntry.value = entry
    showPreview.value = true
  }
}

async function onCreateFolder() {
  const name = newFolderName.value.trim()
  if (!name) return
  try {
    await disk.createFolder(name)
    showNewFolder.value = false
    newFolderName.value = ''
    message.success('文件夹已创建')
  } catch (e: any) {
    message.error(e.message || '创建失败')
  }
}

function onRename(entry: DiskEntry) {
  renameTarget.value = entry
  showRename.value = true
}

async function onRenameConfirm(newName: string) {
  if (!renameTarget.value) return
  try {
    await disk.renameItem(renameTarget.value.path, newName)
    showRename.value = false
    message.success('已重命名')
  } catch (e: any) {
    message.error(e.message || '重命名失败')
  }
}

function onMove(entries: DiskEntry[]) {
  moveTargets.value = entries
  showMove.value = true
}

async function onMoveConfirm(dest: string) {
  try {
    await disk.moveItems(moveTargets.value.map(e => e.path), dest)
    showMove.value = false
    message.success('已移动')
  } catch (e: any) {
    message.error(e.message || '移动失败')
  }
}

function onDelete(entries: DiskEntry[]) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除 ${entries.length} 项？此操作不可撤销。`,
    positiveText: '删除',
    negativeText: '取消',
    positiveButtonProps: { type: 'error' as const },
    onPositiveClick: async () => {
      try {
        await disk.deleteItems(entries.map(e => e.path))
        message.success('已删除')
      } catch (e: any) {
        message.error(e.message || '删除失败')
      }
    },
  })
}

async function onDownload(entry: DiskEntry) {
  try {
    await disk.downloadFile(entry.path, entry.name)
  } catch (e: any) {
    message.error(e.message || '下载失败')
  }
}

async function onBatchDownload() {
  try {
    await disk.batchDownload()
  } catch (e: any) {
    message.error(e.message || '下载失败')
  }
}

function openBatchRename() {
  showBatchRename.value = true
  batchRenameMode.value = 'replace'
  batchRenameFind.value = ''
  batchRenameReplace.value = ''
  batchRenamePrefix.value = ''
  batchRenameSuffix.value = ''
  batchRenameStart.value = 1
}

async function doBatchRename() {
  try {
    const options: Record<string, any> = {}
    if (batchRenameMode.value === 'replace') {
      options.find = batchRenameFind.value
      options.replace = batchRenameReplace.value
    } else if (batchRenameMode.value === 'prefix') {
      options.prefix = batchRenamePrefix.value
    } else if (batchRenameMode.value === 'suffix') {
      options.suffix = batchRenameSuffix.value
    } else if (batchRenameMode.value === 'number') {
      options.start = batchRenameStart.value
    }
    await disk.batchRename(batchRenameMode.value, options)
    showBatchRename.value = false
    message.success('批量重命名完成')
  } catch (e: any) {
    message.error(e.message || '重命名失败')
  }
}

// Drag and drop
function onDragOver(e: DragEvent) {
  e.preventDefault()
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (!files?.length) return
  for (const file of Array.from(files)) {
    await uploadFile(file)
  }
  await disk.loadList()
  await disk.loadStorageInfo()
  message.success(`已上传 ${files.length} 个文件`)
}

onMounted(async () => {
  await Promise.all([disk.loadList(), disk.loadStorageInfo()])
})
</script>

<template>
  <div
    style="display: flex; flex-direction: column; gap: 16px;"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <!-- Title -->
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div>
        <h1 style="font-size: 24px; font-weight: 700; margin: 0;">网盘管理</h1>
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">管理所有用户的文件存储</p>
      </div>
    </div>

    <!-- Storage info -->
    <n-card size="small" style="background: var(--surface-1);">
      <div style="display: flex; align-items: center; gap: 12px;">
        <HardDrive :size="20" style="color: var(--accent);" />
        <div style="flex: 1;">
          <n-progress
            type="line"
            :percentage="disk.storageInfo.value.limit > 0 ? Math.min(100, disk.storageInfo.value.used / disk.storageInfo.value.limit * 100) : 0"
            :show-indicator="false"
            style="height: 6px;"
          />
        </div>
        <span style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">
          {{ disk.formatSize(disk.storageInfo.value.used) }} / {{ disk.formatSize(disk.storageInfo.value.limit) }}
        </span>
      </div>
    </n-card>

    <!-- Toolbar -->
    <DiskToolbar
      :breadcrumbs="disk.breadcrumbs.value"
      :search-query="disk.searchQuery.value"
      :can-go-back="disk.historyIndex.value > 0"
      :can-go-forward="disk.historyIndex.value < disk.pathHistory.value.length - 1"
      :selected-count="disk.selectedCount.value"
      @navigate="disk.goTo"
      @go-back="disk.goBack"
      @go-forward="disk.goForward"
      @go-up="disk.goUp"
      @go-home="disk.goHome"
      @refresh="disk.loadList()"
      @new-folder="showNewFolder = true"
      @upload="triggerUpload"
      @search="disk.searchQuery.value = $event"
      @batch-download="onBatchDownload"
      @batch-rename="openBatchRename"
      @move="onMove(disk.selectedEntries.value)"
      @batch-delete="onDelete(disk.selectedEntries.value)"
      @clear-selection="disk.clearSelection"
    />

    <!-- File list -->
    <DiskList
      :entries="disk.filteredEntries.value"
      :selected-paths="disk.selectedPaths.value"
      :loading="disk.loading.value"
      :format-size="disk.formatSize"
      :format-date="disk.formatDate"
      :get-file-icon="disk.getFileIcon"
      :can-preview="disk.canPreview"
      @open="onOpen"
      @preview="previewEntry = $event; showPreview = true"
      @download="onDownload"
      @rename="onRename"
      @move="onMove"
      @delete="onDelete"
      @select="disk.toggleSelect"
      @select-all="disk.selectAll"
      @clear-selection="disk.clearSelection"
      @upload="triggerUpload"
      @new-folder="showNewFolder = true"
      @refresh="disk.loadList()"
    />

    <!-- Hidden file input -->
    <input ref="fileInputRef" type="file" multiple style="display: none;" @change="onFileSelect" />

    <!-- New folder modal -->
    <n-modal v-model:show="showNewFolder" preset="card" title="新建文件夹" style="width: 360px;" :mask-closable="false">
      <n-input v-model:value="newFolderName" placeholder="文件夹名称" @keyup.enter="onCreateFolder" autofocus />
      <template #footer>
        <n-space justify="end">
          <n-button quaternary @click="showNewFolder = false">取消</n-button>
          <n-button type="primary" @click="onCreateFolder" :disabled="!newFolderName.trim()" round>创建</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Rename modal -->
    <DiskRenameModal
      :show="showRename"
      :entry="renameTarget"
      @close="showRename = false"
      @rename="onRenameConfirm"
    />

    <!-- Move modal -->
    <DiskMoveModal
      :show="showMove"
      :entries="moveTargets"
      @close="showMove = false"
      @move="onMoveConfirm"
    />

    <!-- Preview modal -->
    <DiskPreview
      :entry="previewEntry"
      :format-size="disk.formatSize"
      @close="showPreview = false; previewEntry = null"
      @download="onDownload"
    />

    <!-- Batch rename modal -->
    <n-modal v-model:show="showBatchRename" preset="card" title="批量重命名" style="width: 480px;" :mask-closable="false">
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <n-text depth="3" style="font-size: 13px;">
          已选 {{ disk.selectedCount.value }} 个文件
        </n-text>

        <n-radio-group v-model:value="batchRenameMode">
          <n-radio-button value="replace">查找替换</n-radio-button>
          <n-radio-button value="prefix">添加前缀</n-radio-button>
          <n-radio-button value="suffix">添加后缀</n-radio-button>
          <n-radio-button value="number">序号命名</n-radio-button>
        </n-radio-group>

        <template v-if="batchRenameMode === 'replace'">
          <n-input v-model:value="batchRenameFind" placeholder="查找内容" />
          <n-input v-model:value="batchRenameReplace" placeholder="替换为" />
        </template>
        <template v-else-if="batchRenameMode === 'prefix'">
          <n-input v-model:value="batchRenamePrefix" placeholder="前缀" />
        </template>
        <template v-else-if="batchRenameMode === 'suffix'">
          <n-input v-model:value="batchRenameSuffix" placeholder="后缀" />
        </template>
        <template v-else-if="batchRenameMode === 'number'">
          <n-form-item label="起始序号">
            <n-input-number v-model:value="batchRenameStart" :min="1" style="width: 120px;" />
          </n-form-item>
        </template>
      </div>
      <template #footer>
        <n-space justify="end">
          <n-button quaternary @click="showBatchRename = false">取消</n-button>
          <n-button type="primary" @click="doBatchRename" round>执行重命名</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>
