<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Assignment, Submission, Student } from '@/types'
import {
  NButton, NCard, NModal, NInput, NSelect, NForm, NFormItem, NSpace,
  NTag, NSpin, NEmpty, NText, NDatePicker, NInputNumber, NAvatar,
} from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { Plus } from '@lucide/vue'

const auth = useAuthStore()
const assignments = ref<Assignment[]>([])
const submissions = ref<Submission[]>([])
const students = ref<Student[]>([])
const selectedAssignment = ref<number | null>(null)
const loading = ref(true)
const showNew = ref(false)
const newForm = ref({ title: '', description: '', due_date: '', course: '数学' })
const courses = ['数学', '英语', '语文', '物理']
const courseOptions = courses.map(c => ({ label: c, value: c }))
const gradeInputs = reactive<Record<number, { score: number | null; feedback: string }>>({})

async function load() {
  loading.value = true
  const [asgns, sts] = await Promise.all([
    api.get<Assignment[]>('/assignments'),
    api.get<Student[]>('/students'),
  ])
  assignments.value = asgns
  students.value = sts
  loading.value = false
  const first = asgns[0]; if (first) selectAssignment(first.id)
}

async function createAssignment() {
  await api.post('/assignments', {
    ...newForm.value,
    created_by: auth.user?.id,
  })
  showNew.value = false
  newForm.value = { title: '', description: '', due_date: '', course: '数学' }
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

  useRefresh(load)
onMounted(load)
</script>

<template>
  <div>
    <div style="margin-bottom: 16px; text-align: right;">
      <n-button type="primary" @click="showNew = true">
        <Plus :size="16" /> 发布作业
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
        <n-form-item label="科目">
          <n-select v-model:value="newForm.course" :options="courseOptions" />
        </n-form-item>
        <n-form-item label="截止日期">
          <input
            v-model="newForm.due_date"
            type="date"
            style="
              width: 100%; padding: 10px 12px;
              background: var(--surface-2); border: 1px solid var(--hairline);
              border-radius: var(--radius-sm); color: var(--text-primary);
              font-size: 14px; outline: none; font-family: inherit;
              box-sizing: border-box;
            "
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

          <div
            v-else
            style="display: flex; flex-direction: column; gap: 8px"
          >
            <div
              v-for="a in assignments"
              :key="a.id"
              @click="selectAssignment(a.id)"
              :style="{
                padding: '12px',
                borderRadius: 'var(--radius-sm)',
                background:
                  selectedAssignment === a.id
                    ? 'rgba(94, 106, 210, 0.05)'
                    : 'var(--surface-2)',
                border:
                  selectedAssignment === a.id
                    ? '1px solid var(--accent)'
                    : '1px solid var(--hairline)',
                cursor: 'pointer',
                transition: 'all 150ms var(--ease-out)',
              }"
            >
              <div
                style="
                  font-size: 14px; font-weight: 500; color: var(--text-primary);
                  margin-bottom: 4px; line-height: 1.3;
                "
              >
                {{ a.title }}
              </div>
              <div style="display: flex; gap: 8px; font-size: 12px; color: var(--text-muted)">
                <span
                  style="
                    padding: 1px 7px; border-radius: 100px;
                    background: var(--surface-3); color: var(--text-secondary);
                  "
                >
                  {{ a.course }}
                </span>
                <span>截止 {{ a.due_date }}</span>
              </div>
            </div>
          </div>
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

          <div
            v-else
            style="display: flex; flex-direction: column; gap: 16px"
          >
            <div
              v-for="s in submissions"
              :key="s.id"
              style="
                padding: 16px; border-radius: var(--radius-sm);
                background: var(--surface-2); border: 1px solid var(--hairline);
              "
            >
              <!-- Sub Header -->
              <div
                style="
                  display: flex; justify-content: space-between;
                  align-items: center; margin-bottom: 8px;
                "
              >
                <div style="display: flex; align-items: center; gap: 8px">
                  <n-avatar
                    :size="28"
                    round
                    style="background: var(--accent); color: #fff; font-size: 11px; font-weight: 600"
                  >
                    {{ s.student_name?.charAt(0) }}
                  </n-avatar>
                  <span style="font-size: 14px; font-weight: 500; color: var(--text-primary)">
                    {{ s.student_name }}
                  </span>
                </div>
                <n-tag size="small" :type="s.status === 'graded' ? 'success' : 'warning'">
                  {{ s.status === 'graded' ? '已批改' : '待批改' }}
                </n-tag>
              </div>

              <!-- Content -->
              <div
                v-if="s.content"
                style="
                  font-size: 13px; color: var(--text-secondary);
                  margin-bottom: 8px; line-height: 1.5;
                "
              >
                {{ s.content }}
              </div>
              <div
                v-else
                style="
                  font-size: 13px; font-style: italic; color: var(--text-muted);
                  margin-bottom: 8px;
                "
              >
                未提交内容
              </div>

              <!-- Footer -->
              <div
                style="
                  display: flex; justify-content: space-between;
                  font-size: 12px; color: var(--text-muted);
                  margin-bottom: 16px; padding-bottom: 16px;
                  border-bottom: 1px solid var(--hairline);
                "
              >
                <span>提交于 {{ s.submitted_at?.slice(0, 10) || '—' }}</span>
                <span
                  v-if="s.status === 'graded' && s.score !== null"
                  style="color: var(--accent-text); font-weight: 500"
                >
                  得分：{{ s.score }}
                </span>
              </div>

              <!-- Grade Area -->
              <div style="display: flex; gap: 8px; align-items: center">
                <n-input-number
                  size="small"
                  :min="0"
                  :max="100"
                  style="width: 90px"
                  placeholder="分数"
                  :value="gradeInputs[s.id]?.score ?? null"
                  @update:value="
                    (val: number | null) => {
                      gradeInputs[s.id] = {
                        ...(gradeInputs[s.id] || { feedback: '' }),
                        score: val,
                      }
                    }
                  "
                />
                <span style="font-size: 12px; color: var(--text-muted)">分</span>
                <n-input
                  size="small"
                  placeholder="评语（可选）"
                  :value="gradeInputs[s.id]?.feedback || ''"
                  @update:value="
                    (val: string) => {
                      gradeInputs[s.id] = {
                        ...(gradeInputs[s.id] || { score: null }),
                        feedback: val,
                      }
                    }
                  "
                  style="flex: 1"
                />
                <n-button
                  size="small"
                  type="primary"
                  :disabled="!gradeInputs[s.id]?.score && gradeInputs[s.id]?.score !== 0"
                  @click="grade(s.id)"
                >
                  批改
                </n-button>
              </div>
            </div>
          </div>
        </n-card>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .page-header .n-button { width: 100%; }
}
</style>
