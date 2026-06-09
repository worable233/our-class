<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { api } from '@/api/client'
import { NButton, NCard, NSelect, NInputNumber, NAlert, NTag } from 'naive-ui'
import { useMessage } from 'naive-ui'

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
  <div style="max-width:720px;display:flex;flex-direction:column;gap:16px;padding:8px 0">

    <!-- 版本信息 -->
    <n-card size="small" :bordered="true">
      <template #header><span style="font-weight:600">版本信息</span></template>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-muted)">当前版本</span>
          <span style="font-family:monospace">{{ versionInfo.sha || '--' }}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-muted)">提交信息</span>
          <span style="max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right">{{ versionInfo.message || '--' }}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--text-muted)">上次检查</span>
          <span>{{ lastCheckDisplay }}</span>
        </div>
      </div>
    </n-card>

    <!-- 检查更新 -->
    <n-card size="small" :bordered="true">
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

    <!-- 立即更新 -->
    <n-card v-if="updateInfo?.behind" size="small" :bordered="true">
      <div style="display:flex;flex-direction:column;gap:12px">
        <n-button type="primary" :loading="updateApplying" @click="applyUpdate" round style="width:fit-content">
          {{ updateApplying ? '更新中...' : '立即更新' }}
        </n-button>
        <n-alert v-if="updateResult" :type="updateResult.startsWith('DONE') ? 'success' : (updateResult.startsWith('FAILED') ? 'error' : 'info')" :closable="false" style="font-size:12px;white-space:pre-wrap">{{ updateResult }}</n-alert>
        <pre v-if="updateOutput" style="background:var(--surface-2);border-radius:6px;padding:8px 12px;font-size:11px;line-height:1.5;max-height:300px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;color:var(--text-secondary);margin:0">{{ updateOutput }}</pre>
      </div>
    </n-card>

    <!-- 历史版本 -->
    <n-card size="small" :bordered="true">
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
    <n-card size="small" :bordered="true">
      <template #header><span style="font-weight:600">自动检测设置</span></template>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="color:var(--text-muted);width:100px">检测间隔</span>
          <n-select v-model:value="updateSettings.auto_check_interval" :options="[
            { label: '关闭', value: 0 },
            { label: '每 30 分钟', value: 1800 },
            { label: '每 1 小时', value: 3600 },
            { label: '每 2 小时', value: 7200 },
            { label: '每 6 小时', value: 21600 },
            { label: '每 12 小时', value: 43200 },
            { label: '每天', value: 86400 },
          ]" size="small" style="width:140px" />
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="color:var(--text-muted);width:100px">Ping 超时</span>
          <n-input-number v-model:value="updateSettings.ping_timeout" size="small" style="width:100px" :min="1" :max="10" />
          <span style="font-size:12px;color:var(--text-muted)">秒</span>
        </div>
        <n-button size="tiny" @click="saveUpdateSettings" :loading="savingSettings" round style="width:fit-content">保存设置</n-button>
      </div>
    </n-card>

  </div>
</template>

<style scoped>
code { font-size:12px; }
</style>
