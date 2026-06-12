<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import {
  NCard,
  NDataTable,
  NTag,
  NText,
  NSpin,
  NEmpty,
} from 'naive-ui'
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
    render: (row: any, i: number) =>
      h(
        NTag,
        {
          size: 'small',
          type:
            i === 0
              ? 'warning'
              : i === 1
                ? 'default'
                : i === 2
                  ? 'error'
                  : 'default',
        },
        { default: () => String(i + 1) },
      ),
  },
  {
    title: '姓名',
    key: 'display_name',
  },
  {
    title: '班级',
    key: 'class',
  },
  {
    title: '加分',
    key: 'total_added',
    render: (row: any) =>
      h(NText, { type: 'success' }, { default: () => `+${row.total_added}` }),
  },
  {
    title: '扣分',
    key: 'total_deducted',
    render: (row: any) =>
      h(NText, { type: 'error' }, { default: () => `-${row.total_deducted}` }),
  },
  {
    title: '总分',
    key: 'total_points',
    render: (row: any) =>
      h(
        NText,
        {
          type: row.total_points > 0 ? 'success' : 'default',
          strong: true,
        },
        {
          default: () =>
            `${row.total_points > 0 ? '+' : ''}${row.total_points}`,
        },
      ),
  },
]

const rowProps = (row: any) => {
  if (row.id === auth.user?.id) {
    return { style: 'background: rgba(94, 106, 210, 0.08); border-left: 3px solid var(--accent);' }
  }
  return {}
}
</script>

<template>
  <div>

    <!-- Podium Top 3 -->
    <div
      v-if="summary.length >= 3"
      class="podium"
      style="
        display: flex;
        justify-content: center;
        align-items: flex-end;
        gap: var(--space-md);
        margin-bottom: var(--space-2xl);
        padding: var(--space-xl) 0;
      "
    >
      <!-- 2nd Place -->
      <div
        class="podium-item second"
        style="
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-lg) var(--space-xl) var(--space-xl);
          border-radius: var(--radius-lg);
          background: var(--surface-1);
          border: 1px solid var(--hairline);
          position: relative;
          min-width: 100px;
          transition: border-color 150ms var(--ease-out);
          order: -1;
        "
      >
        <div
          class="podium-rank silver"
          style="
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 13px;
            background: rgba(168, 162, 158, 0.1);
            color: #a8a29e;
          "
        >
          2
        </div>
        <div
          class="podium-avatar"
          style="
            width: 40px;
            height: 40px;
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-weight: 700;
            font-size: 16px;
            background: var(--accent);
          "
        >
          {{ summary[1]!.display_name.charAt(0) }}
        </div>
        <div
          class="podium-name"
          style="
            font-family: 'Inter Tight', sans-serif;
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
          "
        >
          {{ summary[1]!.display_name }}
        </div>
        <div
          class="podium-points"
          style="font-size: 16px; font-weight: 700; color: var(--text-muted)"
        >
          {{ summary[1]!.total_points }}
        </div>
      </div>

      <!-- 1st Place -->
      <div
        class="podium-item first"
        style="
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-2xl) var(--space-xl) var(--space-xl);
          border-radius: var(--radius-lg);
          background: var(--surface-1);
          border: 1px solid rgba(217, 119, 6, 0.12);
          position: relative;
          min-width: 100px;
          transition: border-color 150ms var(--ease-out);
          order: 0;
        "
      >
        <div
          class="podium-rank gold"
          style="
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 13px;
            background: rgba(217, 119, 6, 0.12);
            color: #d97706;
          "
        >
          1
        </div>
        <div
          class="podium-crown"
          style="
            font-size: 22px;
            color: #d97706;
            position: absolute;
            top: -8px;
          "
        >
          <Crown :size="22" style="color:#d97706" />
        </div>
        <div
          class="podium-avatar big"
          style="
            width: 48px;
            height: 48px;
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-weight: 700;
            font-size: 20px;
            background: var(--accent);
          "
        >
          {{ summary[0]!.display_name.charAt(0) }}
        </div>
        <div
          class="podium-name"
          style="
            font-family: 'Inter Tight', sans-serif;
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
          "
        >
          {{ summary[0]!.display_name }}
        </div>
        <div
          class="podium-points highlight"
          style="font-size: 20px; font-weight: 700; color: #d97706"
        >
          {{ summary[0]!.total_points }}
        </div>
      </div>

      <!-- 3rd Place -->
      <div
        class="podium-item third"
        style="
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-lg) var(--space-xl) var(--space-xl);
          border-radius: var(--radius-lg);
          background: var(--surface-1);
          border: 1px solid var(--hairline);
          position: relative;
          min-width: 100px;
          transition: border-color 150ms var(--ease-out);
          order: 1;
        "
      >
        <div
          class="podium-rank bronze"
          style="
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 13px;
            background: rgba(180, 83, 9, 0.1);
            color: #b45309;
          "
        >
          3
        </div>
        <div
          class="podium-avatar"
          style="
            width: 40px;
            height: 40px;
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-weight: 700;
            font-size: 16px;
            background: var(--accent);
          "
        >
          {{ summary[2]!.display_name.charAt(0) }}
        </div>
        <div
          class="podium-name"
          style="
            font-family: 'Inter Tight', sans-serif;
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
          "
        >
          {{ summary[2]!.display_name }}
        </div>
        <div
          class="podium-points"
          style="font-size: 16px; font-weight: 700; color: var(--text-muted)"
        >
          {{ summary[2]!.total_points }}
        </div>
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
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
