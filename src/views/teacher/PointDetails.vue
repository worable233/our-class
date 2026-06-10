<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { BASE } from '@/api/client'
import { RefreshCw } from '@lucide/vue'
import { useMessage } from 'naive-ui'
import {
  NButton, NTag, NSpin, NEmpty, NPagination, NText, NSelect,
} from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { useAuthStore } from '@/stores/auth'

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

interface DescriptionSegment {
  text: string
  type: 'muted' | 'accent' | 'primary'
}

const auth = useAuthStore()
const message = useMessage()
const logs = ref<AuditLog[]>([])
const loading = ref(true)
const page = ref(1)
const pageSize = ref(50)
const meta = ref<PageMeta | null>(null)
const classList = ref<string[]>([])
const filterClass = ref('')

const hasViewAll = computed(() => auth.permissions.includes('classes.view_all'))

const actionLabels: Record<string, string> = {
  add_points: '加分',
  deduct_points: '扣分',
}

const actionTypes: Record<string, 'info' | 'warning' | 'success' | 'error'> = {
  add_points: 'success',
  deduct_points: 'error',
}

function formatTime(t: string) {
  return t.replace('T', ' ').slice(0, 19)
}

function parseDetails(d: string): Record<string, unknown> {
  try { return JSON.parse(d) } catch { return {} }
}

function describeLog(log: AuditLog): DescriptionSegment[] {
  const d = parseDetails(log.details)
  if (log.action === 'add_points' || log.action === 'deduct_points') {
    const studentName = String(d.student_name || '')
    const reason = String(d.reason || '')
    const amount = String(d.amount || '')
    const pts = log.action === 'add_points' ? `+${amount}` : `-${amount}`
    return [
      { text: `${studentName} `, type: 'accent' as const },
      { text: `${pts} `, type: 'primary' as const },
      { text: reason, type: 'muted' as const },
    ]
  }
  return [{ text: log.action, type: 'primary' as const }]
}

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('pageSize', String(pageSize.value))
    params.set('entity_type', 'point')
    if (filterClass.value) params.set('class', filterClass.value)
    const [body, cls] = await Promise.all([
      fetch(`${BASE}/audit?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }).then(r => r.json()),
      fetch(`${BASE}/classes`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      }).then(r => r.json()).catch(() => ({ success: false, data: [] })),
    ])
    if (cls.success) classList.value = cls.data.map((c: any) => c.name) || []
    if (body.success) {
      logs.value = body.data || []
      meta.value = body.meta || null
    } else {
      throw new Error(body.error?.message || '加载失败')
    }
  } catch (e: any) {
    message.error(e.message || '加载积分明细失败')
  } finally {
    loading.value = false
  }
}

function goPage(p: number) {
  page.value = p
  load()
}

function reset() {
  page.value = 1
  load()
}

useRefresh(load)
onMounted(load)
</script>

<template>
  <div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
      <div>
        <NText tag="h2" style="margin:0 0 4px;font-size:24px;font-weight:700;">积分明细</NText>
        <NText depth="3" style="display:block;margin:0;font-size:14px;">查看所有学生的加分与扣分记录</NText>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <NSelect
          v-if="hasViewAll"
          v-model:value="filterClass"
          :options="[{label:'全部班级',value:''},...classList.map(c=>({label:c,value:c}))]"
          style="width:160px"
          size="small"
          placeholder="全部班级"
          clearable
          @update:value="reset"
        />
        <NButton quaternary @click="reset" :disabled="loading" round>
          <template #icon><RefreshCw :size="15" /></template>
          刷新
        </NButton>
      </div>
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
      <NEmpty v-else description="暂无积分记录" />
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
.log-dot.success { background: #18a058; }
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
.log-desc .muted { color: var(--text-secondary); }
.log-desc .accent { color: var(--accent); font-weight: 500; }
.log-desc .primary { color: var(--text-primary); }

@media (max-width: 768px) {
  .log-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .log-time { margin-left: 0; }
}
</style>
