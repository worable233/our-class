<script setup lang="ts">
import { History, Search } from '@lucide/vue'
const props = defineProps<{ sidebarOpen?: boolean }>()
const emit = defineEmits<{ history: []; search: [] }>()
</script>

<template>
  <!-- Left capsule — morphs into sidebar header when sidebar opens -->
  <div class="capsule-left" :class="{ merged: props.sidebarOpen }">
    <button class="capsule-btn" title="历史记录" @click="emit('history')">
      <History :size="16" />
    </button>
    <div class="capsule-divider" />
    <button class="capsule-btn" title="搜索" @click="emit('search')">
      <Search :size="16" />
    </button>
  </div>
</template>

<style scoped>
.capsule-left {
  position: fixed; top: 16px; z-index: 50;
  display: flex; align-items: center; gap: 4px;
  padding: 4px;
  border-radius: 9999px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  box-shadow: 0 1px 2px rgba(0,0,0,.03), 0 2px 8px rgba(0,0,0,.04);
  transition: left .28s cubic-bezier(0,0,0,1),
              background .28s cubic-bezier(0,0,0,1),
              border-color .28s cubic-bezier(0,0,0,1),
              box-shadow .28s cubic-bezier(0,0,0,1);
}
:root.dark .capsule-left {
  box-shadow: 0 1px 2px rgba(0,0,0,.2), 0 2px 8px rgba(0,0,0,.3);
}
.capsule-left { left: 16px; }
.capsule-left.merged {
  left: 181px;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}
.capsule-left.merged .capsule-divider { background: transparent; }

.capsule-btn {
  width: 28px; height: 28px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none;
  color: var(--text-secondary); cursor: pointer;
  transition: color .15s;
}
.capsule-btn:hover { color: var(--text-primary); background: var(--surface-2); }

.capsule-divider { width: 1px; height: 16px; background: var(--hairline); }

@media (max-width: 768px) {
  .capsule-left { z-index: 102; }
}
</style>
