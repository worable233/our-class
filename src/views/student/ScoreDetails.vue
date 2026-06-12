<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Score } from '@/types'
import { NCard, NGrid, NGi, NDataTable, NTag, NText, NSpin, NEmpty } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { TrendingUp, TrendingDown } from '@lucide/vue'

const auth = useAuthStore()
const message = useMessage()
const scores = ref<Score[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    scores.value = await api.get<Score[]>(`/scores?student_id=${auth.user?.id}`)
  } catch (e: any) {
    message.error(e.message || '加载成绩失败')
  } finally {
    loading.value = false
  }
})

const courses = computed(() => Array.from(new Set(scores.value.map(s => s.course))))
const exams = computed(() => Array.from(new Set(scores.value.map(s => s.exam_name))))
const getScore = (course: string, exam: string) => scores.value.find(s => s.course === course && s.exam_name === exam)

const averageByCourse = computed(() => courses.value.map(course => {
  const courseScores = scores.value.filter(s => s.course === course)
  const avg = courseScores.length > 0 ? Math.round(courseScores.reduce((a, b) => a + b.score, 0) / courseScores.length) : 0
  return { course, avg }
}))

const getScoreType = (score: number) => score >= 80 ? 'success' : score >= 60 ? 'warning' : 'error'

const tableColumns = computed(() => [
  { title: '科目', key: 'course', width: 100 },
  ...exams.value.map(e => ({
    title: e, key: e, width: 100,
    render: (row: any) => {
      const s = row.scores[e]
      if (!s) return h(NText, { depth: 3 }, () => '—')
      return h(NTag, { size: 'small', bordered: false, type: getScoreType(s), round: true }, () => s)
    },
  })),
  {
    title: '趋势', key: 'trend', width: 80,
    render: (row: any) => {
      const vals = exams.value.map(e => row.scores[e]).filter(v => v != null)
      if (vals.length < 2) return h(NText, { depth: 3 }, () => '—')
      const isUp = vals[vals.length - 1] >= vals[vals.length - 2]
      return h('span', { class: isUp ? 'text-positive' : 'text-negative', style: 'display:flex;align-items:center;gap:4px;font-size:12px' }, [
        isUp ? h(TrendingUp, { size: 14 }) : h(TrendingDown, { size: 14 }),
        isUp ? '上升' : '下降',
      ])
    },
  },
])

const tableData = computed(() => courses.value.map(c => {
  const row: any = { course: c, scores: {} }
  for (const e of exams.value) {
    const s = getScore(c, e)
    row[e] = s?.score ?? null
    row.scores[e] = s?.score ?? null
  }
  return row
}))
</script>

<template>
  <div class="page-container">
    <n-spin :show="loading">
      <div v-if="!loading && scores.length === 0" style="padding: 80px 0">
        <n-empty description="暂无成绩数据" />
      </div>

      <template v-if="scores.length > 0">
        <div class="section-hint">个人成绩详情与趋势分析</div>

        <n-grid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true" class="avg-grid">
          <n-gi v-for="a in averageByCourse" :key="a.course" span="4 m:1">
            <n-card size="small" class="avg-card" :class="getScoreType(a.avg)">
              <div class="avg-course">{{ a.course }}</div>
              <div class="avg-value">{{ a.avg }}</div>
              <div class="avg-label">平均分</div>
            </n-card>
          </n-gi>
        </n-grid>

        <n-card class="table-card">
          <n-data-table :bordered="false" :single-line="false" :columns="tableColumns" :data="tableData" />
        </n-card>
      </template>
    </n-spin>
  </div>
</template>

<style scoped>
.section-hint {
  font-size: var(--text-body);
  color: var(--text-muted);
  margin-bottom: var(--space-6);
}

.avg-grid {
  margin-bottom: var(--space-6);
}

.avg-card {
  text-align: center;
  transition: transform var(--duration-normal) var(--ease-out), box-shadow var(--duration-normal) var(--ease-out);
  border-left: 3px solid transparent;
}

.avg-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.avg-card.success { border-left-color: #22c55e; background: rgba(34, 197, 94, 0.03); }
.avg-card.warning { border-left-color: #f59e0b; background: rgba(245, 158, 11, 0.03); }
.avg-card.error { border-left-color: #ef4444; background: rgba(239, 68, 68, 0.03); }

.avg-course {
  font-size: var(--text-caption);
  color: var(--text-muted);
  margin-bottom: var(--space-1);
}

.avg-value {
  font-size: 28px;
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--text-primary);
}

.avg-label {
  font-size: var(--text-overline);
  color: var(--text-muted);
  margin-top: var(--space-1);
}

.table-card {
  border: 1px solid var(--hairline);
}

@media (max-width: 768px) {
  .avg-value {
    font-size: var(--text-headline);
  }
}
</style>
