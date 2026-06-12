<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NCard, NDataTable, NTag, NText, NSpin } from 'naive-ui'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useMessage } from 'naive-ui'
import type { PointSummary } from '@/types'
import { Crown, Medal } from '@lucide/vue'

const auth = useAuthStore()
const message = useMessage()
const summary = ref<PointSummary[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const data = await api.get<PointSummary[]>('/points/summary')
    summary.value = [...data].sort((a, b) => b.total_points - a.total_points)
  } catch (e: any) {
    message.error(e.message || '加载数据失败')
  } finally {
    loading.value = false
  }
})

const columns = [
  {
    title: '排名',
    key: 'rank',
    width: 80,
    render: (_row: any, i: number) =>
      h(NTag, {
        size: 'small',
        type: i === 0 ? 'warning' : i === 1 ? 'default' : i === 2 ? 'error' : 'default',
        round: true,
      }, { default: () => String(i + 1) }),
  },
  { title: '姓名', key: 'display_name' },
  { title: '班级', key: 'class' },
  {
    title: '加分',
    key: 'total_added',
    render: (row: any) => h('span', { class: 'score-positive' }, `+${row.total_added}`),
  },
  {
    title: '扣分',
    key: 'total_deducted',
    render: (row: any) => h('span', { class: 'score-negative' }, `-${row.total_deducted}`),
  },
  {
    title: '总分',
    key: 'total_points',
    render: (row: any) =>
      h('span', {
        class: row.total_points > 0 ? 'score-positive' : '',
        style: 'font-weight:700;font-size:15px',
      }, `${row.total_points > 0 ? '+' : ''}${row.total_points}`),
  },
]

const rowProps = (row: any) => {
  if (row.id === auth.user?.id) {
    return { class: 'my-row' }
  }
  return {}
}
</script>

<template>
  <div class="page-container">
    <!-- Podium Top 3 -->
    <div v-if="summary.length >= 3" class="podium">
      <!-- 2nd Place -->
      <div class="podium-item second">
        <div class="podium-rank silver">2</div>
        <div class="podium-avatar">{{ summary[1]!.display_name.charAt(0) }}</div>
        <div class="podium-name">{{ summary[1]!.display_name }}</div>
        <div class="podium-points">{{ summary[1]!.total_points }}</div>
      </div>

      <!-- 1st Place -->
      <div class="podium-item first">
        <div class="podium-crown"><Crown :size="20" /></div>
        <div class="podium-rank gold">1</div>
        <div class="podium-avatar big">{{ summary[0]!.display_name.charAt(0) }}</div>
        <div class="podium-name">{{ summary[0]!.display_name }}</div>
        <div class="podium-points highlight">{{ summary[0]!.total_points }}</div>
      </div>

      <!-- 3rd Place -->
      <div class="podium-item third">
        <div class="podium-rank bronze">3</div>
        <div class="podium-avatar">{{ summary[2]!.display_name.charAt(0) }}</div>
        <div class="podium-name">{{ summary[2]!.display_name }}</div>
        <div class="podium-points">{{ summary[2]!.total_points }}</div>
      </div>
    </div>

    <!-- Full Rankings -->
    <n-spin :show="loading">
      <n-data-table
        :columns="columns"
        :data="summary"
        :bordered="false"
        :single-line="false"
        :row-props="rowProps"
      />
    </n-spin>
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px 0;
}

.score-positive { color: #22c55e; }
.score-negative { color: #ef4444; }

:deep(.my-row) {
  background: rgba(94, 106, 210, 0.06) !important;
  border-left: 3px solid var(--accent);
}

/* Podium */
.podium {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 32px;
  padding: 32px 0 24px;
}

.podium-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px 20px 20px;
  border-radius: 16px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  min-width: 100px;
  transition: transform 0.2s, box-shadow 0.2s;
}

.podium-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.podium-item.first {
  padding-top: 32px;
  border-color: rgba(217, 119, 6, 0.2);
  background: linear-gradient(180deg, rgba(217, 119, 6, 0.04) 0%, var(--surface-1) 100%);
  order: 0;
  position: relative;
}

.podium-item.second { order: -1; }
.podium-item.third { order: 1; }

.podium-crown {
  position: absolute;
  top: 8px;
  color: #d97706;
}

.podium-rank {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
}

.podium-rank.gold { background: rgba(217, 119, 6, 0.12); color: #d97706; }
.podium-rank.silver { background: rgba(168, 162, 158, 0.1); color: #a8a29e; }
.podium-rank.bronze { background: rgba(180, 83, 9, 0.1); color: #b45309; }

.podium-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 18px;
  background: var(--accent);
}

.podium-avatar.big {
  width: 52px;
  height: 52px;
  font-size: 22px;
}

.podium-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.podium-points {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-muted);
}

.podium-points.highlight {
  font-size: 20px;
  color: #d97706;
}

/* Mobile */
@media (max-width: 768px) {
  .podium {
    gap: 8px;
    padding: 20px 0 16px;
  }

  .podium-item {
    padding: 16px 12px 14px;
    min-width: 80px;
  }

  .podium-item.first {
    padding-top: 24px;
  }

  .podium-avatar {
    width: 36px;
    height: 36px;
    font-size: 14px;
  }

  .podium-avatar.big {
    width: 44px;
    height: 44px;
    font-size: 18px;
  }
}
</style>
