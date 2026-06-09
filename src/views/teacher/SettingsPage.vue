<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, h } from 'vue'
import { api } from '@/api/client'
import {
  NButton, NInput, NAlert, NSpace, NSpin, NSelect, NTabs, NTabPane,
  NSwitch, NForm, NFormItem, NInputNumber, NCard, NTag, NDivider,
  NCheckbox, NCheckboxGroup, NGrid, NGi, NScrollbar, NText,
} from 'naive-ui'
import { useMessage } from 'naive-ui'
import type { ChatSettings, ToolConfig } from '@/types'

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

// ── Tab 3 ───────────────────────────────────────────────────

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

// ── Tab 4: System Update ──────────────────────────────────────────────

const updateInfo = ref<{ current: string; latest: string; behind: boolean; commits: { hash: string; message: string; author: string; date: string }[] } | null>(null)
const updateChecking = ref(false)
const updateApplying = ref(false)
const updateResult = ref('')
const reloadCountdown = ref(0)
const updateOutput = ref('')

// 新状态：版本信息、历史列表、设置
const versionInfo = ref({ sha: '', date: '', message: '', last_check_time: '' })
const historyList = ref<{ hash: string; message: string; author: string; date: string }[]>([])
const historyLoaded = ref(false)
const updateSettings = ref({ auto_check_interval: 3600, ping_timeout: 3 })
const savingSettings = ref(false)

const lastCheckDisplay = computed(() => {
  const t = versionInfo.value.last_check_time
  if (!t) return '从未检查'
  const d = new Date(t + 'Z')
  if (isNaN(d.getTime())) return t
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
})

function formatDate(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  if (diff < 604800) return Math.floor(diff / 86400) + ' 天前'
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

async function loadVersion() {
  try { versionInfo.value = await api.get('/system/update/version') } catch {}
}
async function loadHistory() {
  try { historyList.value = await api.get('/system/update/history') } catch {}
  finally { historyLoaded.value = true }
}
async function loadUpdateSettings() {
  try { updateSettings.value = await api.get('/system/update/settings') } catch {}
}
async function saveUpdateSettings() {
  savingSettings.value = true
  try {
    await api.put('/system/update/settings', updateSettings.value)
    message.success('设置已保存')
    startAutoCheck()
  } catch { message.error('保存失败') }
  finally { savingSettings.value = false }
}

async function checkUpdate() {
  updateChecking.value = true
  updateResult.value = ''
  updateInfo.value = null
  try {
    updateInfo.value = await api.post('/system/update/check', {})
  } catch (e: any) {
    updateResult.value = e.message || '检查失败'
  } finally {
    updateChecking.value = false
  }
}

// 自动检测定时器
let autoCheckTimer: ReturnType<typeof setInterval> | null = null
function startAutoCheck() {
  if (autoCheckTimer) clearInterval(autoCheckTimer)
  const interval = updateSettings.value.auto_check_interval
  if (!interval || interval <= 0) return
  autoCheckTimer = setInterval(() => {
    checkUpdate()
  }, interval * 1000)
}

async function applyUpdate() {
  if (!window.confirm('确定要拉取最新代码并安装依赖吗？\n\n更新完成后页面将自动刷新以加载最新代码。')) {
    return
  }
  updateApplying.value = true
  updateResult.value = '... 正在更新...'
  try {
    const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
    const resp = await fetch('/api/system/update/apply', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const reader = resp.body?.getReader()
    if (!reader) throw new Error('无法读取响应流')
    const decoder = new TextDecoder()
    let buf = ''
    let done = false
    while (true) {
      const { done: d, value } = await reader.read()
      if (d) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'step') {
            updateResult.value = '... ' + data.message
          } else if (data.type === 'success') {
            updateOutput.value += '[OK] ' + data.message + '\n'
          } else if (data.type === 'output') {
            updateOutput.value += data.text
          } else if (data.type === 'error') {
            updateResult.value = 'FAILED: ' + data.message
            done = true
          } else if (data.type === 'done') {
            updateResult.value = 'DONE: ' + data.message
            done = true
          }
        } catch {}
      }
    }
    if (done && !updateResult.value.includes('FAILED')) {
      reloadCountdown.value = 5
      if (reloadTimer) clearInterval(reloadTimer)
      reloadTimer = setInterval(() => {
        reloadCountdown.value--
        updateResult.value = '即将刷新... ' + reloadCountdown.value
        if (reloadCountdown.value <= 0) {
          if (reloadTimer) clearInterval(reloadTimer)
          window.location.reload()
        }
      }, 1000)
    }
  } catch (e: any) {
    const msg = e.message || 'update failed'
    updateResult.value = msg.includes('UPDATE_IN_PROGRESS') ? '已有更新任务正在进行中' : ('FAILED: ' + msg)
  } finally {
    updateApplying.value = false
  }
}

onMounted(() => {
  load()
  loadVersion()
  loadHistory()
  loadUpdateSettings()
})

onUnmounted(() => {
  if (autoCheckTimer) clearInterval(autoCheckTimer)
})

// 监听设置变化，重新启动定时器
watch(() => updateSettings.value.auto_check_interval, () => { startAutoCheck() })
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
                      <n-input
                        v-if="field.type === 'text'"
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

        <!-- Tab 4: 系统更新 -->
        <n-tab-pane name="update" tab="系统更新" style="padding-top:8px">
          <!-- 当前版本 + 上次检查 -->
          <n-card size="small" :bordered="true" style="max-width:700px">
            <template #header><span style="font-weight:600">版本信息</span></template>
            <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--text-muted)">当前版本</span>
                <span style="font-family:monospace">{{ versionInfo.sha || '--' }}</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--text-muted)">上次检查</span>
                <span>{{ lastCheckDisplay }}</span>
              </div>
            </div>
          </n-card>

          <!-- 检查更新 -->
          <n-card size="small" :bordered="true" style="max-width:700px">
            <template #header><span style="font-weight:600">检查更新</span></template>
            <div style="display:flex;flex-direction:column;gap:12px">
              <n-button :loading="updateChecking" @click="checkUpdate" round :disabled="updateApplying" style="width:fit-content">
                {{ updateChecking ? '检查中...' : '检查更新' }}
              </n-button>

              <div v-if="updateInfo !== null">
                <n-alert :type="updateInfo.behind ? 'warning' : 'success'" :closable="false" style="font-size:12px;margin-bottom:8px">
                  <template #header>{{ updateInfo.behind ? '有新版本可用' : '已是最新版本' }}</template>
                  <div style="display:flex;gap:12px;font-size:12px">
                    <span>当前 <code>{{ updateInfo.current }}</code></span>
                    <span v-if="updateInfo.behind">→ <code>{{ updateInfo.latest }}</code></span>
                  </div>
                </n-alert>

                <!-- 新版本提交列表 -->
                <div v-if="updateInfo.commits.length > 0" style="background:var(--surface-2);border-radius:6px;padding:8px 12px;font-size:12px;line-height:1.8">
                  <div style="font-weight:600;color:var(--text-secondary);margin-bottom:4px;font-size:11px">更新内容 ({{ updateInfo.commits.length }} 个提交)</div>
                  <div v-for="c in updateInfo.commits" :key="c.hash" style="display:flex;gap:6px;color:var(--text-secondary)">
                    <span style="color:var(--accent-text);font-family:monospace;flex-shrink:0">{{ c.hash }}</span>
                    <span>{{ c.message }}</span>
                  </div>
                </div>
              </div>
            </div>
          </n-card>

          <!-- 立即更新按钮 -->
          <n-card v-if="updateInfo?.behind" size="small" :bordered="true" style="max-width:700px">
            <div style="display:flex;flex-direction:column;gap:12px">
              <n-button type="primary" :loading="updateApplying" @click="applyUpdate" round style="width:fit-content">
                {{ updateApplying ? '更新中...' : '立即更新' }}
              </n-button>

              <n-alert v-if="updateResult" :type="updateResult.startsWith('DONE') ? 'success' : (updateResult.startsWith('FAILED') ? 'error' : 'info')" :closable="false" style="font-size:12px;white-space:pre-wrap">
                {{ updateResult }}
              </n-alert>
              <pre v-if="updateOutput" style="background:var(--surface-2);border-radius:6px;padding:8px 12px;font-size:11px;line-height:1.5;max-height:300px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;color:var(--text-secondary);margin:0">{{ updateOutput }}</pre>
            </div>
          </n-card>

          <!-- 历史版本 -->
          <n-card size="small" :bordered="true" style="max-width:700px">
            <template #header><span style="font-weight:600">历史版本</span></template>
            <div style="display:flex;flex-direction:column;gap:4px;max-height:320px;overflow-y:auto">
              <div v-for="c in historyList" :key="c.hash" style="display:flex;gap:8px;padding:6px 4px;border-bottom:1px solid var(--hairline);font-size:12px">
                <span style="color:var(--accent-text);font-family:monospace;flex-shrink:0">{{ c.hash }}</span>
                <span style="flex:1;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.message }}</span>
                <span style="color:var(--text-muted);flex-shrink:0;font-size:11px">{{ formatDate(c.date) }}</span>
              </div>
              <div v-if="!historyList.length && !historyLoaded" style="text-align:center;color:var(--text-muted);font-size:12px;padding:16px">加载中...</div>
              <div v-if="!historyList.length && historyLoaded" style="text-align:center;color:var(--text-muted);font-size:12px;padding:16px">暂无记录</div>
            </div>
          </n-card>

          <!-- 自动检测设置 -->
          <n-card size="small" :bordered="true" style="max-width:700px">
            <template #header><span style="font-weight:600">自动检测设置</span></template>
            <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
              <div style="display:flex;align-items:center;gap:12px">
                <span style="color:var(--text-muted);width:100px">自动检测间隔</span>
                <n-select
                  v-model:value="updateSettings.auto_check_interval"
                  :options="[
                    { label: '关闭', value: 0 },
                    { label: '每 30 分钟', value: 1800 },
                    { label: '每 1 小时', value: 3600 },
                    { label: '每 2 小时', value: 7200 },
                    { label: '每 6 小时', value: 21600 },
                    { label: '每 12 小时', value: 43200 },
                    { label: '每天', value: 86400 },
                  ]"
                  size="small" style="width:140px"
                />
              </div>
              <div style="display:flex;align-items:center;gap:12px">
                <span style="color:var(--text-muted);width:100px">Ping 超时</span>
                <n-input-number v-model:value="updateSettings.ping_timeout" size="small" style="width:100px" :min="1" :max="10" />
                <span style="font-size:12px;color:var(--text-muted)">秒</span>
              </div>
              <n-button size="tiny" @click="saveUpdateSettings" :loading="savingSettings" round style="width:fit-content">保存设置</n-button>
            </div>
          </n-card>
        </n-tab-pane>
      </n-tabs>
    </n-spin>
  </div>
</template>

<style scoped>
</style>
