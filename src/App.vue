<script setup lang="ts">
import { computed } from 'vue'
import { zhCN, darkTheme } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui'
import { useTheme } from '@/composables/useTheme'

const { isDark } = useTheme()
const theme = computed(() => (isDark.value ? darkTheme : null))

// Base overrides shared by both themes (Naive UI docs site uses Inter for both)
const baseOverrides: GlobalThemeOverrides = {
  common: {
    fontFamily: "'Inter', -apple-system, sans-serif",
    fontFamilyMono: "'JetBrains Mono', 'Fira Code', monospace",
    borderRadius: '6px',
    borderRadiusSmall: '4px',
    primaryColor: '#5E6AD2',
    primaryColorHover: '#7C7FDC',
    primaryColorPressed: '#4D59C2',
    primaryColorSuppl: '#5E6AD2',
  },
  Menu: {
    itemHeight: '36px',
    borderRadius: '6px',
    itemFontSize: '14px',
    itemTextColor: 'rgba(0,0,0,0.6)',
    itemTextColorHover: 'rgba(0,0,0,0.9)',
    itemTextColorActive: 'var(--accent-text)',
    itemColorHover: 'rgba(0,0,0,0.05)',
    itemColorActive: 'rgba(94, 106, 210, 0.1)',
    itemColorActiveHover: 'rgba(94, 106, 210, 0.1)',
    itemIconColor: 'rgba(0,0,0,0.4)',
    itemIconColorHover: 'rgba(0,0,0,0.6)',
    itemIconColorActive: 'var(--accent-text)',
    groupTextColor: 'rgba(0,0,0,0.4)',
  },
}

const darkOverrides: GlobalThemeOverrides = {
  common: {
    ...baseOverrides.common,
    bodyColor: '#1d1d1d',
    cardColor: '#212121',
    modalColor: '#212121',
    popoverColor: '#212121',
    tableColor: '#212121',
    actionColor: '#292929',
    hoverColor: 'rgba(255, 255, 255, 0.08)',
    dividerColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    textColor1: 'rgba(255, 255, 255, 0.9)',
    textColor2: 'rgba(255, 255, 255, 0.6)',
    textColor3: 'rgba(255, 255, 255, 0.4)',
    placeholderColor: 'rgba(255, 255, 255, 0.25)',
    inputColor: '#1d1d1d',
    inputColorDisabled: '#212121',
    railColor: 'rgba(255, 255, 255, 0.08)',
  },
  Menu: {
    itemTextColor: '#a6aab5',
    itemTextColorHover: '#f5f9fe',
    itemTextColorActive: 'var(--accent-text)',
    itemColorHover: 'rgba(255, 255, 255, 0.06)',
    itemColorActive: 'rgba(94, 106, 210, 0.15)',
    itemColorActiveHover: 'rgba(94, 106, 210, 0.15)',
    itemIconColor: '#787d87',
    itemIconColorHover: '#a6aab5',
    itemIconColorActive: 'var(--accent-text)',
    groupTextColor: '#787d87',
  },
}

const themeOverrides = computed(() => (isDark.value ? darkOverrides : baseOverrides))
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

html {
  background: var(--ground);
}
body {
  margin: 0;
  background: var(--ground);
  font-family: 'Inter', -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
}
#app {
  background: var(--ground);
}
</style>
