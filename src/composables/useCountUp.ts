import { ref, readonly } from 'vue'

export function useCountUp(target: number, duration = 2000) {
  const displayValue = ref(0)
  let started = false

  function start() {
    if (started) return
    started = true
    const startTime = performance.now()

    function update(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      displayValue.value = Math.round(eased * target)
      if (progress < 1) {
        requestAnimationFrame(update)
      } else {
        displayValue.value = target
      }
    }

    requestAnimationFrame(update)
  }

  return { displayValue: readonly(displayValue), start }
}
