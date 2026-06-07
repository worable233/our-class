<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Assignment, Score, PointRecord } from '@/types'
import { NCard, NGrid, NGi, NTag, NText, NSpace, NSpin, NEmpty } from 'naive-ui'

const auth = useAuthStore()
const assignments = ref<Assignment[]>([])
const scores = ref<Score[]>([])
const points = ref<PointRecord[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [asgns, scs, pts] = await Promise.all([
      api.get<Assignment[]>(`/assignments?student_id=${auth.user?.id}`),
      api.get<Score[]>(`/scores?student_id=${auth.user?.id}`),
      api.get<PointRecord[]>(`/points?student_id=${auth.user?.id}`),
    ])
    assignments.value = asgns
    scores.value = scs
    points.value = pts
  } finally {
    loading.value = false
  }
})

const pendingAssignments = computed(() => assignments.value.filter(a => a.submit_status === 'pending' || !a.submit_status))
const avgScore = computed(() => scores.value.length > 0
  ? Math.round(scores.value.reduce((a, b) => a + b.score, 0) / scores.value.length)
  : 0)
const totalPoints = computed(() => points.value.reduce((a, b) => a + (b.type === 'add' ? b.amount : -b.amount), 0))
</script>

<template>
  <n-spin :show="loading">
    <div style="width: 100%; display:flex; flex-direction:column; gap:24px">
      <div style="margin-bottom:8px">
        <h2 style="font-family:'Inter Tight',sans-serif;font-weight:700;font-size:24px;color:var(--text-primary);letter-spacing:-0.02em;margin-bottom:4px;margin-block:0">
          欢迎回来，{{ auth.displayName }}
        </h2>
        <p style="font-size:14px;color:var(--text-muted);margin:0">班级：{{ auth.userClass }}</p>
      </div>

      <n-grid :cols="4" :x-gap="16">
        <n-gi>
          <n-card size="small">
            <n-text style="font-family:'Inter Tight',sans-serif;font-weight:700;font-size:32px;letter-spacing:-0.02em;display:block;margin-bottom:4px">
              {{ pendingAssignments }}
            </n-text>
            <n-text depth="3">待完成作业</n-text>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card size="small" :style="{ borderColor: 'rgba(94,106,210,0.15)', background: 'rgba(94,106,210,0.05)' }">
            <n-text style="font-family:'Inter Tight',sans-serif;font-weight:700;font-size:32px;letter-spacing:-0.02em;display:block;margin-bottom:4px">
              {{ avgScore }}
            </n-text>
            <n-text depth="3">平均分</n-text>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card size="small">
            <n-text style="font-family:'Inter Tight',sans-serif;font-weight:700;font-size:32px;letter-spacing:-0.02em;display:block;margin-bottom:4px">
              {{ scores.length }}
            </n-text>
            <n-text depth="3">考试次数</n-text>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card size="small">
            <n-text :style="{ fontFamily: '\'Inter Tight\', sans-serif', fontWeight: 700, fontSize: '32px', letterSpacing: '-0.02em', display: 'block', marginBottom: '4px', color: totalPoints >= 0 ? '#22c55e' : undefined }">
              {{ totalPoints > 0 ? '+' : '' }}{{ totalPoints }}
            </n-text>
            <n-text depth="3">总积分</n-text>
          </n-card>
        </n-gi>
      </n-grid>

      <n-card>
        <template #header>最近成绩</template>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div v-for="s in scores.slice(-4)" :key="s.id"
            :style="{
              display: 'flex', flexDirection: 'column', gap: '2px',
              padding: '12px 16px', borderRadius: 'var(--radius-sm)',
              minWidth: '100px',
              background: s.score >= 80 ? 'rgba(34,197,94,0.1)' : s.score >= 60 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'
            }">
            <span style="font-size:12px;color:var(--text-muted)">{{ s.course }}</span>
            <span style="font-weight:700;font-size:24px;color:var(--text-primary)">{{ s.score }}</span>
            <span style="font-size:11px;color:var(--text-muted)">{{ s.exam_name }}</span>
          </div>
          <n-empty v-if="scores.length === 0" description="暂无成绩数据" />
        </div>
      </n-card>

      <n-card>
        <template #header>待完成作业</template>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div v-for="a in assignments.filter(a => a.submit_status !== 'graded').slice(0, 5)" :key="a.id"
            style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-radius:var(--radius-sm);background:var(--surface-2)">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:14px;font-weight:500;color:var(--text-primary)">{{ a.title }}</span>
              <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:var(--surface-3);color:var(--text-muted)">{{ a.course }}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-muted)">
              截止 {{ a.due_date }}
              <n-tag v-if="a.submit_status === 'pending'" size="small" type="warning">已提交</n-tag>
              <n-tag v-else-if="a.submit_score !== null" size="small" type="success">{{ a.submit_score }}分</n-tag>
              <n-tag v-else size="small">未提交</n-tag>
            </div>
          </div>
          <n-empty v-if="assignments.filter(a => a.submit_status !== 'graded').length === 0" description="暂无待完成作业" />
        </div>
      </n-card>
    </div>
  </n-spin>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
