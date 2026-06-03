<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Student, PointSummary, Submission } from '@/types'
import { NCard, NGrid, NGi, NTag, NText, NSpace, NSpin, NEmpty } from 'naive-ui'

const auth = useAuthStore()
const students = ref<Student[]>([])
const pointSummary = ref<PointSummary[]>([])
const pendingSubmissions = ref<Submission[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [sts, pts, subs] = await Promise.all([
      api.get<Student[]>('/students'),
      api.get<PointSummary[]>('/points/summary'),
      (async () => {
        const assignments = await api.get<any[]>('/assignments')
        if (assignments.length === 0) return []
        const first = assignments[0]
        return api.get<Submission[]>(`/assignments/${first.id}/submissions`)
      })(),
    ])
    students.value = sts
    pointSummary.value = pts
    pendingSubmissions.value = subs.filter(s => s.status === 'pending')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:24px">
    <n-spin :show="loading">
      <n-grid :cols="4" :x-gap="16">
        <n-gi>
          <n-card>
            <div style="font-family:'Inter Tight',sans-serif;font-weight:700;font-size:32px;letter-spacing:-0.02em;margin-bottom:4px">
              {{ students.length }}
            </div>
            <div style="font-size:14px;color:var(--text-muted)">班级人数</div>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card>
            <div style="font-family:'Inter Tight',sans-serif;font-weight:700;font-size:32px;letter-spacing:-0.02em;margin-bottom:4px">
              {{ pendingSubmissions.length }}
            </div>
            <div style="font-size:14px;color:var(--text-muted)">待批改</div>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card>
            <div style="font-family:'Inter Tight',sans-serif;font-weight:700;font-size:32px;letter-spacing:-0.02em;margin-bottom:4px">
              {{ pointSummary.length }}
            </div>
            <div style="font-size:14px;color:var(--text-muted)">积分活跃学生</div>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card :style="{ borderColor: 'rgba(94,106,210,0.15)', background: 'rgba(94,106,210,0.05)' }">
            <div style="font-family:'Inter Tight',sans-serif;font-weight:700;font-size:32px;letter-spacing:-0.02em;margin-bottom:4px">
              {{ pointSummary.reduce((a, b) => a + b.total_points, 0) }}
            </div>
            <div style="font-size:14px;color:var(--text-muted)">总积分</div>
          </n-card>
        </n-gi>
      </n-grid>

      <n-card style="margin-top:24px">
        <template #header>积分排行（前 5）</template>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div
            v-for="(p, i) in pointSummary.slice(0, 5)"
            :key="p.id"
            style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;background:var(--surface-2)"
          >
            <span
              :style="{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '13px',
                color: i === 0 ? '#eab308' : i === 1 ? '#a8a29e' : i === 2 ? '#b45309' : 'var(--text-muted)',
                background: i === 0 ? 'rgba(234,179,8,0.15)' : i === 1 ? 'rgba(168,162,158,0.15)' : i === 2 ? 'rgba(180,83,9,0.15)' : 'var(--surface-3)',
              }"
            >
              {{ i + 1 }}
            </span>
            <span style="flex:1;font-size:14px;font-weight:500;color:var(--text-primary)">{{ p.display_name }}</span>
            <span :style="{ fontWeight: 600, fontSize: '14px', color: p.total_points > 0 ? '#22c55e' : 'var(--text-muted)' }">
              {{ p.total_points > 0 ? '+' : '' }}{{ p.total_points }}
            </span>
          </div>
          <n-empty v-if="pointSummary.length === 0" description="暂无数据" />
        </div>
      </n-card>

      <n-card style="margin-top:24px">
        <template #header>最近待批改作业</template>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div
            v-for="s in pendingSubmissions.slice(0, 5)"
            :key="s.id"
            style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:6px;background:var(--surface-2)"
          >
            <div style="flex:1;font-size:14px;font-weight:500;color:var(--text-primary)">{{ s.student_name }}</div>
            <div style="font-size:13px;color:var(--text-muted)">{{ s.submitted_at?.slice(0, 10) }}</div>
            <n-tag size="small" type="warning">待批改</n-tag>
          </div>
          <n-empty v-if="pendingSubmissions.length === 0" description="暂无待批改作业" />
        </div>
      </n-card>
    </n-spin>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
