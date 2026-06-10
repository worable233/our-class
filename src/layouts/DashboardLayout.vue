<script setup lang="ts">
import { ref, computed, provide, watch, onMounted, onUnmounted } from 'vue'
import { NLayout, NLayoutContent } from 'naive-ui'
import Sidebar from '@/components/dashboard/Sidebar.vue'
import Header from '@/components/dashboard/Header.vue'

const MOBILE_BP = 768
const isMobile = ref(false)
let resizeHandler: (() => void) | null = null

onMounted(() => {
  isMobile.value = window.innerWidth < MOBILE_BP
  resizeHandler = () => { isMobile.value = window.innerWidth < MOBILE_BP }
  window.addEventListener('resize', resizeHandler)
})
onUnmounted(() => {
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
})

const savedSidebar = localStorage.getItem('ourclass_sidebar_open')
const sidebarOpen = ref(savedSidebar !== null ? savedSidebar === 'true' : !isMobile.value)
const sidebarCollapsed = computed({
  get: () => !sidebarOpen.value,
  set: (val) => { sidebarOpen.value = !val },
})

const refreshTick = ref(0)
function refreshContent() { refreshTick.value++ }
provide('refreshContent', refreshContent)
provide('refreshTick', refreshTick)

watch(sidebarOpen, (val) => {
  localStorage.setItem('ourclass_sidebar_open', String(val))
})

function toggleSidebar() { sidebarOpen.value = !sidebarOpen.value }
function closeSidebar() { sidebarOpen.value = false }
</script>

<template>
  <n-layout
    :style="{ height: '100vh', position: 'relative' }"
    :has-sider="!isMobile"
  >
    <!-- Sidebar: inline on desktop, fixed overlay on mobile -->
    <Sidebar
      v-model:collapsed="sidebarCollapsed"
      :is-mobile="isMobile"
      :open="sidebarOpen"
      @close="closeSidebar"
    />

    <!-- Mobile backdrop -->
    <div
      v-if="isMobile && sidebarOpen"
      class="mobile-backdrop"
      @click="closeSidebar"
    />

    <n-layout :style="{ position: 'relative' }">
      <Header @toggle-sidebar="toggleSidebar" :is-mobile="isMobile" />
      <n-layout-content
        class="page-content"
        :style="{
          padding: isMobile ? '16px' : '24px',
          overflowY: 'auto',
          background: 'var(--ground)',
          minHeight: 0,
        }"
      >
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<style>
.mobile-backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 99;
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.n-layout { background-color: transparent !important; }
</style>
