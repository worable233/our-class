<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Pencil, Trash2, Filter, School, Users, GraduationCap } from '@lucide/vue'
import { api } from '@/api/client'
import type { Student, PermissionGroup } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { useDialog, useMessage } from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { NButton, NModal, NForm, NFormItem, NInput, NSelect, NSpace, NTag, NAvatar, NSpin, NEmpty, NList, NListItem, NThing, NScrollbar, NIcon, NTabs, NTabPane, NCard, NButtonGroup, NPopconfirm } from 'naive-ui'

const dialog = useDialog()
const message = useMessage()
const auth = useAuthStore()
const useRef = useRefresh(load)

// ── 用户管理 ──
const students = ref<Student[]>([])
const classList = ref<string[]>([])
const filterClass = ref('')
const roleGroups = ref<{ id: number; name: string }[]>([])
const loading = ref(true)
const saving = ref(false)
const showModal = ref(false)
const editing = ref<Student | null>(null)
const form = ref({ student_no: '', display_name: '', nickname: '', class: '', password: '123456', group_id: null as number | null })

const classOptions = computed(() => [
  { label: '全部班级', value: '' },
  ...classList.value.map(c => ({ label: c, value: c })),
])

const filteredStudents = computed(() =>
  filterClass.value
    ? students.value.filter(s => s.class === filterClass.value)
    : students.value,
)

// ── 教师管理 ──
interface Teacher {
  id: number
  username: string
  display_name: string
  class: string
  avatar: string
  student_no: string | null
  nickname: string | null
}
const teachers = ref<Teacher[]>([])
const teachersLoading = ref(false)

const showTeacherModal = ref(false)
const editingTeacher = ref<Teacher | null>(null)
const teacherForm = ref({ display_name: '', username: '', class: [] as string[], nickname: '', password: '', group_id: null as number | null })
const classSelectOptions = computed(() => classList.value.map(c => ({ label: c, value: c })))
const teacherSaving = ref(false)

async function loadTeachers() {
  teachersLoading.value = true
  try {
    teachers.value = await api.get<Teacher[]>('/teachers')
  } catch (e: any) {
    message.error(e.message || '加载教师数据失败')
  } finally {
    teachersLoading.value = false
  }
}

function openEditTeacher(t: Teacher) {
  editingTeacher.value = t
  teacherForm.value = {
    display_name: t.display_name,
    username: t.username,
    class: (t.class || '').split(',').filter(Boolean),
    nickname: t.nickname || '',
    password: '',
    group_id: null,
  }
  showTeacherModal.value = true
}

async function saveTeacher() {
  if (!teacherForm.value.display_name) { message.error('请输入姓名'); return }
  teacherSaving.value = true
  try {
    const payload: any = { display_name: teacherForm.value.display_name }
    if (teacherForm.value.username) payload.username = teacherForm.value.username
    if (teacherForm.value.class.length > 0) payload.class = teacherForm.value.class.join(',')
    if (teacherForm.value.nickname) payload.nickname = teacherForm.value.nickname
    if (teacherForm.value.password) payload.password = teacherForm.value.password
    if (teacherForm.value.group_id) payload.group_id = teacherForm.value.group_id

    await api.put(`/teachers/${editingTeacher.value!.id}`, payload)
    showTeacherModal.value = false
    await loadTeachers()
    message.success('教师信息已更新')
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    teacherSaving.value = false
  }
}

// ── 班级管理 ──
interface ClassInfo {
  id: number
  name: string
  student_count: number
}
const classData = ref<ClassInfo[]>([])
const classLoading = ref(false)
const showClassModal = ref(false)
const editingClass = ref<ClassInfo | null>(null)
const classForm = ref({ name: '' })

async function load() {
  const stu = await api.get<Student[]>('/students')
  if (!auth.permissions.includes('classes.view_all')) {
    const myClasses = (auth.user?.class || '').split(',').filter(Boolean).map(c => c.trim())
    if (myClasses.length > 0) {
      students.value = stu.filter(s => s.class && myClasses.includes(s.class))
    } else {
      students.value = stu
    }
  } else {
    students.value = stu
  }
  loading.value = false
}

async function loadClasses() {
  classLoading.value = true
  try {
    const data = await api.get<ClassInfo[]>('/classes')
    classData.value = data
    classList.value = data.map(c => c.name)
    if (!form.value.class && data.length > 0) form.value.class = data[0]!.name
    // 加载权限组
    roleGroups.value = await api.get<{ id: number; name: string; permissions: string[] }[]>('/roles/groups').then(r => r.map(g => ({ id: g.id, name: g.name }))).catch(() => [])
  } catch (e: any) {
    message.error(e.message || '加载班级数据失败')
  } finally {
    classLoading.value = false
  }
}

function autoGenerateStudentNo(): string {
  return 'S' + Date.now()
}

function openNew() {
  editing.value = null
  form.value = { student_no: autoGenerateStudentNo(), display_name: '', nickname: '', class: '高三(2)班', password: '123456', group_id: null }
  showModal.value = true
}

function openEdit(s: Student) {
  editing.value = s
  form.value = { student_no: s.student_no || '', display_name: s.display_name, nickname: s.nickname || '', class: s.class, password: s.password || '', group_id: (s as any).group_id || null }
  showModal.value = true
}

async function save() {
  saving.value = true
  try {
    const student_no = form.value.student_no || autoGenerateStudentNo()
    const payload: any = {
      display_name: form.value.display_name,
      nickname: form.value.nickname || undefined,
      class: form.value.class,
      student_no,
      password: form.value.password || undefined,
    }
    if (form.value.group_id) payload.group_id = form.value.group_id
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

function openNewClass() {
  editingClass.value = null
  classForm.value = { name: '' }
  showClassModal.value = true
}

function openEditClass(c: ClassInfo) {
  editingClass.value = c
  classForm.value = { name: c.name }
  showClassModal.value = true
}

async function saveClass() {
  const name = classForm.value.name.trim()
  if (!name) {
    message.error('请输入班级名称')
    return
  }
  try {
    if (editingClass.value) {
      await api.put(`/classes/${editingClass.value.id}`, { name })
      message.success('班级已重命名')
    } else {
      await api.post('/classes', { name })
      message.success('班级已创建')
    }
    showClassModal.value = false
    await loadClasses()
    await load()
  } catch (e: any) {
    message.error(e.message || '保存失败')
  }
}

async function removeClass(id: number, name: string) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除班级「${name}」？该班级所有学生的班级信息将被清空。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.delete(`/classes/${id}`)
      await loadClasses()
      await load()
      message.success('班级已删除')
    },
  })
}

onMounted(() => { load(); loadClasses(); loadTeachers() })
</script>

<template>
  <div>
    <n-tabs type="line" animated>
      <!-- ════ 用户管理 ════ -->
      <n-tab-pane name="students">
        <template #tab>
          <div style="display:flex;align-items:center;gap:6px">
            <Users :size="16" />
            <span>学生管理</span>
          </div>
        </template>
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
            style="background: transparent"
          >
            <n-list-item v-for="s in filteredStudents" :key="s.id">
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
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-weight: 600; font-size: 15px; color: var(--text-primary);">{{ s.display_name }}</span>
                <span v-if="s.student_no" style="font-size: 12px; color: var(--text-muted); font-family: monospace;">#{{ s.student_no }}</span>
                <span v-if="s.class" style="font-size: 12px; color: var(--text-muted);">{{ s.class }}</span>
                <span v-if="s.nickname" style="font-size: 12px; color: var(--text-muted);">📛 {{ s.nickname }}</span>
              </div>
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
      </n-tab-pane>

      <!-- ════ 教师管理 ════ -->
      <n-tab-pane name="teachers">
        <template #tab>
          <div style="display:flex;align-items:center;gap:6px">
            <GraduationCap :size="16" />
            <span>教师管理</span>
          </div>
        </template>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
          <span style="font-size: 14px; color: var(--text-primary); font-weight: 600;">教师账号</span>
          <span style="font-size: 12px; color: var(--text-muted);">共 {{ teachers.length }} 人</span>
        </div>

        <n-spin :show="teachersLoading" style="min-height: 200px">
          <n-list
            v-if="teachers.length > 0"
            hoverable
            style="background: transparent"
          >
            <n-list-item v-for="t in teachers" :key="t.id">
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
                  {{ t.display_name?.charAt(0) || '?' }}
                </n-avatar>
              </template>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-weight: 600; font-size: 15px; color: var(--text-primary);">{{ t.display_name }}</span>
                <span style="font-size: 12px; color: var(--text-muted); font-family: monospace;">@{{ t.username }}</span>
                <span v-if="t.class" style="font-size: 12px; color: var(--text-muted);">{{ t.class }}</span>
                <span v-if="t.nickname" style="font-size: 12px; color: var(--text-muted);">📛 {{ t.nickname }}</span>
                <n-tag size="small" type="primary" round :bordered="false">教师</n-tag>
              </div>
              <template #suffix>
                <n-button quaternary size="small" @click.stop="openEditTeacher(t)" round>
                  <template #icon><Pencil :size="14" /></template>
                  编辑
                </n-button>
              </template>
            </n-list-item>
          </n-list>
          <n-empty v-else description="暂无教师数据" />
        </n-spin>
      </n-tab-pane>

      <!-- ════ 班级管理 ════ -->
      <n-tab-pane name="classes">
        <template #tab>
          <div style="display:flex;align-items:center;gap:6px">
            <School :size="16" />
            <span>班级管理</span>
          </div>
        </template>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <School :size="16" style="color: var(--text-muted);" />
            <span style="font-size: 14px; color: var(--text-primary); font-weight: 600;">班级列表</span>
            <span style="font-size: 12px; color: var(--text-muted);">共 {{ classData.length }} 个班级</span>
          </div>
          <n-button type="primary" @click="openNewClass" round size="small">
            <template #icon><Plus :size="16" /></template>
            创建班级
          </n-button>
        </div>

        <n-spin :show="classLoading" style="min-height: 200px">
          <n-list
            v-if="classData.length > 0"
            hoverable
            clickable
            style="background: transparent"
          >
            <n-list-item v-for="c in classData" :key="c.id">
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
                  🏫
                </n-avatar>
              </template>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-weight: 600; font-size: 15px; color: var(--text-primary);">{{ c.name }}</span>
                <n-tag :bordered="false" size="small" type="info">
                  {{ c.student_count }} 人
                </n-tag>
              </div>
              <template #suffix>
                <div style="display: flex; gap: 4px; flex-shrink: 0;">
                  <n-button quaternary size="small" @click.stop="openEditClass(c)" round>
                    <template #icon><Pencil :size="14" /></template>
                    重命名
                  </n-button>
                  <n-button quaternary size="small" type="error" @click.stop="removeClass(c.id, c.name)" round>
                    <template #icon><Trash2 :size="14" /></template>
                    删除
                  </n-button>
                </div>
              </template>
            </n-list-item>
          </n-list>

          <n-empty v-else description="暂无班级数据，请创建班级" />
        </n-spin>
      </n-tab-pane>
    </n-tabs>

    <!-- ── 学生编辑/创建 Modal ── -->
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
        <n-form-item label="身份职位" path="group_id">
          <n-select
            v-model:value="form.group_id"
            :options="roleGroups.map(g => ({ label: g.name, value: g.id }))"
            placeholder="选择权限组"
            clearable
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

    <!-- ── 班级编辑/创建 Modal ── -->
    <n-modal
      v-model:show="showClassModal"
      preset="card"
      :title="editingClass ? '重命名班级' : '创建班级'"
      style="width: 400px"
      :mask-closable="false"
      header-style="padding: 20px 24px 0; font-size: 18px; font-weight: 600"
      content-style="padding: 16px 24px"
      footer-style="padding: 16px 24px"
    >
      <n-form :model="classForm" label-placement="top">
        <n-form-item label="班级名称" path="name">
          <n-input v-model:value="classForm.name" placeholder="例如：高三(1)班" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showClassModal = false" quaternary>取消</n-button>
          <n-button type="primary" @click="saveClass" :disabled="!classForm.name.trim()" round>
            {{ editingClass ? '保存' : '创建' }}
          </n-button>
        </div>
      </template>
    </n-modal>

    <!-- ── 教师编辑 Modal ── -->
    <n-modal
      v-model:show="showTeacherModal"
      preset="card"
      title="编辑教师"
      style="width: 420px"
      :mask-closable="false"
      header-style="padding: 20px 24px 0; font-size: 18px; font-weight: 600"
      content-style="padding: 16px 24px"
      footer-style="padding: 16px 24px"
    >
      <n-form :model="teacherForm" label-placement="top">
        <n-form-item label="姓名" path="display_name">
          <n-input v-model:value="teacherForm.display_name" placeholder="教师姓名" />
        </n-form-item>
        <n-form-item label="用户名" path="username">
          <n-input v-model:value="teacherForm.username" placeholder="登录用户名" />
        </n-form-item>
        <n-form-item label="昵称" path="nickname">
          <n-input v-model:value="teacherForm.nickname" placeholder="显示昵称（可选）" />
        </n-form-item>
        <n-form-item label="班级" path="class">
          <n-select
            v-model:value="teacherForm.class"
            :options="classSelectOptions"
            multiple
            placeholder="选择所属班级（可多选）"
            style="width:100%"
          />
        </n-form-item>
        <n-form-item label="身份职位" path="group_id">
          <n-select
            v-model:value="teacherForm.group_id"
            :options="roleGroups.map(g => ({ label: g.name, value: g.id }))"
            placeholder="选择权限组"
            clearable
          />
        </n-form-item>
        <n-form-item label="密码" path="password">
          <n-input v-model:value="teacherForm.password" placeholder="留空则保持原密码" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showTeacherModal = false" quaternary>取消</n-button>
          <n-button type="primary" @click="saveTeacher" :disabled="!teacherForm.display_name" :loading="teacherSaving" round>保存</n-button>
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
