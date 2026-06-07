<script setup lang="ts">
// @ts-nocheck - globe.gl and three.js types
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { BASE } from '@/api/client'
import { NSpin, NEmpty, NButton } from 'naive-ui'
import { RotateCw } from '@lucide/vue'

function getToken(): string {
  const stored = localStorage.getItem('ourclass_user')
  if (stored) return JSON.parse(stored).token || ''
  return ''
}

const loading = ref(true)
const data = ref<any>(null)
const globeEl = ref<HTMLDivElement | null>(null)
let globeInstance: any = null

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

    // 控制：关闭缩放，自动旋转 speed 4（雷池一致）
    const ctrl = globeInstance.controls()
    if (ctrl) { ctrl.enableZoom = false; ctrl.autoRotate = true; ctrl.autoRotateSpeed = 4 }
  } catch (e) { console.error('Globe:', e) }
}

function fmtCompact(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
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
        <template #icon><RotateCw :size="15" /></template> 刷新
      </NButton>
    </div>

    <NSpin :show="loading" style="flex:1;min-height:500px">
      <div v-if="data" style="display:flex;flex-direction:column;gap:16px;">
        <!-- Stats Cards -->
        <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:8px;">
          <div v-for="s in [
            { v: fmtCompact(data.requests), l: '请求次数', c: '#0FC6C2' },
            { v: fmtCompact(data.pv), l: '访问次数（PV）', c: '#5E6AD2' },
            { v: fmtCompact(data.uv), l: '独立访客（UV）', c: '#18a058' },
            { v: fmtCompact(data.uniqueIps), l: '独立 IP', c: '#a050dc' },
            { v: fmtCompact(data.intercepts), l: '拦截次数', c: '#e86969' },
            { v: fmtCompact(data.attackIps), l: '攻击 IP', c: '#FF8859' },
            { v: fmtCompact(data.err4xxCount), l: `4xx ${data.err4xxRate}`, c: '#f0a020' },
            { v: fmtCompact(data.err5xxCount), l: `5xx ${data.err5xxRate}`, c: '#e869a0' },
          ]" :key="s.l" style="display:flex;align-items:center;gap:8px;background:var(--surface-1);border:1px solid var(--hairline);border-radius:6px;padding:10px 12px;">
            <div :style="{width:28,height:28,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,background:s.c+'20',color:s.c}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
            </div>
            <div><div style="font-size:17px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;">{{ s.v }}</div><div style="font-size:10px;color:var(--text-muted);white-space:nowrap;">{{ s.l }}</div></div>
          </div>
        </div>

        <!-- Globe Area -->
        <div style="display:flex;gap:12px;min-height:460px;">
          <div ref="globeEl" style="flex:1;min-height:420px;border:1px solid var(--hairline);border-radius:8px;overflow:hidden;position:relative;background-image:radial-gradient(rgba(15,198,194,0.04) 1px,transparent 1px);background-size:20px 20px;background-color:#f5f7fa;"></div>
          <div style="width:300px;flex-shrink:0;background:var(--surface-1);border:1px solid var(--hairline);border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">地理位置</div>
            <div style="display:flex;gap:6px;margin-bottom:14px;font-size:11px;">
              <span style="color:#0FC6C2;background:rgba(15,198,194,0.1);padding:2px 6px;border-radius:4px;">3D</span>
              <span style="color:var(--text-muted);padding:2px 6px;">2D</span>
              <span style="color:var(--hairline);padding:0 2px;">|</span>
              <span style="color:#0FC6C2;background:rgba(15,198,194,0.1);padding:2px 6px;border-radius:4px;">世界</span>
              <span style="color:var(--text-muted);padding:2px 6px;">中国</span>
              <span style="color:var(--hairline);padding:0 2px;">|</span>
              <span style="color:#0FC6C2;background:rgba(15,198,194,0.1);padding:2px 6px;border-radius:4px;">访问</span>
              <span style="color:var(--text-muted);padding:2px 6px;">仅拦截</span>
            </div>
            <div style="flex:1;overflow-y:auto;">
              <div v-for="g in data.geoData" :key="g.country" style="display:flex;align-items:center;gap:8px;padding:5px 4px;border-radius:4px;font-size:12px;">
                <span style="width:8px;height:8px;border-radius:2px;flex-shrink:0;background:#0FC6C2;"></span>
                <span style="flex:1;color:var(--text-secondary);">{{ g.country }}</span>
                <span style="font-weight:600;color:var(--text-primary);">{{ fmtCompact(g.value) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <NEmpty v-else-if="!loading" description="暂无数据" />
    </NSpin>
  </div>
</template>
