<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NCard, NDataTable, NTag, NText, NSpin } from 'naive-ui'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useMessage } from 'naive-ui'
import type { PointSummary } from '@/types'
import { Crown } from '@lucide/vue'

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
    render: (row: any) => h('span', { class: 'text-positive' }, `+${row.total_added}`),
  },
  {
    title: '扣分',
    key: 'total_deducted',
    render: (row: any) => h('span', { class: 'text-negative' }, `-${row.total_deducted}`),
  },
  {
    title: '总分',
    key: 'total_points',
    render: (row: any) =>
      h('span', {
        class: row.total_points > 0 ? 'text-positive' : '',
        style: 'font-weight:700;font-size:15px',
      }, `${row.total_points > 0 ? '+' : ''}${row.total_points}`),
  },
]

const rowProps = (row: any) => {
  if (row.id === auth.user?.id) {
    return { class: 'row-highlight' }
  }
  return {}
}
</script>

<template>
  <div class="page-container">
    <!-- Podium -->
    <div v-if="summary.length >= 3" class="podium">
      <div class="podium-item second">
        <div class="podium-rank silver">2</div>
        <div class="podium-avatar">{{ summary[1]!.display_name.charAt(0) }}</div>
        <div class="podium-name">{{ summary[1]!.display_name }}</div>
        <div class="podium-points">{{ summary[1]!.total_points }}</div>
      </div>
      <div class="podium-item first">
        <div class="podium-crown"><Crown :size="20" /></div>
        <div class="podium-rank gold">1</div>
        <div class="podium-avatar big">{{ summary[0]!.display_name.charAt(0) }}</div>
        <div class="podium-name">{{ summary[0]!.display_name }}</div>
        <div class="podium-points highlight">{{ summary[0]!.total_points }}</div>
      </div>
      <div class="podium-item third">
        <div class="podium-rank bronze">3</div>
        <div class="podium-avatar">{{ summary[2]!.display_name.charAt(0) }}</div>
        <div class="podium-name">{{ summary[2]!.display_name }}</div>
        <div class="podium-points">{{ summary[2]!.total_points }}</div>
      </div>
    </div>

    <!-- Table -->
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
/* Podium */
.podium {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: var(--space-4);
  padding: var(--space-8) 0 var(--space-6);
}

.podium-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4) var(--space-4);
  border-radius: var(--radius-xl);
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  min-width: 100px;
  transition: transform var(--duration-normal) var(--ease-out),
              box-shadow var(--duration-normal) var(--ease-out);
}

.podium-item:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.podium-item.first {
  padding-top: var(--space-8);
  border-color: rgba(217, 119, 6, 0.2);
  background: linear-gradient(180deg, rgba(217, 119, 6, 0.04) 0%, var(--surface-1) 100%);
  order: 0;
  position: relative;
}

.podium-item.second { order: -1; }
.podium-item.third { order: 1; }

.podium-crown {
  position: absolute;
  top: var(--space-2);
  color: #d97706;
}

.podium-rank {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--weight-bold);
  font-size: var(--text-caption);
}

.podium-rank.gold { background: rgba(217, 119, 6, 0.12); color: #d97706; }
.podium-rank.silver { background: rgba(168, 162, 158, 0.1); color: #a8a29e; }
.podium-rank.bronze { background: rgba(180, 83, 9, 0.1); color: #b45309; }

.podium-avatar {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: var(--weight-bold);
  font-size: var(--text-subtitle);
  background: var(--accent);
}

.podium-avatar.big {
  width: 52px;
  height: 52px;
  font-size: var(--text-title);
}

.podium-name {
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
}

.podium-points {
  font-size: var(--text-subtitle);
  font-weight: var(--weight-bold);
  color: var(--text-muted);
}

.podium-points.highlight {
  font-size: var(--text-title);
  color: #d97706;
}

/* Mobile */
@media (max-width: 768px) {
  .podium {
    gap: var(--space-2);
    padding: var(--space-6) 0 var(--space-4);
  }

  .podium-item {
    padding: var(--space-4) var(--space-3);
    min-width: 80px;
  }

  .podium-item.first {
    padding-top: var(--space-6);
  }

  .podium-avatar {
    width: 36px;
    height: 36px;
    font-size: var(--text-body);
  }

  .podium-avatar.big {
    width: 44px;
    height: 44px;
    font-size: var(--text-subtitle);
  }
}
</style>
