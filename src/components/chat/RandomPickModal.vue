<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Shuffle } from '@lucide/vue'

interface RandomPickCardData {
  type: 'random_pick'
  title: string
  subtitle: string
  candidates: string[]
  result: string[]
  count: number
  note?: string | null
}

const props = defineProps<{
  card: RandomPickCardData
  visible: boolean
}>()

const emit = defineEmits<{
  skip: []
  done: [cardData: RandomPickCardData]
}>()

// ── State ──
const phase = ref<'idle' | 'shuffling' | 'landing' | 'flying' | 'done'>('idle')
const displayName = ref('')
const pickedResults = ref<string[]>([])

const SHUFFLE_TICKS = 25
const INITIAL_DELAY = 50
const DECELERATE_AT = 12
const DECELERATE_STEP = 25

let stopped = false
let timer: ReturnType<typeof setTimeout> | null = null

// ── Lifecycle ──
onMounted(() => {
  timer = setTimeout(startPicks, 300)
})

onUnmounted(() => {
  stopped = true
  if (timer) clearTimeout(timer)
})

// ── Animation ──
function startPicks() {
  if (stopped) return
  if (props.card.count === 1 && props.card.candidates.length <= 1) {
    displayName.value = props.card.result[0] || props.card.candidates[0] || '—'
    pickedResults.value = [...props.card.result]
    phase.value = 'done'
    emit('done', props.card)
    return
  }
  shufflePick(0)
}

function shufflePick(pickIndex: number) {
  if (stopped || pickIndex >= props.card.result.length) {
    phase.value = 'done'
    emit('done', props.card)
    return
  }

  const pool = props.card.candidates.filter(n => !pickedResults.value.includes(n))
  if (pool.length === 0) {
    const name = props.card.result[pickIndex]
    if (name) landName(pickIndex, name)
    else { phase.value = 'done'; emit('done', props.card) }
    return
  }

  // Start shuffling — name stays LARGE
  phase.value = 'shuffling'
  displayName.value = pool[0] || '—'

  let count = 0
  let delay = INITIAL_DELAY

  function tick() {
    if (stopped || phase.value !== 'shuffling') return
    const idx = Math.floor(Math.random() * pool.length)
    displayName.value = pool[idx] || '—'
    count++

    if (count >= SHUFFLE_TICKS) {
      const finalName = props.card.result[pickIndex] || pool[Math.floor(Math.random() * pool.length)] || '—'
      displayName.value = finalName
      landName(pickIndex, finalName)
      return
    }

    if (count > DECELERATE_AT) delay += DECELERATE_STEP
    timer = setTimeout(tick, delay)
  }

  tick()
}

function landName(pickIndex: number, name: string) {
  if (stopped) return
  // Brief highlight, then fly to results
  phase.value = 'landing'
  timer = setTimeout(() => {
    if (stopped) return
    // Fly: shrink and move down
    phase.value = 'flying'
    timer = setTimeout(() => {
      if (stopped) return
      pickedResults.value = [...pickedResults.value, name]
      const nextIndex = pickIndex + 1
      if (nextIndex >= props.card.result.length) {
        phase.value = 'done'
        emit('done', props.card)
      } else {
        timer = setTimeout(() => shufflePick(nextIndex), 200)
      }
    }, 350)
  }, 300)
}

// ── Backdrop ──
function onBackdrop() {
  stopped = true
  if (timer) clearTimeout(timer)
  pickedResults.value = [...props.card.result]
  displayName.value = props.card.result[props.card.result.length - 1] || ''
  phase.value = 'done'
  emit('skip')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="backdrop">
      <div v-if="visible" class="rp-overlay" @click.self="onBackdrop">
        <Transition name="panel" appear>
          <div v-if="visible" class="rp-panel" @click.stop>
            <!-- Header -->
            <div class="rp-header">
              <div class="rp-header-left">
                <Shuffle :size="18" class="rp-header-icon" />
                <span class="rp-header-title">随机抽号</span>
              </div>
              <span v-if="card.subtitle" class="rp-header-sub">{{ card.subtitle }}</span>
            </div>

            <!-- Display area — name stays LARGE during shuffle, only shrinks on flying -->
            <div class="rp-display" :class="phase">
              <span class="rp-name" :class="{ landing: phase === 'landing', flying: phase === 'flying' }">
                {{ displayName || '—' }}
              </span>
              <div v-if="phase === 'shuffling'" class="rp-bar"></div>
            </div>

            <!-- Results -->
            <div class="rp-results">
              <TransitionGroup name="chip">
                <span
                  v-for="(name, i) in pickedResults"
                  :key="name + i"
                  class="rp-chip"
                >
                  <span class="rp-chip-n">{{ i + 1 }}</span>
                  {{ name }}
                </span>
              </TransitionGroup>
              <span v-if="pickedResults.length === 0 && phase !== 'idle'" class="rp-results-hint">
                抽取中...
              </span>
            </div>

          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Backdrop ── */
.rp-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.backdrop-enter-active { transition: all 250ms ease-out; }
.backdrop-leave-active { transition: all 200ms ease-in; }
.backdrop-enter-from,
.backdrop-leave-to { opacity: 0; backdrop-filter: blur(0); -webkit-backdrop-filter: blur(0); }

/* ── Panel ── */
.rp-panel {
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  width: min(400px, 90vw);
  overflow: hidden;
  box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.3);
}
.panel-enter-active { transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1); }
.panel-leave-active { transition: all 150ms ease-in; }
.panel-enter-from { transform: scale(0.92) translateY(16px); opacity: 0; }
.panel-leave-to { transform: scale(0.96); opacity: 0; }

/* ── Header ── */
.rp-header {
  display: flex;
  align-items: center;
  padding: 16px 16px 12px;
  gap: 10px;
}
.rp-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.rp-header-icon {
  color: var(--accent-text, #7c7fdc);
  flex-shrink: 0;
}
.rp-header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}
.rp-header-sub {
  font-size: 12px;
  color: var(--text-muted);
}

/* ── Display area ── */
.rp-display {
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  margin: 0 16px;
  border-radius: 10px;
  position: relative;
  overflow: hidden;
  transition: background 200ms ease, box-shadow 200ms ease;
}
.rp-display.shuffling {
  animation: rpPulse 0.3s ease-in-out infinite alternate;
}
.rp-display.landing {
  background: color-mix(in srgb, var(--accent, #5e6ad2) 10%, var(--surface-2));
}
.rp-display.done {
  background: color-mix(in srgb, var(--accent, #5e6ad2) 6%, var(--surface-2));
}

/* Name — stays LARGE during shuffle/land, shrinks on flying */
.rp-name {
  font-size: 44px;
  font-weight: 800;
  color: var(--text-primary);
  user-select: none;
  white-space: nowrap;
  transition: color 80ms ease;
}
.shuffling .rp-name,
.landing .rp-name {
  color: var(--accent-text, #5e6ad2);
}
/* Flying: shrink + move down */
.rp-name.flying {
  animation: nameFly 350ms cubic-bezier(0.4, 0, 0.6, 1) forwards;
}
@keyframes nameFly {
  to {
    transform: translateY(36px) scale(0.35);
    opacity: 0.3;
  }
}

/* Shuffle progress bar */
.rp-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--accent, #5e6ad2), transparent);
  background-size: 200% 100%;
  animation: rpSlide 0.4s linear infinite;
}

/* ── Results ── */
.rp-results {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 14px 16px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
}
.rp-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: var(--accent-glow, rgba(94, 106, 210, 0.08));
  border: 1px solid var(--hairline);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--accent-text, #5e6ad2);
}
.rp-chip-n {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent, #5e6ad2);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.rp-results-hint {
  font-size: 13px;
  color: var(--text-muted);
}

/* Chip enter */
.chip-enter-active {
  transition: all 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.chip-leave-active {
  transition: all 150ms ease-in;
}
.chip-enter-from {
  transform: scale(0);
  opacity: 0;
}
.chip-leave-to {
  transform: scale(0);
  opacity: 0;
}

/* ── Keyframes ── */
@keyframes rpPulse {
  from { box-shadow: inset 0 0 0 0 rgba(124, 127, 220, 0); }
  to   { box-shadow: inset 0 0 24px 0 rgba(124, 127, 220, 0.12); }
}
@keyframes rpSlide {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
