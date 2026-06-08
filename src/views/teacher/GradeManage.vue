<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue'
import {
  NButton,
  NSelect,
  NInputNumber,
  NDataTable,
  NText,
  NSpace,
  NTag,
  NSpin,
  NEmpty,
  NAvatar,
} from 'naive-ui'
import { api } from '@/api/client'
import type { Student, Score } from '@/types'

const students = ref<Student[]>([])
const scores = ref<Score[]>([])
const courses = ['数学', '英语', '语文', '物理']
const exams = ['第一次月考', '期中考试', '第二次月考', '期末考试']
const selectedCourse = ref('数学')
const selectedExam = ref('期中考试')
const loading = ref(true)

const courseOptions = computed(() => courses.map((c) => ({ label: c, value: c })))
const examOptions = computed(() => exams.map((e) => ({ label: e, value: e })))

const filteredScores = computed(() =>
  scores.value.filter(
    (s) => s.course === selectedCourse.value && s.exam_name === selectedExam.value,
  ),
)

const inputValues = ref<Record<number, number | null>>({})

async function load() {
  loading.value = true
  const [sts, scs] = await Promise.all([
    api.get<Student[]>('/students'),
    api.get<Score[]>('/scores'),
  ])
  students.value = sts
  scores.value = scs
  loading.value = false
}

async function addOrUpdate(studentId: number, score: number | null) {
  const existing = scores.value.find(
    (s) =>
      s.student_id === studentId &&
      s.course === selectedCourse.value &&
      s.exam_name === selectedExam.value,
  )
  if (existing) {
    await api.put(`/scores/${existing.id}`, { score })
    existing.score = score || 0
  } else if (score !== null) {
    const res = await api.post<{ id: number }>('/scores', {
      student_id: studentId,
      course: selectedCourse.value,
      exam_name: selectedExam.value,
      score,
      date: new Date().toISOString().split('T')[0],
    })
    scores.value.push({
      id: res.id,
      student_id: studentId,
      student_name: '',
      course: selectedCourse.value,
      exam_name: selectedExam.value,
      score,
      total_score: 100,
      date: '',
    })
  }
}

const getScore = (studentId: number) =>
  filteredScores.value.find((s) => s.student_id === studentId)?.score

const columns = computed(() => {
  // Establish reactive dependency so the table re-renders when scores change
  void filteredScores.value

  return [
    {
      title: '学生',
      key: 'display_name',
      render: (row: Student) =>
        h(NSpace, { align: 'center' }, {
          default: () => [
            h(NAvatar, { size: 28, round: true }, { default: () => row.display_name.charAt(0) }),
            row.display_name,
          ],
        }),
    },
    {
      title: '班级',
      key: 'class',
    },
    {
      title: '成绩',
      key: 'score',
      width: 120,
      render: (row: Student) => {
        const score = getScore(row.id)
        if (score === undefined) {
          return h(NTag, { type: 'default', size: 'small' }, { default: () => '未录入' })
        }
        const type = score >= 80 ? 'success' : score >= 60 ? 'warning' : 'error'
        return h(NTag, { type, size: 'small' }, { default: () => String(score) })
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (row: Student) =>
        h('div', { style: 'display: flex; gap: 8px; align-items: center;' }, [
          h(NInputNumber, {
            value: inputValues.value[row.id] ?? null,
            min: 0,
            max: 100,
            placeholder: '分数',
            size: 'small',
            style: 'width: 100px',
            'on-update:value': (val: number | null) => {
              inputValues.value[row.id] = val
            },
          }),
          h(
            NButton,
            {
              size: 'small',
              type: 'primary',
              onClick: () => addOrUpdate(row.id, inputValues.value[row.id] ?? null),
            },
            { default: () => '保存' },
          ),
        ]),
    },
  ]
})

onMounted(load)
</script>

<template>
  <div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <NText tag="h2" style="margin:0 0 4px;font-size:24px;font-weight:700;">成绩管理</NText>
        <NText depth="3" style="display:block;margin:0;font-size:14px;">录入和管理学生的考试成绩与排名</NText>
      </div>
      <n-space>
        <n-select v-model:value="selectedCourse" :options="courseOptions" style="width: 160px" />
        <n-select v-model:value="selectedExam" :options="examOptions" style="width: 160px" />
      </n-space>
    </div>

    <n-data-table
      :columns="columns"
      :data="students"
      :bordered="false"
      :single-line="false"
      :loading="loading"
    />
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
