<script setup lang="ts">
import { ref, computed, onMounted, type Component } from 'vue'
import { api } from '@/api/client'
import {
  NButton, NInput, NAlert, NSpace, NSpin, NSelect, NTabs, NTabPane,
  NSwitch, NForm, NFormItem, NInputNumber, NCard, NTag, NDivider,
  NCheckbox, NCheckboxGroup, NGrid, NGi, NText, NCascader,
  NModal, NRadio, NPopconfirm, NSkeleton,
} from 'naive-ui'
import { useMessage } from 'naive-ui'
import {
  Bot, CheckCircle, Server, Plus, Play, Pencil, Trash2, Key, Sliders,
  Sparkles, FileText, Settings, Save, Wrench, Info, Gauge, MessageSquare,
  Shield, Users, Star, Trophy, BookOpen, Upload, CloudSun, Search, Shuffle,
  Clock, School, UserPlus, UserPen, UserX, Newspaper,
} from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
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
  is_builtin?: boolean
  created_at: string | null
}

const models = ref<ModelConfig[]>([])
const modelsLoading = ref(false)
const loaded = ref(false)

/** 是否有自定义模型 */
const hasCustomModel = computed(() => models.value.some(m => !m.is_builtin))

/** 内置模型的显示名称 */
const BUILTIN_DISPLAY = 'DeepSeek-V4-Flash（免费内置）'

// Modal state (用于自定义配置)
const showModal = ref(false)
const editingId = ref<number | null>(null)
const formProvider = ref('openai')
const formModel = ref('')
const formApiUrl = ref('')
const formApiKey = ref('')
const formSaving = ref(false)

// Test state per model
const testingId = ref<number | null>(null)

// 打开自定义配置弹窗，预填常用值
function openCustomConfig() {
  editingId.value = null
  formProvider.value = 'openai'
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

async function deleteModel(m: ModelConfig) {
  if (m.is_builtin) {
    message.info('内置模型无需删除，添加自定义模型后会自动覆盖')
    return
  }
  try {
    await api.delete(`/chat/config/${m.id}`)
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
  try {
    const res = await api.post<{ success: boolean; model: string; latency_ms: number; input_tokens: number }>('/chat/test', { id })
    message.success(`连接成功 · ${res.model} · ${res.latency_ms}ms`, { duration: 4000 })
  } catch (e: any) {
    message.error(e.message || '连接失败', { duration: 5000 })
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

function onCityChange(tc: ToolConfig, v: string[] | null) {
  updateConfigData(tc, 'default_city', v?.[v.length - 1] || '')
  const idx = toolConfigs.value.findIndex(t => t.tool_name === tc.tool_name)
  if (idx !== -1) toolConfigs.value[idx] = { ...toolConfigs.value[idx]! }
}

function updateConfigData(tc: ToolConfig, key: string, value: any) {
  const data = getConfigData(tc)
  data[key] = value
  tc.config_json = JSON.stringify(data)
}

const toolLabels: Record<string, string> = {
  list_students: '学生列表',
  get_student_points: '学生积分',
  add_points: '加减分',
  get_score_rankings: '成绩排名',
  list_assignments: '作业列表',
  get_submissions: '提交情况',
  get_weather: '天气查询',
  web_search: '联网搜索',
  random_pick: '随机抽取',
  get_current_time: '当前时间',
  get_class_list: '班级列表',
  view_file: '查看文件',
  create_student: '创建学生',
  update_student: '修改学生',
  delete_student: '删除学生',
  search_articles: '公众号搜索',
}

const toolIcons: Record<string, Component> = {
  list_students: Users,
  get_student_points: Star,
  add_points: Star,
  get_score_rankings: Trophy,
  list_assignments: BookOpen,
  get_submissions: Upload,
  get_weather: CloudSun,
  web_search: Search,
  random_pick: Shuffle,
  get_current_time: Clock,
  get_class_list: School,
  view_file: FileText,
  create_student: UserPlus,
  update_student: UserPen,
  delete_student: UserX,
  search_articles: Newspaper,
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
  <div style="padding-bottom: 24px">
    <PageHeader title="系统设置" subtitle="AI 对话模型、功能开关、工具参数与调用限制配置" />

    <n-spin :show="!loaded" style="min-height: 200px">
      <n-tabs type="line" animated>
        <!-- ══════════════ Tab 1: API 配置 ══════════════ -->
        <n-tab-pane name="api">
          <template #tab>
            <div style="display: flex; align-items: center; gap: 6px">
              <Bot :size="16" />
              API 配置
            </div>
          </template>

          <div style="display: flex; flex-direction: column; gap: 16px; padding-top: 8px; max-width: 720px">
            <n-alert type="success" :bordered="false" closable>
              <template #header>
                <div style="display: flex; align-items: center; gap: 6px">
                  <CheckCircle :size="16" />
                  <span>系统已内置免费 DeepSeek AI 模型，开箱即用！</span>
                </div>
              </template>
              无需任何配置即可使用 AI 聊天助手。如果你有自己的 API Key，可以点击「自定义配置」添加，然后通过 radio 按钮自由切换。
            </n-alert>

            <div style="display: flex; align-items: center; justify-content: space-between">
              <div>
                <div style="display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600">
                  <Server :size="18" />
                  <span>模型管理</span>
                </div>
                <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px">
                  点击 radio 可随时切换内置免费模型和你自定义的模型。
                </div>
              </div>
              <n-button type="primary" size="small" round @click="openCustomConfig">
                <template #icon><Plus :size="14" /></template>
                自定义配置
              </n-button>
            </div>

            <div v-if="modelsLoading" style="display: flex; flex-direction: column; gap: 10px">
              <n-card v-for="i in 2" :key="i" size="small"><n-skeleton :repeat="2" /></n-card>
            </div>

            <div v-else style="display: flex; flex-direction: column; gap: 10px">
              <n-card
                v-for="m in models"
                :key="m.id"
                size="small"
                :bordered="true"
                :style="{
                  borderColor: m.is_active ? 'var(--primary-color)' : undefined,
                  borderWidth: m.is_active ? '1.5px' : '1px',
                }"
              >
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
                  <n-radio
                    :checked="m.is_active"
                    :value="m.id"
                    @update:checked="() => activateModel(m.id)"
                    name="active-model"
                    :disabled="m.is_builtin && !hasCustomModel"
                  />
                  <n-tag
                    :type="m.provider === 'anthropic' ? 'warning' : 'info'"
                    size="small"
                    :bordered="false"
                    round
                  >
                    {{ m.provider === 'anthropic' ? 'Anthropic' : 'OpenAI' }}
                  </n-tag>
                  <div style="flex: 1; min-width: 200px">
                    <div style="font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 8px">
                      {{ m.model || '未命名模型' }}
                      <n-tag v-if="m.is_builtin" size="tiny" type="success" :bordered="false" round>
                        系统内置
                      </n-tag>
                      <n-tag v-else size="tiny" type="info" :bordered="false" round>
                        自定义
                      </n-tag>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px">
                      {{ m.api_url || (m.provider === 'anthropic' ? 'api.anthropic.com' : 'api.openai.com') }}
                      <span v-if="m.has_key" style="color: var(--success-color); margin-left: 8px">
                        <Key :size="12" style="vertical-align: middle; margin-right: 2px" />
                        Key 已配置
                      </span>
                    </div>
                  </div>
                  <div style="display: flex; gap: 6px">
                    <n-button size="tiny" round :loading="testingId === m.id" @click="testModel(m.id)">
                      <template #icon><Play :size="12" /></template>
                      {{ testingId === m.id ? '测试中' : '测试' }}
                    </n-button>
                    <n-button v-if="!m.is_builtin" size="tiny" round @click="openEditModal(m)">
                      <template #icon><Pencil :size="12" /></template>
                      编辑
                    </n-button>
                    <n-popconfirm v-if="!m.is_builtin" @positive-click="deleteModel(m)">
                      <template #trigger>
                        <n-button size="tiny" quaternary round type="error">
                          <template #icon><Trash2 :size="12" /></template>
                          删除
                        </n-button>
                      </template>
                      确定删除模型「{{ m.model || '未命名' }}」？
                    </n-popconfirm>
                  </div>
                </div>
              </n-card>
            </div>

            <n-alert v-if="activeModel" type="success" :bordered="false" :show-icon="false">
              <div style="display: flex; align-items: center; gap: 6px">
                <CheckCircle :size="16" />
                <span>
                  当前使用：<strong>{{ activeModel.is_builtin ? BUILTIN_DISPLAY : activeModel.model }}</strong>
                  （{{ activeModel.provider === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容' }}）
                </span>
              </div>
            </n-alert>
          </div>
        </n-tab-pane>

        <!-- ══════════════ Tab 2: 功能开关 ══════════════ -->
        <n-tab-pane name="features">
          <template #tab>
            <div style="display: flex; align-items: center; gap: 6px">
              <Sliders :size="16" />
              功能开关
            </div>
          </template>

          <div style="display: flex; flex-direction: column; gap: 16px; padding-top: 8px; max-width: 720px">
            <n-card size="small" :bordered="true">
              <div style="display: flex; align-items: center; justify-content: space-between">
                <div>
                  <div style="font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px">
                    <Sparkles :size="16" />
                    深度思考模式
                  </div>
                  <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px">
                    启用后前台聊天输入框将显示「深度思考」按钮
                    <div style="color: var(--warning-color); margin-top: 2px">
                      注意：深度思考模式下 AI 无法使用工具查询数据（Anthropic API 限制）
                    </div>
                  </div>
                </div>
                <n-switch v-model:value="settings.enable_deep_think" />
              </div>
            </n-card>

            <n-card size="small" :bordered="true">
              <div style="display: flex; align-items: center; justify-content: space-between">
                <div>
                  <div style="font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 6px">
                    <FileText :size="16" />
                    文件上传
                  </div>
                  <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px">
                    启用后前台聊天输入框显示「上传文件」按钮
                  </div>
                </div>
                <n-switch v-model:value="settings.enable_file_upload" />
              </div>
            </n-card>

            <n-card
              v-if="settings.enable_file_upload"
              size="small"
              :bordered="true"
            >
              <template #header>
                <div style="display: flex; align-items: center; gap: 6px; font-weight: 600">
                  <Settings :size="16" />
                  文件上传设置
                </div>
              </template>
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
                  <n-input-number
                    v-model:value="settings.max_file_size"
                    :min="1048576"
                    :max="52428800"
                    :step="1048576"
                    style="width: 200px"
                  >
                    <template #suffix>字节</template>
                  </n-input-number>
                  <n-text depth="3" style="font-size: 12px; margin-left: 8px">
                    ≈ {{ (settings.max_file_size / 1048576).toFixed(1) }} MB
                  </n-text>
                </n-form-item>
                <n-form-item label="每对话最大文件数量">
                  <n-input-number
                    v-model:value="settings.max_files_per_conversation"
                    :min="1"
                    :max="50"
                    style="width: 120px"
                  />
                </n-form-item>
              </n-form>
            </n-card>

            <div>
              <n-button type="primary" round :loading="settingsSaving" @click="saveSettings">
                <template #icon><Save :size="14" /></template>
                保存设置
              </n-button>
            </div>
          </div>
        </n-tab-pane>

        <!-- ══════════════ Tab 3: 工具管理 ══════════════ -->
        <n-tab-pane name="tools">
          <template #tab>
            <div style="display: flex; align-items: center; gap: 6px">
              <Wrench :size="16" />
              工具管理
            </div>
          </template>

          <div style="display: flex; flex-direction: column; gap: 16px; padding-top: 8px; max-width: 720px">
            <n-alert type="info" :bordered="false">
              <template #header>
                <div style="display: flex; align-items: center; gap: 6px">
                  <Info :size="16" />
                  配置每个 AI 工具的参数。工具权限在「职位管理」页面中为每个权限组独立配置。
                </div>
              </template>
            </n-alert>

            <n-card
              v-for="tc in toolConfigs"
              :key="tc.tool_name"
              size="small"
              :bordered="true"
              :style="{ opacity: tc.enabled ? 1 : 0.5, transition: 'opacity .2s' }"
            >
              <div style="display: flex; align-items: flex-start; gap: 16px">
                <div style="flex: 1; min-width: 0">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px">
                    <component :is="toolIcons[tc.tool_name]" :size="16" style="flex-shrink: 0" />
                    <span style="font-weight: 600; font-size: 14px">{{ toolLabels[tc.tool_name] || tc.tool_name }}</span>
                    <n-switch v-model:value="tc.enabled" size="small" />
                    <n-tag v-if="tc.enabled" size="tiny" type="success" :bordered="false" round>已启用</n-tag>
                    <n-tag v-else size="tiny" type="warning" :bordered="false" round>已禁用</n-tag>
                  </div>

                  <div
                    v-if="toolFields[tc.tool_name]?.length"
                    style="display: flex; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 8px"
                  >
                    <div
                      v-for="field in toolFields[tc.tool_name]"
                      :key="field.key"
                      style="display: flex; align-items: center; gap: 6px"
                    >
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

                  <div style="display: flex; align-items: center; gap: 6px">
                    <n-text depth="3" style="font-size: 12px">最大返回长度:</n-text>
                    <n-input-number
                      v-model:value="tc.max_result_length"
                      size="small"
                      style="width: 100px"
                      :min="100"
                      :max="10000"
                      :step="100"
                    />
                    <n-text depth="3" style="font-size: 12px">字符</n-text>
                  </div>
                </div>
                <n-button size="small" type="primary" round @click="saveToolConfig(tc)" style="flex-shrink: 0; margin-top: 2px">
                  <template #icon><Save :size="13" /></template>
                  保存
                </n-button>
              </div>
            </n-card>
          </div>
        </n-tab-pane>

        <!-- ══════════════ Tab 4: 调用限制 ══════════════ -->
        <n-tab-pane name="limits">
          <template #tab>
            <div style="display: flex; align-items: center; gap: 6px">
              <Gauge :size="16" />
              调用限制
            </div>
          </template>

          <div style="display: flex; flex-direction: column; gap: 16px; padding-top: 8px; max-width: 720px">
            <n-alert type="info" :bordered="false">
              <template #header>
                <div style="display: flex; align-items: center; gap: 6px">
                  <Info :size="16" />
                  配置 AI 对话的调用限制，包括对话轮数、上下文窗口、工具调用次数和防刷检测。
                </div>
              </template>
            </n-alert>

            <n-card size="small" :bordered="true">
              <template #header>
                <div style="display: flex; align-items: center; gap: 6px; font-weight: 600">
                  <MessageSquare :size="16" />
                  对话限制
                </div>
              </template>
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
                <n-text depth="3" style="font-size: 12px">
                  最大对话轮数决定一次对话最多能来回多少次。上下文窗口决定发送给 AI 的最近几轮对话。
                </n-text>
              </n-form>
            </n-card>

            <n-card size="small" :bordered="true">
              <template #header>
                <div style="display: flex; align-items: center; gap: 6px; font-weight: 600">
                  <Wrench :size="16" />
                  工具调用限制
                </div>
              </template>
              <n-form label-placement="left" label-width="auto" size="small">
                <n-grid :cols="2" :x-gap="24">
                  <n-gi>
                    <n-form-item label="最大工具调用次数">
                      <n-input-number v-model:value="rateLimits.max_agent_loops" :min="1" :max="20" style="width: 100%" />
                    </n-form-item>
                  </n-gi>
                </n-grid>
                <n-text depth="3" style="font-size: 12px">
                  单次 AI 响应中最多能调用多少次工具（查积分、抽人、搜天气等）。
                </n-text>
              </n-form>
            </n-card>

            <n-card size="small" :bordered="true">
              <template #header>
                <div style="display: flex; align-items: center; gap: 6px; font-weight: 600">
                  <Shield :size="16" />
                  防刷检测
                </div>
              </template>
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
                <n-text depth="3" style="font-size: 12px">
                  请求间隔内多次发送消息会被延迟处理。惩罚延迟是检测到快速请求后等待的时间。
                </n-text>
              </n-form>
            </n-card>

            <div>
              <n-button type="primary" round :loading="rateLimitsSaving" @click="saveRateLimits">
                <template #icon><Save :size="14" /></template>
                保存设置
              </n-button>
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </n-spin>

    <!-- ══════════════ 模型配置弹窗 ══════════════ -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editingId ? '编辑模型' : '自定义模型配置'"
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
          <n-input
            v-model:value="formModel"
            :placeholder="formProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'deepseek-chat'"
          />
        </n-form-item>
        <n-form-item label="API 地址">
          <n-input
            v-model:value="formApiUrl"
            :placeholder="formProvider === 'anthropic' ? '留空使用默认 https://api.anthropic.com' : '留空使用默认 https://api.openai.com'"
          />
        </n-form-item>
        <n-form-item>
          <template #label>
            API Key
            <n-text v-if="editingId" depth="3" style="font-size: 12px; font-weight: 400">（留空则保留原 Key）</n-text>
          </template>
          <n-input
            v-model:value="formApiKey"
            type="password"
            show-password-on="click"
            placeholder="sk-ant-..."
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showModal = false" quaternary round>取消</n-button>
          <n-button type="primary" :loading="formSaving" @click="saveModel" round>
            {{ editingId ? '保存' : '添加' }}
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>
