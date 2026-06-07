<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Score } from '@/types'
import {
  NCard,
  NGrid,
  NGi,
  NDataTable,
  NTag,
  NText,
  NSpace,
  NSpin,
  NEmpty,
} from 'naive-ui'

const auth = useAuthStore()
const scores = ref<Score[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    scores.value = await api.get<Score[]>(`/scores?student_id=${auth.user?.id}`)
  } finally {
    loading.value = false
  }
})

const courses = computed(() => {
  const c = new Set(scores.value.map(s => s.course))
  return Array.from(c)
})

const exams = computed(() => {
  const e = new Set(scores.value.map(s => s.exam_name))
  return Array.from(e)
})

const getScore = (course: string, exam: string) =>
  scores.value.find(s => s.course === course && s.exam_name === exam)

const averageByCourse = computed(() => {
  return courses.value.map(course => {
    const courseScores = scores.value.filter(s => s.course === course)
    const avg = courseScores.length > 0
      ? Math.round(courseScores.reduce((a, b) => a + b.score, 0) / courseScores.length)
      : 0
    return { course, avg }
  })
})

const tableColumns = computed(() => {
  const cols: any[] = [
    { title: '科目', key: 'course', width: 100 },
    ...exams.value.map(e => ({
      title: e, key: e, width: 100,
      render: (row: any) => {
        const s = row.scores[e]
        if (!s) return h(NText, { depth: 3 }, () => '—')
        return h(NTag, {
          size: 'small',
          bordered: false,
          type: s >= 80 ? 'success' : s >= 60 ? 'warning' : 'error',
        }, () => s)
      },
    })),
    {
      title: '趋势', key: 'trend', width: 80,
      render: (row: any) => {
        const vals = exams.value.map(e => row.scores[e]).filter(v => v != null)
        if (vals.length < 2) return h(NText, { depth: 3 }, () => '—')
        return vals[vals.length - 1] >= vals[vals.length - 2]
          ? h(NText, { type: 'success', depth: 3 }, () => '↑ 上升')
          : h(NText, { type: 'error', depth: 3 }, () => '↓ 下降')
      },
    },
  ]
  return cols
})

const tableData = computed(() => {
  return courses.value.map(c => {
    const row: any = { course: c, scores: {} }
    for (const e of exams.value) {
      const s = getScore(c, e)
      row[e] = s?.score ?? null
      row.scores[e] = s?.score ?? null
    }
    return row
  })
})
</script>

<template>
  <n-spin :show="loading">
    <div>
      <div v-if="!loading && scores.length === 0" style="padding: 80px 0;">
        <n-empty description="暂无成绩数据" />
      </div>

      <template v-if="scores.length > 0">
        <div style="margin-bottom: 20px; font-size: 14px;">
          <n-text depth="3">个人成绩详情与趋势分析</n-text>
        </div>

        <n-grid :cols="4" :x-gap="12" style="margin-bottom: 24px;">
          <n-gi v-for="a in averageByCourse" :key="a.course">
            <n-card
              size="small"
              :style="{
                borderColor:
                  a.avg >= 80 ? '#22c55e' : a.avg >= 60 ? '#f59e0b' : '#ef4444',
                background:
                  a.avg >= 80
                    ? 'rgba(34,197,94,0.05)'
                    : a.avg >= 60
                      ? 'rgba(245,158,11,0.05)'
                      : 'rgba(239,68,68,0.05)',
              }"
            >
              <div style="text-align: center;">
                <div style="font-size: 13px; margin-bottom: 4px;">
                  <n-text depth="3">{{ a.course }}</n-text>
                </div>
                <div
                  style="font-size: 28px; font-weight: 700; letter-spacing: -0.02em;"
                >
                  {{ a.avg }}
                </div>
                <div style="font-size: 11px; margin-top: 2px;">
                  <n-text depth="3">平均分</n-text>
                </div>
              </div>
            </n-card>
          </n-gi>
        </n-grid>

        <n-data-table
          :bordered="false"
          :single-line="false"
          :columns="tableColumns"
          :data="tableData"
        />
      </template>
    </div>
  </n-spin>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
