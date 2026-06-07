<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { NButton, NCard, NDataTable, NSelect, NTag, NText, NSpace, NSpin, NEmpty } from 'naive-ui'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { ScoreRanking } from '@/types'

const auth = useAuthStore()
const rankings = ref<ScoreRanking[]>([])
const courses = ['数学', '英语', '语文', '物理']
const exams = ['第一次月考', '期中考试', '第二次月考', '期末考试']
const selectedCourse = ref('数学')
const selectedExam = ref('期中考试')
const loading = ref(true)

const courseOptions = computed(() => courses.map((c) => ({ label: c, value: c })))
const examOptions = computed(() => exams.map((e) => ({ label: e, value: e })))

async function load() {
  loading.value = true
  rankings.value = await api.get<ScoreRanking[]>(
    `/scores/rankings?course=${selectedCourse.value}&exam_name=${selectedExam.value}`,
  )
  loading.value = false
}

const myRank = computed(() => rankings.value.find((r) => r.student_id === auth.user?.id))

const columns = [
  {
    title: '排名',
    key: 'rank',
    render: (row: any) =>
      h(
        NTag,
        {
          size: 'small',
          type:
            row.rank === 1 ? 'warning' : row.rank === 2 ? 'default' : row.rank === 3 ? 'error' : 'default',
        },
        { default: () => String(row.rank) },
      ),
  },
  { title: '姓名', key: 'student_name' },
  { title: '班级', key: 'class' },
  {
    title: '分数',
    key: 'score',
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

onMounted(load)
</script>

<template>
  <div>

    <n-space style="margin-bottom: 20px;">
      <n-select v-model:value="selectedCourse" :options="courseOptions" @update:value="load" />
      <n-select v-model:value="selectedExam" :options="examOptions" @update:value="load" />
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
          <span
            style="font-weight: 700; font-size: 24px; letter-spacing: -0.02em;"
          >#{{ myRank.rank }} / {{ rankings.length }}</span>
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
