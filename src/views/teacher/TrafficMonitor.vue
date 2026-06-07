<script setup lang="ts">
// @ts-nocheck - globe.gl and three.js types
import { ref, reactive, onMounted, onUnmounted, nextTick, shallowRef } from 'vue'
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

interface GeoItem { country: string; value: number; lat: number; lng: number }
interface ClientItem { name: string; value: number }
interface StatusItem { code: number; count: number }
interface RefItem { domain: string; count: number }
interface SeriesPoint { time: string; value: number }

interface WafStats {
  requests: number; pv: number; uv: number; uniqueIps: number
  intercepts: number; attackIps: number
  err4xxCount: number; err4xxRate: string
  err5xxCount: number; err5xxRate: string
  qpsData: SeriesPoint[]; accessData: SeriesPoint[]; interceptData: SeriesPoint[]
  geoData: GeoItem[]; clientData: ClientItem[]; statusData: StatusItem[]
  refererDomains: RefItem[]; refererPages: { url: string; count: number }[]
  visitedDomains: RefItem[]; visitedPages: { url: string; count: number }[]
}

const loading = ref(true)
const data = ref<WafStats | null>(null)
const globeEl = ref<HTMLDivElement | null>(null)
let globeInstance: any = null

// ECharts options
const qpsOption = shallowRef({})
const accessOption = shallowRef({})
const interceptOption = shallowRef({})
const clientOption = shallowRef({})
const statusOption = shallowRef({})

const stats = reactive({
  requests: '—', pv: '—', uv: '—', uniqueIps: '—',
  intercepts: '—', attackIps: '—',
  err4xx: '—', err4xxRate: '—',
  err5xx: '—', err5xxRate: '—',
})

function fmtCompact(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function fmt(s: string) { return s }

function buildAreaOpt(data: SeriesPoint[], color: string, name: string) {
  return {
    grid: { left: 40, right: 8, top: 28, bottom: 20 },
    xAxis: { type: 'category', data: data.map(d => d.time.slice(0, 2)), axisLabel: { fontSize: 9, color: '#787d87', interval: 3 }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } }, axisLabel: { fontSize: 9, color: '#787d87' } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(18,19,20,0.92)', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#f5f9fe', fontSize: 11 }, formatter: (p: any) => `${p[0]?.axisValue}:00<br/>${name}: <span style="color:${color};font-weight:600">${p[0]?.value}</span>` },
    series: [{
      type: 'line', smooth: true, showSymbol: false, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: color + '50' }, { offset: 1, color: color + '05' }] } }, lineStyle: { color, width: 1.5 }, data: data.map(d => d.value), name,
    }],
  }
}

function buildPieOpt(data: { name: string; value: number }[], title: string) {
  return {
    tooltip: { trigger: 'item', backgroundColor: 'rgba(18,19,20,0.92)', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#f5f9fe', fontSize: 11 }, formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: '#787d87', fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
    series: [{
      type: 'pie', radius: ['35%', '60%'], center: ['50%', '40%'], avoidLabelOverlap: true,
      label: { show: false }, emphasis: { scale: false },
      itemStyle: { borderRadius: 4 },
      data: data.map((d, i) => ({ ...d, itemStyle: { color: ['#0FC6C2', '#FF8859', '#18a058', '#f0a020', '#a050dc', '#5E6AD2', '#787d87', '#e86969'][i % 8] } })),
    }],
  }
}

function buildBarOpt(data: { name: string; value: number }[]) {
  const maxV = Math.max(...data.map(d => d.value), 1)
  return {
    grid: { left: 50, right: 8, top: 8, bottom: 8 },
    xAxis: { type: 'value', splitLine: { show: false }, axisLabel: { fontSize: 9, color: '#787d87' } },
    yAxis: { type: 'category', data: data.map(d => d.name).reverse(), axisLabel: { fontSize: 10, color: '#f5f9fe' }, axisLine: { show: false }, axisTick: { show: false } },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(18,19,20,0.92)', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#f5f9fe', fontSize: 11 }, formatter: (p: any) => `${p[0]?.axisValue}: ${p[0]?.value}` },
    series: [{
      type: 'bar', barWidth: 12, data: data.map((d, i) => ({ value: d.value, itemStyle: { color: d.value / maxV > 0.8 ? '#FF8859' : d.value / maxV > 0.5 ? '#0FC6C2' : '#5E6AD2', borderRadius: [0, 4, 4, 0] } })),
    }],
  }
}

async function load() {
  loading.value = true
  try {
    const res = await fetch(`${BASE}/analytics/waf-stats`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const body = await res.json()
    if (!body.success) throw new Error(body.error?.message)
    const d = body.data as WafStats
    data.value = d

    // Update stats
    stats.requests = fmtCompact(d.requests)
    stats.pv = fmtCompact(d.pv)
    stats.uv = fmtCompact(d.uv)
    stats.uniqueIps = fmtCompact(d.uniqueIps)
    stats.intercepts = fmtCompact(d.intercepts)
    stats.attackIps = fmtCompact(d.attackIps)
    stats.err4xx = fmtCompact(d.err4xxCount)
    stats.err4xxRate = d.err4xxRate
    stats.err5xx = fmtCompact(d.err5xxCount)
    stats.err5xxRate = d.err5xxRate

    // Charts
    qpsOption.value = buildAreaOpt(d.qpsData, '#0FC6C2', 'QPS')
    accessOption.value = buildAreaOpt(d.accessData, '#18a058', '访问')
    interceptOption.value = buildAreaOpt(d.interceptData, '#FF8859', '拦截')

    const clientNames: Record<string, string> = { MacOS: 'MacOS', Windows: 'Windows', Chrome: 'Chrome', Firefox: 'Firefox', Edge: 'Edge', Go: 'Go-http-client', Mozilla: 'Mozilla' }
    clientOption.value = buildPieOpt(d.clientData.map(c => ({ name: clientNames[c.name] || c.name, value: c.value })), '客户端')
    statusOption.value = buildBarOpt(d.statusData.map(s => ({ name: String(s.code), value: s.count })))

    await nextTick()
    initGlobe(d.geoData)
  } catch (e: any) {
    console.error('Load:', e)
  } finally { loading.value = false }
}

async function initGlobe(geoData: GeoItem[]) {
  const el = globeEl.value
  if (!el) return
  try {
    el.innerHTML = ''
    const w = el.clientWidth || 600
    const h = el.clientHeight || 500
    const [Globe, THREE] = await Promise.all([
      import('globe.gl').then(m => m.default),
      import('three').then(m => m.default),
    ])

    // Load country hex data
    let hexData: any[] = []
    try {
      const geoRes = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      const topology = await geoRes.json()
      hexData = (topology.objects.countries?.geometries || []).map((c: any) => ({ ...c, properties: { ...c.properties, SUBUNIT: c.properties.name } }))
    } catch {}

    // Build value map for country coloring
    const valMap = new Map<string, number>()
    for (const g of geoData) valMap.set(g.country, g.value)
    const maxVal = Math.max(...Array.from(valMap.values()), 1)
    const minVal = Math.min(...Array.from(valMap.values()), 0)

    // Color helpers matching 雷池 gradient
    function tealOrange(t: number): string {
      // t: 0→1 maps to teal(#0FC6C2) → orange(#FF8859)
      const r = Math.round(15 + t * 240)
      const g = Math.round(198 - t * 110)
      const b = Math.round(194 - t * 130)
      return `rgb(${r},${g},${b})`
    }
    function getCountryColor(name: string): string {
      const v = valMap.get(name)
      if (!v) return 'rgba(255,255,255,0.04)'
      const t = Math.max(0, Math.min(1, (v - minVal) / (maxVal - minVal || 1)))
      return tealOrange(t)
    }

    // Create globe — earth texture with colored country overlays
    globeInstance = Globe()(el)
      .width(w).height(h)
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
      .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundImageUrl(null)
      .hexPolygonsData(hexData)
      .hexPolygonResolution(1)
      .hexPolygonMargin(0.2)
      .hexPolygonColor((d: any) => {
        const v = valMap.get(d.properties?.name || '')
        if (!v) return 'rgba(0,0,0,0)'
        const t = Math.max(0, Math.min(1, (v - minVal) / (maxVal - minVal || 1)))
        // Teal → Orange gradient with opacity
        const r = Math.round(15 + t * 240)
        const g = Math.round(198 - t * 110)
        const b = Math.round(194 - t * 130)
        return `rgba(${r},${g},${b},0.55)`
      })
      .hexPolygonLabel((d: any) => {
        const v = valMap.get(d.properties?.name || '')
        return `<div style="font-size:12px;font-weight:600;color:#fff">${d.properties?.name || ''}</div>${v ? `<div style="font-size:11px;color:#0FC6C2;margin-top:2px">${v} 次请求</div>` : ''}`
      })
      .polygonsData(hexData.filter((d: any) => valMap.has(d.properties?.name)))
      .polygonCapMaterial(new THREE.MeshBasicMaterial({ color: 0x0FC6C2, side: THREE.DoubleSide, transparent: true, opacity: 0.12 }))
      .polygonSideMaterial(new THREE.MeshBasicMaterial({ color: 0x0FC6C2, side: THREE.DoubleSide, transparent: true, opacity: 0.06 }))
      .polygonStrokeColor(() => 'rgba(15,198,194,0.12)')
      .pointsData(geoData)
      .pointLat('lat').pointLng('lng').pointAltitude(0.06).pointRadius(0.8).pointColor(() => '#FF8859')
      .pointLabel((d: any) => `<div style="font-size:13px;font-weight:600;color:#fff">${d.country}</div><div style="font-size:11px;color:#FF8859">${d.value} 次请求</div>`)
      .atmosphereColor('#0FC6C2').atmosphereAltitude(0.12)
      .pointMerge(true)
      .lights([new THREE.AmbientLight(0xffffff, 0.6), new THREE.DirectionalLight(0xffffff, 0.8)])

    // Globe material — semi-transparent overlay
    setTimeout(() => {
      try {
        const mat = globeInstance.globeMaterial()
        if (mat) {
          mat.color = new THREE.Color(0x0a1420)
          mat.emissive = new THREE.Color(0x0a1a28)
          mat.emissiveIntensity = 0.15
          mat.opacity = 0.25
          mat.transparent = true
        }
      } catch {}
    }, 50)

    // Auto-rotate
    setTimeout(() => {
      try {
        const ctrl = globeInstance.controls()
        if (ctrl) { ctrl.autoRotate = true; ctrl.autoRotateSpeed = 2 }
      } catch {}
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
    <div style="margin-bottom: 12px; text-align: right;">
      <NButton quaternary size="small" @click="load" :disabled="loading">
        <template #icon><RotateCw :size="15" /></template>
        刷新
      </NButton>
    </div>

    <NSpin :show="loading" style="flex:1;min-height:500px">
      <div v-if="data" class="waf-dash">
        <!-- Stats Cards Row -->
        <div class="stats-row">
          <div class="stat-card"><div class="stat-icon cyan"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div><div><div class="stat-num">{{ stats.requests }}</div><div class="stat-label">请求次数</div></div></div>
          <div class="stat-card"><div class="stat-icon blue"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div><div><div class="stat-num">{{ stats.pv }}</div><div class="stat-label">访问次数（PV）</div></div></div>
          <div class="stat-card"><div class="stat-icon teal"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div><div class="stat-num">{{ stats.uv }}</div><div class="stat-label">独立访客（UV）</div></div></div>
          <div class="stat-card"><div class="stat-icon purple"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div><div class="stat-num">{{ stats.uniqueIps }}</div><div class="stat-label">独立 IP</div></div></div>
          <div class="stat-card"><div class="stat-icon red"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div><div><div class="stat-num">{{ stats.intercepts }}</div><div class="stat-label">拦截次数</div></div></div>
          <div class="stat-card"><div class="stat-icon orange"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div><div><div class="stat-num">{{ stats.attackIps }}</div><div class="stat-label">攻击 IP</div></div></div>
          <div class="stat-card"><div class="stat-icon yellow"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div><div class="stat-num">{{ stats.err4xx }}</div><div class="stat-label">4xx 错误 {{ stats.err4xxRate }}</div></div></div>
          <div class="stat-card"><div class="stat-icon pink"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div><div class="stat-num">{{ stats.err5xx }}</div><div class="stat-label">5xx 错误 {{ stats.err5xxRate }}</div></div></div>
        </div>

        <!-- Main Content: Globe + Legend + Right Panel -->
        <div class="main-area">
          <div class="globe-area">
            <div class="globe-wrap" ref="globeEl"><NEmpty v-if="!data.geoData.length" description="暂无数据" /></div>
            <!-- Geo Legend Panel -->
            <div class="geo-legend">
              <div class="geo-legend-header">地理位置</div>
              <div class="geo-legend-tabs"><span class="active">3D</span><span>2D</span><span class="sep">|</span><span class="active">世界</span><span>中国</span><span class="sep">|</span><span class="active">访问</span><span>仅拦截</span></div>
              <div class="geo-legend-list">
                <div v-for="g in data.geoData" :key="g.country" class="geo-item">
                  <span class="geo-dot" :style="{ background: (() => {
                    const maxV = Math.max(...data.geoData.map(x => x.value), 1)
                    const minV = Math.min(...data.geoData.map(x => x.value), 0)
                    const t = Math.max(0, Math.min(1, (g.value - minV) / (maxV - minV || 1)))
                    const r = Math.round(15 + t * 240)
                    const g2 = Math.round(198 - t * 110)
                    const b = Math.round(194 - t * 130)
                    return 'rgb(' + r + ',' + g2 + ',' + b + ')'
                  })() }"></span>
                  <span class="geo-name">{{ g.country }}</span>
                  <span class="geo-val">{{ fmtCompact(g.value) }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="right-panel">
            <div class="panel-section"><div class="panel-title">实时 QPS</div><VChart :option="qpsOption" autoresize style="height:120px" /></div>
            <div class="panel-section"><div class="panel-title">访问情况</div><VChart :option="accessOption" autoresize style="height:180px" /></div>
            <div class="panel-section"><div class="panel-title">拦截情况</div><VChart :option="interceptOption" autoresize style="height:180px" /></div>
          </div>
        </div>

        <!-- Bottom Charts Row -->
        <div class="charts-row">
          <div class="chart-card"><div class="panel-title">客户端分布</div><VChart :option="clientOption" autoresize style="height:240px" /></div>
          <div class="chart-card"><div class="panel-title">响应状态</div><VChart :option="statusOption" autoresize style="height:240px" /></div>
        </div>

        <!-- Data Tables: 2x2 Grid -->
        <div class="tables-grid">
          <div class="table-card">
            <div class="table-header">外部来源域名 <span class="more-link">查看更多</span></div>
            <div v-for="r in data.refererDomains.slice(0, 5)" :key="r.domain" class="table-row">
              <span class="td-name">{{ r.domain }}</span><span class="td-val">{{ r.count }}</span>
            </div>
          </div>
          <div class="table-card">
            <div class="table-header">外部来源页面 <span class="more-link">查看更多</span></div>
            <div v-for="r in data.refererPages.slice(0, 5)" :key="r.url" class="table-row">
              <span class="td-name td-url">{{ r.url }}</span><span class="td-val">{{ r.count }}</span>
            </div>
          </div>
          <div class="table-card">
            <div class="table-header">受访域名 <span class="more-link">查看更多</span></div>
            <div v-for="r in data.visitedDomains.slice(0, 5)" :key="r.domain" class="table-row">
              <span class="td-name">{{ r.domain }}</span><span class="td-val">{{ r.count }}</span>
            </div>
          </div>
          <div class="table-card">
            <div class="table-header">受访页面 <span class="more-link">查看更多</span></div>
            <div v-for="r in data.visitedPages.slice(0, 5)" :key="r.url" class="table-row">
              <span class="td-name td-url">{{ r.url }}</span><span class="td-val">{{ r.count }}</span>
            </div>
          </div>
        </div>
      </div>
      <NEmpty v-else-if="!loading" description="暂无数据" />
    </NSpin>
  </div>
</template>

<style scoped>
.waf-dash { display:flex; flex-direction:column; gap:16px; }

/* Stats Cards */
.stats-row { display:grid; grid-template-columns:repeat(8,1fr); gap:8px; }
.stat-card { display:flex; align-items:center; gap:8px; background:var(--surface-1); border:1px solid var(--hairline); border-radius:6px; padding:10px 12px; }
.stat-icon { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.stat-icon.cyan { background:rgba(15,198,194,0.12); color:#0FC6C2; }
.stat-icon.blue { background:rgba(94,106,210,0.12); color:#5E6AD2; }
.stat-icon.teal { background:rgba(24,160,88,0.12); color:#18a058; }
.stat-icon.purple { background:rgba(160,80,220,0.12); color:#a050dc; }
.stat-icon.red { background:rgba(232,105,105,0.12); color:#e86969; }
.stat-icon.orange { background:rgba(255,136,89,0.12); color:#FF8859; }
.stat-icon.yellow { background:rgba(240,160,32,0.12); color:#f0a020; }
.stat-icon.pink { background:rgba(232,105,160,0.12); color:#e869a0; }
.stat-num { font-size:17px; font-weight:700; color:var(--text-primary); letter-spacing:-0.02em; line-height:1.2; }
.stat-label { font-size:10px; color:var(--text-muted); margin-top:1px; white-space:nowrap; }

/* Main Area: Globe + Legend + Right Panel */
.main-area { display:flex; gap:12px; min-height:500px; }
.globe-area { flex:1; display:flex; gap:0; min-height:460px; background:var(--surface-1); border:1px solid var(--hairline); border-radius:8px; overflow:hidden; position:relative; }
.globe-wrap { flex:1; min-height:420px; position:relative; display:flex; align-items:center; justify-content:center; background-image: radial-gradient(circle, rgba(15,198,194,0.04) 1px, transparent 1px); background-size: 20px 20px; }
.geo-legend { width:280px; flex-shrink:0; border-left:1px solid var(--hairline); padding:14px 16px; display:flex; flex-direction:column; }
.geo-legend-header { font-size:13px; font-weight:600; color:var(--text-primary); margin-bottom:8px; }
.geo-legend-tabs { display:flex; gap:6px; margin-bottom:14px; font-size:11px; font-weight:500; }
.geo-legend-tabs span { color:var(--text-muted); cursor:pointer; padding:2px 6px; border-radius:4px; }
.geo-legend-tabs span.active { color:#0FC6C2; background:rgba(15,198,194,0.1); }
.geo-legend-tabs span.sep { color:var(--hairline); cursor:default; padding:0 2px; }
.geo-legend-list { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:2px; }
.geo-item { display:flex; align-items:center; gap:8px; padding:5px 4px; border-radius:4px; font-size:12px; }
.geo-item:hover { background:var(--surface-2); }
.geo-dot { width:8px; height:8px; border-radius:2px; flex-shrink:0; }
.geo-name { flex:1; color:var(--text-secondary); }
.geo-val { font-weight:600; color:var(--text-primary); }

.right-panel { width:320px; flex-shrink:0; display:flex; flex-direction:column; gap:8px; }
.panel-section { background:var(--surface-1); border:1px solid var(--hairline); border-radius:6px; padding:8px 10px; }
.panel-title { font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:4px; }

/* Bottom Charts */
.charts-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.chart-card { background:var(--surface-1); border:1px solid var(--hairline); border-radius:6px; padding:10px 12px; }

/* Data Tables */
.tables-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.table-card { background:var(--surface-1); border:1px solid var(--hairline); border-radius:6px; padding:10px 12px; }
.table-header { display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:600; color:var(--text-secondary); margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid var(--hairline); }
.more-link { font-size:10px; font-weight:400; color:var(--text-muted); cursor:pointer; }
.more-link:hover { color:var(--accent-text); }
.table-row { display:flex; justify-content:space-between; align-items:center; padding:5px 0; font-size:12px; border-bottom:1px solid rgba(255,255,255,0.03); }
.table-row:last-child { border-bottom:none; }
.td-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-secondary); }
.td-url { font-size:11px; }
.td-val { font-size:12px; font-weight:600; color:var(--text-primary); margin-left:8px; flex-shrink:0; }

@media (max-width:1200px) { .stats-row { grid-template-columns:repeat(4,1fr); } }
@media (max-width:900px) { .main-area { flex-direction:column; } .right-panel { width:100%; } .charts-row { grid-template-columns:1fr; } .tables-grid { grid-template-columns:1fr; } .stats-row { grid-template-columns:1fr 1fr; } }
</style>
