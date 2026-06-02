<script setup lang="ts">
defineProps<{
  label: string
  title: string
  splitIdx?: number
}>()
</script>

<template>
  <div class="flex flex-col lg:flex-row lg:gap-8">
    <!-- Section label -->
    <div class="w-full lg:w-48 lg:shrink-0 lg:sticky lg:top-[15vh] self-start">
      <div class="flex flex-col items-start gap-3">
        <!-- Mobile: single line -->
        <div class="flex items-center gap-1 text-xs uppercase tracking-wide lg:hidden" style="font-family: var(--font-orbix);">
          <span class="text-[#5E6AD2]">/</span>
          <span class="text-gray-400 truncate">{{ label }}</span>
        </div>
        <!-- Desktop: stacked -->
        <div class="hidden lg:flex items-start gap-1 text-xs uppercase tracking-wide leading-none" style="font-family: var(--font-orbix);">
          <div class="shrink-0 text-right">
            <p class="text-[#5E6AD2]">/</p>
            <p class="invisible">/</p>
          </div>
          <div class="text-gray-500">
            <p
              v-for="(part, i) in label.split(' ')"
              :key="i"
              class="whitespace-nowrap"
            >{{ part }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Headline -->
    <div class="flex-1 min-w-0">
      <h2 class="text-[clamp(1.5rem,2vw,2rem)] font-medium leading-[1.2] tracking-tight text-gray-900 break-keep">
        {{ title }}
      </h2>
    </div>
  </div>
</template>
