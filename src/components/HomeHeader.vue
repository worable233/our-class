<script setup lang="ts">
import { History, Search, Plus } from '@lucide/vue'
import { NTooltip } from 'naive-ui'
const props = defineProps<{ sidebarOpen?: boolean }>()
const emit = defineEmits<{ history: []; search: []; newChat: [] }>()
</script>

<template>
  <div class="capsule-left" :class="{ merged: props.sidebarOpen }">
    <!-- 展开时左边：搜索 -->
    <NTooltip trigger="hover" placement="bottom">
      <template #trigger>
        <button class="capsule-btn" :class="{ 'btn-hidden': !props.sidebarOpen }" @click="emit('search')">
          <Search :size="16" />
        </button>
      </template>
      搜索对话
    </NTooltip>
    <!-- 始终中间：历史记录 -->
    <NTooltip trigger="hover" placement="bottom">
      <template #trigger>
        <button class="capsule-btn" @click="emit('history')">
          <History :size="16" />
        </button>
      </template>
      历史记录
    </NTooltip>
    <!-- 收起时显示在历史和新建之间：分隔线 -->
    <div class="capsule-divider" :class="{ 'div-hidden': props.sidebarOpen }" />
    <!-- 收起时右边：新建对话 -->
    <NTooltip trigger="hover" placement="bottom">
      <template #trigger>
        <button class="capsule-btn" :class="{ 'btn-hidden': props.sidebarOpen }" @click="emit('newChat')">
          <Plus :size="16" />
        </button>
      </template>
      新建对话
    </NTooltip>
  </div>
</template>

<style scoped>
.capsule-left {
  position: fixed; top: 16px; z-index: 50;
  display: flex; align-items: center;
  padding: 4px;
  border-radius: 9999px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  box-shadow: 0 4px 24px 0 rgba(0, 0, 0, .06);
  transition: left .28s cubic-bezier(0,0,0,1),
              background .28s cubic-bezier(0,0,0,1),
              border-color .28s cubic-bezier(0,0,0,1),
              box-shadow .28s cubic-bezier(0,0,0,1);
}
:root.dark .capsule-left {
  box-shadow: 0 1px 2px rgba(0,0,0,.2), 0 2px 8px rgba(0,0,0,.3);
}
.capsule-left { left: 16px; }
.capsule-left.merged {
  left: 181px;
  background: transparent;
  border-color: transparent;
  box-shadow: none !important;
}

.capsule-btn {
  width: 28px; height: 28px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none;
  color: var(--text-secondary); cursor: pointer;
  transition: width .28s cubic-bezier(0,0,0,1),
              opacity .28s cubic-bezier(0,0,0,1),
              transform .28s cubic-bezier(0,0,0,1),
              margin .28s cubic-bezier(0,0,0,1),
              color .15s, background .15s;
  flex-shrink: 0;
  margin: 0 2px;
}
.capsule-btn:hover { color: var(--text-primary); background: var(--surface-2); }
.capsule-btn:active { transform: scale(0.92); background: var(--surface-3); }

.capsule-btn.btn-hidden {
  width: 0;
  margin: 0;
  opacity: 0;
  transform: scale(0.5);
  pointer-events: none;
  overflow: hidden;
}

.capsule-divider {
  width: 1px; height: 16px;
  background: var(--hairline);
  transition: width .28s cubic-bezier(0,0,0,1),
              opacity .15s cubic-bezier(0,0,0,1),
              margin .28s cubic-bezier(0,0,0,1);
  flex-shrink: 0;
  margin: 0 2px;
}
.capsule-divider.div-hidden {
  width: 0;
  margin: 0;
  opacity: 0;
}

@media (max-width: 768px) {
  .capsule-left { z-index: 102; }
}
</style>
