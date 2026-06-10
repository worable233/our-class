<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, h } from 'vue'
import { api } from '@/api/client'
import {
  NButton, NInput, NAlert, NSpace, NSpin, NSelect, NTabs, NTabPane,
  NSwitch, NForm, NFormItem, NInputNumber, NCard, NTag, NDivider,
  NCheckbox, NCheckboxGroup, NGrid, NGi, NScrollbar, NText, NCascader,
} from 'naive-ui'
import { useMessage } from 'naive-ui'
import type { ChatSettings, ToolConfig } from '@/types'
import { chinaRegions } from '@/data/china-regions'

const message = useMessage()

// ── Tab 1: API Config ────────────────────────────────────────

const apiUrl = ref('')
const apiKey = ref('')
const model = ref('')
const provider = ref('anthropic')
const hasKey = ref(false)
const saving = ref(false)
const testing = ref(false)
const testResult = ref<null | { ok: boolean; model?: string; latency?: number; tokens?: number; error?: string }>(null)
const loaded = ref(false)

// ── Tab 2: Feature Toggles ──────────────────────────────────

const settings = ref<ChatSettings>({
  enable_deep_think: false,
  enable_file_upload: false,
  allowed_file_types: '.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,.txt,.csv,.md',
  max_file_size: 10485760,
  max_files_per_conversation: 10,
})

const fileTypeOptions = [
  { label: '.doc / .docx (Word)', value: '.doc' },
  { label: '.docx (Word)', value: '.docx' },
  { label: '.xls / .xlsx (Excel)', value: '.xls' },
  { label: '.xlsx (Excel)', value: '.xlsx' },
  { label: '.ppt / .pptx (PPT)', value: '.ppt' },
  { label: '.pptx (PPT)', value: '.pptx' },
  { label: '.pdf (PDF)', value: '.pdf' },
  { label: '.txt (文本)', value: '.txt' },
  { label: '.csv (表格)', value: '.csv' },
  { label: '.md (Markdown)', value: '.md' },
  { label: '.json (JSON)', value: '.json' },
  { label: '.xml (XML)', value: '.xml' },
]

const selectedFileTypes = computed({
  get: () => settings.value.allowed_file_types.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
  set: (v: string[]) => { settings.value.allowed_file_types = v.join(',') },
})

const settingsSaving = ref(false)

// ── Tab 3: Tool Config ───────────────────────────────────────

const toolConfigs = ref<ToolConfig[]>([])
const toolsLoading = ref(false)
const toolsSaving = ref(false)

// ── Load ─────────────────────────────────────────────────────

async function load() {
  loaded.value = true
  try {
    const config = await api.get<{ has_key: boolean; api_key?: string; api_url: string; model: string; provider: string } | null>('/chat/config')
    if (config) {
      hasKey.value = !!config.has_key
      apiUrl.value = config.api_url || ''
      apiKey.value = (config as any).api_key || ''
      model.value = config.model || ''
      provider.value = config.provider || 'anthropic'
    }
  } catch {}
  try {
    const s = await api.get<ChatSettings>('/chat/settings')
    if (s) Object.assign(settings.value, s)
  } catch {}
  try {
    toolsLoading.value = true
    toolConfigs.value = await api.get<ToolConfig[]>('/chat/tools')
  } catch {} finally {
    toolsLoading.value = false
  }
}

// ── Tab 1 Save ──────────────────────────────────────────────

async function saveApiConfig() {
  if (!apiKey.value.trim() && !hasKey.value) return
  saving.value = true
  try {
    await api.post('/chat/config', {
      ...(apiKey.value.trim() ? { api_key: apiKey.value.trim() } : {}),
      api_url: apiUrl.value.trim(),
      model: model.value,
      provider: provider.value,
    })
    message.success('API 配置已保存')
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
    })
    const res = await api.post<{ success: boolean; model: string; latency_ms: number; input_tokens: number }>('/chat/test', {})
    testResult.value = { ok: true, model: res.model, latency: res.latency_ms, tokens: res.input_tokens }
    message.success('连接成功')
  } catch (e: any) {
    testResult.value = { ok: false, error: e.message || '连接失败' }
  } finally {
    testing.value = false
  }
}

// ── Tab 2 Save ──────────────────────────────────────────────

async function saveSettings() {
  settingsSaving.value = true
  try {
    await api.put('/chat/settings', settings.value)
    message.success('设置已保存')
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    settingsSaving.value = false
  }
}

// ── Tab 5: Rate Limits ─────────────────────────────────────

const rateLimits = ref({ max_rounds: 50, context_window: 20, max_agent_loops: 5, rapid_gap_ms: 1500, rapid_delay_ms: 2000 })
const rateLimitsSaving = ref(false)

async function loadRateLimits() {
  try { rateLimits.value = await api.get('/chat/rate-limits') } catch {}
}
async function saveRateLimits() {
  rateLimitsSaving.value = true
  try {
    await api.put('/chat/rate-limits', rateLimits.value)
    message.success('调用限制已保存')
  } catch { message.error('保存失败') }
  finally { rateLimitsSaving.value = false }
}

// ── Tab 3: Tool Config ───────────────────────────────────────

interface ToolConfigField { key: string; label: string; type: 'text' | 'number'; placeholder?: string }

const toolFields: Record<string, ToolConfigField[]> = {
  list_students: [{ key: 'max_results', label: '最大返回数量', type: 'number', placeholder: '50' }],
  get_student_points: [{ key: 'max_recent', label: '最近记录数', type: 'number', placeholder: '20' }],
  add_points: [],
  get_score_rankings: [],
  list_assignments: [{ key: 'max_results', label: '最大返回数量', type: 'number', placeholder: '50' }],
  get_submissions: [{ key: 'max_results', label: '最大返回数量', type: 'number', placeholder: '50' }],
  get_weather: [{ key: 'default_city', label: '默认城市', type: 'text', placeholder: '北京' }],
  web_search: [{ key: 'max_results', label: '最大搜索结果数', type: 'number', placeholder: '5' }],
  random_pick: [{ key: 'max_count', label: '最大抽取人数', type: 'number', placeholder: '20' }],
  get_current_time: [],
  get_class_list: [],
  view_file: [],
  create_student: [],
  update_student: [],
  delete_student: [],
}

function getConfigData(tc: ToolConfig): Record<string, any> {
  try { return JSON.parse(tc.config_json || '{}') } catch { return {} }
}

function findRegionPath(value: string): string[] {
  if (!value) return []
  for (const province of chinaRegions) {
    if (province.value === value) return [value]
    if (province.children) {
      for (const city of province.children) {
        if (city.value === value) return [province.value, value]
      }
    }
  }
  return []
}

function onCityChange(tc: ToolConfig, v: string[] | null) {
  updateConfigData(tc, 'default_city', v?.[v.length - 1] || '')
  // Force reactivity by replacing the ref item
  const idx = toolConfigs.value.findIndex(t => t.tool_name === tc.tool_name)
  if (idx !== -1) toolConfigs.value[idx] = { ...toolConfigs.value[idx] }
}

function updateConfigData(tc: ToolConfig, key: string, value: any) {
  const data = getConfigData(tc)
  data[key] = value
  tc.config_json = JSON.stringify(data)
}

const toolLabels: Record<string, string> = {
  list_students: '📋 学生列表',
  get_student_points: '⭐ 学生积分',
  add_points: '➕ 加减分',
  get_score_rankings: '🏆 成绩排名',
  list_assignments: '📝 作业列表',
  get_submissions: '📤 提交情况',
  get_weather: '🌤️ 天气查询',
  web_search: '🔍 联网搜索',
  random_pick: '🎲 随机抽取',
  get_current_time: '🕐 当前时间',
  get_class_list: '🏫 班级列表',
  view_file: '📄 查看文件',
  create_student: '👤 创建学生',
  update_student: '✏️ 修改学生',
  delete_student: '🗑️ 删除学生',
  search_articles: '📰 公众号搜索',
}

async function saveToolConfig(tc: ToolConfig) {
  try {
    await api.put(`/chat/tools/${tc.tool_name}`, {
      config_json: tc.config_json,
      max_result_length: tc.max_result_length,
      enabled: tc.enabled,
    })
    message.success(`${toolLabels[tc.tool_name] || tc.tool_name} 已保存`)
  } catch (e: any) {
    message.error(e.message || '保存失败')
  }
}

// tab 4 removed — moved to SystemUpdate.vue
onMounted(() => {
  load()
  loadRateLimits()
})
</script>
<template>
  <div>
    <n-spin :show="!loaded">
      <n-tabs type="line" animated>
        <!-- Tab 1: API Config -->
        <n-tab-pane name="api" tab="API 配置">
          <div style="max-width: 700px; display: flex; flex-direction: column; gap: 16px; padding-top: 8px">
            <div>
              <div style="font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--text-secondary)">接口格式</div>
              <n-select
                v-model:value="provider"
                :options="[
                  { label: 'Anthropic（Claude）', value: 'anthropic' },
                  { label: 'OpenAI 兼容（DeepSeek / GPT / GLM）', value: 'openai' },
                ]"
              />
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px">
                提示：深度思考模式仅在 Anthropic 接口下可用，但会禁用工具调用。如需工具 + 思考模式请使用 OpenAI 兼容接口。
              </div>
            </div>
            <div>
              <div style="font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--text-secondary)">模型</div>
              <n-input v-model:value="model" placeholder="claude-sonnet-4-20250514 或 deepseek-chat" />
            </div>
            <div>
              <div style="font-size: 13px; font-weight: 500; margin-bottom: 6px; color: var(--text-secondary)">API 地址</div>
              <n-input v-model:value="apiUrl" placeholder="留空使用默认 https://api.anthropic.com" />
            </div>
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
            <n-alert v-if="testResult" :type="testResult.ok ? 'success' : 'error'" :closable="false">
              <template v-if="testResult.ok">
                连接成功 — 模型 {{ testResult.model }}，延迟 {{ testResult.latency }}ms，消耗 {{ testResult.tokens }} token
              </template>
              <template v-else>
                {{ testResult.error }}
              </template>
            </n-alert>
            <n-space>
              <n-button :loading="testing" :disabled="!apiKey.trim() && !hasKey" @click="test">
                {{ testing ? '测试中...' : '测试连接' }}
              </n-button>
              <n-button type="primary" :loading="saving" :disabled="!apiKey.trim() && !hasKey" @click="saveApiConfig">
                保存
              </n-button>
            </n-space>
          </div>
        </n-tab-pane>

        <!-- Tab 2: Feature Toggles -->
        <n-tab-pane name="features" tab="功能开关">
          <div style="max-width: 700px; display: flex; flex-direction: column; gap: 20px; padding-top: 8px">
            <n-card size="small" :bordered="true">
              <div style="display: flex; align-items: center; justify-content: space-between">
                <div>
                  <div style="font-weight: 600; font-size: 14px; color: var(--text-primary)">深度思考模式</div>
                  <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px">
                    启用后前台聊天输入框将显示"深度思考"按钮<br />
                    <span style="color: var(--warning-color)">注意：深度思考模式下 AI 无法使用工具查询数据（Anthropic API 限制）</span>
                  </div>
                </div>
                <n-switch v-model:value="settings.enable_deep_think" />
              </div>
            </n-card>

            <n-card size="small" :bordered="true">
              <div style="display: flex; align-items: center; justify-content: space-between">
                <div>
                  <div style="font-weight: 600; font-size: 14px; color: var(--text-primary)">文件上传</div>
                  <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px">
                    启用后前台聊天输入框显示"上传文件"按钮
                  </div>
                </div>
                <n-switch v-model:value="settings.enable_file_upload" />
              </div>
            </n-card>

            <template v-if="settings.enable_file_upload">
              <n-card size="small" title="文件上传设置" :bordered="true">
                <n-form label-placement="top" style="display: flex; flex-direction: column; gap: 14px">
                  <n-form-item label="允许的文件类型">
                    <n-checkbox-group v-model:value="selectedFileTypes">
                      <n-grid :cols="3" :x-gap="12" :y-gap="6">
                        <n-gi v-for="opt in fileTypeOptions" :key="opt.value">
                          <n-checkbox :value="opt.value">{{ opt.label }}</n-checkbox>
                        </n-gi>
                      </n-grid>
                    </n-checkbox-group>
                  </n-form-item>
                  <n-form-item label="单个文件最大大小">
                    <n-input-number v-model:value="settings.max_file_size" :min="1048576" :max="52428800" :step="1048576" style="width: 200px">
                      <template #suffix>字节</template>
                    </n-input-number>
                    <span style="font-size: 12px; color: var(--text-muted); margin-left: 8px">
                      ≈ {{ (settings.max_file_size / 1048576).toFixed(1) }} MB
                    </span>
                  </n-form-item>
                  <n-form-item label="每对话最大文件数量">
                    <n-input-number v-model:value="settings.max_files_per_conversation" :min="1" :max="50" style="width: 120px" />
                  </n-form-item>
                </n-form>
              </n-card>
            </template>

            <n-space>
              <n-button type="primary" :loading="settingsSaving" @click="saveSettings">保存设置</n-button>
            </n-space>
          </div>
        </n-tab-pane>

        <!-- Tab 3: Tool Config -->
        <n-tab-pane name="tools" tab="工具管理">
          <div style="max-width: 700px; display: flex; flex-direction: column; gap: 12px; padding-top: 8px">
            <n-alert type="info" :bordered="false">
              配置每个 AI 工具的参数。工具权限在「职位管理」页面中为每个权限组独立配置。
            </n-alert>
            <n-card
              v-for="tc in toolConfigs"
              :key="tc.tool_name"
              size="small"
              :bordered="true"
              style="transition: opacity .2s"
              :style="{ opacity: tc.enabled ? 1 : 0.5 }"
            >
              <div style="display: flex; align-items: flex-start; gap: 16px">
                <div style="flex: 1; min-width: 0">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px">
                    <span style="font-weight: 600; font-size: 14px; color: var(--text-primary)">{{ toolLabels[tc.tool_name] || tc.tool_name }}</span>
                    <n-switch v-model:value="tc.enabled" size="small" />
                    <n-tag v-if="tc.enabled" size="tiny" type="success" :bordered="false">已启用</n-tag>
                    <n-tag v-else size="tiny" type="warning" :bordered="false">已禁用</n-tag>
                  </div>

                  <div v-if="toolFields[tc.tool_name]?.length" style="display: flex; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 8px">
                    <div v-for="field in toolFields[tc.tool_name]" :key="field.key" style="display: flex; align-items: center; gap: 6px">
                      <span style="font-size: 12px; color: var(--text-muted); white-space: nowrap">{{ field.label }}:</span>
                      <n-cascader
                        v-if="tc.tool_name === 'get_weather' && field.key === 'default_city'"
                        :value="getConfigData(tc)[field.key] || null"
                        @update:value="v => updateConfigData(tc, field.key, v || '')"
                        :options="chinaRegions"
                        size="small"
                        style="width: 140px"
                        placeholder="选择城市"
                        clearable
                      />
                      <n-input
                        v-else-if="field.type === 'text'"
                        :value="getConfigData(tc)[field.key] || ''"
                        @update:value="v => updateConfigData(tc, field.key, v)"
                        :placeholder="field.placeholder"
                        size="small"
                        style="width: 140px"
                      />
                      <n-input-number
                        v-if="field.type === 'number'"
                        :value="Number(getConfigData(tc)[field.key]) || 0"
                        @update:value="v => updateConfigData(tc, field.key, v)"
                        :placeholder="field.placeholder"
                        size="small"
                        style="width: 100px"
                        :min="1"
                      />
                    </div>
                  </div>

                  <div style="display: flex; align-items: center; gap: 8px">
                    <span style="font-size: 12px; color: var(--text-muted)">最大返回长度:</span>
                    <n-input-number v-model:value="tc.max_result_length" size="small" style="width: 100px" :min="100" :max="10000" :step="100" />
                    <span style="font-size: 11px; color: var(--text-muted)">字符</span>
                  </div>
                </div>
                <n-button size="tiny" type="primary" quaternary @click="saveToolConfig(tc)" style="flex-shrink: 0; margin-top: 4px">保存</n-button>
              </div>
            </n-card>
          </div>
        </n-tab-pane>

        <!-- Tab 5: 调用限制 -->
        <n-tab-pane name="limits" tab="调用限制">
          <div style="max-width: 700px; display: flex; flex-direction: column; gap: 16px; padding-top: 8px">
            <n-alert type="info" :bordered="false" style="font-size: 12px">
              配置 AI 对话的调用限制，包括对话轮数、上下文窗口、工具调用次数和防刷检测。
            </n-alert>

            <n-card size="small" :bordered="true">
              <template #header><span style="font-weight: 600">对话限制</span></template>
              <n-form label-placement="left" label-width="auto" size="small" style="margin-top: 4px">
                <n-grid :cols="2" :x-gap="24">
                  <n-gi>
                    <n-form-item label="最大对话轮数">
                      <n-input-number v-model:value="rateLimits.max_rounds" :min="5" :max="200" style="width: 100%" />
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="上下文窗口">
                      <n-input-number v-model:value="rateLimits.context_window" :min="4" :max="100" style="width: 100%" />
                    </n-form-item>
                  </n-gi>
                </n-grid>
                <n-text depth="3" style="font-size: 11px">最大对话轮数决定一次对话最多能来回多少次。上下文窗口决定发送给 AI 的最近几轮对话。</n-text>
              </n-form>
            </n-card>

            <n-card size="small" :bordered="true">
              <template #header><span style="font-weight: 600">工具调用限制</span></template>
              <n-form label-placement="left" label-width="auto" size="small" style="margin-top: 4px">
                <n-grid :cols="2" :x-gap="24">
                  <n-gi>
                    <n-form-item label="最大工具调用次数">
                      <n-input-number v-model:value="rateLimits.max_agent_loops" :min="1" :max="20" style="width: 100%" />
                    </n-form-item>
                  </n-gi>
                </n-grid>
                <n-text depth="3" style="font-size: 11px">单次 AI 响应中最多能调用多少次工具（查积分、抽人、搜天气等）。</n-text>
              </n-form>
            </n-card>

            <n-card size="small" :bordered="true">
              <template #header><span style="font-weight: 600">防刷检测</span></template>
              <n-form label-placement="left" label-width="auto" size="small" style="margin-top: 4px">
                <n-grid :cols="2" :x-gap="24">
                  <n-gi>
                    <n-form-item label="请求间隔">
                      <n-input-number v-model:value="rateLimits.rapid_gap_ms" :min="100" :max="30000" :step="100" style="width: 100%" />
                      <span style="margin-left: 8px; font-size: 12px; color: var(--text-muted)">毫秒</span>
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="惩罚延迟">
                      <n-input-number v-model:value="rateLimits.rapid_delay_ms" :min="100" :max="30000" :step="100" style="width: 100%" />
                      <span style="margin-left: 8px; font-size: 12px; color: var(--text-muted)">毫秒</span>
                    </n-form-item>
                  </n-gi>
                </n-grid>
                <n-text depth="3" style="font-size: 11px">请求间隔内多次发送消息会被延迟处理。惩罚延迟是检测到快速请求后等待的时间。</n-text>
              </n-form>
            </n-card>

            <n-button :loading="rateLimitsSaving" @click="saveRateLimits" secondary style="width: fit-content">
              保存设置
            </n-button>
          </div>
        </n-tab-pane>

      </n-tabs>
    </n-spin>
  </div>
</template>

<style scoped>
</style>
