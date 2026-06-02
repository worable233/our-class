<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import type { Score, PointRecord, Assignment } from '@/types'
import { NCard, NGrid, NGi, NTag, NText, NSpace, NSpin, NEmpty, NAvatar } from 'naive-ui'

const auth = useAuthStore()
const scores = ref<Score[]>([])
const points = ref<PointRecord[]>([])
const assignments = ref<Assignment[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [scs, pts, asgns] = await Promise.all([
      api.get<Score[]>(`/scores?student_id=${auth.user?.id}`),
      api.get<PointRecord[]>(`/points?student_id=${auth.user?.id}`),
      api.get<Assignment[]>(`/assignments?student_id=${auth.user?.id}`),
    ])
    scores.value = scs
    points.value = pts
    assignments.value = asgns
  } finally {
    loading.value = false
  }
})

const avgScore = computed(() => scores.value.length > 0
  ? Math.round(scores.value.reduce((a, b) => a + b.score, 0) / scores.value.length)
  : 0)
const totalPoints = computed(() => points.value.reduce((a, b) => a + (b.type === 'add' ? b.amount : -b.amount), 0))
const completedAssignments = computed(() => assignments.value.filter(a => a.submit_status === 'graded').length)
</script>

<template>
  <div style="max-width: 800px;">
    <n-spin :show="loading" style="min-height: 200px;">
      <!-- Profile Header -->
      <div
        style="display: flex; align-items: center; gap: 24px; background: var(--surface-1); border: 1px solid var(--hairline); border-radius: var(--radius-lg); padding: 32px; margin-bottom: 24px;"
      >
        <n-avatar
          :size="64"
          round
          style="background: var(--accent); color: #fff; font-weight: 700; font-size: 28px; flex-shrink: 0;"
        >
          {{ auth.displayName.charAt(0) }}
        </n-avatar>
        <div>
          <n-text
            strong
            style="font-size: 22px; letter-spacing: -0.02em; line-height: 1.3; display: block; margin-bottom: 2px;"
          >
            {{ auth.displayName }}
          </n-text>
          <n-text depth="3" style="font-size: 14px; display: block; margin-bottom: 12px;">
            {{ auth.userClass }}
          </n-text>
          <n-space size="small">
            <n-tag size="small" :bordered="false">学生</n-tag>
            <n-tag size="small" :bordered="false">ID: {{ auth.user?.id }}</n-tag>
          </n-space>
        </div>
      </div>

      <!-- Stats Row -->
      <n-grid :cols="4" :x-gap="16" style="margin-bottom: 24px;">
        <n-gi>
          <n-card size="small">
            <n-text
              style="font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; display: block; margin-bottom: 4px;"
            >
              {{ scores.length }}
            </n-text>
            <n-text depth="3" style="font-size: 14px;">考试次数</n-text>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card size="small" style="border-color: rgba(94, 106, 210, 0.15);">
            <n-text
              style="font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; display: block; margin-bottom: 4px;"
            >
              {{ avgScore }}
            </n-text>
            <n-text depth="3" style="font-size: 14px;">平均分</n-text>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card size="small">
            <n-text
              style="font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; display: block; margin-bottom: 4px;"
            >
              {{ totalPoints }}
            </n-text>
            <n-text depth="3" style="font-size: 14px;">总积分</n-text>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card size="small">
            <n-text
              style="font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; display: block; margin-bottom: 4px;"
            >
              {{ completedAssignments }}
            </n-text>
            <n-text depth="3" style="font-size: 14px;">已完成作业</n-text>
          </n-card>
        </n-gi>
      </n-grid>

      <!-- Points Records Section -->
      <n-card>
        <template #header>
          <n-text strong style="font-size: 16px; letter-spacing: -0.01em;">积分记录</n-text>
        </template>
        <div v-if="points.length > 0" style="display: flex; flex-direction: column; gap: 8px;">
          <div
            v-for="r in points.slice(0, 10)"
            :key="r.id"
            style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 6px; background: var(--surface-2); border: 1px solid var(--hairline);"
          >
            <div
              style="width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0;"
              :style="{
                background: r.type === 'add' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                color: r.type === 'add' ? '#22c55e' : '#ef4444',
              }"
            >
              {{ r.type === 'add' ? '+' : '−' }}
            </div>
            <div style="flex: 1; min-width: 0;">
              <n-text style="font-size: 13px; font-weight: 500; line-height: 1.4; display: block;">
                {{ r.reason }}
              </n-text>
              <n-text depth="3" style="font-size: 12px; display: block; margin-top: 2px;">
                {{ r.date }}
              </n-text>
            </div>
            <span
              style="font-weight: 700; font-size: 15px; flex-shrink: 0;"
              :style="{ color: r.type === 'add' ? '#22c55e' : '#ef4444' }"
            >
              {{ r.type === 'add' ? '+' : '-' }}{{ r.amount }}
            </span>
          </div>
        </div>
        <n-empty v-else description="暂无积分记录" />
      </n-card>
    </n-spin>
  </div>
</template>
