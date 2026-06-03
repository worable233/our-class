<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api/client'
import {
  NButton, NInput, NAlert, NSpace, NSpin, NSelect, NDivider,
} from 'naive-ui'
import { useMessage } from 'naive-ui'

const message = useMessage()

const apiUrl = ref('')
const apiKey = ref('')
const model = ref('')
const provider = ref('anthropic')
const hasKey = ref(false)
const searchApiUrl = ref('')
const searchApiKey = ref('')
const hasSearchKey = ref(false)
const saving = ref(false)
const testing = ref(false)
const testResult = ref<null | { ok: boolean; model?: string; latency?: number; tokens?: number; error?: string }>(null)
const loaded = ref(false)

async function load() {
  try {
    const config = await api.get<{ has_key: boolean; api_url: string; model: string; provider: string; search_api_url: string; has_search_key: boolean } | null>('/chat/config')
    if (config) {
      hasKey.value = !!config.has_key
      apiUrl.value = config.api_url || ''
      model.value = config.model || ''
      provider.value = config.provider || 'anthropic'
      searchApiUrl.value = config.search_api_url || ''
      hasSearchKey.value = !!config.has_search_key
    }
  } catch {}
  loaded.value = true
}

async function save() {
  if (!apiKey.value.trim() && !hasKey.value) return
  saving.value = true
  try {
    await api.post('/chat/config', {
      ...(apiKey.value.trim() ? { api_key: apiKey.value.trim() } : {}),
      api_url: apiUrl.value.trim(),
      model: model.value,
      provider: provider.value,
      search_api_url: searchApiUrl.value.trim(),
      ...(searchApiKey.value.trim() ? { search_api_key: searchApiKey.value.trim() } : {}),
    })
    message.success('已保存')
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function test() {
  testing.value = true
  testResult.value = null
  try {
    await api.post('/chat/config', {
      ...(apiKey.value.trim() ? { api_key: apiKey.value.trim() } : {}),
      api_url: apiUrl.value.trim(),
      model: model.value,
      provider: provider.value,
      search_api_url: searchApiUrl.value.trim(),
      ...(searchApiKey.value.trim() ? { search_api_key: searchApiKey.value.trim() } : {}),
    })
    const res = await api.post<{ success: boolean; model: string; latency_ms: number; input_tokens: number }>('/chat/test', {})
    testResult.value = {
      ok: true,
      model: res.model,
      latency: res.latency_ms,
      tokens: res.input_tokens,
    }
    message.success('连接成功')
  } catch (e: any) {
    testResult.value = { ok: false, error: e.message || '连接失败' }
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">AI 配置</h2>
        <p class="page-subtitle">配置 API 连接以启用 AI 助手</p>
      </div>
    </div>

    <n-spin :show="!loaded">
      <div style="max-width: 480px; display: flex; flex-direction: column; gap: 16px">
        <!-- Provider -->
        <div>
          <div style="font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--text-secondary)">接口格式</div>
          <n-select
            v-model:value="provider"
            :options="[
              { label: 'Anthropic（Claude）', value: 'anthropic' },
              { label: 'OpenAI 兼容（DeepSeek / GPT）', value: 'openai' },
            ]"
          />
        </div>

        <!-- Model -->
        <div>
          <div style="font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--text-secondary)">模型</div>
          <n-input v-model:value="model" placeholder="claude-sonnet-4-20250514" />
        </div>

        <!-- API URL -->
        <div>
          <div style="font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--text-secondary)">API 地址</div>
          <n-input v-model:value="apiUrl" placeholder="留空使用默认 https://api.anthropic.com" />
        </div>

        <!-- API Key -->
        <div>
          <div style="font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--text-secondary)">
            API Key
            <span v-if="hasKey && !apiKey" style="color: #16a34a; font-weight: 400">已配置</span>
          </div>
          <n-input
            v-model:value="apiKey"
            type="password"
            show-password-on="click"
            :placeholder="hasKey && !apiKey ? '留空则保留原 Key' : 'sk-ant-...'"
          />
        </div>

        <n-divider style="margin: 8px 0">联网搜索（可选）</n-divider>

        <!-- Search API URL -->
        <div>
          <div style="font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--text-secondary)">搜索 API 地址</div>
          <n-input v-model:value="searchApiUrl" placeholder="留空则不配置联网搜索" />
        </div>

        <!-- Search API Key -->
        <div>
          <div style="font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--text-secondary)">
            搜索 API Key
            <span v-if="hasSearchKey && !searchApiKey" style="color: #16a34a; font-weight: 400">已配置</span>
          </div>
          <n-input
            v-model:value="searchApiKey"
            type="password"
            show-password-on="click"
            :placeholder="hasSearchKey && !searchApiKey ? '留空则保留原 Key' : 'sk-...'"
          />
        </div>

        <!-- Test result -->
        <n-alert v-if="testResult" :type="testResult.ok ? 'success' : 'error'" :closable="false">
          <template v-if="testResult.ok">
            连接成功 — 模型 {{ testResult.model }}，延迟 {{ testResult.latency }}ms，消耗 {{ testResult.tokens }} token
          </template>
          <template v-else>
            {{ testResult.error }}
          </template>
        </n-alert>

        <!-- Actions -->
        <n-space>
          <n-button :loading="testing" :disabled="!apiKey.trim() && !hasKey" @click="test">
            {{ testing ? '测试中...' : '测试连接' }}
          </n-button>
          <n-button type="primary" :loading="saving" :disabled="!apiKey.trim() && !hasKey" @click="save">
            保存
          </n-button>
        </n-space>
      </div>
    </n-spin>
  </div>
</template>
