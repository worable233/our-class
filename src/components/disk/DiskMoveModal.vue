<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NButton, NList, NListItem, NSpin, NSpace } from 'naive-ui'
import { Folder, ArrowLeft, Home } from '@lucide/vue'
import { api } from '@/api/client'
import type { DiskEntry } from '@/composables/useDisk'

const props = defineProps<{
  show: boolean
  entries: DiskEntry[]  // entries to move
}>()

const emit = defineEmits<{
  close: []
  move: [dest: string]
}>()

const currentPath = ref('')
const dirs = ref<{ name: string; path: string }[]>([])
const loading = ref(false)

watch(() => props.show, async (val) => {
  if (val) {
    currentPath.value = ''
    await loadDirs('')
  }
})

async function loadDirs(path: string) {
  loading.value = true
  try {
    const data = await api.get<{ path: string; entries: DiskEntry[] }>(
      `/storage/list?path=${encodeURIComponent(path)}`
    )
    currentPath.value = data.path || ''
    dirs.value = data.entries
      .filter(e => e.is_dir)
      .filter(e => !props.entries.some(p => p.path === e.path)) // Exclude source dirs
      .map(e => ({ name: e.name, path: e.path }))
  } catch {
    dirs.value = []
  } finally {
    loading.value = false
  }
}

function enterDir(path: string) {
  loadDirs(path)
}

function goUp() {
  const parts = currentPath.value.split('/').filter(Boolean)
  parts.pop()
  loadDirs(parts.join('/'))
}

function goHome() {
  loadDirs('')
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="移动到"
    style="width: 440px; max-height: 70vh;"
    :mask-closable="false"
    @update:show="!$event && emit('close')"
  >
    <div style="margin-bottom: 12px;">
      <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
        移动 {{ entries.length }} 项到：
      </div>
      <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: var(--surface-2); border-radius: 6px; font-size: 13px;">
        <n-button quaternary size="tiny" @click="goUp" :disabled="!currentPath">
          <template #icon><ArrowLeft :size="14" /></template>
        </n-button>
        <n-button quaternary size="tiny" @click="goHome">
          <template #icon><Home :size="14" /></template>
        </n-button>
        <span style="flex: 1; color: var(--text-primary); font-weight: 500;">
          {{ currentPath || '根目录' }}
        </span>
      </div>
    </div>

    <n-spin :show="loading" style="min-height: 150px;">
      <n-list v-if="dirs.length > 0" hoverable clickable style="max-height: 300px; overflow-y: auto;">
        <n-list-item v-for="dir in dirs" :key="dir.path" @click="enterDir(dir.path)">
          <div style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
            <Folder :size="18" style="color: var(--accent);" />
            <span style="font-size: 14px;">{{ dir.name }}</span>
          </div>
        </n-list-item>
      </n-list>
      <div v-else style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">
        {{ loading ? '加载中...' : '此目录下没有子文件夹' }}
      </div>
    </n-spin>

    <template #footer>
      <n-space justify="end">
        <n-button quaternary @click="emit('close')">取消</n-button>
        <n-button type="primary" @click="emit('move', currentPath)" round>
          移动到此处
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>
