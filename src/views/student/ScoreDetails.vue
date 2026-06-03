<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
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
import { h } from 'vue'

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
</script>

<template>
  <n-spin :show="loading">
    <div style="max-width: 800px;">
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

        <div
          style="background: var(--surface-1); border: 1px solid var(--hairline); border-radius: var(--radius-md); overflow: hidden;"
        >
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th
                  style="text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; background: var(--surface-2); border-bottom: 1px solid var(--hairline);"
                >
                  科目
                </th>
                <th
                  v-for="e in exams"
                  :key="e"
                  style="text-align: center; padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; background: var(--surface-2); border-bottom: 1px solid var(--hairline);"
                >
                  {{ e }}
                </th>
                <th
                  style="text-align: center; padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; background: var(--surface-2); border-bottom: 1px solid var(--hairline);"
                >
                  趋势
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in courses" :key="c">
                <td
                  style="text-align: left; padding: 12px 16px; font-size: 14px; font-weight: 500; color: var(--text-primary); border-bottom: 1px solid var(--hairline);"
                >
                  {{ c }}
                </td>
                <td
                  v-for="e in exams"
                  :key="e"
                  style="text-align: center; padding: 12px 16px; border-bottom: 1px solid var(--hairline);"
                >
                  <n-tag
                    v-if="getScore(c, e)"
                    :type="
                      (getScore(c, e)?.score || 0) >= 80
                        ? 'success'
                        : (getScore(c, e)?.score || 0) >= 60
                          ? 'warning'
                          : 'error'
                    "
                    size="small"
                    :bordered="false"
                  >
                    {{ getScore(c, e)?.score }}
                  </n-tag>
                  <n-text v-else depth="3">&mdash;</n-text>
                </td>
                <td
                  style="text-align: center; padding: 12px 16px; font-size: 13px; font-weight: 500; border-bottom: 1px solid var(--hairline);"
                >
                  <div v-if="scores.filter(s => s.course === c).length >= 2">
                    <n-text
                      v-if="
                        (scores.filter(s => s.course === c).slice(-1)[0]
                          ?.score || 0) >=
                        (scores.filter(s => s.course === c).slice(-2, -1)[0]
                          ?.score || 0)
                      "
                      :type="'success'"
                    >
                      &uarr; 上升
                    </n-text>
                    <n-text v-else :type="'error'"> &darr; 下降 </n-text>
                  </div>
                  <n-text v-else depth="3">&mdash;</n-text>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </n-spin>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
