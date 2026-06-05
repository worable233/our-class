<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { BASE } from '@/api/client'
import { Filter, RefreshCw } from '@lucide/vue'
import { useMessage } from 'naive-ui'
import {
  NButton, NTag, NSpin, NEmpty, NSelect, NPagination,
} from 'naive-ui'

function getToken(): string {
  const stored = localStorage.getItem('ourclass_user')
  if (stored) return (JSON.parse(stored).token || '') as string
  return ''
}

interface AuditLog {
  id: number
  user_id: number
  user_name: string
  action: string
  entity_type: string
  entity_id: number | null
  details: string
  created_at: string
}

interface PageMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

interface PermissionDef {
  code: string
  label: string
  category: string
}

interface DescriptionSegment {
  text: string
  type: 'muted' | 'accent' | 'primary'
}

const message = useMessage()
const logs = ref<AuditLog[]>([])
const loading = ref(true)
const page = ref(1)
const pageSize = ref(50)
const meta = ref<PageMeta | null>(null)
const entityTypes = ref<string[]>([])
const filterType = ref('')
const permMap = ref<Record<string, string>>({})

const actionLabels: Record<string, string> = {
  create_role: '创建职位',
  update_role: '编辑职位',
  delete_role: '删除职位',
  update_api_config: '修改 API 配置',
}

const actionTypes: Record<string, 'info' | 'warning' | 'success' | 'error'> = {
  create_role: 'success',
  update_role: 'info',
  delete_role: 'error',
  update_api_config: 'warning',
}

const entityLabels: Record<string, string> = {
  role: '职位管理',
  config: '系统设置',
}

function formatTime(t: string) {
  return t.replace('T', ' ').slice(0, 19)
}

function parseDetails(d: string): Record<string, unknown> {
  try { return JSON.parse(d) } catch { return {} }
}

function fmtPerms(codes: unknown): string {
  if (!Array.isArray(codes)) return ''
  return codes
    .map(c => permMap.value[String(c)] || String(c))
    .join('、')
}

function describeLog(log: AuditLog): DescriptionSegment[] {
  const d = parseDetails(log.details)

  switch (log.action) {
    case 'create_role': {
      const name = String(d.name || '')
      const perms = fmtPerms(d.permissions)
      return [
        { text: '创建了职位「', type: 'muted' },
        { text: name, type: 'accent' },
        { text: '」', type: 'muted' },
        ...(perms ? [
          { text: '，拥有 ', type: 'muted' },
          { text: perms, type: 'accent' },
          { text: ' 等权限', type: 'muted' },
        ] : [{ text: '，暂无权限', type: 'muted' }]),
      ]
    }
    case 'update_role': {
      const name = String(d.name || '')
      const perms = fmtPerms(d.permissions)
      return [
        { text: '更新了职位「', type: 'muted' },
        { text: name, type: 'accent' },
        { text: '」的权限设置', type: 'muted' },
        ...(perms ? [
          { text: '：', type: 'muted' },
          { text: perms, type: 'accent' },
        ] : []),
      ]
    }
    case 'delete_role': {
      const name = String(d.name || '')
      return [
        { text: '删除了职位「', type: 'muted' },
        { text: name, type: 'accent' },
        { text: '」', type: 'muted' },
      ]
    }
    case 'update_api_config': {
      const provider = String(d.provider || '')
      const model = String(d.model || '')
      const providerLabel = provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI 兼容' : provider
      return [
        { text: '修改了 API 配置（', type: 'muted' },
        { text: providerLabel, type: 'accent' },
        ...(model ? [
          { text: '，模型 ', type: 'muted' },
          { text: model, type: 'accent' },
        ] : []),
        { text: '）', type: 'muted' },
      ]
    }
    default:
      return [
        { text: log.action, type: 'primary' },
        ...Object.entries(d).flatMap(([k, v]) => [
          { text: ` ${k}: `, type: 'muted' },
          { text: String(Array.isArray(v) ? v.join(', ') : v), type: 'accent' },
        ]),
      ]
  }
}

async function loadPermissions() {
  try {
    const res = await fetch(`${BASE}/roles/permissions`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const body = await res.json()
    if (body.success && Array.isArray(body.data)) {
      const map: Record<string, string> = {}
      for (const p of body.data as PermissionDef[]) {
        map[p.code] = p.label
      }
      permMap.value = map
    }
  } catch {}
}

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('pageSize', String(pageSize.value))
    if (filterType.value) params.set('entity_type', filterType.value)
    const res = await fetch(`${BASE}/audit?${params}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const body = await res.json()
    if (body.success) {
      logs.value = body.data || []
      meta.value = body.meta || null
    } else {
      throw new Error(body.error?.message || '加载失败')
    }
  } catch (e: any) {
    message.error(e.message || '加载日志失败')
  } finally {
    loading.value = false
  }
}

async function loadTypes() {
  try {
    const res = await fetch(`${BASE}/audit/types`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const body = await res.json()
    if (body.success) entityTypes.value = body.data || []
  } catch {}
}

function goPage(p: number) {
  page.value = p
  load()
}

function reset() {
  page.value = 1
  filterType.value = ''
  load()
}

onMounted(() => {
  loadPermissions()
  loadTypes()
  load()
})
</script>

<template>
  <div style="max-width: 1000px; margin: 0 auto">
    <!-- Header -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px">
      <div>
        <h2 style="margin: 0 0 6px; font-size: 24px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em">
          操作日志
        </h2>
        <p style="margin: 0; font-size: 14px; color: var(--text-muted)">
          记录所有后台设置变更操作，追踪每一步修改
        </p>
      </div>
      <NButton quaternary @click="reset" :disabled="loading">
        <template #icon><RefreshCw :size="15" /></template>
        刷新
      </NButton>
    </div>

    <!-- Filters -->
    <div
      style="
        display: flex; align-items: center; gap: 12px;
        margin-bottom: 20px; padding: 12px 16px;
        background: var(--surface-1); border: 1px solid var(--hairline);
        border-radius: 6px;
      "
    >
      <Filter :size="15" style="color: var(--text-muted); flex-shrink: 0" />
      <NSelect
        v-model:value="filterType"
        :options="[
          { label: '全部类型', value: '' },
          ...entityTypes.map(t => ({ label: entityLabels[t] || t, value: t })),
        ]"
        style="width: 160px"
        size="small"
        clearable
        @update:value="load()"
      />
      <span v-if="meta" style="font-size: 12px; color: var(--text-muted); margin-left: auto">
        共 {{ meta.total }} 条记录
      </span>
    </div>

    <!-- Log list -->
    <NSpin :show="loading">
      <template v-if="logs.length > 0">
        <div class="log-list">
          <div v-for="log in logs" :key="log.id" class="log-item">
            <div class="log-dot" :class="actionTypes[log.action] || 'default'" />
            <div class="log-body">
              <div class="log-head">
                <NTag
                  size="small"
                  round
                  :bordered="false"
                  :type="actionTypes[log.action] || 'default'"
                  style="flex-shrink: 0"
                >
                  {{ actionLabels[log.action] || log.action }}
                </NTag>
                <span class="log-user">{{ log.user_name }}</span>
                <span class="log-time">{{ formatTime(log.created_at) }}</span>
              </div>
              <div class="log-desc">
                <span
                  v-for="(seg, i) in describeLog(log)"
                  :key="i"
                  :class="seg.type"
                >{{ seg.text }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="meta && meta.totalPages > 1" style="display: flex; justify-content: center; margin-top: 24px">
          <NPagination
            :page="page"
            :page-size="pageSize"
            :item-count="meta.total"
            @update:page="goPage"
          />
        </div>
      </template>
      <NEmpty v-else description="暂无操作日志" />
    </NSpin>
  </div>
</template>

<style scoped>
.log-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.log-item {
  display: flex;
  gap: 14px;
  padding: 14px 18px;
  background: var(--surface-1);
  border: 1px solid var(--hairline);
  border-bottom: none;
  transition: background 0.15s;
}
.log-item:first-child {
  border-radius: 6px 6px 0 0;
}
.log-item:last-child {
  border-bottom: 1px solid var(--hairline);
  border-radius: 0 0 6px 6px;
}
.log-item:hover {
  background: var(--surface-2);
}

.log-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
  background: var(--text-muted);
}
.log-dot.info { background: #5E6AD2; }
.log-dot.success { background: #18a058; }
.log-dot.warning { background: #f0a020; }
.log-dot.error { background: #d03050; }

.log-body {
  flex: 1;
  min-width: 0;
}

.log-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.log-user {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.log-time {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
}

.log-desc {
  font-size: 13px;
  line-height: 1.6;
}
.log-desc .muted {
  color: var(--text-secondary);
}
.log-desc .accent {
  color: var(--accent);
  font-weight: 500;
}
.log-desc .primary {
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .log-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .log-time {
    margin-left: 0;
  }
}
</style>
