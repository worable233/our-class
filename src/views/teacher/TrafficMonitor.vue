<script setup lang="ts">
// @ts-nocheck - globe.gl and three.js types
import { ref, onMounted, onUnmounted, nextTick, shallowRef } from 'vue'
import { BASE } from '@/api/client'
import { NSpin, NEmpty, NButton } from 'naive-ui'
import { RotateCw } from '@lucide/vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'

use([CanvasRenderer, LineChart, BarChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

function getToken(): string {
  const stored = localStorage.getItem('ourclass_user')
  if (stored) return JSON.parse(stored).token || ''
  return ''
}

const loading = ref(true)
const data = ref<any>(null)
const globeEl = ref<HTMLDivElement | null>(null)
let globeInstance: any = null
let loadingGlobe = false
const qpsOption = shallowRef({})
const accessOption = shallowRef({})
const interceptOption = shallowRef({})
const clientOption = shallowRef({})
const statusOption = shallowRef({})

function fmtCompact(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function buildAreaOpt(data: { time: string; value: number }[], color: string, name: string) {
  return {
    grid: { left: 40, right: 8, top: 28, bottom: 20 },
    xAxis: { type: 'category', data: data.map(d => d.time.slice(0, 2)), axisLabel: { fontSize: 9, color: '#787d87', interval: 3 }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } }, axisLabel: { fontSize: 9, color: '#787d87' } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(18,19,20,0.92)', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#f5f9fe', fontSize: 11 } },
    series: [{ type: 'line', smooth: true, showSymbol: false, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '50' }, { offset: 1, color: color + '05' }] } }, lineStyle: { color, width: 1.5 }, data: data.map(d => d.value), name }],
  }
}

function buildPieOpt(data: { name: string; value: number }[]) {
  return {
    tooltip: { trigger: 'item', backgroundColor: 'rgba(18,19,20,0.92)', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#f5f9fe', fontSize: 11 }, formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: '#787d87', fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
    series: [{ type: 'pie', radius: ['35%', '60%'], center: ['50%', '40%'], avoidLabelOverlap: true, label: { show: false }, emphasis: { scale: false }, itemStyle: { borderRadius: 4 }, data: data.map((d, i) => ({ ...d, itemStyle: { color: ['#0FC6C2', '#FF8859', '#18a058', '#f0a020', '#a050dc', '#5E6AD2', '#787d87', '#e86969'][i % 8] } })) }],
  }
}

function buildBarOpt(data: { name: string; value: number }[]) {
  const maxV = Math.max(...data.map(d => d.value), 1)
  return {
    grid: { left: 50, right: 8, top: 8, bottom: 8 },
    xAxis: { type: 'value', splitLine: { show: false }, axisLabel: { fontSize: 9, color: '#787d87' } },
    yAxis: { type: 'category', data: data.map(d => d.name).reverse(), axisLabel: { fontSize: 10, color: '#f5f9fe' }, axisLine: { show: false }, axisTick: { show: false } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(18,19,20,0.92)', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#f5f9fe', fontSize: 11 } },
    series: [{ type: 'bar', barWidth: 12, data: data.map(d => ({ value: d.value, itemStyle: { color: d.value / maxV > 0.8 ? '#FF8859' : d.value / maxV > 0.5 ? '#0FC6C2' : '#5E6AD2', borderRadius: [0, 4, 4, 0] } })) }],
  }
}

async function load() {
  if (loadingGlobe) return
  loadingGlobe = true
  loading.value = true
  try {
    const res = await fetch(`${BASE}/analytics/waf-stats`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const body = await res.json()
    if (!body.success) throw new Error(body.error?.message)
    const d = body.data
    data.value = d

    qpsOption.value = buildAreaOpt(d.qpsData, '#0FC6C2', 'QPS')
    accessOption.value = buildAreaOpt(d.accessData, '#18a058', '访问')
    interceptOption.value = buildAreaOpt(d.interceptData, '#FF8859', '拦截')

    const clientNames: Record<string, string> = { MacOS: 'MacOS', Windows: 'Windows', Chrome: 'Chrome', Firefox: 'Firefox', Edge: 'Edge', 'Go-http-client': 'Go' }
    clientOption.value = buildPieOpt(d.clientData.map(c => ({ name: clientNames[c.name] || c.name, value: c.value })))
    statusOption.value = buildBarOpt(d.statusData.map(s => ({ name: String(s.code), value: s.count })))

    await nextTick()
    initGlobe(d.geoData || [])
  } catch (e: any) { console.error('Load:', e) }
  finally { loading.value = false; loadingGlobe = false }
}

async function initGlobe(geoData: any[]) {
  if (loadingGlobe) return  // 由 load() 保证串行
  const el = globeEl.value
  if (!el) return
  try {
    // 销毁旧 globe
    if (globeInstance && typeof globeInstance._destructor === 'function') globeInstance._destructor()
    globeInstance = null
    el.innerHTML = ''
    el.style.position = 'relative'
    const w = el.clientWidth || 640
    const h = el.clientHeight || 500
    const Globe = (await import('globe.gl')).default
    const THREE = await import('three')

    let hexData: any[] = []
    try {
      const geoRes = await fetch('/countries.json')
      hexData = await geoRes.json()
    } catch (e) { console.error('GeoJSON load error:', e) }

    const cityToCountry: Record<string, string> = {
      '北京': 'China', '上海': 'China', '广州': 'China', '深圳': 'China',
      '新加坡': 'Singapore', '纽约': 'United States of America', '伦敦': 'United Kingdom',
      '东京': 'Japan', '首尔': 'South Korea', '悉尼': 'Australia',
      '莫斯科': 'Russia', '巴黎': 'France', '柏林': 'Germany',
      '多伦多': 'Canada', '荷兰': 'Netherlands', '印尼': 'Indonesia',
      '法国': 'France', '加拿大': 'Canada', '美国': 'United States of America', '中国': 'China',
    }
    const countryMap = new Map<string, number>()
    for (const g of geoData) {
      const country = cityToCountry[g.country] || g.country
      countryMap.set(country, Math.max(countryMap.get(country) || 0, g.value))
    }
    const maxVal = Math.max(...Array.from(countryMap.values()), 1)

    globeInstance = Globe()(el)
      .width(w).height(h)
      .backgroundColor('#FF000000').showAtmosphere(false)
      .hexPolygonsData(hexData).hexPolygonResolution(3).hexPolygonMargin(0.1).hexPolygonDotResolution(1)
      .hexPolygonColor((d: any) => {
        const name = d?.properties?.SUBUNIT || d?.properties?.NAME || ''
        const v = countryMap.get(name)
        if (!v) return '#ffffff'
        const t = Math.max(0, Math.min(1, v / maxVal))
        return `rgb(${Math.round(238 - t * 223)},${Math.round(251 - t * 53)},${Math.round(251 - t * 57)})`
      })
      .hexPolygonLabel((d: any) => {
        const name = d?.properties?.SUBUNIT || d?.properties?.NAME || ''
        const v = countryMap.get(name)
        return `<div style="font-size:12px">${name}</div>${v ? `<div style="font-size:11px;color:#0FC6C2">${v}</div>` : ''}`
      })
      .lights([new THREE.AmbientLight(0xffffff, Math.PI)])

    // 初始化后设置材质颜色（不能在链式中设置，会和 hexPolygonsData 冲突）
    const curGlobe = globeInstance
    setTimeout(() => {
      if (curGlobe !== globeInstance) return  // 如果已经被新 globe 替换则跳过
      try { const mat = curGlobe.globeMaterial(); if (mat) { mat.color = new THREE.Color(0x5E6AD2); mat.opacity = 0.1; mat.transparent = true } } catch {}
    }, 100)

    // Auto-rotate
    setTimeout(() => {
      try { const ctrl = globeInstance.controls(); if (ctrl) { ctrl.autoRotate = true; ctrl.autoRotateSpeed = 2 } } catch {}
    }, 500)
  } catch (e) { console.error('Globe:', e) }
}

onMounted(load)
onUnmounted(() => {
  try { if (globeInstance && typeof globeInstance._destructor === 'function') globeInstance._destructor() } catch {}
  globeInstance = null
})
</script>

<template>
  <div style="height:100%;display:flex;flex-direction:column;">
    <div style="margin-bottom:12px;text-align:right;">
      <NButton quaternary size="small" @click="load" :disabled="loading">
        <template #icon><RotateCw :size="15" /></template> 刷新
      </NButton>
    </div>
    <NSpin :show="loading" style="flex:1;min-height:500px">
      <div v-if="data" style="display:flex;flex-direction:column;gap:16px;">

        <!-- Stats Cards -->
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:8px;">
          <div v-for="s in [
            {v:fmtCompact(data.requests),l:'请求次数',c:'#0FC6C2'},
            {v:fmtCompact(data.pv),l:'访问次数(PV)',c:'#5E6AD2'},
            {v:fmtCompact(data.uv),l:'独立访客(UV)',c:'#18a058'},
            {v:fmtCompact(data.uniqueIps),l:'独立IP',c:'#a050dc'},
            {v:fmtCompact(data.intercepts),l:'拦截次数',c:'#e86969'},
            {v:fmtCompact(data.attackIps),l:'攻击IP',c:'#FF8859'},
            {v:fmtCompact(data.err4xxCount),l:'4xx '+data.err4xxRate,c:'#f0a020'},
            {v:fmtCompact(data.err5xxCount),l:'5xx '+data.err5xxRate,c:'#e869a0'},
          ]" :key="s.l" style="display:flex;align-items:center;gap:8px;background:var(--surface-1);border:1px solid var(--hairline);border-radius:6px;padding:10px 12px;">
            <div :style="{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,background:s.c+'20',color:s.c}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg></div>
            <div><div style="font-size:17px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;">{{ s.v }}</div><div style="font-size:10px;color:var(--text-muted);white-space:nowrap;">{{ s.l }}</div></div>
          </div>
        </div>

        <!-- Globe + Right Panel -->
        <div style="display:flex;gap:12px;min-height:480px;">
          <div ref="globeEl" style="flex:1;min-height:440px;border:1px solid var(--hairline);border-radius:8px;overflow:hidden;position:relative;background-image:radial-gradient(rgba(15,198,194,0.04) 1px,transparent 1px);background-size:20px 20px;background-color:#f5f7fa;"></div>

          <!-- Right Panel: QPS + 访问情况 + 拦截情况 -->
          <div style="width:350px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;">
            <div style="background:var(--surface-1);border:1px solid var(--hairline);border-radius:6px;padding:8px 12px;">
              <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">实时 QPS</div>
              <VChart :option="qpsOption" autoresize style="height:120px" />
            </div>
            <div style="background:var(--surface-1);border:1px solid var(--hairline);border-radius:6px;padding:8px 12px;">
              <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">访问情况</div>
              <VChart :option="accessOption" autoresize style="height:180px" />
            </div>
            <div style="background:var(--surface-1);border:1px solid var(--hairline);border-radius:6px;padding:8px 12px;">
              <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">拦截情况</div>
              <VChart :option="interceptOption" autoresize style="height:180px" />
            </div>
          </div>
        </div>

        <!-- Bottom Charts Row -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div style="background:var(--surface-1);border:1px solid var(--hairline);border-radius:6px;padding:10px 12px;">
            <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">客户端分布</div>
            <VChart :option="clientOption" autoresize style="height:240px" />
          </div>
          <div style="background:var(--surface-1);border:1px solid var(--hairline);border-radius:6px;padding:10px 12px;">
            <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;">响应状态</div>
            <VChart :option="statusOption" autoresize style="height:240px" />
          </div>
        </div>

        <!-- Data Tables -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div v-for="(tbl, ti) in [
            {title:'外部来源域名',items:data.refererDomains,k:'domain'},
            {title:'外部来源页面',items:data.refererPages,k:'url'},
            {title:'受访域名',items:data.visitedDomains,k:'domain'},
            {title:'受访页面',items:data.visitedPages,k:'url'},
          ]" :key="ti" style="background:var(--surface-1);border:1px solid var(--hairline);border-radius:6px;padding:10px 12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--hairline);">
              {{ tbl.title }} <span style="font-size:10px;font-weight:400;color:var(--text-muted);cursor:pointer;">查看更多</span>
            </div>
            <div v-for="r in tbl.items.slice(0,5)" :key="r[tbl.k]" style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.03);">
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary);font-size:11px;">{{ r[tbl.k] }}</span>
              <span style="font-size:12px;font-weight:600;color:var(--text-primary);margin-left:8px;flex-shrink:0;">{{ r.count }}</span>
            </div>
          </div>
        </div>

      </div>
      <NEmpty v-else-if="!loading" description="暂无数据" />
    </NSpin>
  </div>
</template>
