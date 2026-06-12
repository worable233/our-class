<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { PointRecord, PointSummary } from '@/types'
import { NCard, NGrid, NGi, NTag, NText, NSpace, NSpin, NEmpty, NAvatar } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { ThumbsUp, ThumbsDown, Trophy, BarChart3 } from '@lucide/vue'

const auth = useAuthStore()
const message = useMessage()
const records = ref<PointRecord[]>([])
const summary = ref<PointSummary[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [recs, sum] = await Promise.all([
      api.get<PointRecord[]>(`/points?student_id=${auth.user?.id}`),
      api.get<PointSummary[]>('/points/summary'),
    ])
    records.value = recs
    summary.value = sum
  } catch (e: any) {
    message.error(e.message || '加载数据失败')
  } finally {
    loading.value = false
  }
})

const mySummary = computed(() =>
  summary.value.find(s => s.id === auth.user?.id)
)

const myRank = computed(() => {
  const sorted = [...summary.value].sort((a, b) => b.total_points - a.total_points)
  const idx = sorted.findIndex(s => s.id === auth.user?.id)
  return idx >= 0 ? idx + 1 : null
})

const totalAdded = computed(() => mySummary.value?.total_added || 0)
const totalDeducted = computed(() => mySummary.value?.total_deducted || 0)
const netPoints = computed(() => totalAdded.value - totalDeducted.value)
</script>

<template>
  <div style="width:100%;display:flex;flex-direction:column;gap:24px;padding:24px 0;">
    <!-- Hero Points Display -->
    <n-card
      :bordered="true"
      style="background:linear-gradient(135deg,var(--surface-2),var(--surface-1));border:1px solid var(--hairline-strong);"
    >
      <div style="display:flex;align-items:center;gap:24px;">
        <n-avatar :size="52" round style="background:var(--accent);color:#fff;font-weight:700;font-size:22px;">
          {{ auth.displayName.charAt(0) }}
        </n-avatar>
        <div style="flex:1;min-width:0;">
          <n-text style="font-weight:700;font-size:20px;letter-spacing:-0.02em;line-height:1.3;display:block;">
            {{ auth.displayName }}
          </n-text>
          <n-text depth="3" style="font-size:13px;margin-top:2px;display:block;">
            {{ auth.userClass }}
          </n-text>
        </div>
        <div style="text-align:right;">
          <div :style="{ fontWeight: 800, fontSize: '42px', color: netPoints >= 0 ? '#d97706' : '#ef4444', letterSpacing: '-0.03em', lineHeight: 1 }">
            {{ netPoints > 0 ? '+' : '' }}{{ netPoints }}
          </div>
          <n-text depth="3" style="font-size:13px;margin-top:4px;display:block;">总积分</n-text>
        </div>
      </div>
    </n-card>

    <!-- Stats Row -->
    <n-grid :cols="4" :x-gap="16">
      <n-gi>
        <n-card size="small" :hoverable="true" style="text-align:center;">
          <ThumbsUp :size="22" style="color:#22c55e;margin-bottom:8px;display:block;margin-inline:auto;" />
          <n-text style="font-weight:700;font-size:22px;letter-spacing:-0.02em;line-height:1.2;display:block;">
            +{{ totalAdded }}
          </n-text>
          <n-text depth="3" style="font-size:12px;margin-top:2px;display:block;">获得加分</n-text>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card size="small" :hoverable="true" style="text-align:center;">
          <ThumbsDown :size="22" style="color:#ef4444;margin-bottom:8px;display:block;margin-inline:auto;" />
          <n-text style="font-weight:700;font-size:22px;letter-spacing:-0.02em;line-height:1.2;display:block;">
            -{{ totalDeducted }}
          </n-text>
          <n-text depth="3" style="font-size:12px;margin-top:2px;display:block;">被扣分</n-text>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card size="small" :hoverable="true" style="text-align:center;">
          <Trophy :size="22" style="color:var(--accent-text);margin-bottom:8px;display:block;margin-inline:auto;" />
          <n-text style="font-weight:700;font-size:22px;letter-spacing:-0.02em;line-height:1.2;display:block;">
            {{ myRank ? `#${myRank}` : '—' }}
          </n-text>
          <n-text depth="3" style="font-size:12px;margin-top:2px;display:block;">班级排名</n-text>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card size="small" :hoverable="true" style="text-align:center;">
          <BarChart3 :size="22" style="color:var(--text-muted);margin-bottom:8px;display:block;margin-inline:auto;" />
          <n-text style="font-weight:700;font-size:22px;letter-spacing:-0.02em;line-height:1.2;display:block;">
            {{ records.length }}
          </n-text>
          <n-text depth="3" style="font-size:12px;margin-top:2px;display:block;">评价次数</n-text>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- Points Timeline -->
    <n-card>
      <template #header>
        <n-text strong style="font-size:15px;letter-spacing:-0.01em;">积分记录</n-text>
      </template>
      <n-spin :show="loading">
        <div style="display:flex;flex-direction:column;">
          <div
            v-for="r in records"
            :key="r.id"
            style="display:flex;align-items:center;gap:16px;padding:12px 16px;border-bottom:1px solid var(--hairline);"
          >
            <div
              :style="{
                width:'8px',
                height:'8px',
                borderRadius:'50%',
                flexShrink:0,
                background: r.type === 'add' ? '#22c55e' : '#ef4444'
              }"
            />
            <div style="flex:1;min-width:0;">
              <n-text style="font-size:14px;font-weight:500;line-height:1.4;display:block;">
                {{ r.reason }}
              </n-text>
              <n-text depth="3" style="font-size:12px;margin-top:2px;display:block;">
                {{ r.teacher_name }} &middot; {{ r.date }}
              </n-text>
            </div>
            <span
              :style="{
                fontWeight:700,
                fontSize:'15px',
                flexShrink:0,
                color: r.type === 'add' ? '#22c55e' : '#ef4444'
              }"
            >
              {{ r.type === 'add' ? '+' : '-' }}{{ r.amount }}
            </span>
          </div>
          <n-empty v-if="!loading && records.length === 0" description="暂无积分记录" />
        </div>
      </n-spin>
    </n-card>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
