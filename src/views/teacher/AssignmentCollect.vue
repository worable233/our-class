<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Assignment, Submission, SubmissionFile, Student } from '@/types'
import {
  NButton, NCard, NModal, NInput, NSelect, NDatePicker, NForm, NFormItem, NSpace,
  NTag, NSpin, NEmpty, NText, NInputNumber, NAvatar, NList, NListItem,
} from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { Plus, Eye, X, Download, File as FileIcon } from '@lucide/vue'

const auth = useAuthStore()

// 开发中遮罩
const overlayDismissed = ref(localStorage.getItem('assignment_overlay_dismissed') === 'true')
function dismissOverlay() {
  overlayDismissed.value = true
  localStorage.setItem('assignment_overlay_dismissed', 'true')
}
const assignments = ref<Assignment[]>([])
const submissions = ref<Submission[]>([])
const students = ref<Student[]>([])
const selectedAssignment = ref<number | null>(null)
const loading = ref(true)
interface CourseInfo { id: number; name: string; class: string }
const allCourses = ref<CourseInfo[]>([])
const showNew = ref(false)
const newForm = ref({ title: '', description: '', due_date: '', course: '', course_id: null as number | null })
const courseOptions = computed(() => allCourses.value.map(c => ({ label: `${c.name}（${c.class}）`, value: c.id })))
const gradeInputs = reactive<Record<number, { score: number | null; feedback: string }>>({})

async function load() {
  loading.value = true
  const [asgns, sts, crs] = await Promise.all([
    api.get<Assignment[]>('/assignments'),
    api.get<Student[]>('/students'),
    api.get<any[]>('/courses').catch(() => []),
  ])
  assignments.value = asgns
  students.value = sts
  allCourses.value = crs
  loading.value = false
  const first = asgns[0]; if (first) selectAssignment(first.id)
}

async function createAssignment() {
  if (!newForm.value.course_id) { message.warning('请选择关联课程'); return }
  await api.post('/assignments', {
    title: newForm.value.title,
    description: newForm.value.description,
    due_date: newForm.value.due_date,
    course_id: newForm.value.course_id,
    created_by: auth.user?.id,
  })
  showNew.value = false
  newForm.value = { title: '', description: '', due_date: '', course: '', course_id: null }
  await load()
}

async function selectAssignment(id: number) {
  selectedAssignment.value = id
  submissions.value = await api.get<Submission[]>(`/assignments/${id}/submissions`)
  submissions.value.forEach(s => {
    gradeInputs[s.id] = { score: s.score, feedback: s.feedback || '' }
  })
}

async function grade(submissionId: number) {
  const input = gradeInputs[submissionId]
  if (!input || input.score === null) return
  await api.put(`/assignments/submissions/${submissionId}/grade`, {
    score: input.score,
    feedback: input.feedback,
  })
  const sub = submissions.value.find(s => s.id === submissionId)
  if (sub) { sub.score = input.score; sub.feedback = input.feedback; sub.status = 'graded' }
}

  function parseSubmissionFiles(s: Submission): SubmissionFile[] {
    if (!s.files) return []
    try { return JSON.parse(s.files) } catch { return [] }
  }

  async function downloadSubmissionFile(submissionId: number, file: SubmissionFile) {
    const token = auth.user?.token || ''
    try {
      const res = await fetch(`/api/assignments/submissions/${submissionId}/download?path=${encodeURIComponent(file.path)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { alert('下载失败'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = file.name; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('下载失败') }
  }

  useRefresh(load)
onMounted(load)
</script>

<template>
  <div style="position:relative">
    <!-- 开发中遮罩 -->
    <div v-if="!overlayDismissed" class="dev-overlay">
      <div class="dev-overlay-content">
        <Eye :size="40" style="color:#5E6AD2;margin-bottom:12px" />
        <div style="font-size:20px;font-weight:700;margin-bottom:8px;color:var(--text-primary)">功能开发中</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:20px;max-width:300px;text-align:center;line-height:1.6">
          作业管理系统正在紧锣密鼓地开发中，部分功能可能尚未完善
        </div>
        <n-button type="primary" round @click="dismissOverlay" size="medium">
          <template #icon><X :size="16" /></template>
          抢先体验
        </n-button>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <NText tag="h2" style="margin:0 0 4px;font-size:24px;font-weight:700;">作业管理</NText>
        <NText depth="3" style="display:block;margin:0;font-size:14px;">发布和查看各科作业及学生提交情况</NText>
      </div>
      <n-button type="primary" @click="showNew = true" round>
        <template #icon><Plus :size="16" /></template>
        发布作业
      </n-button>
    </div>

    <!-- New Assignment Modal -->
    <n-modal
      v-model:show="showNew"
      preset="card"
      title="发布新作业"
      style="width: 480px"
      :mask-closable="false"
    >
      <n-form>
        <n-form-item label="标题">
          <n-input v-model:value="newForm.title" placeholder="作业标题" />
        </n-form-item>
        <n-form-item label="关联课程">
          <n-select v-model:value="newForm.course_id" :options="courseOptions" placeholder="选择课程" />
        </n-form-item>
        <n-form-item label="截止日期">
          <n-date-picker
            v-model:formatted-value="newForm.due_date"
            type="date"
            value-format="yyyy-MM-dd"
            placeholder="选择截止日期"
            style="width:100%"
            clearable
          />
        </n-form-item>
        <n-form-item label="描述">
          <n-input
            type="textarea"
            v-model:value="newForm.description"
            rows="3"
            placeholder="作业描述"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; gap: 8px; justify-content: flex-end">
          <n-button @click="showNew = false">取消</n-button>
          <n-button
            type="primary"
            @click="createAssignment"
            :disabled="!newForm.title || !newForm.due_date"
          >
            发布
          </n-button>
        </div>
      </template>
    </n-modal>

    <n-spin :show="loading">
      <div
        style="
          display: grid; grid-template-columns: 300px 1fr; gap: 24px;
          align-items: start;
        "
      >
        <!-- Left Panel: Assignment List -->
        <n-card title="作业列表" size="small" :bordered="true">
          <template #header-extra>
            <span
              style="
                font-size: 12px; color: var(--text-muted);
                background: var(--surface-2); padding: 1px 8px;
                border-radius: 100px;
              "
            >
              {{ assignments.length }}
            </span>
          </template>

          <n-empty v-if="assignments.length === 0" description="暂无数据" />

          <NList v-else hoverable clickable>
            <NListItem
              v-for="a in assignments"
              :key="a.id"
              :class="{ active: selectedAssignment === a.id }"
              @click="selectAssignment(a.id)"
            >
              <NText style="font-weight:500;display:block;margin-bottom:2px">{{ a.title }}</NText>
              <div style="display:flex;gap:8px;align-items:center">
                <NTag size="tiny" :bordered="false">{{ a.course }}</NTag>
                <NTag v-if="a.course_name" size="tiny" :bordered="false" type="info" style="font-size:10px">{{ a.course_name }}</NTag>
                <NText depth="3" style="font-size:12px">截止 {{ a.due_date }}</NText>
              </div>
            </NListItem>
          </NList>
        </n-card>

        <!-- Right Panel: Submissions -->
        <n-card size="small" :bordered="true">
          <template #header>
            <div
              v-if="selectedAssignment"
              style="display: flex; align-items: center; gap: 8px"
            >
              <span style="font-weight: 600; font-size: 14px; color: var(--text-primary)">
                提交情况
              </span>
              <span style="font-size: 13px; color: var(--text-muted)">
                {{ assignments.find(a => a.id === selectedAssignment)?.title }}
              </span>
            </div>
          </template>

          <n-empty v-if="submissions.length === 0" description="暂无学生提交" />

          <div v-else style="display:flex;flex-direction:column;gap:12px">
            <NCard v-for="s in submissions" :key="s.id" size="small" :bordered="true">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:8px">
                  <NAvatar :size="28" round style="background:var(--accent);color:#fff;font-size:11px;font-weight:600">
                    {{ s.student_name?.charAt(0) }}
                  </NAvatar>
                  <NText style="font-weight:500">{{ s.student_name }}</NText>
                </div>
                <NTag size="small" :type="s.status === 'graded' ? 'success' : 'warning'">
                  {{ s.status === 'graded' ? '已批改' : '待批改' }}
                </NTag>
              </div>

              <NText v-if="s.content" depth="2" style="display:block;margin-bottom:8px;font-size:13px;line-height:1.5">{{ s.content }}</NText>
              <NText v-else depth="3" style="display:block;margin-bottom:8px;font-size:13px;font-style:italic">未提交内容</NText>

              <!-- 提交的附件 -->
              <div v-if="parseSubmissionFiles(s).length > 0" style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px;">
                <div style="font-size:11px;font-weight:500;color:var(--text-muted);margin-bottom:2px;">附件</div>
                <div v-for="(f, fi) in parseSubmissionFiles(s)" :key="fi"
                  style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--surface-2);border-radius:4px;font-size:12px;cursor:pointer;"
                  @click="downloadSubmissionFile(s.id, f)"
                >
                  <FileIcon :size="14" style="color:var(--accent);flex-shrink:0;" />
                  <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ f.name }}</span>
                  <span style="color:var(--text-muted);font-size:11px;flex-shrink:0;">{{ f.size_display }}</span>
                  <Download :size="13" style="color:var(--accent);flex-shrink:0;" />
                </div>
              </div>

              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--hairline)">
                <NText depth="3">提交于 {{ s.submitted_at?.slice(0, 10) || '—' }}</NText>
                <NText v-if="s.status === 'graded' && s.score !== null" style="color:var(--accent-text);font-weight:500">得分：{{ s.score }}</NText>
              </div>

              <div style="display:flex;gap:8px;align-items:center">
                <NInputNumber size="small" :min="0" :max="100" style="width:90px" placeholder="分数"
                  :value="gradeInputs[s.id]?.score ?? null"
                  @update:value="(val:number|null) => { gradeInputs[s.id] = { ...(gradeInputs[s.id] || { feedback: '' }), score: val } }"
                />
                <NText depth="3" style="font-size:12px">分</NText>
                <NInput size="small" placeholder="评语（可选）" style="flex:1"
                  :value="gradeInputs[s.id]?.feedback || ''"
                  @update:value="(val:string) => { gradeInputs[s.id] = { ...(gradeInputs[s.id] || { score: null }), feedback: val } }"
                />
                <NButton size="small" type="primary"
                  :disabled="!gradeInputs[s.id]?.score && gradeInputs[s.id]?.score !== 0" @click="grade(s.id)"
                >批改
                </NButton>
              </div>
            </NCard>
          </div>
        </n-card>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.dev-overlay {
  position: absolute;
  inset: -4px;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 8px;
}
.dev-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px;
}
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .page-header .n-button { width: 100%; }
}
</style>
