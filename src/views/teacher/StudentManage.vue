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
const form = ref({ student_no: '', display_name: '', nickname: '', class: '高三(2)班', password: '123456' })

const columns = [
  {
    title: '学号',
    key: 'student_no',
    width: 120,
    ellipsis: { tooltip: true },
    render: (row: Student) =>
      row.student_no
        ? h('span', { style: 'font-family: monospace;' }, row.student_no)
        : h('span', { style: 'color: #999;' }, '未设置'),
  },
  {
    title: '真实姓名',
    key: 'display_name',
    render: (row: Student) =>
      h(NSpace, { align: 'center' }, [
        h(NAvatar, { size: 28 }, { default: () => row.display_name.charAt(0) }),
        row.display_name,
      ]),
  },
  {
    title: '昵称',
    key: 'nickname',
    width: 120,
    ellipsis: { tooltip: true },
    render: (row: Student) =>
      row.nickname
        ? h('span', null, row.nickname)
        : h('span', { style: 'color: #999;' }, '未设置'),
  },
  { title: '班级', key: 'class', width: 120 },
  {
    title: '密码',
    key: 'password',
    width: 100,
    render: (row: Student) =>
      h(
        NTag,
        { size: 'small', style: 'font-family: monospace;' },
        { default: () => row.password || '-' },
      ),
  },
  {
    title: '操作',
    key: 'actions',
    width: 150,
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

function autoGenerateStudentNo(): string {
  return 'S' + Date.now()
}

function openNew() {
  editing.value = null
  form.value = { student_no: autoGenerateStudentNo(), display_name: '', nickname: '', class: '高三(2)班', password: '123456' }
  showModal.value = true
}

function openEdit(s: Student) {
  editing.value = s
  form.value = { student_no: s.student_no || '', display_name: s.display_name, nickname: s.nickname || '', class: s.class, password: s.password || '' }
  showModal.value = true
}

async function save() {
  saving.value = true
  try {
    const student_no = form.value.student_no || autoGenerateStudentNo()
    const payload = {
      display_name: form.value.display_name,
      nickname: form.value.nickname || undefined,
      class: form.value.class,
      student_no,
      password: form.value.password || undefined,
      // username and group_id omitted — not in form but the backend will
      // fallback to auto-generated username (or preserve existing on edit)
    }
    if (editing.value) {
      await api.put(`/students/${editing.value.id}`, payload)
    } else {
      await api.post('/students', payload)
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
        <n-form-item label="学号" path="student_no">
          <n-input v-model:value="form.student_no" placeholder="留空自动生成，格式：S + 时间戳" />
        </n-form-item>
        <n-form-item label="真实姓名" path="display_name">
          <n-input v-model:value="form.display_name" placeholder="学生真实姓名" />
        </n-form-item>
        <n-form-item label="昵称" path="nickname">
          <n-input v-model:value="form.nickname" placeholder="显示昵称（可选）" />
        </n-form-item>
        <n-form-item label="班级" path="class">
          <n-input v-model:value="form.class" placeholder="班级" />
        </n-form-item>
        <n-form-item label="密码" path="password">
          <n-input v-model:value="form.password" placeholder="留空则保持原密码（编辑时）或使用默认密码" />
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
