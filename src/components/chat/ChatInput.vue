<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { Square, X, FileText, FileSpreadsheet, FileImage, File, Presentation } from '@lucide/vue'
import { NTooltip } from 'naive-ui'

interface FileAttachments {
  ids: number[]
  items: Array<{ id: number; name: string; url: string }>
}

const emit = defineEmits<{
  send: [content: string, deepThink: boolean, webSearch: boolean, files?: FileAttachments]
  stop: []
  login: []
  'update:deepThink': [value: boolean]
  'update:webSearch': [value: boolean]
  'conversation-created': [id: number]
}>()

const props = defineProps<{
  loading?: boolean
  disabled?: boolean
  enableDeepThink?: boolean
  enableFileUpload?: boolean
  convId?: number | null
  deepThink?: boolean
  webSearch?: boolean
}>()

const auth = useAuthStore()
const input = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingSend = ref(false)

watch(() => props.loading, (loading, prev) => {
  if (loading && !prev) {
    input.value = ''
    pendingSend.value = false
    attachments.value = []
    nextTick(autoResize)
  }
})

// ── File upload state ─────────────────────────────────────────────────────
interface Attachment {
  id: string
  file: File
  url: string          // blob URL for preview
  name: string
  uploading: boolean
  uploaded: boolean
  uploadId?: number
  serverUrl?: string   // 上传后的真实服务端 URL
  error?: string
  progress: number      // 0-100
}

const attachments = ref<Attachment[]>([])
const allUploaded = computed(() => attachments.value.length === 0 || attachments.value.every(a => a.uploaded || a.error))

function pickFiles() {
  fileInputRef.value?.click()
}

async function onFileChange(e: Event) {
  const inputEl = e.target as HTMLInputElement
  const files = inputEl.files
  if (!files?.length) return
  for (const file of Array.from(files)) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const att: Attachment = {
      id,
      file,
      url: URL.createObjectURL(file),
      name: file.name,
      uploading: true,
      uploaded: false,
      progress: 0,
    }
    attachments.value.push(att)
    // Start upload
    uploadFile(att).catch(() => {})
  }
  inputEl.value = ''
}

function uploadFile(att: Attachment) {
  const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''

  const formData = new FormData()
  formData.append('file', att.file)
  if (props.convId) formData.append('conversation_id', String(props.convId))

  const xhr = new XMLHttpRequest()

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      att.progress = Math.round((e.loaded / e.total) * 100)
    }
  }

  xhr.onload = () => {
    try {
      const body = JSON.parse(xhr.responseText)
      if (xhr.status >= 200 && xhr.status < 300 && body.success) {
        att.uploading = false
        att.uploaded = true
        att.progress = 100
        att.uploadId = body.data.id
        att.serverUrl = body.data.url
        if (body.data.conversation_id && body.data.conversation_id !== props.convId) {
          emit('conversation-created', body.data.conversation_id)
        }
      } else {
        throw new Error(body.error?.message || '上传失败')
      }
    } catch (e: any) {
      att.uploading = false
      att.error = e.message || '上传失败'
    }
  }

  xhr.onerror = () => {
    att.uploading = false
    att.error = '网络错误，上传失败'
  }

  xhr.onabort = () => {
    att.uploading = false
    att.error = '上传已取消'
  }

  xhr.open('POST', '/api/chat/upload')
  xhr.setRequestHeader('Authorization', `Bearer ${token}`)
  xhr.send(formData)
}

function removeAttachment(id: string) {
  const att = attachments.value.find(a => a.id === id)
  if (att) {
    URL.revokeObjectURL(att.url)
    // Delete from server if already uploaded
    if (att.uploadId) {
      const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
      fetch(`/api/chat/upload/${att.uploadId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
  }
  attachments.value = attachments.value.filter(a => a.id !== id)
}

// ── File type icons ───────────────────────────────────────────────────────
function isImage(file: File) { return file.type.startsWith('image/') }
function fileIcon(file: File) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.doc') || name.endsWith('.docx')) return FileText
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) return FileSpreadsheet
  if (name.endsWith('.ppt') || name.endsWith('.pptx')) return Presentation
  if (name.endsWith('.pdf')) return File
  if (name.endsWith('.csv') || name.endsWith('.txt')) return FileText
  return FileImage
}
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ── Input handling ────────────────────────────────────────────────────────
function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.max(30, Math.min(el.scrollHeight, 300)) + 'px'
}

function handleSend() {
  if (props.loading) { emit('stop'); return }
  if (props.disabled) return
  if (!auth.isLoggedIn) { emit('login'); return }
  const c = input.value.trim()
  if (!c) return
  if (!allUploaded.value) return // wait for uploads

  const fileIds = attachments.value.filter(a => a.uploadId).map(a => a.uploadId!);
  const dt = props.deepThink ?? false;
  const ws = props.webSearch ?? false;

  pendingSend.value = true
  const fileAttachments = fileIds.length > 0 ? { ids: fileIds, items: attachments.value.filter(a => a.uploadId).map(a => ({ id: a.uploadId!, name: a.name, url: a.serverUrl || '' })) } : undefined
  emit('send', c, dt, ws, fileAttachments)
}

function onInput() { autoResize() }
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
  nextTick(autoResize)
}

watch(input, () => { nextTick(autoResize) })

/** 外部拖拽添加文件（一次一个） */
function addExternalFile(file: File) {
  // 清除已有附件
  const token2 = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
  for (const att of attachments.value) {
    URL.revokeObjectURL(att.url)
    if (att.uploadId) {
      fetch(`/api/chat/upload/${att.uploadId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token2}` } }).catch(() => {})
    }
  }
  attachments.value = []
  // 添加新文件
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const att: Attachment = {
    id, file,
    url: URL.createObjectURL(file),
    name: file.name,
    uploading: true,
    uploaded: false,
    progress: 0,
  }
  attachments.value.push(att)
  uploadFile(att).catch(() => {})
}

defineExpose({ input, addExternalFile })
</script>

<template>
  <div class="input-section">
    <!-- Photo wall -->
    <div v-if="attachments.length" class="photo-wall">
      <div
        v-for="att in attachments"
        :key="att.id"
        class="photo-item"
        :class="{ 'is-doc': !isImage(att.file), uploading: att.uploading && att.progress < 100, error: att.error }"
        :title="att.name"
      >
        <!-- 上传中：白底 + 进度条 -->
        <template v-if="att.uploading && att.progress < 100">
          <div class="upload-progress-bg">
            <div class="upload-progress-bar-track">
              <div class="upload-progress-bar-fill" :style="{ width: att.progress + '%' }" />
            </div>
            <span class="upload-progress-text">{{ att.progress }}%</span>
            <span class="upload-progress-name">{{ att.name }}</span>
          </div>
        </template>
        <!-- 上传完成：显示预览 -->
        <template v-else>
          <template v-if="isImage(att.file)">
            <img :src="att.url" :alt="att.name" class="photo-thumb" />
          </template>
          <template v-else>
            <div class="doc-icon-wrap">
              <component :is="fileIcon(att.file)" :size="24" stroke-width="1.5" />
            </div>
            <div class="doc-info">
              <span class="doc-name">{{ att.name }}</span>
              <span class="doc-size">{{ formatSize(att.file.size) }}</span>
            </div>
          </template>
        </template>
        <!-- Error overlay -->
        <div v-if="att.error" class="photo-error">
          <span class="photo-error-text">{{ att.error }}</span>
        </div>
        <!-- Delete overlay (only when uploaded) -->
        <div v-else-if="att.uploaded && !att.uploading" class="photo-overlay" @click="removeAttachment(att.id)">
          <X :size="14" />
        </div>
      </div>
      <label class="photo-add" @click="pickFiles">
        <span class="photo-add-icon">+</span>
      </label>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept="*/*"
      style="display: none"
      @change="onFileChange"
    />

    <div class="input-wrapper">
      <textarea
        ref="textareaRef"
        v-model="input"
        rows="1"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        :disabled="loading || disabled"
        class="input-area"
        @input="onInput"
        @keydown="onKeydown"
      />
      <div class="input-bottom">
        <div class="input-bottom-left">
          <NTooltip v-if="enableDeepThink" trigger="hover" placement="top">
            <template #trigger>
              <button
                class="toolbar-btn mode-btn"
                :class="{ active: deepThink }"
                @click="$emit('update:deepThink', !deepThink)"
              >
                深度思考
              </button>
            </template>
            深度思考模式（Anthropic 下无法使用工具）
          </NTooltip>
          <NTooltip v-if="true" trigger="hover" placement="top">
            <template #trigger>
              <button
                class="toolbar-btn mode-btn"
                :class="{ active: webSearch }"
                @click="$emit('update:webSearch', !webSearch)"
              >
                联网搜索
              </button>
            </template>
            联网搜索实时信息
          </NTooltip>
        </div>
        <div class="input-bottom-right">
          <NTooltip v-if="enableFileUpload && auth.isLoggedIn" trigger="hover" placement="top">
            <template #trigger>
              <button class="toolbar-btn add-btn" @click="pickFiles">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            </template>
            上传文件
          </NTooltip>
          <NTooltip trigger="hover" placement="top">
            <template #trigger>
              <button
                class="send-btn"
                :class="{ on: input.trim() && !loading && allUploaded, stop: loading }"
                :disabled="(!input.trim() && !loading) || !allUploaded"
                @click="handleSend"
              >
                <svg v-if="!loading" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                <Square v-else :size="14" :fill="'currentColor'" />
              </button>
            </template>
            {{ !allUploaded ? '文件上传中...' : '发送' }}
          </NTooltip>
        </div>
      </div>
    </div>
    <p class="hint">AI 生成内容仅供参考，请核实重要信息</p>
  </div>
</template>

<style scoped>
.input-section {
  padding: 0 24px 12px 24px;
  background: var(--ground);
}
.input-wrapper {
  max-width: 768px;
  margin: 0 auto;
  position: relative;
  background: var(--surface-1);
  border-radius: var(--radius-xl);
  padding: 10px 14px 8px;
  box-shadow: var(--shadow-input);
  transition: box-shadow .2s, background .2s;
}
.input-wrapper::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  border: 1px solid var(--hairline);
  transition: border-color .2s, box-shadow .2s;
}
html.dark .input-wrapper::before { border-color: rgba(255,255,255,0.06); }
.input-wrapper:hover::before { border-color: var(--hairline-strong); }
.input-wrapper:focus-within { background: var(--surface-1); }
.input-wrapper:focus-within::before {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}
html:not(.dark) .input-wrapper:focus-within::before {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.input-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  gap: 6px;
  padding-top: 6px;
}
.input-bottom-left { display: flex; align-items: center; gap: 6px; }
.input-bottom-right { display: flex; align-items: center; gap: 6px; }
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: all .12s;
  line-height: 1;
  white-space: nowrap;
}
.toolbar-btn { transition: background .15s, color .15s; }
.toolbar-btn:hover { background: var(--surface-2); color: var(--text-secondary); }
.toolbar-btn:active { transform: scale(0.92); }
.toolbar-btn.active { color: var(--accent-text); background: var(--accent-glow); }
.toolbar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mode-btn {
  border: 1px solid var(--hairline);
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 12px;
}
.mode-btn.active { border-color: var(--accent); }
.mode-btn:active { transform: scale(0.96); }

.input-area {
  display: block;
  width: 100%;
  box-sizing: border-box;
  resize: none;
  overflow-y: auto;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  font-family: inherit;
  padding: 4px 2px;
  min-height: 40px;
  max-height: 200px;
  margin: 0;
}
.input-area::placeholder { color: var(--text-disabled); font-size: 14px; }
html.dark .input-area::placeholder { color: rgba(255,255,255,0.25); }

.input-area::-webkit-scrollbar { width: 4px; }
.input-area::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 2px; }

.send-btn {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all .15s;
  background: var(--surface-3);
  color: var(--text-muted);
}
.send-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--text-secondary); }
.send-btn:active:not(:disabled) { transform: scale(0.92); }
.send-btn.on { background: rgba(0,0,0,0.85); color: #fff; }
html.dark .send-btn.on { background: #fff; color: #1d1d1d; }
.send-btn.on:hover:not(:disabled) { opacity: 0.85; }
.send-btn.on:active:not(:disabled) { transform: scale(0.92); }
.send-btn.stop { background: var(--surface-2); color: var(--text-secondary); }
.send-btn.stop:hover:not(:disabled) { background: var(--surface-3); color: var(--text-primary); }
.send-btn.stop:active:not(:disabled) { transform: scale(0.92); }

.photo-wall {
  max-width: 768px;
  margin: 0 auto 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}
.photo-item {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--hairline);
  flex-shrink: 0;
}
.photo-item.is-doc {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: var(--surface-2);
}
.photo-item.error { border-color: #e74c3c; }
.doc-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  width: 28px;
  height: 28px;
}
.doc-info { display: flex; flex-direction: column; align-items: center; gap: 1px; max-width: 60px; }
.doc-name {
  font-size: 9px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
  max-width: 100%;
}
.doc-size { font-size: 8px; color: var(--text-muted); line-height: 1; }
.photo-thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
.photo-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,.45);
  color: #fff;
  opacity: 0;
  cursor: pointer;
  transition: opacity .15s;
}
.photo-item:hover .photo-overlay { opacity: 1; }
.upload-progress-bg {
  width: 100%;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border-radius: 8px;
}
.upload-progress-bar-track {
  width: 100%;
  height: 6px;
  background: #eee;
  border-radius: 3px;
  overflow: hidden;
}
.upload-progress-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width .2s ease;
}
.upload-progress-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  line-height: 1;
}
.upload-progress-name {
  font-size: 9px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  line-height: 1;
}
.photo-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,.6);
  color: #e74c3c;
  font-size: 9px;
  padding: 2px;
  text-align: center;
}
.photo-add {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  border: 1px dashed var(--hairline-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .15s;
  flex-shrink: 0;
}
.photo-add:hover { border-color: var(--accent); background: var(--accent-glow); }
.photo-add-icon { font-size: 22px; color: var(--text-muted); line-height: 1; }
.photo-add:hover .photo-add-icon { color: var(--accent-text); }

.hint {
  text-align: center;
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 8px;
  margin-bottom: 0;
  letter-spacing: 0.01em;
}

@media (max-width: 768px) {
  .input-section { padding: 0 12px 10px 12px; }
  .input-wrapper { max-width: 100%; }
}
</style>
