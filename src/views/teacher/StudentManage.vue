<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import { Plus } from '@lucide/vue'
import { api } from '@/api/client'
import type { Student, PermissionGroup } from '@/types'
import { useDialog } from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { NButton, NCard, NDataTable, NModal, NForm, NFormItem, NInput, NSelect, NSpace, NTag, NAvatar, NSpin, NEmpty } from 'naive-ui'

const dialog = useDialog()
const useRef = useRefresh(load)
const students = ref<Student[]>([])
const roleGroups = ref<{ id: number; name: string }[]>([])
const loading = ref(true)
const saving = ref(false)
const showModal = ref(false)
const editing = ref<Student | null>(null)
const form = ref({ display_name: '', class: '高三(2)班', username: '', password: '123456', group_id: null as number | null })

const columns = [
  {
    title: '姓名',
    key: 'display_name',
    render: (row: Student) =>
      h(NSpace, { align: 'center' }, [
        h(NAvatar, { size: 28 }, { default: () => row.display_name.charAt(0) }),
        row.display_name,
      ]),
  },
  { title: '用户名', key: 'username' },
  { title: '班级', key: 'class' },
  {
    title: '操作',
    key: 'actions',
    render: (row: Student) =>
      h(NSpace, null, [
        h(
          NButton,
          { quaternary: true, size: 'small', onClick: () => openEdit(row) },
          { default: () => '编辑' },
        ),
        h(
          NButton,
          { quaternary: true, size: 'small', type: 'error', onClick: () => remove(row.id) },
          { default: () => '删除' },
        ),
      ]),
  },
]

async function load() {
  students.value = await api.get<Student[]>('/students')
  loading.value = false
}

async function loadGroups() {
  const groups = await api.get<PermissionGroup[]>('/roles/groups')
  roleGroups.value = groups.map(g => ({ id: g.id, name: g.name }))
}

function openNew() {
  editing.value = null
  form.value = { display_name: '', class: '高三(2)班', username: '', password: '123456', group_id: null }
  showModal.value = true
}

function openEdit(s: Student) {
  editing.value = s
  form.value = { display_name: s.display_name, class: s.class, username: s.username, password: '', group_id: null }
  showModal.value = true
}

async function save() {
  saving.value = true
  try {
    if (editing.value) {
      await api.put(`/students/${editing.value.id}`, {
        display_name: form.value.display_name,
        class: form.value.class,
        username: form.value.username,
      })
    } else {
      await api.post('/students', {
        display_name: form.value.display_name,
        class: form.value.class,
        username: form.value.username,
        password: form.value.password,
        group_id: form.value.group_id,
      })
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
    content: '确定删除该学生及其所有相关记录（积分、成绩、作业提交、帖子等）？此操作不可撤销。',
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.delete(`/students/${id}`)
      await load()
    },
  })
}

onMounted(() => {
  load()
  loadGroups()
})
</script>

<template>
  <div>
    <div style="margin-bottom: 20px; text-align: right;">
      <n-button type="primary" @click="openNew">
        <Plus :size="16" /> 添加学生
      </n-button>
    </div>

    <n-spin :show="loading">
      <n-data-table
        :bordered="false"
        :single-line="false"
        :data="students"
        :columns="columns"
      />
    </n-spin>

    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editing ? '编辑学生' : '添加学生'"
      style="width: 420px"
      :mask-closable="false"
    >
      <n-form :model="form" label-placement="top">
        <n-form-item label="姓名" path="display_name">
          <n-input v-model:value="form.display_name" placeholder="学生姓名" />
        </n-form-item>
        <n-form-item label="登录用户名">
          <n-input v-model:value="form.username" :placeholder="editing ? '修改用户名' : '可选，默认使用姓名拼音'" />
        </n-form-item>
        <n-form-item v-if="!editing" label="登录密码">
          <n-input v-model:value="form.password" placeholder="默认 123456" />
        </n-form-item>
        <n-form-item label="权限组">
          <n-select
            v-model:value="form.group_id"
            :options="roleGroups.map(g => ({ label: g.name, value: g.id }))"
            placeholder="选择权限组"
            clearable
          />
        </n-form-item>
        <n-form-item label="班级" path="class">
          <n-input v-model:value="form.class" placeholder="班级" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="save" :disabled="!form.display_name" :loading="saving">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .page-header .n-button { width: 100%; }
  :deep(.n-modal) { width: 90vw !important; max-width: 420px; }
}
</style>
