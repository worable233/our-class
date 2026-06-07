<script setup lang="ts">
import { ref, computed, provide } from 'vue'
import { NLayout } from 'naive-ui'
import Sidebar from '@/components/dashboard/Sidebar.vue'
import Header from '@/components/dashboard/Header.vue'

const MOBILE_BP = 768
const isMobile = ref(window.innerWidth < MOBILE_BP)
window.addEventListener('resize', () => { isMobile.value = window.innerWidth < MOBILE_BP })

const sidebarOpen = ref(!isMobile.value)
const sidebarCollapsed = computed({
  get: () => !sidebarOpen.value,
  set: (val) => { sidebarOpen.value = !val },
})

const refreshTick = ref(0)
function refreshContent() { refreshTick.value++ }
provide('refreshContent', refreshContent)
provide('refreshTick', refreshTick)

function toggleSidebar() { sidebarOpen.value = !sidebarOpen.value }
function closeSidebar() { sidebarOpen.value = false }
</script>

<template>
  <n-layout style="height: 100vh" position="absolute">
    <Sidebar v-model:collapsed="sidebarCollapsed" :class="{ 'mobile-sidebar': isMobile && sidebarOpen }" />
    <div
      :style="{
        marginLeft: isMobile ? '0' : (sidebarOpen ? '220px' : '60px'),
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        transition: 'margin-left 0.2s ease',
      }"
    >
      <Header @toggle-sidebar="toggleSidebar" :is-mobile="isMobile" />
      <main style="flex: 1; padding: 24px; overflow-y: auto; background: var(--ground);">
        <router-view  />
      </main>
    </div>
  </n-layout>
</template>

<style>
/* unscoped for sidebar z-index */
.mobile-sidebar { z-index: 100 !important; }
@media (max-width: 768px) {
  main { padding: 16px !important; }
}
</style>
