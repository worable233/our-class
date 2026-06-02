<script setup lang="ts">
defineProps<{
  sidebarOpen?: boolean
}>()
</script>

<template>
  <div class="h-screen w-full flex bg-white">
    <!-- Sidebar -->
    <aside
      class="h-full flex flex-col border-r border-gray-100 bg-gray-50 transition-all duration-200"
      :class="sidebarOpen !== false ? 'w-[300px] shrink-0' : 'w-0 overflow-hidden'"
    >
      <slot name="sidebar" />
    </aside>

    <!-- Main -->
    <main class="flex-1 flex flex-col min-w-0 h-full">
      <slot name="main" />
    </main>
  </div>
</template>
