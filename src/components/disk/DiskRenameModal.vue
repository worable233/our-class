<script setup lang="ts">
import { ref, watch } from 'vue'
import { NModal, NButton, NInput, NSpace } from 'naive-ui'
import type { DiskEntry } from '@/composables/useDisk'

const props = defineProps<{
  show: boolean
  entry: DiskEntry | null
}>()

const emit = defineEmits<{
  close: []
  rename: [newName: string]
}>()

const newName = ref('')

watch(() => props.show, (val) => {
  if (val && props.entry) {
    newName.value = props.entry.name
  }
})

function onSubmit() {
  const name = newName.value.trim()
  if (name && name !== props.entry?.name) {
    emit('rename', name)
  }
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="重命名"
    style="width: 400px;"
    :mask-closable="false"
    @update:show="!$event && emit('close')"
  >
    <n-form-item label="新名称">
      <n-input
        v-model:value="newName"
        placeholder="输入新名称"
        @keyup.enter="onSubmit"
        autofocus
      />
    </n-form-item>
    <template #footer>
      <n-space justify="end">
        <n-button quaternary @click="emit('close')">取消</n-button>
        <n-button type="primary" @click="onSubmit" :disabled="!newName.trim() || newName.trim() === entry?.name" round>
          确定
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>
