<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { DiskEntry } from '@/composables/useDisk'

const props = defineProps<{
  entries: DiskEntry[]
  selectedPaths: Set<string>
  loading: boolean
  formatSize: (bytes: number) => string
  formatDate: (iso: string) => string
  getFileIcon: (entry: DiskEntry) => string
  canPreview: (entry: DiskEntry) => boolean
}>()

const emit = defineEmits<{
  open: [entry: DiskEntry]
  preview: [entry: DiskEntry]
  download: [entry: DiskEntry]
  rename: [entry: DiskEntry]
  move: [entries: DiskEntry[]]
  delete: [entries: DiskEntry[]]
  select: [path: string]
  selectAll: []
  clearSelection: []
  upload: []
  newFolder: []
  refresh: []
}>()

// ── Context Menu ──
const ctxMenu = ref({ visible: false, x: 0, y: 0, target: null as DiskEntry | null })

function onContextMenu(e: MouseEvent, entry?: DiskEntry) {
  e.preventDefault()
  e.stopPropagation()

  // Calculate position with viewport boundary check
  const menuWidth = 200
  const menuHeight = 300
  let x = e.clientX
  let y = e.clientY
  if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8
  if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8

  ctxMenu.value = { visible: true, x, y, target: entry || null }
}

function hideContextMenu() {
  ctxMenu.value.visible = false
}

// Close menu on click outside
function handleGlobalClick() {
  hideContextMenu()
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
  document.addEventListener('contextmenu', handleGlobalClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
  document.removeEventListener('contextmenu', handleGlobalClick)
})

// ── Keyboard shortcuts ──
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Delete') {
    const selected = props.entries.filter(ep => props.selectedPaths.has(ep.path))
    if (selected.length > 0) emit('delete', selected)
  }
  if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    emit('selectAll')
  }
  if (e.key === 'Escape') {
    emit('clearSelection')
    hideContextMenu()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

// ── Column widths ──
const colWidths = ref({ select: 40, icon: 36, name: 1, size: 80, date: 130, actions: 100 })

// ── Drag to resize columns ──
const resizing = ref<{ col: string; startX: number; startW: number } | null>(null)

function startResize(e: MouseEvent, col: string) {
  e.preventDefault()
  resizing.value = { col, startX: e.clientX, startW: (colWidths.value as any)[col] }
}

function onMouseMove(e: MouseEvent) {
  if (!resizing.value) return
  const diff = e.clientX - resizing.value.startX
  const col = resizing.value.col as keyof typeof colWidths.value
  if (col === 'name') return // name is flex, don't resize
  ;(colWidths.value as any)[col] = Math.max(40, resizing.value.startW + diff)
}

function onMouseUp() {
  resizing.value = null
}

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})
</script>

<template>
  <div class="disk-list" @contextmenu="onContextMenu($event)">
    <!-- Header -->
    <div class="disk-header">
      <div class="disk-cell" :style="{ width: colWidths.select + 'px', flex: 'none' }">
        <input
          type="checkbox"
          :checked="selectedPaths.size === entries.length && entries.length > 0"
          @change="selectedPaths.size === entries.length ? emit('clearSelection') : emit('selectAll')"
        />
      </div>
      <div class="disk-cell" :style="{ width: colWidths.icon + 'px', flex: 'none' }"></div>
      <div class="disk-cell disk-cell-name" style="flex:1">
        名称
        <div class="disk-col-grip" @mousedown="startResize($event, 'name')"></div>
      </div>
      <div class="disk-cell" :style="{ width: colWidths.size + 'px', flex: 'none' }">
        大小
        <div class="disk-col-grip" @mousedown="startResize($event, 'size')"></div>
      </div>
      <div class="disk-cell" :style="{ width: colWidths.date + 'px', flex: 'none' }">
        修改时间
        <div class="disk-col-grip" @mousedown="startResize($event, 'date')"></div>
      </div>
      <div class="disk-cell" :style="{ width: colWidths.actions + 'px', flex: 'none' }">操作</div>
    </div>

    <!-- Rows -->
    <div class="disk-body">
      <div
        v-for="entry in entries"
        :key="entry.path"
        class="disk-row"
        :class="{ selected: selectedPaths.has(entry.path) }"
        @click="emit('select', entry.path)"
        @dblclick="emit('open', entry)"
        @contextmenu.stop="onContextMenu($event, entry)"
      >
        <div class="disk-cell" :style="{ width: colWidths.select + 'px', flex: 'none' }">
          <input
            type="checkbox"
            :checked="selectedPaths.has(entry.path)"
            @click.stop="emit('select', entry.path)"
          />
        </div>
        <div class="disk-cell" :style="{ width: colWidths.icon + 'px', flex: 'none' }">
          {{ getFileIcon(entry) }}
        </div>
        <div class="disk-cell disk-cell-name" style="flex:1" :title="entry.name">
          <span class="disk-name" @click="emit('open', entry)">{{ entry.name }}</span>
        </div>
        <div class="disk-cell" :style="{ width: colWidths.size + 'px', flex: 'none' }">
          {{ entry.is_dir ? '文件夹' : formatSize(entry.size) }}
        </div>
        <div class="disk-cell" :style="{ width: colWidths.date + 'px', flex: 'none' }">
          {{ formatDate(entry.modified) }}
        </div>
        <div class="disk-cell" :style="{ width: colWidths.actions + 'px', flex: 'none' }">
          <div class="disk-actions">
            <button class="disk-action-btn" @click.stop="emit('rename', entry)" title="重命名">✏️</button>
            <button v-if="!entry.is_dir" class="disk-action-btn" @click.stop="emit('download', entry)" title="下载">⬇️</button>
            <button class="disk-action-btn disk-action-danger" @click.stop="emit('delete', [entry])" title="删除">🗑️</button>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="entries.length === 0 && !loading" class="disk-empty">
        <div style="font-size:48px;margin-bottom:12px;">📂</div>
        <div>此文件夹为空</div>
      </div>
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.visible"
        class="disk-ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
        @click.stop
      >
        <!-- File/Folder specific actions -->
        <template v-if="ctxMenu.target">
          <div v-if="ctxMenu.target.is_dir" class="disk-ctx-item" @click="emit('open', ctxMenu.target!); hideContextMenu()">
            📂 打开
          </div>
          <div v-if="!ctxMenu.target.is_dir && canPreview(ctxMenu.target)" class="disk-ctx-item" @click="emit('preview', ctxMenu.target!); hideContextMenu()">
            👁 预览
          </div>
          <div v-if="!ctxMenu.target.is_dir" class="disk-ctx-item" @click="emit('download', ctxMenu.target!); hideContextMenu()">
            ⬇ 下载
          </div>
          <div class="disk-ctx-separator"></div>
          <div class="disk-ctx-item" @click="emit('rename', ctxMenu.target!); hideContextMenu()">
            ✏️ 重命名
          </div>
          <div class="disk-ctx-item" @click="emit('move', [ctxMenu.target!]); hideContextMenu()">
            📁 移动到...
          </div>
          <div class="disk-ctx-separator"></div>
          <div class="disk-ctx-item" @click="emit('select', ctxMenu.target!.path); hideContextMenu()">
            ☑ 选中
          </div>
        </template>

        <!-- Common actions -->
        <div class="disk-ctx-item" @click="emit('selectAll'); hideContextMenu()">
          ☑ 全选
        </div>
        <div class="disk-ctx-separator"></div>
        <div class="disk-ctx-item" @click="emit('refresh'); hideContextMenu()">
          🔄 刷新
        </div>
        <div class="disk-ctx-item" @click="emit('newFolder'); hideContextMenu()">
          📁 新建文件夹
        </div>
        <div class="disk-ctx-item" @click="emit('upload'); hideContextMenu()">
          📤 上传文件
        </div>

        <!-- Delete (only when target selected) -->
        <template v-if="ctxMenu.target">
          <div class="disk-ctx-separator"></div>
          <div class="disk-ctx-item disk-ctx-danger" @click="emit('delete', [ctxMenu.target!]); hideContextMenu()">
            🗑 删除
          </div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.disk-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-1);
}

.disk-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--hairline);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  user-select: none;
}

.disk-body {
  flex: 1;
  overflow-y: auto;
  max-height: calc(100vh - 280px);
}

.disk-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--hairline);
  cursor: pointer;
  transition: background 0.1s;
}

.disk-row:hover {
  background: var(--surface-2);
}

.disk-row.selected {
  background: var(--accent-bg);
}

.disk-cell {
  padding: 0 4px;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
}

.disk-cell-name {
  display: flex;
  align-items: center;
  gap: 6px;
}

.disk-name {
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.disk-name:hover {
  color: var(--accent);
}

.disk-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.disk-row:hover .disk-actions {
  opacity: 1;
}

.disk-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1;
  transition: background 0.1s;
}

.disk-action-btn:hover {
  background: var(--surface-3);
}

.disk-action-danger:hover {
  background: var(--error-bg);
}

.disk-col-grip {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 1;
}

.disk-col-grip:hover {
  background: var(--accent);
}

.disk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--text-muted);
  font-size: 14px;
}

/* Context Menu */
.disk-ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 180px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  padding: 4px;
  backdrop-filter: blur(12px);
}

.disk-ctx-item {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.disk-ctx-item:hover {
  background: var(--surface-2);
}

.disk-ctx-danger {
  color: var(--error-color);
}

.disk-ctx-danger:hover {
  background: var(--error-bg);
}

.disk-ctx-separator {
  height: 1px;
  background: var(--hairline);
  margin: 4px 8px;
}

/* Checkbox styling */
input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--accent);
}
</style>
