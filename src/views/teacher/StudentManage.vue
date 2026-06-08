<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Pencil, Trash2, BookOpen, Hash, Key, Filter } from '@lucide/vue'
import { api } from '@/api/client'
import type { Student, PermissionGroup } from '@/types'
import { useDialog, useMessage } from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { NButton, NModal, NForm, NFormItem, NInput, NSelect, NSpace, NTag, NAvatar, NSpin, NEmpty, NList, NListItem, NThing, NScrollbar, NIcon } from 'naive-ui'

const dialog = useDialog()
const message = useMessage()
const useRef = useRefresh(load)
const students = ref<Student[]>([])
const classList = ref<string[]>([])
const filterClass = ref('')
const roleGroups = ref<{ id: number; name: string }[]>([])
const loading = ref(true)
const saving = ref(false)
const showModal = ref(false)
const editing = ref<Student | null>(null)
const form = ref({ student_no: '', display_name: '', nickname: '', class: '', password: '123456' })

const classOptions = computed(() => [
  { label: '全部班级', value: '' },
  ...classList.value.map(c => ({ label: c, value: c })),
])

const filteredStudents = computed(() =>
  filterClass.value
    ? students.value.filter(s => s.class === filterClass.value)
    : students.value,
)

async function load() {
  const [stu, cls] = await Promise.all([
    api.get<Student[]>('/students'),
    api.get<string[]>('/classes').catch(() => []),
  ])
  students.value = stu
  classList.value = cls
  // Set default class if form is empty and classes exist
  if (!form.value.class && cls.length > 0) form.value.class = cls[0]
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
    }
    if (editing.value) {
      await api.put(`/students/${editing.value.id}`, payload)
    } else {
      await api.post('/students', payload)
    }
    showModal.value = false
    await load()
    message.success(editing.value ? '学生信息已更新' : '学生已创建')
  } catch (e: any) {
    message.error(e.message || '保存失败')
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
      message.success('已删除')
    },
  })
}

onMounted(() => { load() })
</script>

<template>
  <div>
    <!-- Top bar: filter + add -->
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; gap: 12px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <Filter :size="16" style="color: var(--text-muted); flex-shrink: 0;" />
        <n-select
          v-model:value="filterClass"
          :options="classOptions"
          style="width: 160px"
          size="small"
          placeholder="全部班级"
          clearable
          @clear="filterClass = ''"
        />
        <span style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">
          共 {{ filteredStudents.length }} 人
        </span>
      </div>
      <n-button type="primary" @click="openNew" round size="small">
        <template #icon><Plus :size="16" /></template>
        添加学生
      </n-button>
    </div>

    <n-spin :show="loading" style="min-height: 200px">
      <n-list
        v-if="filteredStudents.length > 0"
        hoverable
        clickable
        :bordered="false"
        style="background: transparent"
      >
        <n-list-item
          v-for="s in filteredStudents"
          :key="s.id"
          style="background: var(--surface-1); border: 1px solid var(--hairline); border-radius: 8px; margin-bottom: 8px; padding: 14px 18px; transition: all .15s;"
          :style="{ borderColor: 'var(--hairline)' }"
          @mouseenter="$el?.style?.setProperty('border-color', 'var(--accent)')"
          @mouseleave="$el?.style?.setProperty('border-color', 'var(--hairline)')"
        >
          <template #prefix>
            <n-avatar
              :size="40"
              :style="{
                background: 'var(--accent-glow)',
                color: 'var(--accent-text)',
                fontWeight: 600,
                fontSize: '16px',
              }"
            >
              {{ s.display_name?.charAt(0) || '?' }}
            </n-avatar>
          </template>

          <template #header>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 600; font-size: 15px; color: var(--text-primary)">{{ s.display_name }}</span>
              <n-tag v-if="s.nickname" size="small" :bordered="false" style="font-size: 11px;">
                {{ s.nickname }}
              </n-tag>
              <n-tag v-if="s.class" size="small" type="info" :bordered="false" style="font-size: 11px;">
                {{ s.class }}
              </n-tag>
            </div>
          </template>

          <template #default>
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap; font-size: 13px; color: var(--text-muted);">
              <div v-if="s.student_no" style="display: flex; align-items: center; gap: 4px;">
                <Hash :size="13" />
                <span style="font-family: monospace;">{{ s.student_no }}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <Key :size="13" />
                <span style="font-family: monospace;">{{ s.password || '******' }}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <BookOpen :size="13" />
                <span>{{ s.role === 'student' ? '学生' : s.role }}</span>
              </div>
            </div>
          </template>

          <template #suffix>
            <div style="display: flex; gap: 4px; flex-shrink: 0;">
              <n-button quaternary size="small" @click.stop="openEdit(s)" round>
                <template #icon><Pencil :size="14" /></template>
                编辑
              </n-button>
              <n-button quaternary size="small" type="error" @click.stop="remove(s.id)" round>
                <template #icon><Trash2 :size="14" /></template>
                删除
              </n-button>
            </div>
          </template>
        </n-list-item>
      </n-list>

      <n-empty v-else description="暂无学生数据" />
    </n-spin>

    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editing ? '编辑学生' : '添加学生'"
      style="width: 420px"
      :mask-closable="false"
      header-style="padding: 20px 24px 0; font-size: 18px; font-weight: 600"
      content-style="padding: 16px 24px"
      footer-style="padding: 16px 24px"
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
          <n-select
            v-model:value="form.class"
            :options="classList.map(c => ({ label: c, value: c }))"
            :placeholder="classList.length > 0 ? '选择班级' : '暂无班级数据'"
            :disabled="classList.length === 0"
          />
        </n-form-item>
        <n-form-item label="密码" path="password">
          <n-input v-model:value="form.password" placeholder="留空则保持原密码（编辑时）或使用默认密码" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showModal = false" quaternary>取消</n-button>
          <n-button type="primary" @click="save" :disabled="!form.display_name" :loading="saving" round>保存</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  :deep(.n-modal) { width: 90vw !important; max-width: 420px; }
}
</style>
