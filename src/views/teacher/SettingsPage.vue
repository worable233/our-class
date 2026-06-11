<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { api } from '@/api/client'
import {
  NButton, NInput, NAlert, NSpace, NSpin, NSelect, NTabs, NTabPane,
  NSwitch, NForm, NFormItem, NInputNumber, NCard, NTag, NDivider,
  NCheckbox, NCheckboxGroup, NGrid, NGi, NScrollbar, NText, NCascader,
  NModal, NRadio, NPopconfirm, NEmpty, NSkeleton,
} from 'naive-ui'
import { useMessage } from 'naive-ui'
import type { ChatSettings, ToolConfig } from '@/types'
import { chinaRegions } from '@/data/china-regions'

const message = useMessage()

// ── Tab 1: API Config ────────────────────────────────────────

interface ModelConfig {
  id: number
  provider: string
  model: string
  api_url: string
  has_key: boolean
  api_key: string
  is_active: boolean
  created_at: string
}

const models = ref<ModelConfig[]>([])
const modelsLoading = ref(false)
const loaded = ref(false)

// Modal state
const showModal = ref(false)
const editingId = ref<number | null>(null)
const formProvider = ref('anthropic')
const formModel = ref('')
const formApiUrl = ref('')
const formApiKey = ref('')
const formSaving = ref(false)

// Test state per model
const testingId = ref<number | null>(null)
const testResults = ref<Record<number, { ok: boolean; model?: string; latency?: number; tokens?: number; error?: string }>>({})

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
  // 图片类型
  { label: '.jpg (JPEG 图片)', value: '.jpg' },
  { label: '.jpeg (JPEG 图片)', value: '.jpeg' },
  { label: '.png (PNG 图片)', value: '.png' },
  { label: '.gif (GIF 图片)', value: '.gif' },
  { label: '.webp (WebP 图片)', value: '.webp' },
  { label: '.bmp (BMP 图片)', value: '.bmp' },
  { label: '.svg (SVG 矢量图)', value: '.svg' },
  { label: '.ico (图标)', value: '.ico' },
  { label: '.tif / .tiff (TIFF)', value: '.tif' },
  { label: '.avif (AVIF 图片)', value: '.avif' },
  { label: '.heic / .heif (HEIC)', value: '.heic' },
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
    modelsLoading.value = true
    models.value = await api.get<ModelConfig[]>('/chat/config')
  } catch {} finally {
    modelsLoading.value = false
  }
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

// ── Tab 1: Model CRUD ──────────────────────────────────────

function openAddModal() {
  editingId.value = null
  formProvider.value = 'anthropic'
  formModel.value = ''
  formApiUrl.value = ''
  formApiKey.value = ''
  showModal.value = true
}

function openEditModal(m: ModelConfig) {
  editingId.value = m.id
  formProvider.value = m.provider
  formModel.value = m.model
  formApiUrl.value = m.api_url
  formApiKey.value = ''
  showModal.value = true
}

async function saveModel() {
  if (!formApiKey.value.trim() && !editingId.value) {
    message.warning('请输入 API Key')
    return
  }
  formSaving.value = true
  try {
    const body: any = {
      provider: formProvider.value,
      model: formModel.value.trim(),
      api_url: formApiUrl.value.trim(),
    }
    if (formApiKey.value.trim()) body.api_key = formApiKey.value.trim()

    if (editingId.value) {
      await api.put(`/chat/config/${editingId.value}`, body)
      message.success('模型已更新')
    } else {
      await api.post('/chat/config', body)
      message.success('模型已添加')
    }
    showModal.value = false
    await load()
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    formSaving.value = false
  }
}

async function deleteModel(id: number) {
  try {
    await api.delete(`/chat/config/${id}`)
    message.success('模型已删除')
    await load()
  } catch (e: any) {
    message.error(e.message || '删除失败')
  }
}

async function activateModel(id: number) {
  try {
    await api.post(`/chat/config/${id}/activate`)
    message.success('模型已激活')
    await load()
  } catch (e: any) {
    message.error(e.message || '激活失败')
  }
}

async function testModel(id: number) {
  testingId.value = id
  delete testResults.value[id]
  try {
    const res = await api.post<{ success: boolean; model: string; latency_ms: number; input_tokens: number }>('/chat/test', { id })
    testResults.value[id] = { ok: true, model: res.model, latency: res.latency_ms, tokens: res.input_tokens }
  } catch (e: any) {
    testResults.value[id] = { ok: false, error: e.message || '连接失败' }
  } finally {
    testingId.value = null
  }
}

const activeModel = computed(() => models.value.find(m => m.is_active))

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
          <div class="tab-content">
            <div class="tab-header">
              <div>
                <div class="tab-title">模型管理</div>
                <div class="tab-desc">添加多个模型，选择一个启用。深度思考仅在 Anthropic 接口下可用（会禁用工具调用）。</div>
              </div>
              <n-button type="primary" size="small" @click="openAddModal">添加模型</n-button>
            </div>

            <div v-if="modelsLoading" class="card-stack">
              <n-card v-for="i in 2" :key="i" size="small"><n-skeleton :repeat="2" /></n-card>
            </div>

            <n-empty v-else-if="models.length === 0" description="暂无配置的模型，点击上方「添加模型」开始" style="padding: 48px 0" />

            <div v-else class="card-stack">
              <n-card
                v-for="m in models"
                :key="m.id"
                size="small"
                :class="{ 'model-card--active': m.is_active }"
              >
                <div class="model-row">
                  <n-radio
                    :checked="m.is_active"
                    :value="m.id"
                    @update:checked="() => activateModel(m.id)"
                    name="active-model"
                  />
                  <n-tag :type="m.provider === 'anthropic' ? 'warning' : 'info'" size="small" :bordered="false">
                    {{ m.provider === 'anthropic' ? 'Anthropic' : 'OpenAI' }}
                  </n-tag>
                  <div class="model-info">
                    <div class="model-name">{{ m.model || '未命名模型' }}</div>
                    <div class="model-meta">
                      {{ m.api_url || (m.provider === 'anthropic' ? 'api.anthropic.com' : 'api.openai.com') }}
                      <span v-if="m.has_key" class="key-ok">Key 已配置</span>
                    </div>
                    <div v-if="testResults[m.id]" class="test-result">
                      <n-tag v-if="testResults[m.id]!.ok" type="success" size="tiny">
                        连接成功 · {{ testResults[m.id]!.latency }}ms · {{ testResults[m.id]!.model }}
                      </n-tag>
                      <n-tag v-else type="error" size="tiny">{{ testResults[m.id]!.error }}</n-tag>
                    </div>
                  </div>
                  <n-space size="small" :wrap="false">
                    <n-button size="tiny" :loading="testingId === m.id" @click="testModel(m.id)">
                      {{ testingId === m.id ? '测试中' : '测试' }}
                    </n-button>
                    <n-button size="tiny" @click="openEditModal(m)">编辑</n-button>
                    <n-popconfirm @positive-click="deleteModel(m.id)">
                      <template #trigger>
                        <n-button size="tiny" type="error" quaternary>删除</n-button>
                      </template>
                      确定删除模型「{{ m.model || '未命名' }}」？
                    </n-popconfirm>
                  </n-space>
                </div>
              </n-card>
            </div>

            <n-alert v-if="activeModel" type="success" :bordered="false" :show-icon="false" class="active-summary">
              当前使用：<strong>{{ activeModel.model }}</strong>（{{ activeModel.provider === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容' }}）
            </n-alert>
          </div>

          <n-modal
            v-model:show="showModal"
            preset="card"
            :title="editingId ? '编辑模型' : '添加模型'"
            style="max-width: 520px"
            :segmented="{ content: true, footer: true }"
          >
            <n-form label-placement="top">
              <n-form-item label="接口格式">
                <n-select
                  v-model:value="formProvider"
                  :options="[
                    { label: 'Anthropic（Claude）', value: 'anthropic' },
                    { label: 'OpenAI 兼容（DeepSeek / GPT / GLM）', value: 'openai' },
                  ]"
                />
              </n-form-item>
              <n-form-item label="模型名称">
                <n-input v-model:value="formModel" :placeholder="formProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'deepseek-chat'" />
              </n-form-item>
              <n-form-item label="API 地址">
                <n-input v-model:value="formApiUrl" :placeholder="formProvider === 'anthropic' ? '留空使用默认 https://api.anthropic.com' : '留空使用默认 https://api.openai.com'" />
              </n-form-item>
              <n-form-item>
                <template #label>
                  API Key
                  <n-text v-if="editingId" depth="3" style="font-size: 12px; font-weight: 400">（留空则保留原 Key）</n-text>
                </template>
                <n-input v-model:value="formApiKey" type="password" show-password-on="click" placeholder="sk-ant-..." />
              </n-form-item>
            </n-form>
            <template #footer>
              <n-space justify="end">
                <n-button @click="showModal = false">取消</n-button>
                <n-button type="primary" :loading="formSaving" @click="saveModel">
                  {{ editingId ? '保存' : '添加' }}
                </n-button>
              </n-space>
            </template>
          </n-modal>
        </n-tab-pane>

        <!-- Tab 2: Feature Toggles -->
        <n-tab-pane name="features" tab="功能开关">
          <div class="tab-content">
            <n-card size="small" :bordered="true">
              <div class="toggle-row">
                <div>
                  <div class="toggle-title">深度思考模式</div>
                  <div class="toggle-desc">
                    启用后前台聊天输入框将显示"深度思考"按钮<br />
                    <n-text type="warning">注意：深度思考模式下 AI 无法使用工具查询数据（Anthropic API 限制）</n-text>
                  </div>
                </div>
                <n-switch v-model:value="settings.enable_deep_think" />
              </div>
            </n-card>

            <n-card size="small" :bordered="true">
              <div class="toggle-row">
                <div>
                  <div class="toggle-title">文件上传</div>
                  <div class="toggle-desc">启用后前台聊天输入框显示"上传文件"按钮</div>
                </div>
                <n-switch v-model:value="settings.enable_file_upload" />
              </div>
            </n-card>

            <n-card v-if="settings.enable_file_upload" size="small" title="文件上传设置" :bordered="true">
              <n-form label-placement="top">
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
                  <n-text depth="3" style="font-size: 12px; margin-left: 8px">
                    ≈ {{ (settings.max_file_size / 1048576).toFixed(1) }} MB
                  </n-text>
                </n-form-item>
                <n-form-item label="每对话最大文件数量">
                  <n-input-number v-model:value="settings.max_files_per_conversation" :min="1" :max="50" style="width: 120px" />
                </n-form-item>
              </n-form>
            </n-card>

            <n-button type="primary" :loading="settingsSaving" @click="saveSettings">保存设置</n-button>
          </div>
        </n-tab-pane>

        <!-- Tab 3: Tool Config -->
        <n-tab-pane name="tools" tab="工具管理">
          <div class="tab-content">
            <n-alert type="info" :bordered="false">
              配置每个 AI 工具的参数。工具权限在「职位管理」页面中为每个权限组独立配置。
            </n-alert>
            <n-card
              v-for="tc in toolConfigs"
              :key="tc.tool_name"
              size="small"
              :bordered="true"
              :style="{ opacity: tc.enabled ? 1 : 0.5, transition: 'opacity .2s' }"
            >
              <div class="tool-row">
                <div class="tool-body">
                  <div class="tool-header">
                    <span class="tool-name">{{ toolLabels[tc.tool_name] || tc.tool_name }}</span>
                    <n-switch v-model:value="tc.enabled" size="small" />
                    <n-tag v-if="tc.enabled" size="tiny" type="success" :bordered="false">已启用</n-tag>
                    <n-tag v-else size="tiny" type="warning" :bordered="false">已禁用</n-tag>
                  </div>

                  <div v-if="toolFields[tc.tool_name]?.length" class="tool-fields">
                    <div v-for="field in toolFields[tc.tool_name]" :key="field.key" class="tool-field">
                      <n-text depth="3" style="font-size: 12px; white-space: nowrap">{{ field.label }}:</n-text>
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

                  <div class="tool-field">
                    <n-text depth="3" style="font-size: 12px">最大返回长度:</n-text>
                    <n-input-number v-model:value="tc.max_result_length" size="small" style="width: 100px" :min="100" :max="10000" :step="100" />
                    <n-text depth="3" style="font-size: 12px">字符</n-text>
                  </div>
                </div>
                <n-button size="small" type="primary" @click="saveToolConfig(tc)" class="tool-save">保存</n-button>
              </div>
            </n-card>
          </div>
        </n-tab-pane>

        <!-- Tab 4: Rate Limits -->
        <n-tab-pane name="limits" tab="调用限制">
          <div class="tab-content">
            <n-alert type="info" :bordered="false">
              配置 AI 对话的调用限制，包括对话轮数、上下文窗口、工具调用次数和防刷检测。
            </n-alert>

            <n-card size="small" :bordered="true">
              <template #header><span class="card-header">对话限制</span></template>
              <n-form label-placement="left" label-width="auto" size="small">
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
                <n-text depth="3" style="font-size: 12px">最大对话轮数决定一次对话最多能来回多少次。上下文窗口决定发送给 AI 的最近几轮对话。</n-text>
              </n-form>
            </n-card>

            <n-card size="small" :bordered="true">
              <template #header><span class="card-header">工具调用限制</span></template>
              <n-form label-placement="left" label-width="auto" size="small">
                <n-grid :cols="2" :x-gap="24">
                  <n-gi>
                    <n-form-item label="最大工具调用次数">
                      <n-input-number v-model:value="rateLimits.max_agent_loops" :min="1" :max="20" style="width: 100%" />
                    </n-form-item>
                  </n-gi>
                </n-grid>
                <n-text depth="3" style="font-size: 12px">单次 AI 响应中最多能调用多少次工具（查积分、抽人、搜天气等）。</n-text>
              </n-form>
            </n-card>

            <n-card size="small" :bordered="true">
              <template #header><span class="card-header">防刷检测</span></template>
              <n-form label-placement="left" label-width="auto" size="small">
                <n-grid :cols="2" :x-gap="24">
                  <n-gi>
                    <n-form-item label="请求间隔">
                      <n-input-number v-model:value="rateLimits.rapid_gap_ms" :min="100" :max="30000" :step="100" style="width: 100%" />
                      <n-text depth="3" style="font-size: 12px; margin-left: 8px">毫秒</n-text>
                    </n-form-item>
                  </n-gi>
                  <n-gi>
                    <n-form-item label="惩罚延迟">
                      <n-input-number v-model:value="rateLimits.rapid_delay_ms" :min="100" :max="30000" :step="100" style="width: 100%" />
                      <n-text depth="3" style="font-size: 12px; margin-left: 8px">毫秒</n-text>
                    </n-form-item>
                  </n-gi>
                </n-grid>
                <n-text depth="3" style="font-size: 12px">请求间隔内多次发送消息会被延迟处理。惩罚延迟是检测到快速请求后等待的时间。</n-text>
              </n-form>
            </n-card>

            <n-button type="primary" :loading="rateLimitsSaving" @click="saveRateLimits">保存设置</n-button>
          </div>
        </n-tab-pane>

      </n-tabs>
    </n-spin>
  </div>
</template>

<style scoped>
/* ── Tab layout ────────────────────────────────── */
.tab-content {
  max-width: 700px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 8px;
}

.tab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tab-title {
  font-size: 14px;
  font-weight: 600;
}

.tab-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.card-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Tab 1: Model list ────────────────────────── */
.model-card--active {
  border-color: var(--primary-color) !important;
  border-width: 1.5px !important;
}

.model-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.model-info {
  flex: 1;
  min-width: 200px;
}

.model-name {
  font-size: 14px;
  font-weight: 500;
}

.model-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.key-ok {
  color: var(--success-color);
  margin-left: 8px;
}

.test-result {
  margin-top: 4px;
}

.active-summary {
  margin-top: 4px;
}

.active-summary :deep(strong) {
  font-weight: 600;
}

/* ── Tab 2: Feature toggles ───────────────────── */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toggle-title {
  font-weight: 600;
  font-size: 14px;
}

.toggle-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* ── Tab 3: Tool config ───────────────────────── */
.tool-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.tool-body {
  flex: 1;
  min-width: 0;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.tool-name {
  font-weight: 600;
  font-size: 14px;
}

.tool-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 8px;
}

.tool-field {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-save {
  flex-shrink: 0;
  margin-top: 2px;
}

/* ── Tab 4: Rate limits ───────────────────────── */
.card-header {
  font-weight: 600;
}
</style>
