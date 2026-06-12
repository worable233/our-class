<script setup lang="ts">
import { NButton, NInput } from 'naive-ui'
import { ArrowLeft, ArrowRight, ArrowUp, Home, RefreshCw, Plus, Upload, Search } from '@lucide/vue'

defineProps<{
  breadcrumbs: { name: string; path: string }[]
  searchQuery: string
  canGoBack: boolean
  canGoForward: boolean
  selectedCount: number
}>()

const emit = defineEmits<{
  navigate: [path: string]
  goBack: []
  goForward: []
  goUp: []
  goHome: []
  refresh: []
  newFolder: []
  upload: []
  search: [query: string]
  batchDownload: []
  batchRename: []
  move: []
  batchDelete: []
  clearSelection: []
}>()
</script>

<template>
  <div class="disk-toolbar">
    <!-- Navigation buttons -->
    <div class="disk-toolbar-nav">
      <n-button quaternary size="small" :disabled="!canGoBack" @click="emit('goBack')" title="后退">
        <template #icon><ArrowLeft :size="16" /></template>
      </n-button>
      <n-button quaternary size="small" :disabled="!canGoForward" @click="emit('goForward')" title="前进">
        <template #icon><ArrowRight :size="16" /></template>
      </n-button>
      <n-button quaternary size="small" @click="emit('goUp')" title="上级目录">
        <template #icon><ArrowUp :size="16" /></template>
      </n-button>
      <n-button quaternary size="small" @click="emit('goHome')" title="根目录">
        <template #icon><Home :size="16" /></template>
      </n-button>
    </div>

    <!-- Breadcrumb -->
    <div class="disk-toolbar-breadcrumb">
      <span
        v-for="(crumb, i) in breadcrumbs"
        :key="crumb.path"
        class="disk-breadcrumb-item"
        @click="emit('navigate', crumb.path)"
      >
        <span v-if="i > 0" class="disk-breadcrumb-sep">/</span>
        {{ crumb.name }}
      </span>
    </div>

    <!-- Search -->
    <n-input
      :value="searchQuery"
      @update:value="emit('search', $event)"
      placeholder="搜索..."
      size="small"
      clearable
      style="width: 160px;"
    >
      <template #prefix><Search :size="14" /></template>
    </n-input>

    <!-- Action buttons -->
    <div class="disk-toolbar-actions">
      <n-button quaternary size="small" @click="emit('refresh')" title="刷新">
        <template #icon><RefreshCw :size="14" /></template>
      </n-button>
      <n-button quaternary size="small" @click="emit('newFolder')" title="新建文件夹">
        <template #icon><Plus :size="14" /></template>
        新建
      </n-button>
      <n-button type="primary" size="small" @click="emit('upload')" round>
        <template #icon><Upload :size="14" /></template>
        上传
      </n-button>
    </div>
  </div>

  <!-- Batch operation bar -->
  <div v-if="selectedCount > 0" class="disk-batch-bar">
    <span class="disk-batch-count">已选 {{ selectedCount }} 项</span>
    <n-button size="tiny" quaternary @click="emit('batchDownload')">⬇ 下载</n-button>
    <n-button size="tiny" quaternary @click="emit('batchRename')">✏️ 重命名</n-button>
    <n-button size="tiny" quaternary @click="emit('move')">📁 移动</n-button>
    <n-button size="tiny" quaternary type="error" @click="emit('batchDelete')">🗑 删除</n-button>
    <n-button size="tiny" quaternary @click="emit('clearSelection')">取消</n-button>
  </div>
</template>

<style scoped>
.disk-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 8px;
  flex-wrap: wrap;
}

.disk-toolbar-nav {
  display: flex;
  gap: 2px;
}

.disk-toolbar-breadcrumb {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 13px;
}

.disk-breadcrumb-item {
  cursor: pointer;
  color: var(--text-muted);
  transition: color 0.1s;
}

.disk-breadcrumb-item:hover {
  color: var(--accent);
}

.disk-breadcrumb-item:last-child {
  color: var(--text-primary);
  font-weight: 500;
}

.disk-breadcrumb-sep {
  color: var(--text-muted);
  margin: 0 2px;
}

.disk-toolbar-actions {
  display: flex;
  gap: 4px;
}

.disk-batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--accent-bg);
  border: 1px solid var(--accent);
  border-radius: 8px;
  font-size: 13px;
}

.disk-batch-count {
  font-weight: 600;
  color: var(--accent);
  margin-right: 4px;
}

@media (max-width: 768px) {
  .disk-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .disk-toolbar-breadcrumb {
    order: -1;
  }

  .disk-toolbar-actions {
    justify-content: flex-end;
  }
}
</style>
