<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Assignment, SubmissionFile } from '@/types'
import { NButton, NCard, NModal, NInput, NForm, NFormItem, NSpace, NTag, NSpin, NEmpty, NText } from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { useMessage } from 'naive-ui'
import { Calendar, Upload, FolderOpen, X, File, Clock, CheckCircle, AlertCircle } from '@lucide/vue'
import FilePicker from '@/components/FilePicker.vue'

const auth = useAuthStore()
const message = useMessage()
const assignments = ref<Assignment[]>([])
const loading = ref(true)
const showSubmit = ref(false)
const submittingId = ref<number | null>(null)
const submitContent = ref('')
const isResubmit = ref(false)

const existingFiles = ref<SubmissionFile[]>([])
const selectedFiles = ref<{ file: File; name: string }[]>([])
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const showDiskPicker = ref(false)
const diskPickedFiles = ref<{ name: string; path: string; size: number; size_display: string }[]>([])

async function load() {
  loading.value = true
  assignments.value = await api.get<Assignment[]>(`/assignments?student_id=${auth.user?.id}`)
  loading.value = false
}

useRefresh(load)

async function openSubmit(assignmentId: number, resubmit: boolean) {
  submittingId.value = assignmentId
  submitContent.value = ''
  selectedFiles.value = []
  diskPickedFiles.value = []
  existingFiles.value = []
  isResubmit.value = resubmit

  if (resubmit) {
    try {
      const sub = await api.get<{ content: string; files: SubmissionFile[] } | null>(`/assignments/${assignmentId}/my-submission`)
      if (sub) {
        submitContent.value = sub.content || ''
        existingFiles.value = sub.files || []
      }
    } catch {}
  }

  showSubmit.value = true
}

function handleClose() {
  showSubmit.value = false
  submittingId.value = null
  submitContent.value = ''
  selectedFiles.value = []
  diskPickedFiles.value = []
  existingFiles.value = []
  isResubmit.value = false
}

function handleFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    selectedFiles.value.push({ file, name: file.name })
  }
  input.value = ''
}

function removeFile(index: number) {
  selectedFiles.value.splice(index, 1)
}

function removeExistingFile(index: number) {
  existingFiles.value.splice(index, 1)
}

function removeDiskFile(path: string) {
  diskPickedFiles.value = diskPickedFiles.value.filter(f => f.path !== path)
}

function onDiskPick(files: { name: string; path: string; size: number; size_display: string }[]) {
  const existing = new Set(diskPickedFiles.value.map(f => f.path))
  for (const f of files) {
    if (!existing.has(f.path)) {
      diskPickedFiles.value.push(f)
      existing.add(f.path)
    }
  }
  showDiskPicker.value = false
}

async function submit() {
  if (submittingId.value === null) return
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('student_id', String(auth.user?.id))
    formData.append('content', submitContent.value)

    if (existingFiles.value.length > 0) {
      formData.append('kept_files', JSON.stringify(existingFiles.value))
    }

    for (const sf of selectedFiles.value) {
      if (sf.file.size > 500 * 1024 * 1024) {
        message.error(`文件 ${sf.name} 过大，最大支持 500MB`)
        return
      }
      formData.append('file', sf.file, sf.name)
    }

    if (diskPickedFiles.value.length > 0) {
      formData.append('disk_files', JSON.stringify(
        diskPickedFiles.value.map(f => ({ name: f.name, disk_path: f.path }))
      ))
    }

    const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
    const resp = await fetch(`/api/assignments/${submittingId.value}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}))
      throw new Error(errData.error?.message || `提交失败 (${resp.status})`)
    }

    const body = await resp.json()
    if (!body.success) throw new Error(body.error?.message || '提交失败')

    handleClose()
    await load()
    message.success('提交成功')
  } catch (e: any) {
    message.error(e.message || '提交失败')
  }
  finally { uploading.value = false }
}

function getStatusInfo(status: string | null) {
  if (status === 'graded') return { type: 'success' as const, label: '已批改', icon: CheckCircle }
  if (status === 'pending') return { type: 'warning' as const, label: '待批改', icon: Clock }
  return { type: 'default' as const, label: '未提交', icon: AlertCircle }
}

onMounted(load)
</script>

<template>
  <div class="page-container">
    <n-spin :show="loading">
      <div v-if="!loading && assignments.length === 0" class="empty-state">
        <n-empty description="暂无作业" />
      </div>
      <div v-else class="assignment-list">
        <n-card v-for="a in assignments" :key="a.id" :hoverable="true" class="assignment-card">
          <template #header>
            <div class="assignment-header">
              <div class="assignment-title-row">
                <span class="assignment-title">{{ a.title }}</span>
                <n-tag size="small" :bordered="false" round>{{ a.course }}</n-tag>
              </div>
              <div class="assignment-status">
                <n-tag
                  :type="getStatusInfo(a.submit_status).type"
                  size="small"
                  round
                >
                  <template #icon>
                    <component :is="getStatusInfo(a.submit_status).icon" :size="12" />
                  </template>
                  {{ getStatusInfo(a.submit_status).label }}
                  <span v-if="a.submit_status === 'graded' && a.submit_score != null" class="score-badge">
                    {{ a.submit_score }}分
                  </span>
                </n-tag>
              </div>
            </div>
          </template>

          <div class="assignment-desc">
            {{ a.description || '暂无描述' }}
          </div>

          <template #footer>
            <div class="assignment-footer">
              <div class="assignment-due">
                <Calendar :size="14" />
                <span>截止：{{ a.due_date }}</span>
              </div>
              <n-button
                v-if="a.submit_status !== 'graded'"
                type="primary"
                size="small"
                round
                @click="openSubmit(a.id, a.submit_status === 'pending')"
              >
                {{ a.submit_status === 'pending' ? '重新提交' : '提交作业' }}
              </n-button>
            </div>
          </template>
        </n-card>
      </div>
    </n-spin>

    <!-- Submit Modal -->
    <n-modal
      v-model:show="showSubmit"
      preset="card"
      :title="isResubmit ? '重新提交' : '提交作业'"
      style="width: 560px"
      :mask-closable="false"
      @update:show="(val) => { if (!val) handleClose() }"
    >
      <n-form>
        <n-form-item label="作业内容">
          <n-input type="textarea" v-model:value="submitContent" placeholder="输入作业内容或备注..." :rows="3" />
        </n-form-item>

        <n-form-item v-if="existingFiles.length > 0" label="已提交文件">
          <div class="file-list">
            <div v-for="(f, i) in existingFiles" :key="'exist'+f.path" class="file-item">
              <File :size="14" class="file-icon" />
              <span class="file-name">{{ f.name }}</span>
              <span class="file-size">{{ f.size_display }}</span>
              <X :size="14" class="file-remove" @click="removeExistingFile(i)" />
            </div>
          </div>
        </n-form-item>

        <n-form-item label="添加文件">
          <div class="upload-area">
            <div class="upload-buttons">
              <NButton size="small" secondary @click="fileInput?.click()">
                <template #icon><Upload :size="14" /></template>
                选择文件
              </NButton>
              <NButton size="small" secondary @click="showDiskPicker = true">
                <template #icon><FolderOpen :size="14" /></template>
                从网盘选择
              </NButton>
            </div>
            <input ref="fileInput" type="file" multiple style="display:none" @change="handleFileSelected" @click="(e: any) => e.target.value = null" />

            <div v-if="selectedFiles.length > 0 || diskPickedFiles.length > 0" class="file-list">
              <div v-for="(f, i) in selectedFiles" :key="'local'+i" class="file-item">
                <File :size="14" class="file-icon" />
                <span class="file-name">{{ f.name }}</span>
                <X :size="14" class="file-remove" @click="removeFile(i)" />
              </div>
              <div v-for="f in diskPickedFiles" :key="'disk'+f.path" class="file-item">
                <FolderOpen :size="14" class="file-icon disk" />
                <span class="file-name">{{ f.name }}</span>
                <span class="file-size">{{ f.size_display }}</span>
                <X :size="14" class="file-remove" @click="removeDiskFile(f.path)" />
              </div>
            </div>
            <span v-else class="upload-hint">可选，支持上传文件或从个人网盘选择</span>
          </div>
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; gap: 8px; justify-content: flex-end">
          <n-button @click="handleClose">取消</n-button>
          <n-button type="primary" @click="submit" :loading="uploading" :disabled="!submitContent && existingFiles.length === 0 && selectedFiles.length === 0 && diskPickedFiles.length === 0" round>
            {{ isResubmit ? '重新提交' : '提交' }}
          </n-button>
        </div>
      </template>
    </n-modal>

    <FilePicker
      v-model:show="showDiskPicker"
      :accept="['*']"
      multiple
      @confirm="onDiskPick"
    />
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px 0;
}

.empty-state {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.assignment-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.assignment-card {
  transition: transform 0.2s, box-shadow 0.2s;
}

.assignment-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.assignment-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.assignment-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.assignment-title {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-primary);
}

.assignment-status {
  flex-shrink: 0;
}

.score-badge {
  margin-left: 6px;
  padding-left: 6px;
  border-left: 1px solid currentColor;
  opacity: 0.8;
}

.assignment-desc {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.assignment-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid var(--hairline);
}

.assignment-due {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
}

/* File List */
.file-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--surface-2);
  border-radius: 8px;
  font-size: 13px;
  transition: background 0.15s;
}

.file-item:hover {
  background: var(--surface-3);
}

.file-icon {
  color: var(--accent);
  flex-shrink: 0;
}

.file-icon.disk {
  color: #f0a020;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.file-size {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.file-remove {
  cursor: pointer;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: color 0.15s;
}

.file-remove:hover {
  color: #ef4444;
}

/* Upload Area */
.upload-area {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.upload-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.upload-hint {
  font-size: 12px;
  color: var(--text-muted);
}

/* Mobile */
@media (max-width: 768px) {
  .page-container {
    padding: 16px 0;
  }

  .assignment-header {
    flex-direction: column;
    gap: 8px;
  }

  .assignment-footer {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
}
</style>
