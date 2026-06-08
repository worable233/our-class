<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { BASE } from '@/api/client'
import { Filter, RefreshCw } from '@lucide/vue'
import { useMessage } from 'naive-ui'
import {
  NButton, NTag, NSpin, NEmpty, NSelect, NPagination,
} from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'

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
  update_chat_settings: '修改 AI 设置',
  update_tool_config: '修改工具配置',
  upload_file: '上传文件',
  delete_file: '删除文件',
  create_skill: '创建 Skill',
  update_skill: '编辑 Skill',
  delete_skill: '删除 Skill',
  reorder_skills: 'Skill 排序',
  add_points: '加分',
  deduct_points: '扣分',
}

const actionTypes: Record<string, 'info' | 'warning' | 'success' | 'error'> = {
  create_role: 'success',
  update_role: 'info',
  delete_role: 'error',
  update_api_config: 'warning',
  update_chat_settings: 'warning',
  update_tool_config: 'warning',
  upload_file: 'success',
  delete_file: 'error',
  create_skill: 'success',
  update_skill: 'info',
  delete_skill: 'error',
  reorder_skills: 'info',
  add_points: 'success',
  deduct_points: 'error',
}

const entityLabels: Record<string, string> = {
  role: '职位管理',
  config: '系统设置',
  skill: 'Skill 管理',
  file: '文件管理',
  point: '积分管理',
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
        { text: '创建了职位「', type: 'muted' as const },
        { text: name, type: 'accent' as const },
        { text: '」', type: 'muted' as const },
        ...(perms ? [
          { text: '，拥有 ', type: 'muted' as const },
          { text: perms, type: 'accent' as const },
          { text: ' 等权限', type: 'muted' as const },
        ] : [{ text: '，暂无权限', type: 'muted' as const }]),
      ]
    }
    case 'update_role': {
      const name = String(d.name || '')
      const perms = fmtPerms(d.permissions)
      return [
        { text: '更新了职位「', type: 'muted' as const },
        { text: name, type: 'accent' as const },
        { text: '」的权限设置', type: 'muted' as const },
        ...(perms ? [
          { text: '：', type: 'muted' as const },
          { text: perms, type: 'accent' as const },
        ] : []),
      ]
    }
    case 'delete_role': {
      const name = String(d.name || '')
      return [
        { text: '删除了职位「', type: 'muted' as const },
        { text: name, type: 'accent' as const },
        { text: '」', type: 'muted' as const },
      ]
    }
    case 'update_api_config': {
      const provider = String(d.provider || '')
      const model = String(d.model || '')
      const providerLabel = provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI 兼容' : provider
      return [
        { text: '修改了 API 配置（', type: 'muted' as const },
        { text: providerLabel, type: 'accent' as const },
        ...(model ? [
          { text: '，模型 ', type: 'muted' as const },
          { text: model, type: 'accent' as const },
        ] : []),
        { text: '）', type: 'muted' as const },
      ]
    }
    case 'update_chat_settings': {
      const changes: string[] = []
      if (d.enable_deep_think !== undefined) changes.push(`深度思考 ${d.enable_deep_think ? '开启' : '关闭'}`)
      if (d.enable_file_upload !== undefined) changes.push(`文件上传 ${d.enable_file_upload ? '开启' : '关闭'}`)
      if (d.allowed_file_types) changes.push(`文件类型: ${d.allowed_file_types}`)
      if (d.max_file_size) changes.push(`大小上限: ${(Number(d.max_file_size) / 1048576).toFixed(1)}MB`)
      if (d.max_files_per_conversation) changes.push(`每对话文件数: ${d.max_files_per_conversation}`)
      return [
        { text: '修改了 AI 设置（', type: 'muted' as const },
        { text: changes.join('，'), type: 'accent' as const },
        { text: '）', type: 'muted' as const },
      ]
    }
    case 'update_tool_config': {
      const toolName = String(d.tool || '')
      const cfg: string[] = []
      if (d.config_json) {
        try {
          const j = JSON.parse(String(d.config_json))
          Object.entries(j).forEach(([k, v]) => cfg.push(`${k}: ${v}`))
        } catch { cfg.push('配置已修改') }
      }
      if (d.max_result_length) cfg.push(`最大返回 ${d.max_result_length} 字符`)
      if (d.enabled !== undefined) cfg.push(d.enabled ? '已启用' : '已禁用')
      return [
        { text: '修改了工具「', type: 'muted' as const },
        { text: toolName, type: 'accent' as const },
        { text: '」的配置', type: 'muted' as const },
        ...(cfg.length ? [
          { text: '：', type: 'muted' as const },
          { text: cfg.join('，'), type: 'accent' as const },
        ] : []),
      ]
    }
    case 'upload_file': {
      return [
        { text: '上传了文件「', type: 'muted' as const },
        { text: String(d.name || ''), type: 'accent' as const },
        { text: `」（${d.size ? (Number(d.size) / 1024).toFixed(1) : '?'}KB）`, type: 'muted' as const },
      ]
    }
    case 'delete_file': {
      return [
        { text: '删除了文件「', type: 'muted' as const },
        { text: String(d.name || ''), type: 'accent' as const },
        { text: '」', type: 'muted' as const },
      ]
    }
    case 'create_skill': {
      return [
        { text: '创建了 Skill「', type: 'muted' as const },
        { text: String(d.name || ''), type: 'accent' as const },
        { text: '」', type: 'muted' as const },
      ]
    }
    case 'update_skill': {
      const skillName = String(d.name || '')
      const skillChanges: string[] = []
      if (d.content !== undefined) skillChanges.push('内容已更新')
      if (d.enabled !== undefined) skillChanges.push(d.enabled ? '已启用' : '已禁用')
      return [
        { text: '编辑了 Skill「', type: 'muted' as const },
        { text: skillName, type: 'accent' as const },
        ...(skillChanges.length ? [
          { text: '」（', type: 'muted' as const },
          { text: skillChanges.join('，'), type: 'accent' as const },
          { text: '）', type: 'muted' as const },
        ] : [
          { text: '」', type: 'muted' as const },
        ]),
      ]
    }
    case 'delete_skill': {
      return [
        { text: '删除了 Skill「', type: 'muted' as const },
        { text: String(d.name || ''), type: 'accent' as const },
        { text: '」', type: 'muted' as const },
      ]
    }
    case 'reorder_skills': {
      return [
        { text: `重新排列了 ${d.count || ''} 个 Skill 的顺序`, type: 'muted' as const },
      ]
    }
    default:
      return [
        { text: log.action, type: 'primary' as const },
        ...Object.entries(d).flatMap(([k, v]) => [
          { text: ` ${k}: `, type: 'muted' as const },
          { text: String(Array.isArray(v) ? v.join(', ') : v), type: 'accent' as const },
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

  useRefresh(load)
onMounted(() => {
  loadPermissions()
  loadTypes()
  load()
})
</script>

<template>
  <div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div>
        <NText tag="h2" style="margin:0 0 4px;font-size:24px;font-weight:700;">操作日志</NText>
        <NText depth="3" style="display:block;margin:0;font-size:14px;">查看所有用户的操作记录与系统变更</NText>
      </div>
      <NButton quaternary @click="reset" :disabled="loading" round>
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
