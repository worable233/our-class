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

    // ── Load country border data ───────
    let polygonsData: any[] = []
    try {
      const geoRes = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      const topology = await geoRes.json()
      const arcs = topology.arcs as number[][][]
      const transform = topology.transform
      const features: any[] = []

      for (const obj of Object.values(topology.objects) as any[]) {
        for (const geom of obj.geometries || []) {
          const coords = decodeArcs(geom, arcs, transform)
          if (coords.length > 0) {
            if (geom.type === 'Polygon') features.push({ type: 'Polygon', properties: { name: geom.properties?.name || '' }, geometry: { type: 'Polygon', coordinates: coords } })
            else features.push({ type: 'MultiPolygon', properties: { name: geom.properties?.name || '' }, geometry: { type: 'MultiPolygon', coordinates: [coords] } })
          }
        }
      }

      polygonsData = features.flatMap((c: any) => {
        if (c.geometry.type === 'Polygon') return [{ name: c.properties.name, coordinates: c.geometry.coordinates }]
        if (c.geometry.type === 'MultiPolygon') return c.geometry.coordinates.map((coords: any) => ({ name: c.properties.name, coordinates: [coords] }))
        return []
      })
    } catch {}

    function decodeArcs(geom: any, arcs: number[][][], tr: { scale: number[]; translate: number[] }): number[][][] {
      const polygons: number[][][] = []
      const rings = geom.type === 'MultiPolygon' ? geom.arcs : [geom.arcs]
      for (const ring of rings) {
        const coords: number[][] = []
        let x = 0, y = 0
        for (const arcIdx of ring) {
          const idx = arcIdx >= 0 ? arcIdx : ~arcIdx
          const arc = arcs[idx]
          const reversed = arcIdx < 0
          const iter = reversed ? [...arc].reverse() : arc
          for (const [dx, dy] of iter) {
            x += dx; y += dy
            const lng = x * tr.scale[0] + tr.translate[0]
            const lat = y * tr.scale[1] + tr.translate[1]
            coords.push([lng, lat])
          }
        }
        if (coords.length > 0) polygons.push(coords)
      }
      return polygons
    }

    // Build value map for country coloring
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

    // ── Build globe ───────────────────────────────
    globeInstance = Globe()(el)
      .globeImageUrl(null)
      .bumpImageUrl(null)
      .backgroundImageUrl(null)
      .width(w).height(h)
      .polygonsData(polygonsData)
      .polygonCapMaterial(new THREE.MeshBasicMaterial({ color: 0x4ECDC4, side: THREE.DoubleSide, transparent: true, opacity: 0.55 }))
      .polygonSideMaterial(new THREE.MeshBasicMaterial({ color: 0x3DBDB0, side: THREE.DoubleSide, transparent: true, opacity: 0.4 }))
      .polygonStrokeColor(() => 'rgba(78, 205, 196, 0.7)')
      .polygonLabel((d: any) => {
        const v = countryMap.get(d.name || '')
        return `<div style="font-size:12px;font-weight:600;color:#333">${d.name || ''}</div>${v ? `<div style="font-size:11px;color:#0FC6C2">${v} 次请求</div>` : ''}`
      })
      .atmosphereColor('#4ECDC4')
      .atmosphereAltitude(0.12)

    // Globe material — 半透明青绿，匹配雷池 #4ECDC4
    setTimeout(() => {
      try {
        const mat = globeInstance.globeMaterial()
        if (mat) {
          mat.color = new THREE.Color(0x4ECDC4)
          mat.emissive = new THREE.Color(0x2DADA5)
          mat.emissiveIntensity = 0.15
          mat.opacity = 0.5
          mat.transparent = true
        }
      } catch {}
    }, 100)

    // Auto-rotate
    setTimeout(() => {
      try {
        const ctrl = globeInstance.controls()
        if (ctrl) { ctrl.autoRotate = true; ctrl.autoRotateSpeed = 2 }
      } catch {}
    }, 500)
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
