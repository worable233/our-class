<script setup lang="ts">
import { ref, computed, onMounted, watch, h } from 'vue'
import { NCard, NDataTable, NSelect, NTag, NText, NSpin, NSpace } from 'naive-ui'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useMessage } from 'naive-ui'
import type { ScoreRanking } from '@/types'

const auth = useAuthStore()
const message = useMessage()
const rankings = ref<ScoreRanking[]>([])
const loading = ref(true)

// 动态获取课程和考试列表
interface ExamInfo { exam_name: string; date: string; count: number }

const courseOptions = ref<{ label: string; value: string }[]>([])
const examOptions = ref<{ label: string; value: string }[]>([])
const selectedCourse = ref<string>('')
const selectedExam = ref<string>('')
let initializing = true

async function loadCourses() {
  try {
    const courses = await api.get<any[]>('/courses')
    courseOptions.value = courses.map(c => ({ label: c.name, value: c.name }))
    if (courseOptions.value.length > 0 && !selectedCourse.value) {
      initializing = true
      selectedCourse.value = courseOptions.value[0]!.value
      await loadExams()
      initializing = false
    }
  } catch {
    // fallback: 从自己的成绩中推导课程
    try {
      const scores = await api.get<any[]>(`/scores?student_id=${auth.user?.id}`)
      const courseSet = new Set(scores.map((s: any) => s.course))
      courseOptions.value = Array.from(courseSet).map(c => ({ label: c, value: c }))
      if (courseOptions.value.length > 0) {
        initializing = true
        selectedCourse.value = courseOptions.value[0]!.value
        const examSet = new Set(scores.filter((s: any) => s.course === selectedCourse.value).map((s: any) => s.exam_name))
        examOptions.value = Array.from(examSet).map(e => ({ label: e, value: e }))
        if (examOptions.value.length > 0) {
          selectedExam.value = examOptions.value[0]!.value
          await load()
        }
        initializing = false
      }
    } catch (e: any) {
      message.error(e.message || '加载课程失败')
    }
  }
}

async function loadExams() {
  if (!selectedCourse.value) return
  try {
    const exams = await api.get<ExamInfo[]>(`/scores/exams?course=${encodeURIComponent(selectedCourse.value)}`)
    examOptions.value = exams.map(e => ({ label: e.exam_name, value: e.exam_name }))
    if (examOptions.value.length > 0) {
      initializing = true
      selectedExam.value = examOptions.value[0]!.value
      await load()
      initializing = false
    } else {
      examOptions.value = []
      selectedExam.value = ''
      rankings.value = []
    }
  } catch (e: any) {
    message.error(e.message || '加载考试列表失败')
    examOptions.value = []
  }
}

async function load() {
  if (!selectedCourse.value || !selectedExam.value) return
  loading.value = true
  try {
    rankings.value = await api.get<ScoreRanking[]>(
      `/scores/rankings?course=${encodeURIComponent(selectedCourse.value)}&exam_name=${encodeURIComponent(selectedExam.value)}`,
    )
  } catch (e: any) {
    message.error(e.message || '加载排名失败')
    rankings.value = []
  }
  loading.value = false
}

watch(selectedCourse, () => { if (!initializing) loadExams() })
watch(selectedExam, () => { if (!initializing && selectedExam.value) load() })

const myRank = computed(() => rankings.value.find((r) => r.student_id === auth.user?.id))

const columns = [
  {
    title: '排名',
    key: 'rank',
    width: 80,
    render: (row: any) =>
      h(NTag, {
        size: 'small',
        type: row.rank === 1 ? 'warning' : row.rank === 2 ? 'default' : row.rank === 3 ? 'error' : 'default',
      }, { default: () => String(row.rank) }),
  },
  { title: '姓名', key: 'student_name' },
  { title: '班级', key: 'class' },
  {
    title: '分数',
    key: 'score',
    width: 100,
    render: (row: any) => {
      const t = row.score >= 80 ? 'success' : row.score >= 60 ? 'warning' : 'error'
      return h(NTag, { type: t, size: 'small' }, { default: () => String(row.score) })
    },
  },
]

const rowProps = (row: ScoreRanking) => {
  if (row.student_id === auth.user?.id) {
    return { style: 'background: rgba(94,106,210,0.03);' }
  }
  return {}
}

onMounted(loadCourses)
</script>

<template>
  <div>
    <n-space style="margin-bottom: 20px;">
      <n-select
        v-model:value="selectedCourse"
        :options="courseOptions"
        placeholder="选择课程"
        style="width: 160px"
      />
      <n-select
        v-model:value="selectedExam"
        :options="examOptions"
        placeholder="选择考试"
        style="width: 160px"
      />
    </n-space>

    <n-card
      v-if="myRank"
      :bordered="true"
      style="border: 1px solid rgba(94,106,210,0.3); margin-bottom: 20px;"
      size="small"
    >
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <n-text depth="3" style="font-size: 14px;">我的排名</n-text>
        <div>
          <span style="font-weight: 700; font-size: 24px; letter-spacing: -0.02em;">#{{ myRank.rank }} / {{ rankings.length }}</span>
          <n-text depth="2" style="font-size: 16px; margin-left: 12px;">{{ myRank.score }}分</n-text>
        </div>
      </div>
    </n-card>

    <n-spin :show="loading">
      <n-data-table
        :columns="columns"
        :data="rankings"
        :bordered="false"
        :single-line="false"
        :row-props="rowProps"
      />
    </n-spin>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
