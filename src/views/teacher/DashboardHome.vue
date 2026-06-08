<script setup lang="ts">
import { NEmpty, NText } from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
</script>

<template>
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;gap:16px">
    <NText depth="3" style="font-size:15px;">仪表盘待重新设计</NText>
    <NEmpty description="敬请期待" />
  </div>
</template>
