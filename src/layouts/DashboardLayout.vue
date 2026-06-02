<script setup lang="ts">
import { ref } from 'vue'
import { NLayout } from 'naive-ui'
import Sidebar from '@/components/dashboard/Sidebar.vue'
import Header from '@/components/dashboard/Header.vue'

const sidebarCollapsed = ref(false)
</script>

<template>
  <n-layout style="height: 100vh" position="absolute">
    <Sidebar v-model:collapsed="sidebarCollapsed" />
    <div
      :style="{
        marginLeft: sidebarCollapsed ? '60px' : '220px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        transition: 'margin-left 0.2s ease',
      }"
    >
      <Header />
      <main
        style="flex: 1; padding: 24px; overflow-y: auto; background: var(--ground)"
      >
        <router-view />
      </main>
    </div>
  </n-layout>
</template>
