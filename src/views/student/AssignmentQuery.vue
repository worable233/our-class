<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Assignment, SubmissionFile } from '@/types'
import { NButton, NCard, NModal, NInput, NForm, NFormItem, NSpace, NTag, NSpin, NEmpty, NText } from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { Calendar, Upload, FolderOpen, X, File } from '@lucide/vue'
import FilePicker from '@/components/FilePicker.vue'

const auth = useAuthStore()
const assignments = ref<Assignment[]>([])
const loading = ref(true)
const showSubmit = ref(false)
const submittingId = ref<number | null>(null)
const submitContent = ref('')
const isResubmit = ref(false)

// 已提交的文件（重新编辑时加载）
const existingFiles = ref<SubmissionFile[]>([])
// 新增的本地文件
const selectedFiles = ref<{ file: File; name: string }[]>([])
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

// 网盘文件选择器
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

    // 保留的已有文件
    if (existingFiles.value.length > 0) {
      formData.append('kept_files', JSON.stringify(existingFiles.value))
    }

    // 新增的本地文件（检查大小）
    for (const sf of selectedFiles.value) {
      if (sf.file.size > 500 * 1024 * 1024) {
        message.error(`文件 ${sf.name} 过大，最大支持 500MB`)
        return
      }
      formData.append('file', sf.file, sf.name)
    }

    // 新增的网盘文件
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

onMounted(load)
</script>

<template>
  <div>
    <n-spin :show="loading">
      <div v-if="!loading && assignments.length === 0" style="display: flex; justify-content: center; padding: 48px 0">
        <n-empty description="暂无作业" />
      </div>
      <div v-else style="display: flex; flex-direction: column; gap: 16px">
        <n-card v-for="a in assignments" :key="a.id" :hoverable="true">
          <template #header>
            <div class="assign-head">
              <div class="assign-info" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
                <n-text strong style="font-size: 16px">{{ a.title }}</n-text>
                <n-tag size="small">{{ a.course }}</n-tag>
                <n-text depth="3">{{ a.teacher_name }}</n-text>
              </div>
              <div class="assign-status" style="white-space: nowrap">
                <n-tag v-if="a.submit_status === 'graded'" size="small" type="success">
                  已批改 {{ a.submit_score }}分
                </n-tag>
                <n-tag v-else-if="a.submit_status === 'pending'" size="small" type="warning">
                  已提交待批改
                </n-tag>
                <n-tag v-else size="small" type="default">
                  未提交
                </n-tag>
              </div>
            </div>
          </template>
          <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px 0; color: var(--text-secondary)">
            {{ a.description }}
          </p>
          <template #footer>
            <div class="assign-foot" style="display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid var(--hairline)">
              <n-text depth="3" style="display: flex; align-items: center; gap: 6px">
                <Calendar :size="14" /> 截止：{{ a.due_date }}
              </n-text>
              <n-button
                v-if="a.submit_status !== 'graded'"
                type="primary"
                size="small"
                @click="openSubmit(a.id, a.submit_status === 'pending')"
              >
                {{ a.submit_status === 'pending' ? '重新提交' : '提交作业' }}
              </n-button>
            </div>
          </template>
        </n-card>
      </div>
    </n-spin>

    <!-- ═══ 提交作业 Modal ═══ -->
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

        <!-- 已提交的文件（重新编辑时） -->
        <n-form-item v-if="existingFiles.length > 0" label="已提交文件">
          <div style="width:100%;display:flex;flex-direction:column;gap:4px;">
            <div v-for="(f, i) in existingFiles" :key="'exist'+f.path"
              style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--surface-2);border-radius:4px;font-size:12px;"
            >
              <File :size="14" style="color:var(--accent);flex-shrink:0;" />
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ f.name }}</span>
              <span style="font-size:10px;color:var(--text-muted);flex-shrink:0;">{{ f.size_display }}</span>
              <X :size="14" style="cursor:pointer;color:var(--text-muted);flex-shrink:0;" @click="removeExistingFile(i)" />
            </div>
          </div>
        </n-form-item>

        <!-- 新增文件上传区 -->
        <n-form-item label="添加文件">
          <div style="width:100%;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;gap:8px;">
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

            <!-- 新增文件列表 -->
            <div v-if="selectedFiles.length > 0 || diskPickedFiles.length > 0" style="display:flex;flex-direction:column;gap:4px;">
              <div v-for="(f, i) in selectedFiles" :key="'local'+i"
                style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--surface-2);border-radius:4px;font-size:12px;"
              >
                <File :size="14" style="color:var(--accent);flex-shrink:0;" />
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ f.name }}</span>
                <X :size="14" style="cursor:pointer;color:var(--text-muted);flex-shrink:0;" @click="removeFile(i)" />
              </div>
              <div v-for="f in diskPickedFiles" :key="'disk'+f.path"
                style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--surface-2);border-radius:4px;font-size:12px;"
              >
                <FolderOpen :size="14" style="color:#f0a020;flex-shrink:0;" />
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ f.name }}</span>
                <span style="font-size:10px;color:var(--text-muted);flex-shrink:0;">{{ f.size_display }}</span>
                <X :size="14" style="cursor:pointer;color:var(--text-muted);flex-shrink:0;" @click="removeDiskFile(f.path)" />
              </div>
            </div>
            <span v-else style="font-size:12px;color:var(--text-muted);">可选，支持上传文件或从个人网盘选择</span>
          </div>
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; gap: 8px; justify-content: flex-end">
          <n-button @click="handleClose">取消</n-button>
          <n-button type="primary" @click="submit" :loading="uploading" :disabled="!submitContent && existingFiles.length === 0 && selectedFiles.length === 0 && diskPickedFiles.length === 0">
            {{ isResubmit ? '重新提交' : '提交' }}
          </n-button>
        </div>
      </template>
    </n-modal>

    <!-- ═══ 可复用文件选择器 ═══ -->
    <FilePicker
      v-model:show="showDiskPicker"
      :accept="['*']"
      multiple
      @confirm="onDiskPick"
    />
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
