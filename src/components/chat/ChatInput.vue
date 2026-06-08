<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { ArrowUp, Square, Paperclip, X, FileText, FileSpreadsheet, FileImage, File, Presentation } from '@lucide/vue'
import Tooltip from '@/components/Tooltip.vue'

const emit = defineEmits<{ send: [content: string]; stop: []; login: [] }>()
const props = defineProps<{ loading?: boolean; disabled?: boolean }>()
const auth = useAuthStore()
const input = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

interface Attachment {
  id: string
  file: File
  url: string
  name: string
}
const attachments = ref<Attachment[]>([])

function pickFiles() {
  fileInputRef.value?.click()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  for (const file of Array.from(files)) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    attachments.value.push({
      id,
      file,
      url: URL.createObjectURL(file),
      name: file.name,
    })
  }
  input.value = '' // reset so same file can be picked again
}

function removeAttachment(id: string) {
  const att = attachments.value.find(a => a.id === id)
  if (att) URL.revokeObjectURL(att.url)
  attachments.value = attachments.value.filter(a => a.id !== id)
}

const deepThink = ref(false)
const webSearch = ref(false)

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

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const h = el.scrollHeight
  if (h > 30) {
    el.style.height = h + 'px'
  } else {
    el.style.height = ''
  }
}

function handleSend() {
  if (props.loading) { emit('stop'); return }
  if (props.disabled) return
  if (!auth.isLoggedIn) { emit('login'); return }
  const c = input.value.trim()
  if (!c) return
  // Attach file info if any
  const fileInfo = attachments.value.length
    ? attachments.value.map(a => `[附件: ${a.name}]`).join(' ') + '\n'
    : ''
  emit('send', fileInfo + c)
  input.value = ''
  attachments.value = []
  nextTick(autoResize)
}

function onInput() {
  autoResize()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
  nextTick(autoResize)
}

watch(input, () => { nextTick(autoResize) })
</script>

<template>
  <div class="input-section">
    <!-- Photo wall: uploaded attachments -->
    <div v-if="attachments.length" class="photo-wall">
      <div
        v-for="att in attachments"
        :key="att.id"
        class="photo-item"
        :class="{ 'is-doc': !isImage(att.file) }"
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
        <div class="photo-overlay" @click="removeAttachment(att.id)">
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
      accept="image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.csv"
      style="display: none"
      @change="onFileChange"
    />

    <div class="input-wrapper">
      <textarea
        ref="textareaRef"
        v-model="input"
        rows="1"
        placeholder="输入消息，Shift+Enter 发送，Enter 换行"
        :disabled="loading || disabled"
        class="input-area"
        @input="onInput"
        @keydown="onKeydown"
      />
      <div class="input-bottom">
        <div class="input-bottom-left">
          <Tooltip text="深度思考模式">
            <button
              class="toolbar-btn mode-btn"
              :class="{ active: deepThink }"
              @click="deepThink = !deepThink"
            >
              深度思考
            </button>
          </Tooltip>
          <Tooltip text="联网搜索实时信息">
            <button
              class="toolbar-btn mode-btn"
              :class="{ active: webSearch }"
              @click="webSearch = !webSearch"
            >
              联网搜索
            </button>
          </Tooltip>
        </div>
        <div class="input-bottom-right">
          <Tooltip text="上传文件">
            <button class="toolbar-btn" @click="pickFiles">
              <Paperclip :size="15" />
            </button>
          </Tooltip>
          <Tooltip text="发送">
            <button
              class="send-btn"
              :class="{ on: input.trim() && !loading, stop: loading }"
              :disabled="!input.trim() && !loading"
              @click="handleSend"
            >
              <ArrowUp v-if="!loading" :size="18" />
              <Square v-else :size="14" :fill="'currentColor'" />
            </button>
          </Tooltip>
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
  transition: border-color .3s cubic-bezier(.4,0,.2,1),
              box-shadow .3s cubic-bezier(.4,0,.2,1);
}
html.dark .input-wrapper::before {
  border-color: transparent;
}
.input-wrapper > * + * {
  margin-top: 4px;
}
.input-wrapper:hover::before {
  border-color: #7C7FDC;
}
html:not(.dark) .input-wrapper:hover::before {
  border-color: var(--hairline-strong);
}
.input-wrapper:focus-within {
  background-color: rgba(94, 106, 210, 0.08);
}
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
.input-bottom-left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.input-bottom-right {
  display: flex;
  align-items: center;
  gap: 2px;
}
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
.toolbar-btn {
  transition: background .15s, color .15s;
}
.toolbar-btn:hover {
  background: var(--surface-2);
  color: var(--text-secondary);
}
.toolbar-btn:active {
  transform: scale(0.92);
}
.toolbar-btn.active {
  color: var(--accent-text);
  background: var(--accent-glow);
}
.mode-btn {
  border: 1px solid var(--hairline);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
}
.mode-btn.active {
  border-color: var(--accent);
}
.mode-btn:active {
  transform: scale(0.96);
}

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
.input-area::placeholder {
  color: var(--text-muted);
}

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
.send-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text-secondary);
}
.send-btn:active:not(:disabled) {
  transform: scale(0.92);
}
.send-btn.on {
  background: var(--accent);
  color: #fff;
}
.send-btn.on:hover:not(:disabled) {
  filter: brightness(1.15);
}
.send-btn.on:active:not(:disabled) {
  filter: brightness(0.9);
  transform: scale(0.92);
}
.send-btn.stop {
  background: var(--surface-2);
  color: var(--text-secondary);
}
.send-btn.stop:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text-primary);
}
.send-btn.stop:active:not(:disabled) {
  transform: scale(0.92);
}

/* ── Photo wall ── */
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
.doc-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  width: 28px;
  height: 28px;
}
.doc-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  max-width: 60px;
}
.doc-name {
  font-size: 9px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
  max-width: 100%;
}
.doc-size {
  font-size: 8px;
  color: var(--text-muted);
  line-height: 1;
}
.photo-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
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
.photo-item:hover .photo-overlay {
  opacity: 1;
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
.photo-add:hover {
  border-color: var(--accent);
  background: var(--accent-glow);
}
.photo-add-icon {
  font-size: 22px;
  color: var(--text-muted);
  line-height: 1;
}
.photo-add:hover .photo-add-icon {
  color: var(--accent-text);
}

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
