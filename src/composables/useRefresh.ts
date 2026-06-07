import { inject, watch, type Ref } from 'vue'

export function useRefresh(onRefresh: () => void) {
  const tick = inject<Ref<number>>('refreshTick')
  if (tick) {
    watch(tick, () => onRefresh())
  }
}
