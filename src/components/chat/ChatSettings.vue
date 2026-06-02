<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import { Key, Eye, EyeOff } from '@lucide/vue'

const emit = defineEmits<{ close: [] }>()

const apiKey = ref('')
const model = ref('claude-sonnet-4-20250514')
const saving = ref(false)
const showKey = ref(false)
const message = ref('')

const models = [
  { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
  { label: 'Claude Haiku 3.5', value: 'claude-3-5-haiku-20241022' },
]

async function load() {
  try {
    const res = await api.get<any>('/chat/config')
    if (res.data) {
      apiKey.value = res.data.api_key || ''
      model.value = res.data.model || 'claude-sonnet-4-20250514'
    }
  } catch {}
}

async function save() {
  if (!apiKey.value.trim()) return
  saving.value = true
  message.value = ''
  try {
    await api.post('/chat/config', { api_key: apiKey.value.trim(), model: model.value })
    message.value = '保存成功'
    setTimeout(() => emit('close'), 1000)
  } catch (e: any) {
    message.value = e.message || '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" @click.self="emit('close')">
    <div class="w-[420px] bg-white rounded-2xl shadow-xl border border-gray-100 p-6 animate-[fadeIn_0.2s_ease-out]">
      <h2 class="text-base font-semibold text-gray-900 mb-5">API 配置</h2>

      <div class="flex flex-col gap-4">
        <!-- Model -->
        <div>
          <label class="text-xs font-medium text-gray-400 block mb-1.5">模型</label>
          <select
            v-model="model"
            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-gray-400"
          >
            <option v-for="m in models" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </div>

        <!-- API Key -->
        <div>
          <label class="text-xs font-medium text-gray-400 block mb-1.5">Anthropic API Key</label>
          <div class="relative">
            <input
              v-model="apiKey"
              :type="showKey ? 'text' : 'password'"
              placeholder="sk-ant-..."
              class="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-gray-400 transition-colors pr-10"
            />
            <button class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" @click="showKey = !showKey">
              <Eye v-if="!showKey" :size="16" />
              <EyeOff v-else :size="16" />
            </button>
          </div>
        </div>

        <p v-if="message" class="text-sm text-center" :class="message === '保存成功' ? 'text-green-500' : 'text-red-500'">{{ message }}</p>

        <div class="flex gap-2 justify-end pt-2">
          <button class="px-5 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors" @click="emit('close')">取消</button>
          <button
            class="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
            :disabled="saving || !apiKey.trim()"
            @click="save"
          >{{ saving ? '保存中...' : '保存' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.97) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
