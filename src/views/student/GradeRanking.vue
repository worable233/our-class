<script setup lang="ts">
import { ref, computed, onMounted, watch, h } from 'vue'
import { NCard, NDataTable, NSelect, NTag, NText, NSpin } from 'naive-ui'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useMessage } from 'naive-ui'
import type { ScoreRanking } from '@/types'
import { Trophy } from '@lucide/vue'

const auth = useAuthStore()
const message = useMessage()
const rankings = ref<ScoreRanking[]>([])
const loading = ref(true)

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
    title: '排名', key: 'rank', width: 80,
    render: (row: any) => h(NTag, {
      size: 'small',
      type: row.rank === 1 ? 'warning' : row.rank === 2 ? 'default' : row.rank === 3 ? 'error' : 'default',
      round: true,
    }, { default: () => String(row.rank) }),
  },
  { title: '姓名', key: 'student_name' },
  { title: '班级', key: 'class' },
  {
    title: '分数', key: 'score', width: 100,
    render: (row: any) => h(NTag, {
      type: row.score >= 80 ? 'success' : row.score >= 60 ? 'warning' : 'error',
      size: 'small', round: true,
    }, { default: () => String(row.score) }),
  },
]

const rowProps = (row: ScoreRanking) => {
  if (row.student_id === auth.user?.id) return { class: 'row-highlight' }
  return {}
}

onMounted(loadCourses)
</script>

<template>
  <div class="page-container">
    <div class="filters">
      <n-select v-model:value="selectedCourse" :options="courseOptions" placeholder="选择课程" style="width:160px" size="small" />
      <n-select v-model:value="selectedExam" :options="examOptions" placeholder="选择考试" style="width:160px" size="small" />
    </div>

    <n-card v-if="myRank" class="my-rank-card" size="small">
      <div class="my-rank-content">
        <div class="my-rank-left">
          <div class="my-rank-icon"><Trophy :size="20" /></div>
          <span class="my-rank-label">我的排名</span>
        </div>
        <div class="my-rank-right">
          <span class="my-rank-number">#{{ myRank.rank }}</span>
          <span class="my-rank-total">/ {{ rankings.length }}</span>
          <span class="my-rank-score">{{ myRank.score }}分</span>
        </div>
      </div>
    </n-card>

    <n-spin :show="loading">
      <n-data-table :columns="columns" :data="rankings" :bordered="false" :single-line="false" :row-props="rowProps" />
    </n-spin>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.my-rank-card {
  border: 1px solid rgba(94, 106, 210, 0.2);
  background: linear-gradient(135deg, rgba(94, 106, 210, 0.04) 0%, transparent 100%);
}

.my-rank-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.my-rank-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.my-rank-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-lg);
  background: rgba(94, 106, 210, 0.1);
  color: var(--accent-text);
  display: flex;
  align-items: center;
  justify-content: center;
}

.my-rank-label {
  font-size: var(--text-body);
  color: var(--text-secondary);
}

.my-rank-right {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.my-rank-number {
  font-weight: var(--weight-bold);
  font-size: 28px;
  letter-spacing: var(--tracking-tight);
  color: var(--accent-text);
}

.my-rank-total {
  font-size: var(--text-subtitle);
  color: var(--text-muted);
}

.my-rank-score {
  font-size: var(--text-subtitle);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  margin-left: var(--space-2);
  padding-left: var(--space-3);
  border-left: 1px solid var(--hairline);
}

@media (max-width: 768px) {
  .my-rank-content {
    flex-direction: column;
    gap: var(--space-3);
    text-align: center;
  }

  .my-rank-right {
    justify-content: center;
  }

  .my-rank-number {
    font-size: var(--text-headline);
  }
}
</style>
