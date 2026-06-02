<script setup lang="ts">
withDefaults(defineProps<{
  size?: number
  theme?: 'auto' | 'light' | 'dark'
}>(), {
  size: 150,
  theme: 'auto',
})
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="-5 -5 110 115"
    :width="size"
    :height="size"
    class="block"
    :class="theme === 'light' ? 'logo-light' : theme === 'dark' ? 'logo-dark' : 'logo-auto'"
  >
    <defs>
      <linearGradient id="gDark" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#5E6AD2" />
        <stop offset="50%" stop-color="#7C7FDC" />
        <stop offset="100%" stop-color="#A78BFA" />
      </linearGradient>
      <linearGradient id="gStrokeDark" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#A78BFA" stop-opacity="0.6" />
        <stop offset="100%" stop-color="#5E6AD2" stop-opacity="0.3" />
      </linearGradient>
      <linearGradient id="gLight" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4A56C8" />
        <stop offset="50%" stop-color="#5E6AD2" />
        <stop offset="100%" stop-color="#8B7FD4" />
      </linearGradient>
      <linearGradient id="gStrokeLight" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4A56C8" stop-opacity="0.3" />
        <stop offset="100%" stop-color="#A78BFA" stop-opacity="0.15" />
      </linearGradient>
    </defs>
    <!-- Dark mode -->
    <g class="logo-dark-group">
      <path d="m3.3 100.1 0.1-0.1c0.6-0.8 8.6-9.4 11.2-12.1l32-32.9 25.7-25.5 21.6-21.1v-0.2l-25 32-23.3 20.8c-2.3 2.1-33.8 30.8-41.5 38.7-0.1 0.1-0.4 0.4-0.8 0.4z" fill="url(#gDark)" fill-opacity="0.85" stroke="url(#gStrokeDark)" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round" style="mix-blend-mode: screen;" />
      <path d="m41.8 53.6-0.1-0.1c-1-0.3-4.2-1.8-4.7-2.1-3.3-2.8-9.2-8.4-9.4-8.9-0.2-0.9-1.2-9.7-1.1-10.1 0.1-0.3 5.5-10.7 6-11.4 0.1-0.1 7-3.6 9.9-4.9 2.8-1.3 6.8-3.1 7.6-3.6 4 0.5 9.7 1.9 13.1 2.6s5.4 1.1 8.4 0.8c3.3-0.2 5-1.2 7.3-2.5 3.3-2 18.1-13.3 18.1-13.4-1 1.4-29.6 29-29.6 29-5.5-2-11.7-3.7-17.8-3.9h-1.8l-1.2 0.1c-1.7 1.3-6.4 5.3-7.2 6-0.2 0.3 0.9 7.1 1 7.2 2.2 1.4 6.4 3.3 11 5.4" fill="url(#gDark)" fill-opacity="0.75" stroke="url(#gStrokeDark)" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round" style="mix-blend-mode: screen;" />
      <path d="m64.1 48.8-10 9.8c2.7 1.3 7 3.4 9 4.7 0.1 0.2 0.3 5.6 0.2 5.9-0.6 0.8-7 6.2-7.7 6.8-1.1 0.1-4.7-0.2-6.8-0.5-3-0.5-6.6-1.5-10.5-3.5l-13 11.6-12.8 11.4c3.6-2.3 11.5-7.2 13.5-8.1 3.7-1.7 6.1-2.2 9.6-2.2 4 0 5.8 0.7 8.8 1.4 3.5 0.8 8.1 2 8.8 2 0.4-0.2 15.4-6.8 17.4-8l6.2-15c0.1-0.1-2.3-7.4-2.8-7.8-1.5-1.6-4.3-4.6-7.3-7l-2.6-1.5z" fill="url(#gDark)" fill-opacity="0.9" stroke="url(#gStrokeDark)" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round" style="mix-blend-mode: screen;" />
    </g>
    <!-- Light mode -->
    <g class="logo-light-group">
      <!-- shadow offset -->
      <g transform="translate(0.5, 1.5)" opacity="0.12">
        <path d="m3.3 100.1 0.1-0.1c0.6-0.8 8.6-9.4 11.2-12.1l32-32.9 25.7-25.5 21.6-21.1v-0.2l-25 32-23.3 20.8c-2.3 2.1-33.8 30.8-41.5 38.7-0.1 0.1-0.4 0.4-0.8 0.4z" fill="#4A56C8"/>
        <path d="m41.8 53.6-0.1-0.1c-1-0.3-4.2-1.8-4.7-2.1-3.3-2.8-9.2-8.4-9.4-8.9-0.2-0.9-1.2-9.7-1.1-10.1 0.1-0.3 5.5-10.7 6-11.4 0.1-0.1 7-3.6 9.9-4.9 2.8-1.3 6.8-3.1 7.6-3.6 4 0.5 9.7 1.9 13.1 2.6s5.4 1.1 8.4 0.8c3.3-0.2 5-1.2 7.3-2.5 3.3-2 18.1-13.3 18.1-13.4-1 1.4-29.6 29-29.6 29-5.5-2-11.7-3.7-17.8-3.9h-1.8l-1.2 0.1c-1.7 1.3-6.4 5.3-7.2 6-0.2 0.3 0.9 7.1 1 7.2 2.2 1.4 6.4 3.3 11 5.4" fill="#4A56C8"/>
        <path d="m64.1 48.8-10 9.8c2.7 1.3 7 3.4 9 4.7 0.1 0.2 0.3 5.6 0.2 5.9-0.6 0.8-7 6.2-7.7 6.8-1.1 0.1-4.7-0.2-6.8-0.5-3-0.5-6.6-1.5-10.5-3.5l-13 11.6-12.8 11.4c3.6-2.3 11.5-7.2 13.5-8.1 3.7-1.7 6.1-2.2 9.6-2.2 4 0 5.8 0.7 8.8 1.4 3.5 0.8 8.1 2 8.8 2 0.4-0.2 15.4-6.8 17.4-8l6.2-15c0.1-0.1-2.3-7.4-2.8-7.8-1.5-1.6-4.3-4.6-7.3-7l-2.6-1.5z" fill="#4A56C8"/>
      </g>
      <path d="m3.3 100.1 0.1-0.1c0.6-0.8 8.6-9.4 11.2-12.1l32-32.9 25.7-25.5 21.6-21.1v-0.2l-25 32-23.3 20.8c-2.3 2.1-33.8 30.8-41.5 38.7-0.1 0.1-0.4 0.4-0.8 0.4z" fill="url(#gLight)" fill-opacity="0.88" stroke="url(#gStrokeLight)" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round" />
      <path d="m41.8 53.6-0.1-0.1c-1-0.3-4.2-1.8-4.7-2.1-3.3-2.8-9.2-8.4-9.4-8.9-0.2-0.9-1.2-9.7-1.1-10.1 0.1-0.3 5.5-10.7 6-11.4 0.1-0.1 7-3.6 9.9-4.9 2.8-1.3 6.8-3.1 7.6-3.6 4 0.5 9.7 1.9 13.1 2.6s5.4 1.1 8.4 0.8c3.3-0.2 5-1.2 7.3-2.5 3.3-2 18.1-13.3 18.1-13.4-1 1.4-29.6 29-29.6 29-5.5-2-11.7-3.7-17.8-3.9h-1.8l-1.2 0.1c-1.7 1.3-6.4 5.3-7.2 6-0.2 0.3 0.9 7.1 1 7.2 2.2 1.4 6.4 3.3 11 5.4" fill="url(#gLight)" fill-opacity="0.75" stroke="url(#gStrokeLight)" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round" />
      <path d="m64.1 48.8-10 9.8c2.7 1.3 7 3.4 9 4.7 0.1 0.2 0.3 5.6 0.2 5.9-0.6 0.8-7 6.2-7.7 6.8-1.1 0.1-4.7-0.2-6.8-0.5-3-0.5-6.6-1.5-10.5-3.5l-13 11.6-12.8 11.4c3.6-2.3 11.5-7.2 13.5-8.1 3.7-1.7 6.1-2.2 9.6-2.2 4 0 5.8 0.7 8.8 1.4 3.5 0.8 8.1 2 8.8 2 0.4-0.2 15.4-6.8 17.4-8l6.2-15c0.1-0.1-2.3-7.4-2.8-7.8-1.5-1.6-4.3-4.6-7.3-7l-2.6-1.5z" fill="url(#gLight)" fill-opacity="0.92" stroke="url(#gStrokeLight)" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round" />
    </g>
  </svg>
</template>

<style scoped>
/* Default: auto (follow system) */
.logo-auto .logo-light-group { display: none; }
@media (prefers-color-scheme: light) {
  .logo-auto .logo-dark-group { display: none; }
  .logo-auto .logo-light-group { display: block; }
}
/* Explicit light */
.logo-light .logo-dark-group { display: none; }
.logo-light .logo-light-group { display: block; }
/* Explicit dark */
.logo-dark .logo-dark-group { display: block; }
.logo-dark .logo-light-group { display: none; }
</style>
