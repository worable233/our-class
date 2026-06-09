<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { api } from '@/api/client'
import {
  NButton, NCard, NSelect, NInputNumber, NAlert, NTag, NSpace, NDivider,
  NDescriptions, NDescriptionsItem, NTimeline, NTimelineItem, NEmpty, NSpin,
  NForm, NFormItem, NGi, NGrid, NStatistic,
} from 'naive-ui'
import { useMessage } from 'naive-ui'
import { RefreshCw, Download, Save, History, Settings } from '@lucide/vue'

const message = useMessage()

const updateInfo = ref<{ current: string; latest: string; behind: boolean; commits: { hash: string; message: string; author: string; date: string }[] } | null>(null)
const updateChecking = ref(false)
const updateApplying = ref(false)
const updateResult = ref('')
const reloadCountdown = ref(0)
const updateOutput = ref('')
const historyList = ref<{ hash: string; message: string; author: string; date: string }[]>([])
const historyLoaded = ref(false)
const updateSettings = ref({ auto_check_interval: 3600, ping_timeout: 3 })
const savingSettings = ref(false)

const versionInfo = ref({ sha: '', date: '', message: '', last_check_time: '' })
const versionLoading = ref(true)

const lastCheckDisplay = computed(() => {
  const t = versionInfo.value.last_check_time
  if (!t) return '从未检查'
  const d = new Date(t + 'Z')
  if (isNaN(d.getTime())) return t
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
})

const intervalOptions = [
  { label: '关闭', value: 0 },
  { label: '每 30 分钟', value: 1800 },
  { label: '每 1 小时', value: 3600 },
  { label: '每 2 小时', value: 7200 },
  { label: '每 6 小时', value: 21600 },
  { label: '每 12 小时', value: 43200 },
  { label: '每天', value: 86400 },
]

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

function formatDateTime(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function loadVersion() {
  versionLoading.value = true
  try { versionInfo.value = await api.get('/system/update/version') } catch {}
  finally { versionLoading.value = false }
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

let autoCheckTimer: ReturnType<typeof setInterval> | null = null
function startAutoCheck() {
  if (autoCheckTimer) clearInterval(autoCheckTimer)
  const interval = updateSettings.value.auto_check_interval
  if (!interval || interval <= 0) return
  autoCheckTimer = setInterval(() => { checkUpdate() }, interval * 1000)
}

let reloadTimer: ReturnType<typeof setInterval> | null = null

async function applyUpdate() {
  if (!window.confirm('确定要拉取最新代码并安装依赖吗？\n\n更新完成后页面将自动刷新以加载最新代码。')) return
  updateApplying.value = true
  updateResult.value = '... 正在更新...'
  updateOutput.value = ''
  const token = JSON.parse(localStorage.getItem('ourclass_user') || '{}').token || ''
  try {
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
          if (data.type === 'step') updateResult.value = '... ' + data.message
          else if (data.type === 'success') updateOutput.value += '[OK] ' + data.message + '\n'
          else if (data.type === 'output') updateOutput.value += data.text
          else if (data.type === 'error') { updateResult.value = 'FAILED: ' + data.message; done = true }
          else if (data.type === 'done') { updateResult.value = 'DONE: ' + data.message; done = true }
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
    updateResult.value = 'FAILED: ' + (e.message || '更新失败')
  } finally {
    updateApplying.value = false
  }
}

onMounted(() => {
  loadVersion()
  loadHistory()
  loadUpdateSettings()
})
onUnmounted(() => {
  if (autoCheckTimer) clearInterval(autoCheckTimer)
  if (reloadTimer) clearInterval(reloadTimer)
})
watch(() => updateSettings.value.auto_check_interval, () => { startAutoCheck() })
</script>

<template>
  <n-spin :show="versionLoading">
    <n-space vertical :size="16" style="max-width: 800px; padding: 8px 0">

      <!-- ── 版本信息 ── -->
      <n-card title="版本信息" size="small" segmented>
        <n-descriptions label-placement="left" :column="1" size="small" bordered>
          <n-descriptions-item label="当前版本">
            <code style="font-size: 13px">{{ versionInfo.sha || '--' }}</code>
          </n-descriptions-item>
          <n-descriptions-item label="提交信息">
            {{ versionInfo.message || '--' }}
          </n-descriptions-item>
          <n-descriptions-item label="提交时间">
            {{ versionInfo.date ? formatDateTime(versionInfo.date) : '--' }}
          </n-descriptions-item>
          <n-descriptions-item label="上次检查">
            {{ lastCheckDisplay }}
          </n-descriptions-item>
        </n-descriptions>
      </n-card>

      <!-- ── 检查更新 ── -->
      <n-card title="检查更新" size="small" segmented>
        <n-space vertical :size="12">
          <n-button :loading="updateChecking" @click="checkUpdate" :disabled="updateApplying" secondary>
            <template #icon><RefreshCw :size="14" /></template>
            {{ updateChecking ? '检查中...' : '检查更新' }}
          </n-button>

          <n-alert v-if="updateResult && !updateInfo" :type="updateResult.startsWith('FAILED') ? 'error' : 'info'" :closable="false" style="font-size: 12px">
            {{ updateResult }}
          </n-alert>

          <n-alert v-if="updateInfo" :type="updateInfo.behind ? 'warning' : 'success'" :closable="false" style="font-size: 12px">
            <template #header>
              <span style="font-weight: 600">
                {{ updateInfo.behind ? '有新版本可用' : '已是最新版本' }}
              </span>
            </template>
            <n-space :size="12" align="center">
              <n-tag size="small" :bordered="false">{{ updateInfo.current }}</n-tag>
              <span v-if="updateInfo.behind">→</span>
              <n-tag v-if="updateInfo.behind" size="small" type="warning" :bordered="false">{{ updateInfo.latest }}</n-tag>
            </n-space>
          </n-alert>

          <div v-if="updateInfo?.commits.length" style="background: var(--surface-2); border-radius: 8px; padding: 12px 16px">
            <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px">
              更新内容（共 {{ updateInfo.commits.length }} 个提交）
            </div>
            <n-timeline size="small">
              <n-timeline-item
                v-for="c in updateInfo.commits"
                :key="c.hash"
                :content="c.message"
                :time="formatDate(c.date)"
                type="info"
              >
                <template #icon>
                  <code style="font-size: 10px">{{ c.hash }}</code>
                </template>
              </n-timeline-item>
            </n-timeline>
          </div>
        </n-space>
      </n-card>

      <!-- ── 立即更新 ── -->
      <n-card v-if="updateInfo?.behind" size="small" segmented>
        <n-space vertical :size="12">
          <n-button type="primary" :loading="updateApplying" @click="applyUpdate">
            <template #icon><Download :size="14" /></template>
            {{ updateApplying ? '更新中...' : '立即更新' }}
          </n-button>

          <n-alert v-if="updateResult" :type="updateResult.startsWith('DONE') ? 'success' : 'error'" :closable="false" style="font-size: 12px; white-space: pre-wrap">
            {{ updateResult }}
          </n-alert>

          <pre v-if="updateOutput" style="background: var(--surface-2); border-radius: 6px; padding: 8px 12px; font-size: 11px; line-height: 1.5; max-height: 240px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; color: var(--text-secondary); margin: 0">{{ updateOutput }}</pre>
        </n-space>
      </n-card>

      <!-- ── 历史版本 ── -->
      <n-card title="历史版本" size="small" segmented>
        <template #header-extra>
          <History :size="14" />
        </template>
        <div v-if="!historyList.length && !historyLoaded" style="padding: 24px 0">
          <n-empty description="加载中..." />
        </div>
        <div v-else-if="!historyList.length" style="padding: 24px 0">
          <n-empty description="暂无记录" />
        </div>
        <n-timeline v-else size="small">
          <n-timeline-item
            v-for="c in historyList"
            :key="c.hash"
            :content="c.message"
            :time="formatDateTime(c.date)"
            :type="c.hash === versionInfo.sha ? 'success' : 'default'"
          >
            <template #icon>
              <code style="font-size: 10px">{{ c.hash }}</code>
            </template>
          </n-timeline-item>
        </n-timeline>
      </n-card>

      <!-- ── 自动检测设置 ── -->
      <n-card title="自动检测设置" size="small" segmented>
        <template #header-extra>
          <Settings :size="14" />
        </template>
        <n-form label-placement="left" label-width="100" size="small">
          <n-grid :cols="2" :x-gap="24">
            <n-gi>
              <n-form-item label="检测间隔">
                <n-select v-model:value="updateSettings.auto_check_interval" :options="intervalOptions" style="width: 100%" />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="Ping 超时">
                <n-input-number v-model:value="updateSettings.ping_timeout" :min="1" :max="10" style="width: 100px" />
                <span style="margin-left: 8px; font-size: 12px; color: var(--text-muted)">秒</span>
              </n-form-item>
            </n-gi>
          </n-grid>
          <n-space :size="12" style="margin-top: 4px">
            <n-button size="small" @click="saveUpdateSettings" :loading="savingSettings" secondary>
              <template #icon><Save :size="14" /></template>
              保存设置
            </n-button>
          </n-space>
        </n-form>
      </n-card>

    </n-space>
  </n-spin>
</template>

<style scoped>
code { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
</style>
