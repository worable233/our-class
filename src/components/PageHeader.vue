<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div style="margin-bottom: 16px;">
    <n-text tag="h2" style="font-size: 24px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.3; margin: 0;">
      {{ title }}
    </n-text>
    <n-text v-if="subtitle" depth="3" style="font-size: 13px; margin-top: 4px; display: block;">
      {{ subtitle }}
    </n-text>
    <slot />
  </div>
</template>
