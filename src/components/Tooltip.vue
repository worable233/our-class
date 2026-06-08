<script setup lang="ts">
defineProps<{
  text: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}>()
</script>

<template>
  <div class="tooltip-wrap" :class="`tooltip-${placement || 'top'}`">
    <slot />
    <div class="tooltip-popup">{{ text }}</div>
  </div>
</template>

<style scoped>
.tooltip-wrap {
  position: relative;
  display: inline-flex;
}
.tooltip-popup {
  position: absolute;
  z-index: 1000;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  color: #fff;
  background: rgba(50, 50, 50, 0.92);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 2px 8px rgba(0,0,0,.15);
  pointer-events: none;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity .2s ease, transform .2s ease;
}
.tooltip-wrap:hover .tooltip-popup {
  opacity: 1;
  transform: translateY(0);
}

/* Placement */
.tooltip-top .tooltip-popup {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-4px);
  margin-bottom: 6px;
}
.tooltip-top:hover .tooltip-popup {
  transform: translateX(-50%) translateY(0);
}

.tooltip-bottom .tooltip-popup {
  top: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  margin-top: 6px;
}
.tooltip-bottom:hover .tooltip-popup {
  transform: translateX(-50%) translateY(0);
}

.tooltip-left .tooltip-popup {
  right: 100%;
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  margin-right: 6px;
}
.tooltip-left:hover .tooltip-popup {
  transform: translateY(-50%) translateX(0);
}

.tooltip-right .tooltip-popup {
  left: 100%;
  top: 50%;
  transform: translateY(-50%) translateX(4px);
  margin-left: 6px;
}
.tooltip-right:hover .tooltip-popup {
  transform: translateY(-50%) translateX(0);
}
</style>
