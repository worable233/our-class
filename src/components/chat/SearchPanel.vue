<script setup lang="ts">
import { useSearchPanel } from '@/composables/useSearchPanel'
const { show, results, favicons, close } = useSearchPanel()

function safeHost(url: string): string {
  try { return new URL(url).hostname } catch { return '' }
}
</script>

<template>
  <div class="search-panel-root">
    <!-- Overlay (visible only on mobile when open) -->
    <div class="sp-overlay" :class="{ open: show && results.length }" @click="close()" />
    <div class="sp-panel" :class="{ open: show && results.length }">
      <div class="sp-panel-inner">
        <div class="sp-header">
          <h3 class="sp-title">搜索结果</h3>
          <span class="sp-count">{{ results.length }} 条</span>
          <button class="sp-close" @click="close()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div class="sp-list">
          <a v-for="(r, i) in results" :key="i" :href="r.url" target="_blank" class="sp-item" rel="noreferrer">
            <div class="sp-item-top">
              <span class="sp-index">{{ i + 1 }}</span>
              <img v-if="favicons[i]" :src="favicons[i]" width="16" height="16" class="sp-favicon" @error="($event.target as HTMLImageElement).style.display='none'" />
              <span class="sp-domain">{{ safeHost(r.url) }}</span>
            </div>
            <div class="sp-item-title">{{ r.title }}</div>
            <div class="sp-item-snippet">{{ r.snippet }}</div>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Overlay: backdrop blur + fade (mobile only) ── */
@media (min-width: 769px) {
  .sp-overlay { display: none; }
}
@media (max-width: 768px) {
  .sp-overlay {
    position: fixed; inset: 0; z-index: 199;
    background: rgba(0,0,0,.3);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    opacity: 0;
    pointer-events: none;
    transition: opacity .28s cubic-bezier(0,0,0,1);
  }
  .sp-overlay.open {
    opacity: 1;
    pointer-events: auto;
  }
}

/* Desktop: inline sidebar with slide animation */
.sp-panel {
  width: 0;
  flex-shrink: 0;
  background: var(--surface-1);
  border-left: none;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: width .28s cubic-bezier(0,0,0,1);
}
.search-panel-root {
  display: contents;
}
.sp-panel.open {
  width: 340px;
  border-left: 1px solid var(--hairline);
  transition: width .28s cubic-bezier(0,0,0,1),
              border-left .28s cubic-bezier(0,0,0,1);
}
.sp-panel-inner {
  width: 340px;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.sp-header {
  display: flex; align-items: center; gap: 8px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--hairline);
  flex-shrink: 0;
}
.sp-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
.sp-count { font-size: 13px; color: var(--text-muted); }
.sp-close {
  margin-left: auto; background: none; border: none; color: var(--text-muted);
  cursor: pointer; padding: 4px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.sp-close:hover { background: var(--surface-2); color: var(--text-primary); }
.sp-close:active { transform: scale(0.88); }

.sp-list { flex: 1; overflow-y: auto; padding: 2px; }

.sp-item {
  display: block; padding: 12px 8px; text-decoration: none;
  border-radius: 8px;
  margin-bottom: 2px;
  transition: background .12s;
}
.sp-item:last-child { margin-bottom: 0; }
.sp-item:hover { background: var(--surface-2); }

.sp-item-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.sp-index {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  background: var(--surface-3); color: var(--text-muted);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 600;
}
.sp-favicon { width: 16px; height: 16px; border-radius: 2px; flex-shrink: 0; object-fit: contain; }
.sp-domain { font-size: 12px; color: var(--text-muted); }

.sp-item-title {
  font-size: 14px; font-weight: 500; color: var(--text-primary);
  line-height: 1.4; margin-bottom: 6px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.sp-item:hover .sp-item-title { color: var(--accent-text); }

.sp-item-snippet {
  font-size: 13px; color: var(--text-muted); line-height: 1.6;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}

@media (max-width: 768px) {
  .sp-panel {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 200;
    width: 88vw !important;
    overflow: visible !important;
    border-left: none !important;
    transform: translateX(100%);
    transition: transform .3s cubic-bezier(0,0,0,1);
    /* Prevent desktop width transition from interfering */
    transition-property: transform;
  }
  .sp-panel.open { transform: translateX(0); border-left: 1px solid var(--hairline) !important; }
  .sp-panel-inner { width: 100%; }
}
</style>
