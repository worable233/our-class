<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { BASE } from '@/api/client'
import { useMessage } from 'naive-ui'
import { NButton, NSpin, NEmpty, NScrollbar } from 'naive-ui'

interface TrafficSource {
  city: string; lat: number; lng: number
  count: number; upload: number; download: number
}
interface TrafficData {
  sources: TrafficSource[]
  totals: { total_requests: number; total_upload: number; total_download: number }
}
interface CountryFeature {
  type: string
  properties: { name: string }
  geometry: { type: string; coordinates: number[][][] }
}

function getToken(): string {
  const stored = localStorage.getItem('ourclass_user')
  if (stored) return (JSON.parse(stored).token || '') as string
  return ''
}

const message = useMessage()
const data = ref<TrafficData | null>(null)
const loading = ref(true)
const globeEl = ref<HTMLDivElement | null>(null)
let globeInstance: any = null

function fmt(b: number): string {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}

async function load() {
  loading.value = true
  try {
    const res = await fetch(`${BASE}/analytics/traffic`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const body = await res.json()
    if (body.success) { data.value = body.data; await nextTick(); initGlobe(body.data.sources) }
    else throw new Error(body.error?.message)
  } catch (e: any) {
    message.error(e.message || '加载失败')
  } finally { loading.value = false }
}

async function initGlobe(sources: TrafficSource[]) {
  const el = globeEl.value
  if (!el) return

  try {
    el.style.position = 'relative'
    el.innerHTML = ''
    const w = el.clientWidth || 640
    const h = el.clientHeight || 500

    const [Globe, THREE] = await Promise.all([
      import('globe.gl').then(m => m.default),
      import('three').then(m => m.default),
    ])

    // ── Load country border data (inlined TopoJSON→GeoJSON) ───────
    let polygonsData: any[] = []
    try {
      const geoRes = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      const topology = await geoRes.json()
      const arcs = topology.arcs as number[][][]
      const transform = topology.transform
      const features: CountryFeature[] = []

      for (const obj of Object.values(topology.objects) as any[]) {
        for (const geom of obj.geometries || []) {
          const coords = decodeArcs(geom, arcs, transform)
          if (coords.length > 0) {
            if (geom.type === 'Polygon') features.push({ type: 'Polygon', properties: { name: geom.properties?.name || '' }, geometry: { type: 'Polygon', coordinates: coords } } as any)
            else features.push({ type: 'MultiPolygon', properties: { name: geom.properties?.name || '' }, geometry: { type: 'MultiPolygon', coordinates: [coords] } } as any)
          }
        }
      }

      polygonsData = features.flatMap((c: CountryFeature) => {
        if (c.geometry.type === 'Polygon') return [{ name: c.properties.name, coordinates: c.geometry.coordinates }]
        if (c.geometry.type === 'MultiPolygon') return c.geometry.coordinates.map((coords: number[][][]) => ({ name: c.properties.name, coordinates: [coords] }))
        return []
      })
    } catch { /* globe without borders is fine */ }

    // Helper: decode TopoJSON arcs to [lng, lat] coordinates
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

    // ── Points ────────────────────────────────────────────────────
    const maxCount = Math.max(...sources.map(s => s.count), 1)
    const points = sources.map(s => ({
      lat: s.lat, lng: s.lng,
      r: Math.max(0.15, s.count / maxCount * 1.8),
      label: s.city, count: s.count,
    }))

    // ── Arcs ──────────────────────────────────────────────────────
    const targetLat = 31.2304, targetLng = 121.4737
    const arcs = sources
      .filter(s => !(Math.abs(s.lat - targetLat) < 0.5 && Math.abs(s.lng - targetLng) < 0.5))
      .map(s => ({ startLat: s.lat, startLng: s.lng, endLat: targetLat, endLng: targetLng }))

    // ── Build globe ───────────────────────────────────────────────
    globeInstance = Globe()(el)
      .globeImageUrl(null)             // NO earth texture
      .bumpImageUrl(null)              // NO bump map
      .backgroundImageUrl(null)        // Transparent background
      .width(w)
      .height(h)
      .polygonsData(polygonsData)
      .polygonCapMaterial(new THREE.MeshBasicMaterial({ color: 0x12141f, side: THREE.DoubleSide }))
      .polygonSideMaterial(new THREE.MeshBasicMaterial({ color: 0x1e2030, side: THREE.DoubleSide }))
      .polygonStrokeColor(() => 'rgba(94, 106, 210, 0.25)')
      .polygonLabel((d: any) => `<div style="font-size:12px;color:#aaa">${d.name || ''}</div>`)
      .pointsData(points)
      .pointLat('lat').pointLng('lng')
      .pointAltitude(0.06)
      .pointRadius('r')
      .pointColor(() => '#FF8859')
      .pointLabel((d: any) => `<div style="font-size:13px;font-weight:600;color:#fff">${d.label}</div><div style="font-size:11px;color:#999">${d.count} 次请求</div>`)
      .arcsData(arcs)
      .arcColor(() => ['rgba(255, 136, 89, 0.4)', 'rgba(94, 106, 210, 0.02)'])
      .arcStroke(0.35)
      .arcDashLength(0.25)
      .arcDashGap(0.12)
      .arcDashAnimateTime(2500)
      .arcsTransitionDuration(0)
      .atmosphereColor('#5E6AD2')
      .atmosphereAltitude(0.12)

    // Darken the sphere
    setTimeout(() => {
      try {
        const mat = globeInstance.globeMaterial()
        if (mat) {
          mat.color = new THREE.Color(0x0d0e1a)
          mat.emissive = new THREE.Color(0x1a1c30)
          mat.emissiveIntensity = 0.15
          mat.opacity = 0.92
          mat.transparent = true
        }
      } catch {}
    }, 50)

    // Auto-rotate after render
    setTimeout(() => {
      try {
        const ctrl = globeInstance.controls()
        if (ctrl) { ctrl.autoRotate = true; ctrl.autoRotateSpeed = 0.4 }
      } catch {}
    }, 800)
  } catch (e) { console.error('Globe:', e) }
}

onMounted(load)
onUnmounted(() => {
  try { if (globeInstance && typeof globeInstance._destructor === 'function') globeInstance._destructor() } catch {}
  globeInstance = null
})
</script>

<template>
  <div style="max-width: 1200px; margin: 0 auto">
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div>
        <h2 style="margin:0 0 4px;font-size:24px;font-weight:700;color:var(--text-primary);letter-spacing:-0.02em">流量监控</h2>
        <p style="margin:0;font-size:14px;color:var(--text-muted)">实时查看流量来源与分布</p>
      </div>
      <NButton quaternary size="small" @click="load" :disabled="loading">
        <template #icon>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v6h-6"/></svg>
        </template>
        刷新
      </NButton>
    </div>

    <!-- Stats -->
    <div v-if="data" class="stats-row">
      <div class="stat-card"><div class="stat-icon cyan"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div><div><div class="stat-num">{{ data.totals.total_requests }}</div><div class="stat-label">总请求数</div></div></div>
      <div class="stat-card"><div class="stat-icon green"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div><div><div class="stat-num">{{ fmt(data.totals.total_upload) }}</div><div class="stat-label">总上传</div></div></div>
      <div class="stat-card"><div class="stat-icon orange"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div><div><div class="stat-num">{{ fmt(data.totals.total_download) }}</div><div class="stat-label">总下载</div></div></div>
      <div class="stat-card"><div class="stat-icon purple"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div><div class="stat-num">{{ data.sources.length }}</div><div class="stat-label">来源城市</div></div></div>
    </div>

    <!-- Globe + Panel -->
    <NSpin :show="loading" style="min-height:500px">
      <div v-if="data" class="globe-layout">
        <div class="globe-container" ref="globeEl">
          <div v-if="!data.sources.length" style="display:flex;align-items:center;justify-content:center;height:100%"><NEmpty description="暂无流量数据" /></div>
        </div>
        <div class="sources-panel">
          <div class="panel-header">流量来源</div>
          <NScrollbar style="height:calc(100% - 44px)">
            <div class="list">
              <div v-for="(s, i) in data.sources" :key="s.city" class="row">
                <span class="rank">{{ i + 1 }}</span>
                <div class="info"><div class="city">{{ s.city }}</div><div class="reqs">{{ s.count }} 次</div></div>
                <div class="traffic"><span class="up">↑ {{ fmt(s.upload) }}</span><span class="down">↓ {{ fmt(s.download) }}</span></div>
              </div>
            </div>
          </NScrollbar>
        </div>
      </div>
      <NEmpty v-else-if="!loading" description="暂无数据" />
    </NSpin>
  </div>
</template>

<style scoped>
.stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
.stat-card { display:flex; align-items:center; gap:12px; background:var(--surface-1); border:1px solid var(--hairline); border-radius:8px; padding:14px 16px; }
.stat-icon { width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.stat-icon.cyan { background:rgba(15,198,194,0.12); color:#0FC6C2; }
.stat-icon.green { background:rgba(24,160,88,0.12); color:#18a058; }
.stat-icon.orange { background:rgba(255,136,89,0.12); color:#FF8859; }
.stat-icon.purple { background:rgba(160,80,220,0.12); color:#a050dc; }
.stat-num { font-size:20px; font-weight:700; color:var(--text-primary); letter-spacing:-0.02em; line-height:1.2; }
.stat-label { font-size:12px; color:var(--text-muted); margin-top:1px; }

.globe-layout { display:flex; gap:16px; min-height:520px; }
.globe-container { flex:1; background:var(--surface-1); border:1px solid var(--hairline); border-radius:8px; overflow:hidden; min-height:480px; position:relative; }

.sources-panel { width:300px; flex-shrink:0; background:var(--surface-1); border:1px solid var(--hairline); border-radius:8px; display:flex; flex-direction:column; }
.panel-header { font-size:13px; font-weight:600; color:var(--text-primary); padding:14px 16px; border-bottom:1px solid var(--hairline); }
.list { padding:2px 6px; }
.row { display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:6px; border-bottom:1px solid var(--hairline); transition:background .12s; }
.row:last-child { border-bottom:none; }
.row:hover { background:var(--surface-2); }
.rank { width:20px; font-size:11px; font-weight:600; color:var(--text-muted); text-align:center; flex-shrink:0; }
.info { flex:1; min-width:0; }
.city { font-size:13px; font-weight:500; color:var(--text-primary); }
.reqs { font-size:11px; color:var(--text-muted); }
.traffic { text-align:right; flex-shrink:0; display:flex; flex-direction:column; gap:1px; }
.traffic .up { font-size:11px; font-weight:500; color:#18a058; }
.traffic .down { font-size:11px; font-weight:500; color:#f0a020; }

@media (max-width:900px) { .globe-layout { flex-direction:column; } .sources-panel { width:100%; max-height:360px; } .stats-row { grid-template-columns:1fr 1fr; } }
</style>
