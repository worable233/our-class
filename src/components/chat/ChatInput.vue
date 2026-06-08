<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { ArrowUp, Square, Paperclip, X, FileText, FileSpreadsheet, FileImage, File, Presentation, Loader2 } from '@lucide/vue'
import { NTooltip } from 'naive-ui'

const emit = defineEmits<{
  send: [content: string, deepThink: boolean, webSearch: boolean, fileIds?: number[]]
  stop: []
  login: []
  'update:deepThink': [value: boolean]
  'update:webSearch': [value: boolean]
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

// ── File upload state ─────────────────────────────────────────────────────
interface Attachment {
  id: string
  file: File
  url: string
  name: string
  uploading: boolean
  uploaded: boolean
  uploadId?: number
  error?: string
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
    }
    attachments.value.push(att)
    // Start upload
    uploadFile(att).catch(() => {})
  }
  inputEl.value = ''
}

async function uploadFile(att: Attachment) {
  const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
  const convId = props.convId

  if (!convId) {
    att.uploading = false
    att.error = '请先发送一条消息创建对话后再上传文件'
    return
  }

  const formData = new FormData()
  formData.append('file', att.file)
  formData.append('conversation_id', String(convId))

  try {
    const res = await fetch('/api/chat/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    const body = await res.json()
    if (!res.ok || body.success === false) {
      throw new Error(body.error?.message || '上传失败')
    }
    att.uploading = false
    att.uploaded = true
    att.uploadId = body.data.id
  } catch (e: any) {
    att.uploading = false
    att.error = e.message || '上传失败'
  }
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

  emit('send', c, dt, ws, fileIds.length > 0 ? fileIds : undefined)
  input.value = ''
  attachments.value = []
  nextTick(autoResize)
}

function onInput() { autoResize() }
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
  nextTick(autoResize)
}

watch(input, () => { nextTick(autoResize) })
</script>

<template>
  <div class="input-section">
    <!-- Photo wall -->
    <div v-if="attachments.length" class="photo-wall">
      <div
        v-for="att in attachments"
        :key="att.id"
        class="photo-item"
        :class="{ 'is-doc': !isImage(att.file), uploading: att.uploading, error: att.error }"
        :title="att.name"
      >
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
        <!-- Upload spinner / error -->
        <div v-if="att.uploading" class="photo-uploading">
          <Loader2 :size="18" class="spin" />
        </div>
        <div v-else-if="att.error" class="photo-error">
          <span class="photo-error-text">{{ att.error }}</span>
        </div>
        <div v-else class="photo-overlay" @click="removeAttachment(att.id)">
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
          <NTooltip v-if="enableFileUpload && auth.isLoggedIn" trigger="hover" placement="top">
            <template #trigger>
              <button class="toolbar-btn" @click="pickFiles" :disabled="!convId && attachments.length === 0">
                <Paperclip :size="15" />
              </button>
            </template>
            上传文件
          </NTooltip>
        </div>
        <div class="input-bottom-right">
          <NTooltip trigger="hover" placement="top">
            <template #trigger>
              <button
                class="send-btn"
                :class="{ on: input.trim() && !loading && allUploaded, stop: loading }"
                :disabled="(!input.trim() && !loading) || !allUploaded"
                @click="handleSend"
              >
                <ArrowUp v-if="!loading" :size="18" />
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
  padding: 0 16px 8px 16px;
  background: var(--ground);
}
.input-wrapper {
  max-width: 768px;
  margin: 0 auto;
  position: relative;
  background: var(--ground);
  border-radius: 6px;
  padding: 0 12px;
  transition: background-color .3s cubic-bezier(.4,0,.2,1);
}
.input-wrapper::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  border: 1px solid var(--hairline);
  transition: border-color .3s cubic-bezier(.4,0,.2,1), box-shadow .3s cubic-bezier(.4,0,.2,1);
}
html.dark .input-wrapper::before { border-color: transparent; }
.input-wrapper > * + * { margin-top: 4px; }
.input-wrapper:hover::before { border-color: #7C7FDC; }
html:not(.dark) .input-wrapper:hover::before { border-color: var(--hairline-strong); }
.input-wrapper:focus-within { background-color: rgba(94, 106, 210, 0.08); }
.input-wrapper:focus-within::before {
  border-color: #7C7FDC;
  box-shadow: 0 0 8px 0 rgba(94, 106, 210, 0.3);
}
html:not(.dark) .input-wrapper:focus-within::before {
  box-shadow: 0 0 0 2px rgba(94, 106, 210, 0.2);
}

.input-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  gap: 6px;
}
.input-bottom-left { display: flex; align-items: center; gap: 6px; }
.input-bottom-right { display: flex; align-items: center; gap: 2px; }
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  transition: all .12s;
  line-height: 1;
}
.toolbar-btn { transition: background .15s, color .15s; }
.toolbar-btn:hover { background: var(--surface-2); color: var(--text-secondary); }
.toolbar-btn:active { transform: scale(0.92); }
.toolbar-btn.active { color: var(--accent-text); background: var(--accent-glow); }
.toolbar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mode-btn {
  border: 1px solid var(--hairline);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
}
.mode-btn.active { border-color: var(--accent); }
.mode-btn:active { transform: scale(0.96); }

.input-area {
  display: block;
  width: 100%;
  box-sizing: border-box;
  resize: none;
  overflow-y: hidden;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  font-family: inherit;
  padding: 8px 0;
  max-height: 300px;
  margin: 0;
}
.input-area::placeholder { color: var(--text-muted); }

.send-btn {
  width: 32px; height: 32px;
  border-radius: 8px;
  border: none;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all .12s;
  background: var(--surface-3);
  color: var(--text-muted);
}
.send-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--text-secondary); }
.send-btn:active:not(:disabled) { transform: scale(0.92); }
.send-btn.on { background: var(--accent); color: #fff; }
.send-btn.on:hover:not(:disabled) { filter: brightness(1.15); }
.send-btn.on:active:not(:disabled) { filter: brightness(0.9); transform: scale(0.92); }
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
.photo-uploading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,.35);
  color: #fff;
}
.photo-uploading .spin { animation: tpSpin 1s linear infinite; }
@keyframes tpSpin { to { transform: rotate(360deg); } }
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
  margin-top: 6px;
  margin-bottom: 0;
}

@media (max-width: 768px) {
  .input-section { padding: 0 8px 8px 8px; }
  .input-wrapper { max-width: 100%; }
}
</style>
