<script setup lang="ts">
import { useSearchPanel } from '@/composables/useSearchPanel'
const { show, results, favicons, close } = useSearchPanel()

function safeHost(url: string): string {
  try { return new URL(url).hostname } catch { return '' }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show && results.length" class="sp-overlay" @click="close()" />
    <div class="sp-panel" :class="{ open: show && results.length }">
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
            <img v-if="favicons[i]" :src="favicons[i]" width="16" height="16" class="sp-favicon" />
            <span class="sp-domain">{{ safeHost(r.url) }}</span>
          </div>
          <div class="sp-item-title">{{ r.title }}</div>
          <div class="sp-item-snippet">{{ r.snippet }}</div>
        </a>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sp-overlay { display: none; }

.sp-panel {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 200;
  width: 420px; max-width: 90vw;
  background: var(--surface-1);
  border-left: 1px solid var(--hairline);
  transform: translateX(100%);
  transition: transform .3s cubic-bezier(0,0,0,1);
  display: flex; flex-direction: column;
}
.sp-panel.open { transform: translateX(0); }

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

.sp-list { flex: 1; overflow-y: auto; padding: 4px 16px 24px; }

.sp-item {
  display: block; padding: 16px 8px; text-decoration: none;
  border-bottom: 1px solid var(--hairline); transition: background .12s;
  border-radius: 8px; margin-bottom: 2px;
}
.sp-item:last-child { border-bottom: none; }
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
  .sp-overlay { display: block; position: fixed; inset: 0; z-index: 199; background: rgba(0,0,0,.3); }
  .sp-panel { width: 88vw; }
}
</style>
