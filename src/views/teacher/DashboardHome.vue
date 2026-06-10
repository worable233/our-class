<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { BASE } from '@/api/client'
import { useRouter } from 'vue-router'
import { NSpin, NCard, NText, NGi, NGrid, NTag } from 'naive-ui'
import { Star, Users, List, Shield, Bot, LayoutDashboard, TrendingUp, Award } from '@lucide/vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { useRefresh } from '@/composables/useRefresh'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent])

const router = useRouter()

// 快捷入口
const quickLinks = [
  { label: '积分管理', icon: Star, route: '/teacher/points', color: '#0FC6C2' },
  { label: '用户管理', icon: Users, route: '/teacher/users', color: '#5E6AD2' },
  { label: '作业管理', icon: List, route: '/teacher/assignments', color: '#18a058' },
  { label: '职位管理', icon: Shield, route: '/teacher/roles', color: '#f0a020' },
  { label: 'AI 配置', icon: Bot, route: '/teacher/settings', color: '#a050dc' },
]

// 排行数据
interface TopRow {
  id: number
  display_name: string
  class: string
  total: number
  total_added: number
  total_deducted: number
}

const weeklyTop = ref<TopRow[]>([])
const monthlyTop = ref<TopRow[]>([])
const loading = ref(true)

function getToken(): string {
  const stored = localStorage.getItem('ourclass_user')
  if (stored) return JSON.parse(stored).token || ''
  return ''
}

async function load() {
  try {
    const headers = { Authorization: `Bearer ${getToken()}` }
    const [weekRes, monthRes] = await Promise.all([
      fetch(`${BASE}/points/top?days=7`, { headers }),
      fetch(`${BASE}/points/top?days=30`, { headers }),
    ])
    const week = await weekRes.json()
    const month = await monthRes.json()
    if (week.success) weeklyTop.value = week.data || []
    if (month.success) monthlyTop.value = month.data || []
  } catch {} finally {
    loading.value = false
  }
}

function chartOption(data: TopRow[], title: string) {
  const names = data.map(r => r.display_name)
  const values = data.map(r => r.total)
  const colors = data.map((_, i) => {
    const t = i / Math.max(data.length - 1, 1)
    const r = Math.round(15 + t * 94)
    const g = Math.round(198 - t * 60)
    const b = Math.round(194 - t * 30)
    return `rgb(${r},${g},${b})`
  })
  return {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 16, right: 16, bottom: 24, top: 8, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: names,
      axisLabel: { fontSize: 11, color: '#888' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      axisLabel: { fontSize: 11, color: '#888' },
    },
    series: [{
      type: 'bar' as const,
      data: values.map((v, i) => ({ value: v, itemStyle: { color: colors[i], borderRadius: [4, 4, 0, 0] } })),
      barWidth: '60%',
    }],
  }
}

const weekChartOption = computed(() => chartOption(weeklyTop.value, '本周积分排行'))
const monthChartOption = computed(() => chartOption(monthlyTop.value, '本月积分排行'))

useRefresh(load)
onMounted(load)
</script>

<template>
  <div style="height:100%;display:flex;flex-direction:column;gap:24px;">
    <!-- Page title -->
    <div>
      <NText tag="h2" style="margin:0 0 4px;font-size:24px;font-weight:700;">仪表盘</NText>
      <NText depth="3" style="display:block;margin:0;font-size:14px;">班级概览与快速操作</NText>
    </div>

    <!-- Quick links -->
    <n-grid :cols="5" :x-gap="12" :y-gap="12" style="max-width:800px">
      <n-gi v-for="link in quickLinks" :key="link.label">
        <n-card
          size="small"
          :bordered="true"
          hoverable
          @click="router.push(link.route)"
          style="cursor:pointer;text-align:center;padding:8px 0;transition:all .2s"
          :style="'--accent:'+link.color"
        >
          <div :style="{width:36,height:36,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 6px',background:link.color+'20',color:link.color}">
            <component :is="link.icon" :size="18" />
          </div>
          <div style="font-size:12px;font-weight:500;color:var(--text-primary)">{{ link.label }}</div>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- Charts -->
    <n-grid :cols="2" :x-gap="16" :y-gap="16" style="flex:1">
      <n-gi>
        <n-card size="small" :bordered="true" style="height:100%">
          <template #header>
            <div style="display:flex;align-items:center;gap:8px">
              <Award :size="16" style="color:#0FC6C2" />
              <span style="font-size:14px;font-weight:600">本周积分排行</span>
              <n-tag size="tiny" :bordered="false" round style="font-size:10px">近 7 天</n-tag>
            </div>
          </template>
          <n-spin :show="loading" style="min-height:240px">
            <VChart v-if="weeklyTop.length > 0" :option="weekChartOption" autoresize style="width:100%;height:300px" />
            <div v-else style="display:flex;align-items:center;justify-content:center;height:300px;color:var(--text-muted);font-size:13px">暂无本周积分数据</div>
          </n-spin>
        </n-card>
      </n-gi>
      <n-gi>
        <n-card size="small" :bordered="true" style="height:100%">
          <template #header>
            <div style="display:flex;align-items:center;gap:8px">
              <TrendingUp :size="16" style="color:#5E6AD2" />
              <span style="font-size:14px;font-weight:600">本月积分排行</span>
              <n-tag size="tiny" :bordered="false" round style="font-size:10px">近 30 天</n-tag>
            </div>
          </template>
          <n-spin :show="loading" style="min-height:240px">
            <VChart v-if="monthlyTop.length > 0" :option="monthChartOption" autoresize style="width:100%;height:300px" />
            <div v-else style="display:flex;align-items:center;justify-content:center;height:300px;color:var(--text-muted);font-size:13px">暂无本月积分数据</div>
          </n-spin>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .n-grid { grid-template-columns: repeat(2, 1fr) !important; }
}
</style>
