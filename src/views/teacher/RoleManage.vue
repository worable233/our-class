<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import { Shield, Plus, Pencil, Trash2 } from '@lucide/vue'
import { api } from '@/api/client'
import type { PermissionGroup, PermissionDef } from '@/types'
import { useDialog } from 'naive-ui'
import {
  NButton, NCard, NDataTable, NModal, NForm, NFormItem, NInput,
  NSpace, NTag, NSpin, NCheckbox, NCheckboxGroup, NDivider,
} from 'naive-ui'

const dialog = useDialog()
const groups = ref<PermissionGroup[]>([])
const allPermissions = ref<PermissionDef[]>([])
const loading = ref(true)
const saving = ref(false)
const showModal = ref(false)
const editing = ref<PermissionGroup | null>(null)
const form = ref({
  name: '',
  description: '',
  permissions: [] as string[],
})

// Group permissions by category for display
const permissionCategories = computed(() => {
  const map: Record<string, PermissionDef[]> = {}
  for (const p of allPermissions.value) {
    const category = p.category
    if (!map[category]) map[category] = []
    map[category].push(p)
  }
  return Object.entries(map)
})

const columns = [
  {
    title: '权限组名称',
    key: 'name',
    render: (row: PermissionGroup) =>
      h(NSpace, { align: 'center' }, [
        h(Shield, { size: 16 }),
        row.name,
      ]),
  },
  { title: '描述', key: 'description', ellipsis: { tooltip: true } },
  {
    title: '权限数量',
    key: 'permissions',
    render: (row: PermissionGroup) =>
      h(NTag, { type: 'info', size: 'small' }, { default: () => `${row.permissions.length} 项权限` }),
  },
  {
    title: '操作',
    key: 'actions',
    render: (row: PermissionGroup) =>
      h(NSpace, null, [
        h(NButton, { quaternary: true, size: 'small', onClick: () => openEdit(row) }, { default: () => '编辑' }),
        h(NButton, { quaternary: true, size: 'small', type: 'error', onClick: () => remove(row.id) }, { default: () => '删除' }),
      ]),
  },
]

async function load() {
  loading.value = true
  try {
    const [g, p] = await Promise.all([
      api.get<PermissionGroup[]>('/roles/groups'),
      api.get<PermissionDef[]>('/roles/permissions'),
    ])
    groups.value = g
    allPermissions.value = p
  } finally {
    loading.value = false
  }
}

function openNew() {
  editing.value = null
  form.value = { name: '', description: '', permissions: [] }
  showModal.value = true
}

function openEdit(g: PermissionGroup) {
  editing.value = g
  form.value = { name: g.name, description: g.description, permissions: [...g.permissions] }
  showModal.value = true
}

async function save() {
  if (!form.value.name) return
  saving.value = true
  try {
    if (editing.value) {
      await api.put(`/roles/groups/${editing.value.id}`, form.value)
    } else {
      await api.post('/roles/groups', form.value)
    }
    showModal.value = false
    await load()
  } finally {
    saving.value = false
  }
}

async function remove(id: number) {
  dialog.warning({
    title: '确认删除',
    content: '删除该权限组后，该组下的用户将失去所有权限。确定删除？',
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.delete(`/roles/groups/${id}`)
      await load()
    },
  })
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">权限管理</h2>
        <p class="page-subtitle">管理权限组和权限分配</p>
      </div>
      <n-button type="primary" @click="openNew">
        <Plus :size="16" /> 创建权限组
      </n-button>
    </div>

    <n-spin :show="loading">
      <n-dataTable
        :bordered="false"
        :single-line="false"
        :data="groups"
        :columns="columns"
        v-if="groups.length > 0"
      />
      <n-empty v-else description="暂无权限组" />
    </n-spin>

    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editing ? '编辑权限组' : '创建权限组'"
      style="width: 560px"
      :mask-closable="false"
    >
      <n-form :model="form" label-placement="top">
        <n-form-item label="名称" required>
          <n-input v-model:value="form.name" placeholder="例如：班长、纪律委员" />
        </n-form-item>
        <n-form-item label="描述">
          <n-input v-model:value="form.description" placeholder="权限组说明" />
        </n-form-item>

        <n-divider>权限设置</n-divider>

        <div v-for="[category, perms] in permissionCategories" :key="category" style="margin-bottom: 16px">
          <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px">
            {{ category }}
          </div>
          <n-checkbox-group v-model:value="form.permissions">
            <n-space vertical :size="6">
              <n-checkbox v-for="p in perms" :key="p.code" :value="p.code">
                {{ p.label }}
              </n-checkbox>
            </n-space>
          </n-checkbox-group>
        </div>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="save" :disabled="!form.name" :loading="saving">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>
