<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import { api } from '@/api/client'
import type { Student } from '@/types'
import { NButton, NCard, NDataTable, NModal, NForm, NFormItem, NInput, NSelect, NSpace, NTag, NAvatar, NSpin, NEmpty } from 'naive-ui'

const students = ref<Student[]>([])
const loading = ref(true)
const showModal = ref(false)
const editing = ref<Student | null>(null)
const form = ref({ display_name: '', class: '高三(2)班', username: '' })

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

function openNew() {
  editing.value = null
  form.value = { display_name: '', class: '高三(2)班', username: '' }
  showModal.value = true
}

function openEdit(s: Student) {
  editing.value = s
  form.value = { display_name: s.display_name, class: s.class, username: s.username }
  showModal.value = true
}

async function save() {
  if (editing.value) {
    await api.put(`/students/${editing.value.id}`, {
      display_name: form.value.display_name,
      class: form.value.class,
    })
  } else {
    await api.post('/students', form.value)
  }
  showModal.value = false
  await load()
}

async function remove(id: number) {
  if (!confirm('确定删除该学生及其所有相关记录？')) return
  await api.delete(`/students/${id}`)
  await load()
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">学生管理</h2>
        <p class="page-subtitle">管理班级学生信息</p>
      </div>
      <n-button type="primary" @click="openNew">
        <font-awesome-icon :icon="['fas', 'plus']" /> 添加学生
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
        <n-form-item v-if="!editing" label="登录用户名">
          <n-input v-model:value="form.username" placeholder="可选" />
        </n-form-item>
        <n-form-item label="班级" path="class">
          <n-input v-model:value="form.class" placeholder="班级" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="save" :disabled="!form.display_name">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>
