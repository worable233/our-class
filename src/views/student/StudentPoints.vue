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
    <!-- Hero Card -->
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
          <div class="points-number" :class="netPoints >= 0 ? 'text-positive' : 'text-negative'">
            {{ netPoints > 0 ? '+' : '' }}{{ netPoints }}
          </div>
          <div class="points-label">总积分</div>
        </div>
      </div>
    </n-card>

    <!-- Stats Grid -->
    <n-grid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
      <n-gi span="4 m:1">
        <n-card size="small" class="stat-card">
          <div class="stat-icon bg-positive text-positive"><ThumbsUp :size="20" /></div>
          <div class="stat-value">+{{ totalAdded }}</div>
          <div class="stat-label">获得加分</div>
        </n-card>
      </n-gi>
      <n-gi span="4 m:1">
        <n-card size="small" class="stat-card">
          <div class="stat-icon bg-negative text-negative"><ThumbsDown :size="20" /></div>
          <div class="stat-value">-{{ totalDeducted }}</div>
          <div class="stat-label">被扣分</div>
        </n-card>
      </n-gi>
      <n-gi span="4 m:1">
        <n-card size="small" class="stat-card">
          <div class="stat-icon bg-accent text-accent"><Trophy :size="20" /></div>
          <div class="stat-value">{{ myRank ? `#${myRank}` : '—' }}</div>
          <div class="stat-label">班级排名</div>
        </n-card>
      </n-gi>
      <n-gi span="4 m:1">
        <n-card size="small" class="stat-card">
          <div class="stat-icon" style="background:var(--surface-2);color:var(--text-muted)"><BarChart3 :size="20" /></div>
          <div class="stat-value">{{ records.length }}</div>
          <div class="stat-label">评价次数</div>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- Timeline -->
    <n-card class="timeline-card">
      <template #header>
        <span class="card-title">积分记录</span>
      </template>
      <n-spin :show="loading">
        <div class="timeline">
          <div v-for="r in records" :key="r.id" class="timeline-item">
            <div class="timeline-dot" :class="r.type === 'add' ? 'text-positive' : 'text-negative'" />
            <div class="timeline-content">
              <div class="timeline-reason">{{ r.reason }}</div>
              <div class="timeline-meta">{{ r.teacher_name }} · {{ r.date }}</div>
            </div>
            <div class="timeline-amount" :class="r.type === 'add' ? 'text-positive' : 'text-negative'">
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
/* Hero */
.hero-card {
  background: linear-gradient(135deg, var(--surface-2) 0%, var(--surface-1) 100%);
  border: 1px solid var(--hairline-strong);
}

.hero-content {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.hero-avatar {
  background: var(--accent);
  color: #fff;
  font-weight: var(--weight-bold);
  font-size: var(--text-headline);
  flex-shrink: 0;
}

.hero-info {
  flex: 1;
  min-width: 0;
}

.hero-name {
  font-weight: var(--weight-bold);
  font-size: var(--text-title);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--text-primary);
}

.hero-class {
  font-size: var(--text-caption);
  color: var(--text-muted);
  margin-top: var(--space-1);
}

.hero-points {
  text-align: right;
  flex-shrink: 0;
}

.points-number {
  font-weight: var(--weight-extrabold);
  font-size: var(--text-display);
  letter-spacing: var(--tracking-tight);
  line-height: 1;
}

.points-label {
  font-size: var(--text-caption);
  color: var(--text-muted);
  margin-top: var(--space-1);
}

/* Timeline */
.timeline-card {
  border: 1px solid var(--hairline);
}

.timeline-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--hairline);
  transition: background var(--duration-fast);
}

.timeline-item:last-child {
  border-bottom: none;
}

.timeline-item:hover {
  background: var(--surface-2);
  margin: 0 calc(-1 * var(--space-4));
  padding-left: var(--space-4);
  padding-right: var(--space-4);
  border-radius: var(--radius-md);
}

.timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  background: currentColor;
}

.timeline-content {
  flex: 1;
  min-width: 0;
}

.timeline-reason {
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  line-height: var(--leading-normal);
  color: var(--text-primary);
}

.timeline-meta {
  font-size: var(--text-caption);
  color: var(--text-muted);
  margin-top: var(--space-1);
}

.timeline-amount {
  font-weight: var(--weight-bold);
  font-size: var(--text-body);
  flex-shrink: 0;
}

/* Mobile */
@media (max-width: 768px) {
  .hero-content {
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .hero-points {
    width: 100%;
    text-align: left;
    padding-top: var(--space-3);
    border-top: 1px solid var(--hairline);
  }

  .points-number {
    font-size: 34px;
  }
}
</style>
