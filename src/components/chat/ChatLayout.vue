<script setup lang="ts">
defineProps<{ sidebarOpen?: boolean }>()
defineEmits<{ closeSidebar: [] }>()
</script>

<template>
  <div class="flex-1 w-full flex min-h-0" style="background: var(--ground)">
    <div v-if="sidebarOpen !== false" class="sidebar-overlay" @click="$emit('closeSidebar')" />
    <aside
      class="sidebar-panel"
      :class="{ open: sidebarOpen !== false }"
    >
      <slot name="sidebar" />
    </aside>
    <main class="flex-1 flex flex-col min-w-0">
      <slot name="main" />
    </main>
  </div>
</template>

<style scoped>
.sidebar-panel {
  width: 261px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  transform: translateX(-261px);
  margin-left: -261px;
  transition: transform .28s cubic-bezier(0,0,0,1),
              margin-left .28s cubic-bezier(0,0,0,1);
  will-change: transform;
}

.sidebar-panel.open {
  transform: translateX(0);
  margin-left: 0;
}

.sidebar-overlay {
  display: none;
}

@media (max-width: 768px) {
  .sidebar-panel {
    position: fixed; top: 0; left: 0; bottom: 0; z-index: 101;
    margin-left: 0;
  }
  .sidebar-overlay {
    display: block;
    position: fixed; inset: 0; z-index: 100;
    background: rgba(0,0,0,.3);
    backdrop-filter: blur(2px);
  }
}
</style>
