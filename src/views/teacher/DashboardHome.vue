<script setup lang="ts">
import { ref, computed, shallowRef, watch, onMounted } from 'vue'
import { BASE } from '@/api/client'
import { useMessage } from 'naive-ui'
import { NSpin, NEmpty, NButton } from 'naive-ui'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent,
} from 'echarts/components'
import { useRefresh } from '@/composables/useRefresh'
import { RotateCw } from '@lucide/vue'

use([CanvasRenderer, LineChart, BarChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

interface VisitPoint { date: string; visits: number }
interface ApiCallPoint { date: string; calls: number; tokens: number; models: string[] }
interface TechItem { name: string; category: string; description: string; color: string }
interface DashboardData {
  users: { total: number; students: number; teachers: number }
  totalPointRecords: number
  totalSubmissions: number
  totalMessages: number
  totalConversations: number
  totalViews: number
  visitTrend: VisitPoint[]
  apiTrend: ApiCallPoint[]
  techStack: TechItem[]
}

function getToken(): string {
  const stored = localStorage.getItem('ourclass_user')
  if (stored) return (JSON.parse(stored).token || '') as string
  return ''
}

const message = useMessage()
const data = ref<DashboardData | null>(null)
const loading = ref(true)

const visitChartOption = shallowRef({})
const apiChartOption = shallowRef({})

async function load() {
  loading.value = true
  try {
    const res = await fetch(`${BASE}/analytics/dashboard`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const body = await res.json()
    if (body.success) data.value = body.data
    else throw new Error(body.error?.message)
  } catch (e: any) {
    message.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function buildCharts(d: DashboardData) {
  const dateLabels = d.visitTrend.map(p => p.date.slice(5))

  visitChartOption.value = {
    grid: { left: 40, right: 16, top: 8, bottom: 24 },
    xAxis: {
      type: 'category',
      data: dateLabels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 10, color: '#787d87', interval: 4 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)', type: 'dashed' } },
      axisLabel: { fontSize: 10, color: '#787d87' },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(18,19,20,0.92)',
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#f5f9fe', fontSize: 12 },
      formatter: (params: any) => {
        const p = params[0]
        return `<div style="font-weight:600;margin-bottom:4px">${p.axisValue}</div>访问量：<span style="color:#5E6AD2;font-weight:600">${p.value}</span>`
      },
    },
    series: [{
      type: 'bar',
      data: d.visitTrend.map(p => p.visits),
      itemStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(94,106,210,0.8)' },
            { offset: 1, color: 'rgba(94,106,210,0.15)' },
          ],
        },
        borderRadius: [3, 3, 0, 0],
      },
      emphasis: { itemStyle: { color: '#5E6AD2' } },
    }],
  }

  apiChartOption.value = {
    grid: { left: 40, right: 16, top: 8, bottom: 24 },
    xAxis: {
      type: 'category',
      data: dateLabels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 10, color: '#787d87', interval: 4 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)', type: 'dashed' } },
      axisLabel: { fontSize: 10, color: '#787d87' },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(18,19,20,0.92)',
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#f5f9fe', fontSize: 12 },
      formatter: (params: any) => {
        const p = params[0]
        const idx = p.dataIndex
        const day = d.apiTrend[idx]!
        let html = `<div style="font-weight:600;margin-bottom:6px;font-size:13px">${p.axisValue}</div>`
        html += `<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:2px">调用次数<span style="color:#18a058;font-weight:600">${p.value}</span></div>`
        html += `<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:2px">Token 消耗<span style="color:#f0a020;font-weight:600">${day.tokens.toLocaleString()}</span></div>`
        if (day.models.length > 0) {
          html += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.08)"><span style="color:var(--text-muted);font-size:11px">模型：</span>`
          html += day.models.map((m: string) => `<span style="color:#5E6AD2;font-size:11px;font-weight:500">${m}</span>`).join('、')
          html += '</div>'
        }
        return html
      },
    },
    series: [{
      type: 'line',
      data: d.apiTrend.map(p => p.calls),
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { color: '#18a058', width: 2 },
      itemStyle: { color: '#18a058' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(24,160,88,0.3)' },
            { offset: 1, color: 'rgba(24,160,88,0.02)' },
          ],
        },
      },
    }],
  }
}

watch(data, (d) => {
  if (d) buildCharts(d)
})

const techCategories = computed(() => {
  if (!data.value) return []
  const map: Record<string, TechItem[]> = {}
  for (const t of data.value.techStack) {
    if (!map[t.category]) map[t.category] = []
    const cat = map[t.category]!
    cat.push(t)
  }
  return Object.entries(map)
})

  useRefresh(load)
onMounted(load)
</script>

<template>
  <div>
    <div style="margin-bottom: 16px; text-align: right;">
      <NButton quaternary size="small" @click="load" :disabled="loading">
        <template #icon><RotateCw :size="15" /></template>
        刷新
      </NButton>
    </div>

    <NSpin :show="loading" style="min-height: 400px">
      <template v-if="data">
        <!-- Stats Row -->
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-icon user-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div>
              <div class="stat-num">{{ data.users.total }}</div>
              <div class="stat-label">注册用户</div>
              <div class="stat-sub">{{ data.users.students }} 学生 · {{ data.users.teachers }} 教师</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon visit-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            </div>
            <div>
              <div class="stat-num">{{ data.totalViews }}</div>
              <div class="stat-label">网站流量</div>
              <div class="stat-sub">30天访问 {{ data.visitTrend.reduce((s, p) => s + p.visits, 0) }}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon msg-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div>
              <div class="stat-num">{{ data.totalMessages }}</div>
              <div class="stat-label">AI 消息总数</div>
              <div class="stat-sub">{{ data.totalConversations }} 个对话</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon activity-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <div class="stat-num">{{ data.totalPointRecords + data.totalSubmissions }}</div>
              <div class="stat-label">总操作记录</div>
              <div class="stat-sub">{{ data.totalPointRecords }} 积分 · {{ data.totalSubmissions }} 作业</div>
            </div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="charts-row">
          <div class="chart-card">
            <div class="chart-header">
              <div>
                <div class="chart-title">访问趋势</div>
                <div class="chart-sub">最近 30 天</div>
              </div>
              <span class="chart-stat">峰值 {{ Math.max(...data.visitTrend.map(p => p.visits)) }}</span>
            </div>
            <div class="chart-body">
              <VChart :option="visitChartOption" autoresize style="width:100%;height:200px" />
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div>
                <div class="chart-title">大模型 API 调用趋势</div>
                <div class="chart-sub">最近 30 天</div>
              </div>
              <span class="chart-stat">总计 {{ data.apiTrend.reduce((s, p) => s + p.calls, 0) }} 次</span>
            </div>
            <div class="chart-body">
              <VChart :option="apiChartOption" autoresize style="width:100%;height:200px" />
            </div>
          </div>
        </div>

        <!-- Tech Stack -->
        <div class="section-title">网站技术栈</div>
        <div class="tech-grid">
          <div v-for="[category, items] in techCategories" :key="category" class="tech-group">
            <div class="tech-category-label">{{ category }}</div>
            <div class="tech-items">
              <div v-for="item in items" :key="item.name" class="tech-item">
                <div class="tech-dot" :style="{ background: item.color }" />
                <div>
                  <div class="tech-name">{{ item.name }}</div>
                  <div class="tech-desc">{{ item.description }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <NEmpty v-else-if="!loading" description="暂无数据" />
    </NSpin>
  </div>
</template>

<style scoped>
.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 10px;
  padding: 18px 20px;
}
.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.user-icon { background: rgba(94, 106, 210, 0.12); color: #5E6AD2; }
.visit-icon { background: rgba(24, 160, 88, 0.12); color: #18a058; }
.msg-icon { background: rgba(240, 160, 32, 0.12); color: #f0a020; }
.activity-icon { background: rgba(208, 48, 80, 0.12); color: #d03050; }
.stat-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  line-height: 1.2;
}
.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 1px;
}
.stat-sub {
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.7;
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 28px;
}
.chart-card {
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 10px;
  overflow: hidden;
}
.chart-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 18px 0;
}
.chart-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.chart-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 1px;
}
.chart-stat {
  font-size: 12px;
  font-weight: 500;
  color: var(--accent);
  background: rgba(94, 106, 210, 0.1);
  padding: 2px 10px;
  border-radius: 6px;
  white-space: nowrap;
}
.chart-body {
  padding: 8px 12px 12px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 14px;
}
.tech-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}
.tech-group {
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 10px;
  padding: 16px 18px;
}
.tech-category-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}
.tech-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tech-item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tech-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tech-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}
.tech-desc {
  font-size: 11px;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
  .stats-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
