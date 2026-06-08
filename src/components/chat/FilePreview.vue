<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NButton } from 'naive-ui'
import { FileText, Download, X } from '@lucide/vue'
import type { UploadedFileInfo } from '@/types'

const props = defineProps<{
  file: UploadedFileInfo | null
  show: boolean
}>()
const emit = defineEmits<{ 'update:show': [boolean] }>()

const textContent = ref('')
const loadingText = ref(false)

// Get auth token from localStorage for authenticated file access
function getAuthUrl(url: string): string {
  try {
    const user = JSON.parse(localStorage.getItem('ourclass_user') || '{}')
    if (user.token) {
      const sep = url.includes('?') ? '&' : '?'
      return `${url}${sep}token=${encodeURIComponent(user.token)}`
    }
  } catch {}
  return url
}

const isImage = (f: UploadedFileInfo) => f.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(f.name)
const isPdf = (f: UploadedFileInfo) => f.mime_type === 'application/pdf' || f.name.endsWith('.pdf')
const isText = (f: UploadedFileInfo) => /\.(txt|csv|md|json|xml|yaml|yml|log|js|ts|py|html|css|sql|sh|env)$/i.test(f.name)

async function loadText(url: string) {
  loadingText.value = true
  try {
    const res = await fetch(getAuthUrl(url))
    textContent.value = await res.text()
  } catch {
    textContent.value = '无法加载文件内容'
  }
  loadingText.value = false
}

watch(() => props.show, (v) => {
  if (v && props.file && isText(props.file)) {
    loadText(props.file.url)
  }
  if (!v) textContent.value = ''
})
</script>

<template>
  <NModal
    :show="show"
    @update:show="(v: boolean) => emit('update:show', v)"
    preset="card"
    :title="file?.name || '文件预览'"
    style="width: 800px; max-width: 92vw; height: 80vh; display: flex; flex-direction: column;"
    :mask-closable="true"
    :segmented="{ content: true }"
    header-style="font-size:16px;font-weight:600"
    content-style="flex: 1; overflow: auto; padding: 0; display: flex;"
  >
    <template v-if="file">
      <!-- Image -->
      <div v-if="isImage(file)" class="preview-img-wrap">
        <img :src="getAuthUrl(file.url)" :alt="file.name" class="preview-img" />
      </div>

      <!-- PDF -->
      <iframe v-else-if="isPdf(file)" :src="getAuthUrl(file.url)" class="preview-pdf" />

      <!-- Text -->
      <div v-else-if="isText(file)" class="preview-text-wrap">
        <div v-if="loadingText" class="preview-loading">加载中...</div>
        <pre v-else class="preview-text">{{ textContent }}</pre>
      </div>

      <!-- Other -->
      <div v-else class="preview-other">
        <FileText :size="48" class="preview-other-icon" />
        <div class="preview-other-name">{{ file.name }}</div>
        <div class="preview-other-size">{{ (file.size / 1024).toFixed(1) }} KB</div>
        <div class="preview-other-type">{{ file.mime_type || '未知类型' }}</div>
        <a :href="getAuthUrl(file.url)" download :target="'_blank'" class="preview-download-link">
          <NButton type="primary" size="small">
            <template #icon><Download :size="14" /></template>
            下载文件
          </NButton>
        </a>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.preview-img-wrap {
  display: flex; align-items: center; justify-content: center;
  width: 100%; padding: 16px; overflow: auto;
}
.preview-img {
  max-width: 100%; max-height: 60vh; object-fit: contain;
  border-radius: 4px;
}
.preview-pdf {
  width: 100%; height: 100%; border: none;
}
.preview-text-wrap {
  width: 100%; padding: 16px; overflow: auto;
}
.preview-loading {
  color: var(--text-muted); text-align: center; padding: 40px;
}
.preview-text {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px; line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap; word-break: break-all;
  margin: 0;
}
.preview-other {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; width: 100%; gap: 8px; padding: 40px;
}
.preview-other-icon { color: var(--text-muted); }
.preview-other-name { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.preview-other-size { font-size: 13px; color: var(--text-muted); }
.preview-other-type { font-size: 12px; color: var(--text-muted); }
.preview-download-link { text-decoration: none; margin-top: 12px; }
</style>
