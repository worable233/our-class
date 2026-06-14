<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { BASE } from '@/api/client'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { NCard, NText, NGi, NGrid, NTag, NSpin, NAvatar, NButton, NEmpty, useThemeVars } from 'naive-ui'
import { Star, Users, List, Shield, Bot, Award, Trophy, TrendingUp, ChevronRight } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { useRefresh } from '@/composables/useRefresh'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent])

const router = useRouter()
const themeVars = useThemeVars()
const auth = useAuthStore()

const quickLinks = computed(() => {
  const links = [
    { label: '积分管理', icon: Star, route: '/teacher/points', color: '#5E6AD2', perm: 'points.read' },
    { label: '用户管理', icon: Users, route: '/teacher/users', color: '#5E6AD2', perm: 'students.write' },
    { label: '作业管理', icon: List, route: '/teacher/assignments', color: '#5E6AD2', perm: 'assignments.write' },
    { label: '职位管理', icon: Shield, route: '/teacher/roles', color: '#5E6AD2', perm: '' },
    { label: 'AI 配置', icon: Bot, route: '/teacher/settings', color: '#5E6AD2', perm: 'chat.config' },
  ]
  return links.filter(l => !l.perm || auth.hasPermission(l.perm))
})

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

// 排名辅助
function rankBadge(index: number) {
  if (index === 0) return { icon: Trophy, color: '#f0a020' }
  if (index === 1) return { icon: Trophy, color: '#8899AA' }
  if (index === 2) return { icon: Trophy, color: '#CD7F32' }
  return { text: `#${index + 1}`, color: 'var(--text-muted)' }
}

function chartOption(data: TopRow[]) {
  const names = data.map(r => r.display_name.length > 4 ? r.display_name.slice(0, 4) + '..' : r.display_name)
  const values = data.map(r => r.total)
  const maxVal = Math.max(...values, 1)
  return {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      formatter: (params: any[]) => {
        const p = params[0]
        const row = data[p.dataIndex]
        return `<div style="font-size:13px;line-height:1.8">
          <b>${row.display_name}</b> <span style="color:#888">${row.class}</span><br/>
          总积分: <b style="color:#18a058">+${row.total_added}</b> / <b style="color:#d03050">-${row.total_deducted}</b>
          <br/>净增: <b>${row.total > 0 ? '+' : ''}${row.total}</b>
        </div>`
      },
    },
    grid: { left: 4, right: 8, bottom: 4, top: 4, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: names,
      axisLabel: { fontSize: 11, color: '#888', fontWeight: 500 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      max: maxVal * 1.25,
      splitLine: { lineStyle: { color: 'rgba(128,128,128,0.08)', type: 'dashed' as const } },
      axisLabel: { fontSize: 10, color: '#999' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar' as const,
      data: values.map((v, i) => ({
        value: v,
        itemStyle: {
          color: i === 0 ? 'var(--accent)' : i === 1 ? 'var(--accent)' : i === 2 ? '#f0a020' : 'rgba(128,128,128,0.25)',
          borderRadius: [4, 4, 0, 0] as [number, number, number, number],
        },
      })),
      barWidth: '55%',
      animationDuration: 600,
      animationEasing: 'cubicOut' as const,
    }],
  }
}

const weekChartOption = computed(() => chartOption(weeklyTop.value))
const monthChartOption = computed(() => chartOption(monthlyTop.value))

useRefresh(load)
onMounted(load)
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:20px;padding-bottom:24px;">
    <!-- ═══ 页面标题 ═══ -->
    <PageHeader title="仪表盘" subtitle="班级概览 · 快速操作" />

    <!-- ═══ 快捷入口 ═══ -->
    <n-grid :cols="quickLinks.length" :x-gap="14" :y-gap="14" style="max-width:820px;">
      <n-gi v-for="link in quickLinks" :key="link.label">
        <n-card
          size="small"
          :bordered="true"
          hoverable
          @click="router.push(link.route)"
          style="cursor:pointer;transition:all .2s ease;text-align:center;"
          :style="{ '--accent': link.color }"
        >
          <div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0;">
            <div
              :style="{
                width: 44, height: 44, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${link.color}22, ${link.color}11)`,
                color: link.color,
                border: `1px solid ${link.color}18`,
              }"
            >
              <component :is="link.icon" :size="20" :stroke-width="1.5" />
            </div>
            <NText style="font-size:13px;font-weight:500;color:var(--text-primary);line-height:1;">{{ link.label }}</NText>
          </div>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- ═══ 积分排行 ═══ -->
    <n-grid :cols="2" :x-gap="20" :y-gap="20">
      <!-- ── 本周 ── -->
      <n-gi>
        <n-card :bordered="true" size="small" style="height:100%;">
          <template #header>
            <div style="display:flex;align-items:center;gap:8px;">
              <Award :size="18" style="color:#0FC6C2;" />
              <span style="font-size:15px;font-weight:600;">本周积分榜</span>
              <n-tag size="tiny" :bordered="false" round style="font-size:10px;font-weight:400;">近 7 天</n-tag>
            </div>
          </template>
          <n-spin :show="loading" style="min-height:260px;">
            <template v-if="weeklyTop.length > 0">
              <!-- 前三名突出展示 -->
              <div style="display:flex;gap:12px;margin-bottom:16px;">
                <div v-for="(row, i) in weeklyTop.slice(0, 3)" :key="row.id"
                  style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 8px;border-radius:10px;background:var(--surface-2);"
                >
                  <component :is="rankBadge(i).icon" :size="22" v-if="rankBadge(i).icon" :color="rankBadge(i).color" /><span v-else style="font-size:22px;line-height:1;">{{ rankBadge(i).text }}</span>
                  <span style="font-size:13px;font-weight:600;color:var(--text-primary);text-align:center;">{{ row.display_name }}</span>
                  <span style="font-size:11px;color:var(--text-muted);">{{ row.class }}</span>
                  <span style="font-size:18px;font-weight:700;color:var(--accent);">{{ row.total > 0 ? '+' : '' }}{{ row.total }}</span>
                </div>
              </div>
              <!-- 排行列表 -->
              <VChart :option="weekChartOption" autoresize style="width:100%;height:140px;" />
              <!-- 完整列表 -->
              <div style="margin-top:12px;display:flex;flex-direction:column;gap:2px;">
                <div v-for="(row, i) in weeklyTop" :key="row.id"
                  style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;font-size:13px;transition:background .15s;"
                  :style="{ background: i % 2 === 0 ? 'var(--surface-1)' : 'transparent' }"
                >
                  <span :style="{ width: 24, textAlign: 'center', fontWeight: i < 3 ? 600 : 400, color: rankBadge(i).color, display: 'flex', alignItems: 'center', justifyContent: 'center' }">
                    <component :is="rankBadge(i).icon" :size="16" v-if="rankBadge(i).icon" />
                    <span v-else>{{ rankBadge(i).text }}</span>
                  </span>
                  <span style="flex:1;color:var(--text-primary);font-weight:500;">{{ row.display_name }}</span>
                  <span style="color:var(--text-muted);font-size:12px;">{{ row.class }}</span>
                  <span style="font-weight:600;min-width:48px;text-align:right;color:var(--accent);">{{ row.total > 0 ? '+' : '' }}{{ row.total }}</span>
                </div>
              </div>
            </template>
            <n-empty v-else description="暂无本周积分数据" style="height:260px;display:flex;flex-direction:column;justify-content:center;" />
          </n-spin>
        </n-card>
      </n-gi>

      <!-- ── 本月 ── -->
      <n-gi>
        <n-card :bordered="true" size="small" style="height:100%;">
          <template #header>
            <div style="display:flex;align-items:center;gap:8px;">
              <TrendingUp :size="18" style="color:#5E6AD2;" />
              <span style="font-size:15px;font-weight:600;">本月积分榜</span>
              <n-tag size="tiny" :bordered="false" round style="font-size:10px;font-weight:400;">近 30 天</n-tag>
            </div>
          </template>
          <n-spin :show="loading" style="min-height:260px;">
            <template v-if="monthlyTop.length > 0">
              <div style="display:flex;gap:12px;margin-bottom:16px;">
                <div v-for="(row, i) in monthlyTop.slice(0, 3)" :key="row.id"
                  style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 8px;border-radius:10px;background:var(--surface-2);"
                >
                  <component :is="rankBadge(i).icon" :size="22" v-if="rankBadge(i).icon" :color="rankBadge(i).color" /><span v-else style="font-size:22px;line-height:1;">{{ rankBadge(i).text }}</span>
                  <span style="font-size:13px;font-weight:600;color:var(--text-primary);text-align:center;">{{ row.display_name }}</span>
                  <span style="font-size:11px;color:var(--text-muted);">{{ row.class }}</span>
                  <span style="font-size:18px;font-weight:700;color:var(--accent);">{{ row.total > 0 ? '+' : '' }}{{ row.total }}</span>
                </div>
              </div>
              <VChart :option="monthChartOption" autoresize style="width:100%;height:140px;" />
              <div style="margin-top:12px;display:flex;flex-direction:column;gap:2px;">
                <div v-for="(row, i) in monthlyTop" :key="row.id"
                  style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;font-size:13px;transition:background .15s;"
                  :style="{ background: i % 2 === 0 ? 'var(--surface-1)' : 'transparent' }"
                >
                  <span :style="{ width: 24, textAlign: 'center', fontWeight: i < 3 ? 600 : 400, color: rankBadge(i).color, display: 'flex', alignItems: 'center', justifyContent: 'center' }">
                    <component :is="rankBadge(i).icon" :size="16" v-if="rankBadge(i).icon" />
                    <span v-else>{{ rankBadge(i).text }}</span>
                  </span>
                  <span style="flex:1;color:var(--text-primary);font-weight:500;">{{ row.display_name }}</span>
                  <span style="color:var(--text-muted);font-size:12px;">{{ row.class }}</span>
                  <span style="font-weight:600;min-width:48px;text-align:right;color:var(--accent);">{{ row.total > 0 ? '+' : '' }}{{ row.total }}</span>
                </div>
              </div>
            </template>
            <n-empty v-else description="暂无本月积分数据" style="height:260px;display:flex;flex-direction:column;justify-content:center;" />
          </n-spin>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>
