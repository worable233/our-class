<script setup lang="ts">
interface RandomPickCardData {
  type: 'random_pick'
  title: string
  subtitle: string
  candidates: string[]
  result: string[]
  count: number
  note?: string | null
}

defineProps<{
  card: RandomPickCardData
}>()
</script>

<template>
  <div class="rp-results">
    <span
      v-for="(name, i) in card.result"
      :key="i"
      class="rp-name"
    >{{ name }}<span v-if="i < card.result.length - 1" class="rp-sep">、</span></span>
  </div>
  <div v-if="card.note" class="rp-note">{{ card.note }}</div>
</template>

<style scoped>
.rp-results {
  padding: 20px 16px;
  text-align: center;
  line-height: 1.8;
}

.rp-name {
  font-size: 28px;
  font-weight: 800;
  color: var(--accent-text, #5e6ad2);
}

.rp-sep {
  color: var(--text-muted);
  font-weight: 400;
}

.rp-note {
  padding: 6px 16px 14px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}
</style>
