<script setup lang="ts">
// @ts-nocheck - globe.gl and three.js types
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { BASE } from '@/api/client'
import { NSpin, NEmpty, NButton, NText, NCard, NTag } from 'naive-ui'
import { RotateCw, Activity, Eye, Users, Globe, Shield, ShieldAlert, AlertTriangle, XCircle } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'

function getToken(): string {
  const stored = localStorage.getItem('ourclass_user')
  if (stored) return JSON.parse(stored).token || ''
  return ''
}

const loading = ref(true)
const data = ref<any>(null)
const globeEl = ref<HTMLDivElement | null>(null)
let globeInstance: any = null

// 筛选状态
const activeView = ref('3d')
const activeRegion = ref('world')
const activeMode = ref('访问')

const viewOptions = ['3D', '2D']
const regionOptions = ['世界', '中国']
const modeOptions = ['访问', '仅拦截']

async function load() {
  loading.value = true
  try {
    const res = await fetch(`${BASE}/analytics/waf-stats`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const body = await res.json()
    if (body.success) {
      data.value = body.data
      await nextTick()
      initGlobe(body.data.geoData || [])
    }
  } catch (e: any) {
    console.error('Load:', e)
  } finally { loading.value = false }
}

async function initGlobe(geoData: any[]) {
  const el = globeEl.value
  if (!el) return
  try {
    el.style.position = 'relative'
    el.innerHTML = ''
    const w = el.clientWidth || 640
    const h = el.clientHeight || 500

    const Globe = (await import('globe.gl')).default
    const THREE = await import('three')

    // ── 加载国家 GeoJSON 数据（雷池同款数据源）───────
    let hexData: any[] = []
    try {
      const geoRes = await fetch('/countries.json')
      hexData = await geoRes.json()
    } catch (e) { console.error('GeoJSON load error:', e) }

    // Build value map for country coloring（匹配雷池数据中的 SUBUNIT 字段）
    const cityToCountry: Record<string, string> = {
      '北京': 'China', '上海': 'China', '广州': 'China', '深圳': 'China',
      '新加坡': 'Singapore', '纽约': 'United States of America', '伦敦': 'United Kingdom',
      '东京': 'Japan', '首尔': 'South Korea', '悉尼': 'Australia',
      '莫斯科': 'Russia', '巴黎': 'France', '柏林': 'Germany',
      '多伦多': 'Canada', '荷兰': 'Netherlands', '印尼': 'Indonesia',
      '法国': 'France', '加拿大': 'Canada', '美国': 'United States of America',
      '中国': 'China',
    }
    const countryMap = new Map<string, number>()
    for (const g of geoData) {
      const country = cityToCountry[g.country] || g.country
      countryMap.set(country, Math.max(countryMap.get(country) || 0, g.value))
    }
    const maxVal = Math.max(...Array.from(countryMap.values()), 1)

    // ── 雷池颜色渐变函数 ──
    const hexToRgb = (hex: string) => ({
      r: parseInt(hex.substring(1,3), 16),
      g: parseInt(hex.substring(3,5), 16),
      b: parseInt(hex.substring(5,7), 16),
    })
    const gScale = (colors: string[]) => {
      const a = hexToRgb(colors[0]), b2 = hexToRgb(colors[1])
      return { rgb1: a, rgb2: b2 }
    }
    const lerpColor = (t: number, s: { rgb1: any; rgb2: any }) => {
      const r = Math.round(s.rgb1.r + (s.rgb2.r - s.rgb1.r) * t)
      const g = Math.round(s.rgb1.g + (s.rgb2.g - s.rgb1.g) * t)
      const b2 = Math.round(s.rgb1.b + (s.rgb2.b - s.rgb1.b) * t)
      return `rgb(${r},${g},${b2})`
    }
    // 暗色模式渐变: 低→高 = #eefbfb → #0fc6c2
    const gradient = gScale(['#0fc6c2', '#eefbfb'].reverse())

    // 第一步：创建 globe 实例（不含材质和颜色）
    globeInstance = Globe()(el)
      .width(w).height(h)
      .backgroundColor('#FF000000')
      .showAtmosphere(false)
      .hexPolygonsData(hexData)
      .hexPolygonResolution(3)
      .hexPolygonMargin(0.1)
      .hexPolygonDotResolution(1)
      .hexPolygonLabel((d: any) => {
        const name = d?.properties?.SUBUNIT || d?.properties?.NAME || ''
        const v = countryMap.get(name)
        return `<div style="font-size:12px">${name}</div>${v ? `<div style="font-size:11px;color:#0FC6C2">${v}</div>` : ''}`
      })
      .lights([new THREE.AmbientLight(0xffffff, Math.PI)])

    // 第二步：在已创建实例上设置材质 + 颜色（雷池模式）
    globeInstance
      .globeMaterial(new THREE.MeshPhongMaterial({
        color: 0x0FC6C2, transparent: true, opacity: 0.1,
      }))
      .hexPolygonColor((d: any) => {
        const name = d?.properties?.SUBUNIT || d?.properties?.NAME || ''
        const v = countryMap.get(name)
        if (!v) return '#ffffff'
        const t = Math.max(0, Math.min(1, v / maxVal))
        return lerpColor(t, gradient)
      })

    // 控制：锁定距离、禁止平移、自动旋转
    const ctrl = globeInstance.controls()
    if (ctrl) {
      ctrl.enablePan = false
      ctrl.autoRotate = true
      ctrl.autoRotateSpeed = 4
      ctrl.rotateSpeed = 0.8
      ctrl.minDistance = 250
      ctrl.maxDistance = 250
    }
  } catch (e) { console.error('Globe:', e) }
}

function fmtCompact(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}
function fmtBytes(b: number): string {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB'
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB'
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB'
  return b + ' B'
}

onMounted(load)
onUnmounted(() => {
  try { if (globeInstance && typeof globeInstance._destructor === 'function') globeInstance._destructor() } catch {}
  globeInstance = null
})
</script>

<template>
  <div style="height:100%;display:flex;flex-direction:column;">
    <div class="page-header">
      <PageHeader title="流量监控" subtitle="实时监控网站访问流量与 API 调用情况" />
      <NButton quaternary size="small" @click="load" :disabled="loading" round>
        <template #icon><RotateCw :size="15" /></template> 刷新
      </NButton>
    </div>

    <NSpin :show="loading" style="flex:1;min-height:500px">
      <div v-if="data" style="display:flex;flex-direction:column;gap:16px;">
        <!-- Stats Cards (CSS responsive grid) -->
        <div class="stats-grid">
          <n-card v-for="s in [
            { v: fmtCompact(data.requests), l: '总请求数', c: '#0FC6C2', icon: Activity },
            { v: fmtCompact(data.pv), l: 'GET 请求（PV）', c: '#5E6AD2', icon: Eye },
            { v: fmtCompact(data.uv), l: '覆盖城市数', c: '#18a058', icon: Users },
            { v: fmtBytes(data.uniqueIps), l: '总流量', c: '#a050dc', icon: Globe },
            { v: fmtCompact(data.intercepts), l: '拦截次数', c: '#e86969', icon: Shield },
            { v: fmtCompact(data.attackIps), l: '攻击来源城市', c: '#FF8859', icon: ShieldAlert },
            { v: fmtCompact(data.err4xxCount), l: `4xx ${data.err4xxRate}`, c: '#f0a020', icon: AlertTriangle },
            { v: fmtCompact(data.err5xxCount), l: `5xx ${data.err5xxRate}`, c: '#e869a0', icon: XCircle },
          ]" :key="s.l" size="small" :bordered="true" class="stat-card">
            <div style="display:flex;align-items:center;gap:8px;">
              <div :style="{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,background:s.c+'20',color:s.c}">
                <component :is="s.icon" :size="16" />
              </div>
              <div class="stat-card-text">
                <div style="font-size:17px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;">{{ s.v }}</div>
                <div class="stat-card-label">{{ s.l }}</div>
              </div>
            </div>
          </n-card>
        </div>

        <!-- Globe Area (CSS responsive flex) -->
        <div class="globe-layout">
          <div ref="globeEl" class="globe-wrap"></div>
          <n-card size="small" :bordered="true" class="geo-panel">
            <template #header>
              <span style="font-size:13px;font-weight:600;">地理位置</span>
            </template>
            <div style="display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
              <n-tag v-for="v in viewOptions" :key="v" size="tiny" round :bordered="false" :type="activeView === v ? 'info' : 'default'" :checkable="true" :checked="activeView === v" @click="activeView = v" style="cursor:pointer">{{ v }}</n-tag>
              <span style="color:var(--hairline);margin:0 2px;">|</span>
              <n-tag v-for="r in regionOptions" :key="r" size="tiny" round :bordered="false" :type="activeRegion === r ? 'info' : 'default'" :checkable="true" :checked="activeRegion === r" @click="activeRegion = r" style="cursor:pointer">{{ r }}</n-tag>
              <span style="color:var(--hairline);margin:0 2px;">|</span>
              <n-tag v-for="m in modeOptions" :key="m" size="tiny" round :bordered="false" :type="activeMode === m ? 'info' : 'default'" :checkable="true" :checked="activeMode === m" @click="activeMode = m" style="cursor:pointer">{{ m }}</n-tag>
            </div>
            <div style="flex:1;overflow-y:auto;">
              <div v-for="g in data.geoData" :key="g.country" style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-radius:4px;font-size:12px;">
                <span style="width:8px;height:8px;border-radius:2px;flex-shrink:0;background:#0FC6C2;"></span>
                <span style="flex:1;color:var(--text-secondary);">{{ g.country }}</span>
                <span style="font-weight:600;color:var(--text-primary);">{{ fmtCompact(g.value) }}</span>
              </div>
            </div>
          </n-card>
        </div>
      </div>
      <NEmpty v-else-if="!loading" description="暂无数据" />
    </NSpin>
  </div>
</template>

<style scoped>
/* ── Page header ─────────────────────────── */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-shrink: 0;
}
@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}

/* ── Stats grid ──────────────────────────── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
}
@media (max-width: 1024px) {
  .stats-grid { grid-template-columns: repeat(4, 1fr); }
}
.stats-grid > .stat-card {
  min-width: 0;
  overflow: hidden;
}
.stat-card-text {
  min-width: 0;
  overflow: hidden;
}
.stat-card-label {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 640px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}

/* ── Globe layout ────────────────────────── */
.globe-layout {
  display: flex;
  gap: 12px;
  min-height: 520px;
}
.geo-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}
@media (max-width: 900px) {
  .globe-layout { flex-direction: column; }
  .geo-panel { width: 100%; max-height: 240px; }
}

/* ── Globe wrap ──────────────────────────── */
.globe-wrap {
  flex: 1;
  min-height: 480px;
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background-image: radial-gradient(rgba(15,198,194,0.04) 1px, transparent 1px);
  background-size: 20px 20px;
  background-color: transparent;
}
.globe-wrap::before,
.globe-wrap::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  pointer-events: none;
  z-index: 1;
}
.globe-wrap::before {
  width: min(92%, 480px);
  aspect-ratio: 1;
  border: 3px solid rgba(255, 255, 255, 0.15);
}
html:not(.dark) .globe-wrap::before {
  border-color: rgba(15, 198, 194, 0.25);
}

.globe-wrap::after {
  width: min(98%, 520px);
  aspect-ratio: 1;
  background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.03) 60%, transparent 80%);
  filter: blur(14px);
}
html:not(.dark) .globe-wrap::after {
  background: radial-gradient(circle, rgba(15,198,194,0.10) 0%, rgba(15,198,194,0.06) 30%, rgba(15,198,194,0.02) 60%, transparent 80%);
}

/* 中等宽度叠放时，地球仪高度不小于宽度 */
@media (max-width: 900px) and (min-width: 641px) {
  .globe-wrap {
    min-height: 420px;
  }
}

@media (max-width: 640px) {
  .globe-wrap {
    min-height: 360px;
  }
  .globe-wrap::before {
    width: min(85%, 320px);
  }
  .globe-wrap::after {
    width: min(92%, 360px);
  }
}
</style>
