<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import {
  NButton, NInput, NAlert, NSpace, NSpin, NSelect, NTabs, NTabPane,
  NModal, NCard, NTag, NCheckbox, NCheckboxGroup, NDivider, NForm, NFormItem,
  NInputNumber,
} from 'naive-ui'
import { useMessage } from 'naive-ui'
import { HardDrive } from '@lucide/vue'

const message = useMessage()
const auth = useAuthStore()

interface PermissionDef { code: string; label: string; category: string }
interface PermissionGroup { id: number; name: string; description: string; parent_id: number | null; class: string; parent_name?: string; group_type: string; permissions: string[]; created_at: string }

// ── Shared state ─────────────────────────────────────────────────

const allPermissions = ref<PermissionDef[]>([])
const groups = ref<PermissionGroup[]>([])
const storageQuota = ref<Record<number, number>>({}) // group_id → storage_limit
const loading = ref(false)
const showModal = ref(false)
const editing = ref<number | null>(null)
const form = ref({ name: '', description: '', class: '', parent_id: null as number | null, group_type: 'custom' as string, permissions: [] as string[], storage_limit: 100 })
const saving = ref(false)
const activeTab = ref('identities')
const currentUserPerms = computed(() => auth.permissions || [])
const filterClass = ref('')
const allClassList = ref<string[]>([])

// ── Computed ─────────────────────────────────────────────────────

const identityGroups = computed(() => groups.value.filter(g => !g.parent_id))
const roleGroups = computed(() => groups.value.filter(g => g.parent_id))

const permissionCategories = computed(() => {
  const map: Record<string, PermissionDef[]> = {}
  for (const p of allPermissions.value) {
    const cat = p.category
    if (!map[cat]) map[cat] = []
    map[cat].push(p)
  }
  return Object.entries(map)
})

const parentOptions = computed(() => identityGroups.value.map(g => ({ label: g.name, value: g.id })))

const classOptions = computed(() => {
  if (currentUserPerms.value.includes('classes.view_all')) return [{ label: '全部班级', value: '' }]
  return (auth.user?.class || '').split(',').filter(Boolean).map(c => ({ label: c, value: c }))
})

// Selected parent's permissions (for disabled checkboxes)
const selectedParentPerms = computed(() => {
  const pid = form.value.parent_id
  if (!pid) return []
  const parent = groups.value.find(g => g.id === pid)
  return parent?.permissions || []
})

// Permissions available to check: current user's perms minus parent's perms
const availableExtraPerms = computed(() => {
  const parentPerms = new Set(selectedParentPerms.value)
  const userPerms = new Set(currentUserPerms.value)
  return allPermissions.value.filter(p => !parentPerms.has(p.code) && userPerms.has(p.code))
})

function tagType(count: number) {
  if (count >= 14) return 'info' as const
  if (count >= 8) return 'warning' as const
  return 'success' as const
}

function canManageRoleGroup(g: PermissionGroup): boolean {
  if (currentUserPerms.value.includes('roles.manage')) return true
  if (currentUserPerms.value.includes('classes.view_all')) return true
  const myClasses = (auth.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
  return myClasses.includes(g.class)
}

// ── Load ─────────────────────────────────────────────────────────

async function load() {
  loading.value = true
  try {
    const params = filterClass.value ? `?class=${encodeURIComponent(filterClass.value)}` : ''
    const [g, p, sq, cls] = await Promise.all([
      api.get<PermissionGroup[]>(`/roles/groups${params}`),
      api.get<PermissionDef[]>('/roles/permissions'),
      api.get<any[]>('/storage/groups').catch(() => []),
      api.get<any[]>('/classes').catch(() => ({ data: [], success: false })),
    ])
    groups.value = g || []
    allPermissions.value = p || []
    if (Array.isArray(cls)) allClassList.value = cls.map((c: any) => c.name)
    else if (cls && cls.data) allClassList.value = cls.data.map((c: any) => c.name)
    const map: Record<number, number> = {}
    for (const item of sq) map[item.id] = Math.round((item.storage_limit || 104857600) / 1048576)
    storageQuota.value = map
  } catch { message.error('加载数据失败') }
  finally { loading.value = false }
}

onMounted(load)

// ── Identity Group CRUD ─────────────────────────────────────────

function openIdentityNew() {
  editing.value = null
  form.value = { name: '', description: '', class: '', parent_id: null, group_type: 'custom', permissions: [], storage_limit: 100 }
  showModal.value = true
}

function openIdentityEdit(g: PermissionGroup) {
  editing.value = g.id
  form.value = { name: g.name, description: g.description, class: '', parent_id: null, group_type: g.group_type || 'custom', permissions: [...g.permissions], storage_limit: storageQuota.value[g.id] || 100 }
  showModal.value = true
}

async function saveIdentity() {
  saving.value = true
  try {
    const payload: any = { name: form.value.name, description: form.value.description, permissions: form.value.permissions, group_type: form.value.group_type }
    let groupId: number
    if (editing.value) {
      await api.put(`/roles/groups/${editing.value}`, payload)
      groupId = editing.value
    } else {
      const created = await api.post<any>('/roles/groups', payload)
      groupId = created.id
    }
    // 保存存储配额
    if (form.value.storage_limit && form.value.storage_limit > 0) {
      await api.put(`/storage/groups/${groupId}`, { storage_limit: form.value.storage_limit * 1048576 }).catch(() => {})
    }
    showModal.value = false
    load()
  } catch (e: any) { message.error(e.message || '操作失败') }
  finally { saving.value = false }
}

async function deleteIdentity(id: number) {
  if (!window.confirm('确定要删除此身份组吗？')) return
  try {
    await api.delete(`/roles/groups/${id}`)
    message.success('已删除')
    load()
  } catch (e: any) { message.error(e.message || '删除失败') }
}

// ── Role Group CRUD ─────────────────────────────────────────────

function openRoleNew() {
  editing.value = null
  form.value = { name: '', description: '', class: '', parent_id: null, group_type: 'custom', permissions: [], storage_limit: 100 }
  showModal.value = true
}

function openRoleEdit(g: PermissionGroup) {
  editing.value = g.id
  form.value = { name: g.name, description: g.description, class: g.class, parent_id: g.parent_id, group_type: g.group_type || 'custom', permissions: [...g.permissions], storage_limit: 100 }
  showModal.value = true
}

async function saveRole() {
  if (!form.value.parent_id) { message.error('请选择父身份组'); return }
  if (!form.value.class) { message.error('请选择班级'); return }
  saving.value = true
  try {
    if (editing.value) {
      await api.put(`/roles/role-groups/${editing.value}`, { name: form.value.name, permissions: form.value.permissions, class: form.value.class })
      message.success('职位已更新')
    } else {
      await api.post('/roles/role-groups', { name: form.value.name, parent_id: form.value.parent_id, class: form.value.class, permissions: form.value.permissions })
      message.success('职位已创建')
    }
    showModal.value = false
    load()
  } catch (e: any) { message.error(e.message || '操作失败') }
  finally { saving.value = false }
}

async function deleteRole(id: number) {
  if (!window.confirm('确定要删除此职位吗？')) return
  try {
    await api.delete(`/roles/role-groups/${id}`)
    message.success('已删除')
    load()
  } catch (e: any) { message.error(e.message || '删除失败') }
}
</script>

<template>
  <n-spin :show="loading">
    <n-tabs v-model:value="activeTab" type="line" animated style="margin-bottom: 12px">
      <n-tab-pane name="identities" tab="身份管理">
        <n-space vertical :size="12">
          <n-button v-if="currentUserPerms.includes('roles.manage')" @click="openIdentityNew" secondary>新建身份组</n-button>

          <n-card v-for="g in identityGroups" :key="g.id" size="small" :bordered="true">
            <div style="display: flex; align-items: flex-start; gap: 12px">
              <div style="flex: 1; min-width: 0">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px">
                  <span style="font-weight: 600; font-size: 14px; color: var(--text-primary)">{{ g.name }}</span>
                  <n-tag size="tiny" :type="tagType(g.permissions.length)" round :bordered="false" style="flex-shrink:0">
                    {{ g.permissions.length }} 项
                  </n-tag>
                  <n-tag v-if="g.group_type && g.group_type !== 'custom'" size="tiny" :bordered="false" :type="g.group_type === 'teacher' ? 'warning' : 'info'" round style="flex-shrink:0; font-size: 11px">
                    {{ g.group_type === 'teacher' ? '教师端' : '学生端' }}
                  </n-tag>
                  <n-tag v-else size="tiny" :bordered="false" round style="flex-shrink:0; font-size: 11px; opacity: 0.5">
                    自定义
                  </n-tag>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;">
                  <span style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:3px"><HardDrive :size="12" /> {{ storageQuota[g.id] || 100 }} MB</span>
                </div>
                <div v-if="g.description" style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px">{{ g.description }}</div>
                <div v-if="g.permissions.length > 0" style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px">
                  <n-tag v-for="code in g.permissions.slice(0, 8)" :key="code" size="tiny" :bordered="false" round style="font-size: 11px">{{ code }}</n-tag>
                  <n-tag v-if="g.permissions.length > 8" size="tiny" :bordered="false" round style="font-size: 11px">+{{ g.permissions.length - 8 }}</n-tag>
                </div>
              </div>
              <div v-if="currentUserPerms.includes('roles.manage')" style="display: flex; gap: 4px; flex-shrink: 0">
                <n-button size="tiny" quaternary @click="openIdentityEdit(g)">编辑</n-button>
                <n-button size="tiny" quaternary type="error" @click="deleteIdentity(g.id)">删除</n-button>
              </div>
            </div>
          </n-card>
        </n-space>
      </n-tab-pane>

      <n-tab-pane name="roles" tab="职位管理">
        <n-space vertical :size="12">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <n-button @click="openRoleNew" secondary>新建职位</n-button>
            <n-select
              v-if="currentUserPerms.includes('classes.view_all')"
              v-model:value="filterClass"
              :options="[{label:'全部班级',value:''},...allClassList.map(c=>({label:c,value:c}))]"
              style="width:160px"
              size="small"
              placeholder="全部班级"
              clearable
              @update:value="load"
            />
          </div>

          <n-card v-for="g in roleGroups" :key="g.id" size="small" :bordered="true">
            <div style="display: flex; align-items: flex-start; gap: 12px">
              <div style="flex: 1; min-width: 0">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap">
                  <span style="font-weight: 600; font-size: 14px; color: var(--text-primary)">{{ g.name }}</span>
                  <n-tag size="tiny" :bordered="false" round style="font-size: 11px">{{ g.class }}</n-tag>
                  <n-tag size="tiny" type="info" :bordered="false" round style="font-size: 11px">{{ g.parent_name || '未知' }}</n-tag>
                  <n-tag size="tiny" :type="tagType(g.permissions.length)" round :bordered="false" style="font-size: 11px">
                    +{{ g.permissions.length }} 额外
                  </n-tag>
                </div>
              </div>
              <div v-if="canManageRoleGroup(g)" style="display: flex; gap: 4px; flex-shrink: 0">
                <n-button size="tiny" quaternary @click="openRoleEdit(g)">编辑</n-button>
                <n-button size="tiny" quaternary type="error" @click="deleteRole(g.id)">删除</n-button>
              </div>
            </div>
          </n-card>
        </n-space>
      </n-tab-pane>
    </n-tabs>

    <!-- ── Shared Modal ── -->
    <n-modal v-model:show="showModal" :mask-closable="false" preset="card" style="max-width: 640px" :title="editing ? '编辑' : '新建'" :segmented="{ content: true }">
      <n-form label-placement="top" size="small">
        <n-form-item label="名称">
          <n-input v-model:value="form.name" placeholder="权限组名称" />
        </n-form-item>

        <n-form-item v-if="activeTab === 'identities'" label="描述">
          <n-input v-model:value="form.description" placeholder="可选描述" />
        </n-form-item>

        <n-form-item v-if="activeTab === 'identities' && currentUserPerms.includes('roles.manage')" label="类型">
          <n-select v-model:value="form.group_type" :options="[
            { label: '自定义（默认学生端）', value: 'custom' },
            { label: '教师端', value: 'teacher' },
            { label: '学生端', value: 'student' },
          ]" :disabled="!!editing" />
        </n-form-item>

        <n-form-item v-if="activeTab === 'identities' && currentUserPerms.includes('roles.manage')" label="存储上限 (MB)">
          <n-input-number v-model:value="form.storage_limit" :min="1" :max="1048576" style="width:100%;" placeholder="每人默认 100 MB" />
        </n-form-item>

        <template v-if="activeTab === 'roles'">
          <n-form-item label="继承自">
            <n-select v-model:value="form.parent_id" :options="parentOptions" :disabled="!!editing" placeholder="选择身份组" />
          </n-form-item>
          <n-form-item label="班级">
            <n-input v-if="currentUserPerms.includes('classes.view_all')" v-model:value="form.class" placeholder="输入班级名称" :disabled="!!editing" />
            <n-select v-else v-model:value="form.class" :options="classOptions" placeholder="选择班级" :disabled="!!editing" />
          </n-form-item>
        </template>

        <n-divider>权限设置</n-divider>

        <!-- Selected parent's permissions (disabled) -->
        <div v-if="activeTab === 'roles' && selectedParentPerms.length > 0" style="margin-bottom: 12px">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px">继承自父身份组（不可修改）</div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px">
            <n-tag v-for="code in selectedParentPerms" :key="code" size="tiny" :bordered="false" round style="opacity: 0.5; font-size: 11px; cursor: not-allowed">{{ code }}</n-tag>
          </div>
        </div>

        <!-- Identity: show all permissions -->
        <!-- Role: show only extra permissions the user can grant -->
        <div v-for="[category, perms] in permissionCategories" :key="category">
          <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary); margin: 8px 0 4px">{{ category }}</div>
          <n-checkbox-group v-model:value="form.permissions">
            <n-space :size="[12, 4]" wrap>
              <template v-for="p in perms" :key="p.code">
                <!-- Identity tab: show all permissions -->
                <n-checkbox v-if="activeTab === 'identities'" :value="p.code" :label="`${p.label} (${p.code})`" size="small" />
                <!-- Role tab: show only perms user has AND not in parent -->
                <n-checkbox
                  v-else-if="availableExtraPerms.includes(p) || form.permissions.includes(p.code)"
                  :value="p.code" :label="`${p.label} (${p.code})`" size="small"
                />
              </template>
            </n-space>
          </n-checkbox-group>
        </div>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="activeTab === 'identities' ? saveIdentity() : saveRole()">
            {{ editing ? '保存' : '创建' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </n-spin>
</template>

<style scoped>
</style>
