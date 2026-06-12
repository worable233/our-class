<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Student } from '@/types'
import {
  NButton, NCard, NModal, NInput, NForm, NFormItem, NSpace,
  NTag, NSpin, NEmpty, NText, NInputNumber, NAvatar, NList, NListItem,
  NGrid, NGi, NPopconfirm,
} from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { Plus, Trash2, BookOpen, GraduationCap, ClipboardList, FileSpreadsheet } from '@lucide/vue'
import { useMessage } from 'naive-ui'
import * as XLSX from 'xlsx'

const message = useMessage()
const auth = useAuthStore()

interface ClassInfo { id: number; name: string; student_count: number }
interface CourseInfo { id: number; name: string; class: string }
interface ExamInfo { exam_name: string; date: string; count: number }

// ─── 状态 ──────────────────────────────────────────────────────────────────
const selectedClass = ref<ClassInfo | null>(null)
const selectedCourse = ref<number | null>(null)
const selectedCourseInfo = ref<CourseInfo | null>(null)
const selectedExam = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)

const rawClasses = ref<ClassInfo[]>([])
const allCourses = ref<CourseInfo[]>([])
const exams = ref<ExamInfo[]>([])
const students = ref<Student[]>([])
const scoreMap = reactive<Record<number, number | null>>({})

// 新建考试弹窗
const showNewExam = ref(false)
const newExamName = ref('')

// ─── 计算属性 ──────────────────────────────────────────────────────────────
const classList = computed(() => {
  if (rawClasses.value.length === 0) return []
  if (auth.permissions.includes('classes.view_all')) return rawClasses.value
  const myClasses = (auth.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
  if (myClasses.length === 0) return rawClasses.value
  return rawClasses.value.filter(c => myClasses.includes(c.name))
})

const courseList = computed(() => {
  if (!selectedClass.value) return []
  return allCourses.value.filter(c => c.class === selectedClass.value!.name)
})

// ─── 导航 ──────────────────────────────────────────────────────────────────
function enterClass(cls: ClassInfo) {
  selectedClass.value = cls
  selectedCourse.value = null
  selectedCourseInfo.value = null
  selectedExam.value = null
  exams.value = []
  students.value = []
  load()
}

function selectCourse(crs: CourseInfo) {
  selectedCourse.value = crs.id
  selectedCourseInfo.value = crs
  selectedExam.value = null
  exams.value = []
  students.value = []
  loadExams()
}

function selectExam(examName: string) {
  selectedExam.value = examName
  loadStudentsAndScores()
}

function backToClasses() {
  selectedClass.value = null
  selectedCourse.value = null
  selectedCourseInfo.value = null
  selectedExam.value = null
  exams.value = []
  students.value = []
}

function backToCourses() {
  selectedCourse.value = null
  selectedCourseInfo.value = null
  selectedExam.value = null
  exams.value = []
  students.value = []
}

// ─── 数据加载 ──────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  allCourses.value = await api.get<CourseInfo[]>('/courses').catch(() => [])
  loading.value = false
}

async function loadClasses() {
  try { rawClasses.value = await api.get<ClassInfo[]>('/classes') } catch {}
}

async function loadExams() {
  if (!selectedCourseInfo.value) return
  loading.value = true
  exams.value = await api.get<ExamInfo[]>(`/scores/exams?course=${encodeURIComponent(selectedCourseInfo.value.name)}`).catch(() => [])
  loading.value = false
  // 自动选中第一个考试
  if (exams.value.length > 0 && !selectedExam.value) {
    selectExam(exams.value[0]!.exam_name)
  } else if (exams.value.length === 0) {
    selectedExam.value = null
    students.value = []
  }
}

async function loadStudentsAndScores() {
  if (!selectedClass.value || !selectedCourseInfo.value || !selectedExam.value) return
  loading.value = true
  // 加载该班级的学生
  const sts = await api.get<Student[]>(`/students?class=${encodeURIComponent(selectedClass.value.name)}`).catch(() => [])
  students.value = sts
  // 加载该考试的成绩
  const scs = await api.get<any[]>(
    `/scores?course=${encodeURIComponent(selectedCourseInfo.value.name)}&exam_name=${encodeURIComponent(selectedExam.value)}&class=${encodeURIComponent(selectedClass.value.name)}`
  ).catch(() => [])
  // 填充 scoreMap
  for (const s of sts) {
    const existing = scs.find((sc: any) => sc.student_id === s.id)
    scoreMap[s.id] = existing ? existing.score : null
  }
  loading.value = false
}

// ─── 创建考试 ──────────────────────────────────────────────────────────────
function openNewExam() {
  newExamName.value = ''
  showNewExam.value = true
}

async function createExam() {
  if (!newExamName.value.trim()) { message.warning('请输入考试名称'); return }
  // 检查是否重名
  if (exams.value.some(e => e.exam_name === newExamName.value.trim())) {
    message.warning('该考试已存在'); return
  }
  showNewExam.value = false
  selectedExam.value = newExamName.value.trim()
  students.value = []
  // 加载学生列表（新考试还没有成绩）
  if (selectedClass.value) {
    loading.value = true
    students.value = await api.get<Student[]>(`/students?class=${encodeURIComponent(selectedClass.value.name)}`).catch(() => [])
    for (const s of students.value) { scoreMap[s.id] = null }
    loading.value = false
  }
  message.success(`考试「${newExamName.value.trim()}」已创建，可以开始录入成绩`)
}

// ─── 删除考试 ──────────────────────────────────────────────────────────────
async function deleteExam(examName: string) {
  if (!selectedCourseInfo.value) return
  try {
    await api.delete('/scores/exams', {
      body: { course: selectedCourseInfo.value.name, exam_name: examName },
    })
    message.success(`已删除考试「${examName}」`)
    if (selectedExam.value === examName) {
      selectedExam.value = null
      students.value = []
    }
    loadExams()
  } catch (e: any) {
    message.error(e.message || '删除失败')
  }
}

// ─── 保存成绩 ──────────────────────────────────────────────────────────────
async function saveScores() {
  if (!selectedCourseInfo.value || !selectedExam.value) return
  if (students.value.length === 0) { message.warning('暂无学生'); return }

  // 收集有分数的条目
  const scoreList = students.value
    .filter(s => scoreMap[s.id] !== null && scoreMap[s.id] !== undefined)
    .map(s => ({ student_id: s.id, score: scoreMap[s.id]! }))

  if (scoreList.length === 0) { message.warning('请至少填写一名学生的成绩'); return }

  saving.value = true
  try {
    const res = await api.post<{ created: number; updated: number; errors: string[] }>('/scores/batch', {
      course: selectedCourseInfo.value.name,
      exam_name: selectedExam.value,
      scores: scoreList,
    })
    let msg = `保存成功：新增 ${res.created} 条，更新 ${res.updated} 条`
    if (res.errors?.length) msg += `；${res.errors.length} 条失败`
    message.success(msg)
    // 刷新考试列表（更新录入人数）
    loadExams()
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

useRefresh(loadExams)
onMounted(() => { loadClasses(); load() })

function safeFilename(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 50)
}

function exportScores() {
  if (students.value.length === 0) { message.warning('暂无学生数据'); return }
  const courseName = selectedCourseInfo.value?.name || '课程'
  const examName = selectedExam.value || '考试'

  const rows = [
    ['序号', '学生姓名', '学号', '班级', '分数'],
    ...students.value.map((s, idx) => [
      String(idx + 1),
      s.display_name || '',
      s.student_no || '',
      s.class || '',
      scoreMap[s.id] !== null && scoreMap[s.id] !== undefined ? String(scoreMap[s.id]) : '',
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '成绩表')
  XLSX.writeFile(wb, safeFilename(`${courseName}_${examName}_成绩_${new Date().toLocaleDateString('zh-CN')}.xlsx`))
  message.success(`已导出 ${students.value.length} 条记录`)
}
</script>

<template>
  <div>
    <!-- ════ 面包屑 ════ -->
    <template v-if="selectedClass">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <NButton quaternary size="tiny" @click="backToClasses" style="padding:0;font-size:13px;color:var(--text-muted);height:auto;min-height:0" :bordered="false">
          成绩管理
        </NButton>
        <span style="color:var(--text-muted);font-size:12px">/</span>
        <NButton v-if="selectedCourseInfo" quaternary size="tiny" @click="backToCourses" style="padding:0;font-size:13px;color:var(--text-muted);height:auto;min-height:0" :bordered="false">
          {{ selectedClass.name }}
        </NButton>
        <span v-else style="font-size:13px;font-weight:600;color:var(--text-primary)">{{ selectedClass.name }}</span>
        <template v-if="selectedCourseInfo">
          <span style="color:var(--text-muted);font-size:12px">/</span>
          <span style="font-size:13px;font-weight:600;color:var(--text-primary)">{{ selectedCourseInfo.name }}</span>
        </template>
        <template v-if="selectedExam">
          <span style="color:var(--text-muted);font-size:12px">/</span>
          <span style="font-size:13px;font-weight:600;color:var(--text-primary)">{{ selectedExam }}</span>
        </template>
      </div>
    </template>

    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <NText tag="h2" style="margin:0 0 4px;font-size:24px;font-weight:700;">成绩管理</NText>
        <NText depth="3" style="display:block;margin:0;font-size:14px;">选择班级和课程后管理考试与录入成绩</NText>
      </div>
    </div>

    <!-- ════ 阶段 1：选择班级 ════ -->
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
              <div class="class-card-icon"><GraduationCap :size="28" /></div>
              <NText style="font-size:16px;font-weight:700;color:var(--text-primary);text-align:center">{{ cls.name }}</NText>
              <NText depth="3" style="font-size:12px">{{ cls.student_count }} 名学生</NText>
            </div>
          </n-card>
        </n-gi>
        <n-gi v-if="classList.length === 0"><NEmpty description="暂无班级数据" /></n-gi>
      </n-grid>
    </template>

    <!-- ════ 阶段 2：选择课程 ════ -->
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

    <!-- ════ 阶段 3：考试列表 + 成绩录入 ════ -->
    <template v-if="selectedClass && selectedCourseInfo">
      <n-spin :show="loading">
        <div style="display:grid;grid-template-columns:280px 1fr;gap:24px;align-items:start">
          <!-- 左侧：考试列表 -->
          <n-card size="small" :bordered="true">
            <template #header>
              <div style="display:flex;align-items:center;gap:6px">
                <ClipboardList :size="16" style="color:var(--accent-text)" />
                <span style="font-weight:600;font-size:14px">考试列表</span>
              </div>
            </template>
            <template #header-extra>
              <NButton size="tiny" type="primary" @click="openNewExam" round>
                <template #icon><Plus :size="12" /></template>
                新建
              </NButton>
            </template>
            <n-empty v-if="exams.length === 0" description="暂无考试，点击上方新建" />
            <NList v-else hoverable clickable>
              <NListItem
                v-for="e in exams" :key="e.exam_name"
                :class="{ active: selectedExam === e.exam_name }"
                @click="selectExam(e.exam_name)"
              >
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div style="flex:1;min-width:0">
                    <NText style="font-weight:500;display:block;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ e.exam_name }}</NText>
                    <div style="display:flex;gap:8px;align-items:center">
                      <NText depth="3" style="font-size:12px">{{ e.date }}</NText>
                      <NTag size="tiny" :bordered="false" style="font-size:10px">已录 {{ e.count }} 人</NTag>
                    </div>
                  </div>
                  <NPopconfirm @positive-click="deleteExam(e.exam_name)">
                    <template #trigger>
                      <NButton size="tiny" quaternary type="error" @click.stop style="flex-shrink:0">
                        <template #icon><Trash2 :size="14" /></template>
                      </NButton>
                    </template>
                    确定删除「{{ e.exam_name }}」的所有成绩？
                  </NPopconfirm>
                </div>
              </NListItem>
            </NList>
          </n-card>

          <!-- 右侧：学生成绩录入 -->
          <n-card size="small" :bordered="true">
            <template #header>
              <div v-if="selectedExam" style="display:flex;align-items:center;gap:8px">
                <span style="font-weight:600;font-size:14px;color:var(--text-primary)">{{ selectedExam }}</span>
                <NText depth="3" style="font-size:13px">{{ selectedCourseInfo.name }} · {{ selectedClass.name }}</NText>
              </div>
              <span v-else style="font-size:14px;color:var(--text-muted)">请先选择或新建考试</span>
            </template>
            <template #header-extra>
              <n-button v-if="selectedExam && students.length > 0" size="tiny" quaternary @click="exportScores" round>
                <template #icon><FileSpreadsheet :size="14" /></template>
                导出 xlsx
              </n-button>
            </template>

            <template v-if="!selectedExam">
              <NEmpty description="请从左侧选择一次考试，或新建考试" />
            </template>

            <template v-else-if="students.length === 0 && !loading">
              <NEmpty description="该班级暂无学生" />
            </template>

            <template v-else>
              <!-- 学生成绩表 -->
              <div style="display:flex;flex-direction:column;gap:1px">
                <!-- 表头 -->
                <div style="display:grid;grid-template-columns:40px 1fr 160px;gap:12px;padding:8px 12px;background:var(--surface-1);border-radius:6px 6px 0 0;font-size:12px;font-weight:600;color:var(--text-muted)">
                  <span>#</span>
                  <span>学生</span>
                  <span style="text-align:center">分数</span>
                </div>
                <!-- 行 -->
                <div
                  v-for="(s, idx) in students" :key="s.id"
                  style="display:grid;grid-template-columns:40px 1fr 160px;gap:12px;padding:10px 12px;align-items:center;border-bottom:1px solid var(--hairline)"
                >
                  <NText depth="3" style="font-size:13px">{{ idx + 1 }}</NText>
                  <div style="display:flex;align-items:center;gap:8px">
                    <NAvatar :size="28" round style="background:var(--accent);color:#fff;font-size:11px;font-weight:600;flex-shrink:0">
                      {{ s.display_name?.charAt(0) }}
                    </NAvatar>
                    <NText style="font-weight:500;font-size:13px">{{ s.display_name }}</NText>
                  </div>
                  <div style="display:flex;align-items:center;justify-content:center;gap:4px">
                    <NInputNumber
                      :value="scoreMap[s.id] ?? null"
                      :min="0" :max="100" size="small" placeholder="分数"
                      style="width:100px"
                      @update:value="(val: number | null) => { scoreMap[s.id] = val }"
                    />
                    <NText depth="3" style="font-size:12px">分</NText>
                  </div>
                </div>
              </div>

              <!-- 底部保存按钮 -->
              <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:20px;padding-top:16px;border-top:1px solid var(--hairline)">
                <NText depth="3" style="font-size:13px;line-height:32px">
                  已填写 {{ students.filter(s => scoreMap[s.id] !== null && scoreMap[s.id] !== undefined).length }} / {{ students.length }} 人
                </NText>
                <NButton type="primary" :loading="saving" @click="saveScores">
                  保存成绩
                </NButton>
              </div>
            </template>
          </n-card>
        </div>
      </n-spin>

      <!-- 新建考试弹窗 -->
      <n-modal v-model:show="showNewExam" preset="card" title="新建考试" style="width:400px" :mask-closable="false">
        <n-form>
          <n-form-item label="考试名称">
            <n-input v-model:value="newExamName" placeholder="如期中考试、第一次月考" @keydown.enter.prevent="createExam" />
          </n-form-item>
          <n-form-item label="课程">
            <NText>{{ selectedCourseInfo?.name }}</NText>
          </n-form-item>
        </n-form>
        <template #footer>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <n-button @click="showNewExam = false">取消</n-button>
            <n-button type="primary" @click="createExam" :disabled="!newExamName.trim()">创建</n-button>
          </div>
        </template>
      </n-modal>
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
:deep(.n-list-item.active) {
  background: var(--accent-glow);
  border-radius: 6px;
}
</style>
