<script setup lang="ts">
import { computed } from 'vue'
import { zhCN, darkTheme } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import { useTheme } from '@/composables/useTheme'

const { isDark } = useTheme()
const theme = computed(() => (isDark.value ? darkTheme : null))

const darkOverrides: GlobalThemeOverrides = {
  common: {
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontFamilyMono: "'JetBrains Mono', 'Fira Code', monospace",
    borderRadius: '6px',
    borderRadiusSmall: '4px',
    primaryColor: '#5E6AD2',
    primaryColorHover: '#7C7FDC',
    primaryColorPressed: '#4D59C2',
    primaryColorSuppl: '#5E6AD2',
    bodyColor: '#0a0b0d',
    cardColor: '#121314',
    modalColor: '#121314',
    popoverColor: '#121314',
    tableColor: '#121314',
    actionColor: '#18191b',
    hoverColor: 'rgba(255, 255, 255, 0.08)',
    dividerColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    textColor1: '#f5f9fe',
    textColor2: '#a6aab5',
    textColor3: '#787d87',
    placeholderColor: '#555',
    inputColor: '#0a0b0d',
    inputColorDisabled: '#121314',
    railColor: 'rgba(255, 255, 255, 0.08)',
  },
}

const themeOverrides = computed(() => (isDark.value ? darkOverrides : null))
</script>

<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverrides" :locale="zhCN">
    <NDialogProvider>
      <NMessageProvider>
        <router-view />
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>

<style>
@import "tailwindcss";

@variant dark (&:where(.dark, .dark *));

@font-face {
  font-family: 'Orbix';
  src: url('@/assets/fonts/orbix-regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

:root {
  --font-orbix: 'Orbix', sans-serif;
}

body {
  font-family: 'Inter', -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
}
</style>
