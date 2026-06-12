<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Assignment, Submission, SubmissionFile, Student } from '@/types'
import {
  NButton, NCard, NModal, NInput, NSelect, NDatePicker, NForm, NFormItem, NSpace,
  NTag, NSpin, NEmpty, NText, NInputNumber, NAvatar, NList, NListItem, NGrid, NGi,
} from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { Plus, Download, File as FileIcon, BookOpen, GraduationCap, FileSpreadsheet } from '@lucide/vue'
import { useMessage } from 'naive-ui'
import PageHeader from '@/components/PageHeader.vue'
import * as XLSX from 'xlsx'
const message = useMessage()

const auth = useAuthStore()

interface ClassInfo { id: number; name: string; student_count: number }
interface CourseInfo { id: number; name: string; class: string }

const selectedClass = ref<ClassInfo | null>(null)
const selectedCourse = ref<number | null>(null)
const selectedCourseInfo = ref<CourseInfo | null>(null)
const assignments = ref<Assignment[]>([])
const submissions = ref<Submission[]>([])
const students = ref<Student[]>([])
const selectedAssignment = ref<number | null>(null)
const loading = ref(true)
const allCourses = ref<CourseInfo[]>([])
const showNew = ref(false)
const newForm = ref({ title: '', description: '', course_id: null as number | null })
const dueDateTs = ref<number | null>(null)
const gradeInputs = reactive<Record<number, { score: number | null; feedback: string }>>({})

// Classes user can manage
const rawClasses = ref<ClassInfo[]>([])
const classList = computed(() => {
  if (rawClasses.value.length === 0) return []
  if (auth.permissions.includes('classes.view_all')) return rawClasses.value
  const myClasses = (auth.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
  if (myClasses.length === 0) return rawClasses.value
  return rawClasses.value.filter(c => myClasses.includes(c.name))
})

// Courses filtered by selected class
const courseList = computed(() => {
  if (!selectedClass.value) return []
  return allCourses.value.filter(c => c.class === selectedClass.value!.name)
})

const courseOptions = computed(() => courseList.value.map(c => ({ label: c.name, value: c.id })))

// Assignments filtered by selected course
const filteredAssignments = computed(() => {
  if (!selectedCourse.value) return assignments.value
  return assignments.value.filter(a => a.course_id === selectedCourse.value)
})

function enterClass(cls: ClassInfo) {
  selectedClass.value = cls
  selectedCourse.value = null
  selectedCourseInfo.value = null
  selectedAssignment.value = null
  submissions.value = []
  load()
}

function selectCourse(crs: CourseInfo) {
  selectedCourse.value = crs.id
  selectedCourseInfo.value = crs
  selectedAssignment.value = null
  submissions.value = []
  load()
}

function backToClasses() {
  selectedClass.value = null
  selectedCourse.value = null
  selectedCourseInfo.value = null
  selectedAssignment.value = null
  assignments.value = []
  submissions.value = []
}

function backToCourses() {
  selectedCourse.value = null
  selectedCourseInfo.value = null
  selectedAssignment.value = null
  submissions.value = []
}

async function load() {
  loading.value = true
  const [crs] = await Promise.all([
    api.get<any[]>('/courses').catch(() => []),
  ])
  allCourses.value = crs
  // Load assignments
  if (selectedCourse.value) {
    assignments.value = await api.get<Assignment[]>('/assignments').catch(() => [])
  }
  loading.value = false
  const first = filteredAssignments.value[0]
  if (first) selectAssignment(first.id)
}

async function loadClasses() {
  try { rawClasses.value = await api.get<ClassInfo[]>('/classes') } catch {}
}

function openNewForm() {
  newForm.value = { title: '', description: '', course_id: selectedCourse.value }
  dueDateTs.value = null
  showNew.value = true
}

async function createAssignment() {
  if (!newForm.value.title || !dueDateTs.value) { message.warning('请填写标题和截止日期'); return }
  if (!newForm.value.course_id) { message.warning('请选择关联课程'); return }
  try {
    const dueDate = new Date(dueDateTs.value).toISOString().slice(0, 10)
    await api.post('/assignments', {
      title: newForm.value.title,
      description: newForm.value.description,
      due_date: dueDate,
      course_id: newForm.value.course_id,
    })
    showNew.value = false
    load()
  } catch (e: any) { message.error(e.message || '发布失败') }
}

async function selectAssignment(id: number) {
  selectedAssignment.value = id
  try {
    submissions.value = await api.get<Submission[]>(`/assignments/${id}/submissions`)
  } catch { submissions.value = [] }
}

function parseSubmissionFiles(s: Submission): SubmissionFile[] {
  try { return typeof s.files === 'string' ? JSON.parse(s.files) : (s.files || []) } catch { return [] }
}

async function grade(submissionId: number) {
  const g = gradeInputs[submissionId]
  if (!g || (g.score === null && !g.feedback)) return
  await api.put(`/submissions/${submissionId}/grade`, { score: g.score || 0, feedback: g.feedback || '' })
  delete gradeInputs[submissionId]
  if (selectedAssignment.value) selectAssignment(selectedAssignment.value)
}

function safeFilename(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 50)
}

function exportSubmissions() {
  if (submissions.value.length === 0) { message.warning('暂无提交数据'); return }
  const assignment = filteredAssignments.value.find(a => a.id === selectedAssignment.value)
  const title = assignment?.title || '作业提交'

  const rows = [
    ['学生姓名', '班级', '提交时间', '状态', '得分', '评语', '提交内容'],
    ...submissions.value.map(s => [
      s.student_name || '',
      s.class || '',
      s.submitted_at?.slice(0, 16) || '',
      s.status === 'graded' ? '已批改' : '待批改',
      s.score !== null && s.score !== undefined ? String(s.score) : '',
      s.feedback || '',
      s.content || '',
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 8 }, { wch: 20 }, { wch: 40 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '提交列表')
  XLSX.writeFile(wb, safeFilename(`${title}_提交情况_${new Date().toLocaleDateString('zh-CN')}.xlsx`))
  message.success(`已导出 ${submissions.value.length} 条记录`)
}

useRefresh(load)
onMounted(() => { loadClasses(); load() })
</script>

<template>
  <div>
    <!-- ════ 面包屑 ════ -->
    <template v-if="selectedClass">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <NButton quaternary size="tiny" @click="backToClasses" style="padding:0;font-size:13px;color:var(--text-muted);height:auto;min-height:0" :bordered="false">
          作业管理
        </NButton>
        <span style="color:var(--text-muted);font-size:12px">/</span>
        <NButton v-if="selectedCourseInfo" quaternary size="tiny" @click="backToCourses" style="padding:0;font-size:13px;color:var(--text-muted);height:auto;min-height:0" :bordered="false">
          {{ selectedClass.name }}
        </NButton>
        <span v-else style="font-size:13px;font-weight:600;color:var(--text-primary)">{{ selectedClass.name }}</span>
        <span v-if="selectedCourseInfo" style="color:var(--text-muted);font-size:12px">/</span>
        <span v-if="selectedCourseInfo" style="font-size:13px;font-weight:600;color:var(--text-primary)">{{ selectedCourseInfo.name }}</span>
      </div>
    </template>

    <!-- Header -->
    <PageHeader title="作业管理" subtitle="选择班级和课程后查看和发布作业，批改学生提交" />

    <!-- ════ 班级选择视图 ════ -->
    <template v-if="!selectedClass">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
        <GraduationCap :size="20" style="color:var(--accent-text)" />
        <NText style="font-size:17px;font-weight:700;color:var(--text-primary)">选择班级</NText>
        <NText depth="3" style="font-size:13px">共 {{ classList.length }} 个班级</NText>
      </div>
      <n-grid :cols="4" :x-gap="16" :y-gap="16">
        <n-gi v-for="cls in classList" :key="cls.id">
          <n-card hoverable size="small" :bordered="true" class="class-card" @click="enterClass(cls)">
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0">
              <div class="class-card-icon"><BookOpen :size="28" /></div>
              <NText style="font-size:16px;font-weight:700;color:var(--text-primary);text-align:center">{{ cls.name }}</NText>
            </div>
          </n-card>
        </n-gi>
        <n-gi v-if="classList.length === 0"><NEmpty description="暂无班级数据" /></n-gi>
      </n-grid>
    </template>

    <!-- ════ 课程选择视图 ════ -->
    <template v-if="selectedClass && !selectedCourseInfo">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
        <BookOpen :size="20" style="color:var(--accent-text)" />
        <NText style="font-size:17px;font-weight:700;color:var(--text-primary)">选择课程</NText>
        <NText depth="3" style="font-size:13px">{{ selectedClass.name }}，共 {{ courseList.length }} 门课程</NText>
      </div>
      <n-grid :cols="4" :x-gap="16" :y-gap="16">
        <n-gi v-for="crs in courseList" :key="crs.id">
          <n-card hoverable size="small" :bordered="true" class="class-card" @click="selectCourse(crs)">
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0">
              <div class="class-card-icon" style="background:var(--surface-2);color:var(--text-secondary)"><BookOpen :size="28" /></div>
              <NText style="font-size:16px;font-weight:700;color:var(--text-primary);text-align:center">{{ crs.name }}</NText>
            </div>
          </n-card>
        </n-gi>
        <n-gi v-if="courseList.length === 0">
          <NEmpty description="该班级暂无课程" />
        </n-gi>
      </n-grid>
    </template>

    <!-- ════ 作业+提交视图 ════ -->
    <template v-if="selectedClass && selectedCourseInfo">
      <!-- Toolbar -->
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px">
        <span style="font-size:14px;font-weight:600;color:var(--text-primary)">{{ selectedCourseInfo.name }}</span>
        <span style="flex:1" />
        <n-button type="primary" @click="openNewForm" size="small" round>
          <template #icon><Plus :size="14" /></template>
          发布作业
        </n-button>
      </div>

      <!-- New Assignment Modal -->
      <n-modal v-model:show="showNew" preset="card" title="发布新作业" style="width:480px" :mask-closable="false">
        <n-form>
          <n-form-item label="标题">
            <n-input v-model:value="newForm.title" placeholder="作业标题" />
          </n-form-item>
          <n-form-item label="关联课程">
            <n-select v-model:value="newForm.course_id" :options="courseOptions" placeholder="选择课程" />
          </n-form-item>
          <n-form-item label="截止日期">
            <n-date-picker v-model:value="dueDateTs" type="date" placeholder="选择截止日期" style="width:100%" clearable />
          </n-form-item>
          <n-form-item label="描述">
            <n-input type="textarea" v-model:value="newForm.description" rows="3" placeholder="作业描述" />
          </n-form-item>
        </n-form>
        <template #footer>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <n-button @click="showNew = false">取消</n-button>
            <n-button type="primary" @click="createAssignment" :disabled="!newForm.title || !dueDateTs">发布</n-button>
          </div>
        </template>
      </n-modal>

      <!-- Main Content -->
      <n-spin :show="loading">
        <div style="display:grid;grid-template-columns:300px 1fr;gap:24px;align-items:start">
          <!-- Left: Assignment List -->
          <n-card :title="'作业列表'" size="small" :bordered="true">
            <template #header-extra>
              <span style="font-size:12px;color:var(--text-muted);background:var(--surface-2);padding:1px 8px;border-radius:100px">
                {{ filteredAssignments.length }}
              </span>
            </template>
            <n-empty v-if="filteredAssignments.length === 0" description="暂无作业" />
            <NList v-else hoverable clickable>
              <NListItem
                v-for="a in filteredAssignments" :key="a.id"
                :class="{ active: selectedAssignment === a.id }"
                @click="selectAssignment(a.id)"
              >
                <NText style="font-weight:500;display:block;margin-bottom:2px">{{ a.title }}</NText>
                <div style="display:flex;gap:8px;align-items:center">
                  <NTag v-if="a.course_name" size="tiny" :bordered="false" style="font-size:10px">{{ a.course_name }}</NTag>
                  <NText depth="3" style="font-size:12px">截止 {{ a.due_date }}</NText>
                </div>
              </NListItem>
            </NList>
          </n-card>

          <!-- Right: Submissions -->
          <n-card size="small" :bordered="true">
            <template #header>
              <div v-if="selectedAssignment" style="display:flex;align-items:center;gap:8px">
                <span style="font-weight:600;font-size:14px;color:var(--text-primary)">提交情况</span>
                <span style="font-size:13px;color:var(--text-muted)">{{ assignments.find(a => a.id === selectedAssignment)?.title }}</span>
              </div>
            </template>
            <template #header-extra>
              <n-button v-if="submissions.length > 0" size="tiny" quaternary @click="exportSubmissions" round>
                <template #icon><FileSpreadsheet :size="14" /></template>
                导出 xlsx
              </n-button>
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
                <div v-if="parseSubmissionFiles(s).length > 0" style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">
                  <div style="font-size:11px;font-weight:500;color:var(--text-muted);margin-bottom:2px">附件</div>
                  <div v-for="(f, fi) in parseSubmissionFiles(s)" :key="fi" style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--surface-2);border-radius:4px;font-size:12px;cursor:pointer;">
                    <FileIcon :size="14" style="color:var(--accent);flex-shrink:0" />
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ f.name }}</span>
                    <span style="color:var(--text-muted);font-size:11px;flex-shrink:0">{{ f.size_display }}</span>
                  </div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--hairline)">
                  <NText depth="3">提交于 {{ s.submitted_at?.slice(0, 10) || '-' }}</NText>
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
                    :disabled="!gradeInputs[s.id]?.score && gradeInputs[s.id]?.score !== 0"
                    @click="grade(s.id)"
                  >批改</NButton>
                </div>
              </NCard>
            </div>
          </n-card>
        </div>
      </n-spin>
    </template>
  </div>
</template>

<style scoped>
.class-card { cursor: pointer; transition: transform .15s, box-shadow .15s; }
.class-card:hover { transform: translateY(-2px); }
.class-card-icon {
  width: 52px; height: 52px; border-radius: 16px;
  background: var(--accent-glow); color: var(--accent-text);
  display: flex; align-items: center; justify-content: center;
}
</style>
