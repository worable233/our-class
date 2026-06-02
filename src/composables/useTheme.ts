import { ref, watchEffect } from 'vue'

const isDark = ref(localStorage.getItem('ourclass_theme') === 'dark')

export function useTheme() {
  function toggle() {
    isDark.value = !isDark.value
    localStorage.setItem('ourclass_theme', isDark.value ? 'dark' : 'light')
  }

  watchEffect(() => {
    document.documentElement.classList.toggle('dark', isDark.value)
  })

  return { isDark, toggle }
}
