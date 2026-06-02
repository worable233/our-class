import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export function useScrollReveal() {
  const target = ref<HTMLElement | null>(null) as Ref<HTMLElement | null>
  const isVisible = ref(false)
  let observer: IntersectionObserver | null = null

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          isVisible.value = true
          if (target.value) observer?.unobserve(target.value)
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    )
    if (target.value) observer.observe(target.value)
  })

  onUnmounted(() => {
    observer?.disconnect()
  })

  return { target, isVisible }
}
