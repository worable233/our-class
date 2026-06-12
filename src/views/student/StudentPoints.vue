<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { PointRecord, PointSummary } from '@/types'
import { NCard, NGrid, NGi, NTag, NText, NSpin, NEmpty, NAvatar } from 'naive-ui'
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
  <div class="page-container">
    <!-- Hero Points Display -->
    <n-card :bordered="true" class="hero-card">
      <div class="hero-content">
        <n-avatar :size="56" round class="hero-avatar">
          {{ auth.displayName.charAt(0) }}
        </n-avatar>
        <div class="hero-info">
          <div class="hero-name">{{ auth.displayName }}</div>
          <div class="hero-class">{{ auth.userClass }}</div>
        </div>
        <div class="hero-points">
          <div class="points-number" :class="netPoints >= 0 ? 'positive' : 'negative'">
            {{ netPoints > 0 ? '+' : '' }}{{ netPoints }}
          </div>
          <div class="points-label">总积分</div>
        </div>
      </div>
    </n-card>

    <!-- Stats Row -->
    <n-grid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
      <n-gi span="4 m:1">
        <n-card size="small" class="stat-card">
          <div class="stat-icon green"><ThumbsUp :size="20" /></div>
          <div class="stat-value">+{{ totalAdded }}</div>
          <div class="stat-label">获得加分</div>
        </n-card>
      </n-gi>
      <n-gi span="4 m:1">
        <n-card size="small" class="stat-card">
          <div class="stat-icon red"><ThumbsDown :size="20" /></div>
          <div class="stat-value">-{{ totalDeducted }}</div>
          <div class="stat-label">被扣分</div>
        </n-card>
      </n-gi>
      <n-gi span="4 m:1">
        <n-card size="small" class="stat-card">
          <div class="stat-icon accent"><Trophy :size="20" /></div>
          <div class="stat-value">{{ myRank ? `#${myRank}` : '—' }}</div>
          <div class="stat-label">班级排名</div>
        </n-card>
      </n-gi>
      <n-gi span="4 m:1">
        <n-card size="small" class="stat-card">
          <div class="stat-icon muted"><BarChart3 :size="20" /></div>
          <div class="stat-value">{{ records.length }}</div>
          <div class="stat-label">评价次数</div>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- Points Timeline -->
    <n-card class="timeline-card">
      <template #header>
        <span class="card-title">积分记录</span>
      </template>
      <n-spin :show="loading">
        <div class="timeline">
          <div v-for="r in records" :key="r.id" class="timeline-item">
            <div class="timeline-dot" :class="r.type === 'add' ? 'green' : 'red'" />
            <div class="timeline-content">
              <div class="timeline-reason">{{ r.reason }}</div>
              <div class="timeline-meta">{{ r.teacher_name }} · {{ r.date }}</div>
            </div>
            <div class="timeline-amount" :class="r.type === 'add' ? 'positive' : 'negative'">
              {{ r.type === 'add' ? '+' : '-' }}{{ r.amount }}
            </div>
          </div>
          <n-empty v-if="!loading && records.length === 0" description="暂无积分记录" />
        </div>
      </n-spin>
    </n-card>
  </div>
</template>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px 0;
}

/* Hero Card */
.hero-card {
  background: linear-gradient(135deg, var(--surface-2) 0%, var(--surface-1) 100%);
  border: 1px solid var(--hairline-strong);
}

.hero-content {
  display: flex;
  align-items: center;
  gap: 20px;
}

.hero-avatar {
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  font-size: 24px;
  flex-shrink: 0;
}

.hero-info {
  flex: 1;
  min-width: 0;
}

.hero-name {
  font-weight: 700;
  font-size: 20px;
  letter-spacing: -0.02em;
  line-height: 1.3;
  color: var(--text-primary);
}

.hero-class {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 2px;
}

.hero-points {
  text-align: right;
  flex-shrink: 0;
}

.points-number {
  font-weight: 800;
  font-size: 42px;
  letter-spacing: -0.03em;
  line-height: 1;
}

.points-number.positive { color: #d97706; }
.points-number.negative { color: #ef4444; }

.points-label {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Stat Cards */
.stat-card {
  text-align: center;
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 10px;
}

.stat-icon.green { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
.stat-icon.red { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
.stat-icon.accent { background: rgba(94, 106, 210, 0.1); color: var(--accent-text); }
.stat-icon.muted { background: var(--surface-2); color: var(--text-muted); }

.stat-value {
  font-weight: 700;
  font-size: 22px;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--text-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Timeline */
.timeline-card {
  border: 1px solid var(--hairline);
}

.card-title {
  font-weight: 600;
  font-size: 15px;
  letter-spacing: -0.01em;
}

.timeline {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--hairline);
  transition: background 0.15s;
}

.timeline-item:last-child {
  border-bottom: none;
}

.timeline-item:hover {
  background: var(--surface-2);
  margin: 0 -16px;
  padding-left: 16px;
  padding-right: 16px;
  border-radius: 8px;
}

.timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.timeline-dot.green { background: #22c55e; }
.timeline-dot.red { background: #ef4444; }

.timeline-content {
  flex: 1;
  min-width: 0;
}

.timeline-reason {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--text-primary);
}

.timeline-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.timeline-amount {
  font-weight: 700;
  font-size: 15px;
  flex-shrink: 0;
}

.timeline-amount.positive { color: #22c55e; }
.timeline-amount.negative { color: #ef4444; }

/* Mobile */
@media (max-width: 768px) {
  .page-container {
    padding: 16px 0;
    gap: 16px;
  }

  .hero-content {
    flex-wrap: wrap;
    gap: 16px;
  }

  .hero-points {
    width: 100%;
    text-align: left;
    padding-top: 12px;
    border-top: 1px solid var(--hairline);
  }

  .points-number {
    font-size: 36px;
  }
}
</style>
