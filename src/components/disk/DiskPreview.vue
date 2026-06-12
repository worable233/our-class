<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NSpin, NButton } from 'naive-ui'
import { Download, X } from '@lucide/vue'
import { BASE } from '@/api/client'
import type { DiskEntry } from '@/composables/useDisk'

const props = defineProps<{
  entry: DiskEntry | null
  formatSize: (bytes: number) => string
}>()

const emit = defineEmits<{
  close: []
  download: [entry: DiskEntry]
}>()

const loading = ref(false)
const textContent = ref('')
const imageSrc = ref('')
const error = ref('')

const visible = ref(false)

watch(() => props.entry, async (entry) => {
  if (!entry) {
    visible.value = false
    return
  }
  visible.value = true
  loading.value = true
  error.value = ''
  textContent.value = ''
  imageSrc.value = ''

  const ext = entry.ext || entry.name.split('.').pop()?.toLowerCase() || ''
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp']
  const textExts = ['txt', 'md', 'json', 'js', 'ts', 'py', 'html', 'css', 'sql', 'log', 'csv', 'xml', 'yaml', 'yml']

  try {
    if (imageExts.includes(ext)) {
      const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
      const resp = await fetch(`${BASE}/storage/download?path=${encodeURIComponent(entry.path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error('加载失败')
      const blob = await resp.blob()
      imageSrc.value = URL.createObjectURL(blob)
    } else if (textExts.includes(ext)) {
      const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
      const resp = await fetch(`${BASE}/storage/download?path=${encodeURIComponent(entry.path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error('加载失败')
      const text = await resp.text()
      // Limit to 100KB to prevent memory issues
      textContent.value = text.length > 100000 ? text.slice(0, 100000) + '\n\n...（文件过大，仅显示前 100KB）' : text
    } else if (ext === 'pdf') {
      // PDF: show download prompt
      error.value = 'pdf'
    } else {
      error.value = 'unsupported'
    }
  } catch (e: any) {
    error.value = e.message || '预览失败'
  } finally {
    loading.value = false
  }
})

function onClose() {
  if (imageSrc.value) URL.revokeObjectURL(imageSrc.value)
  visible.value = false
  emit('close')
}
</script>

<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :title="entry?.name || '预览'"
    style="width: 80vw; max-width: 900px; max-height: 85vh;"
    :mask-closable="true"
    @after-leave="onClose"
  >
    <template #header-extra>
      <n-button quaternary size="small" @click="emit('download', entry!)" title="下载">
        <template #icon><Download :size="16" /></template>
      </n-button>
    </template>

    <div class="preview-content">
      <n-spin :show="loading">
        <!-- Image preview -->
        <img v-if="imageSrc" :src="imageSrc" class="preview-image" />

        <!-- Text preview -->
        <pre v-else-if="textContent" class="preview-text">{{ textContent }}</pre>

        <!-- PDF -->
        <div v-else-if="error === 'pdf'" class="preview-info">
          <div style="font-size:48px;margin-bottom:16px;">📄</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:8px;">{{ entry?.name }}</div>
          <div style="color:var(--text-muted);margin-bottom:16px;">{{ formatSize(entry?.size || 0) }}</div>
          <n-button type="primary" @click="emit('download', entry!)" round>
            <template #icon><Download :size="16" /></template>
            下载 PDF
          </n-button>
        </div>

        <!-- Unsupported -->
        <div v-else-if="error === 'unsupported'" class="preview-info">
          <div style="font-size:48px;margin-bottom:16px;">📄</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:8px;">{{ entry?.name }}</div>
          <div style="color:var(--text-muted);margin-bottom:16px;">{{ formatSize(entry?.size || 0) }}</div>
          <div style="color:var(--text-muted);">暂不支持在线预览此文件类型</div>
        </div>

        <!-- Error -->
        <div v-else-if="error && error !== 'pdf' && error !== 'unsupported'" class="preview-info">
          <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
          <div style="color:var(--error-color);">{{ error }}</div>
        </div>
      </n-spin>
    </div>
  </n-modal>
</template>

<style scoped>
.preview-content {
  min-height: 200px;
  max-height: calc(85vh - 120px);
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image {
  max-width: 100%;
  max-height: calc(85vh - 140px);
  object-fit: contain;
  border-radius: 4px;
}

.preview-text {
  width: 100%;
  padding: 16px;
  background: var(--surface-2);
  border-radius: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  max-height: calc(85vh - 140px);
}

.preview-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  text-align: center;
}
</style>
