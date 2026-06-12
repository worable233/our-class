<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Pencil, Trash2, Filter, School, Users, GraduationCap, Tag, Download, CheckSquare, Square, MinusSquare } from '@lucide/vue'
import { api } from '@/api/client'
import type { Student, PermissionGroup } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { useDialog, useMessage } from 'naive-ui'
import { useRefresh } from '@/composables/useRefresh'
import { NButton, NModal, NForm, NFormItem, NInput, NSelect, NSpace, NTag, NAvatar, NSpin, NEmpty, NList, NListItem, NThing, NScrollbar, NIcon, NTabs, NTabPane, NCard, NButtonGroup, NPopconfirm, NCheckbox } from 'naive-ui'
import * as XLSX from 'xlsx'

const dialog = useDialog()
const message = useMessage()
const auth = useAuthStore()
const useRef = useRefresh(load)

// ── 用户管理 ──
const students = ref<Student[]>([])
const classList = ref<string[]>([])
const filterClass = ref('')
const allGroups = ref<PermissionGroup[]>([])
const loading = ref(true)
const saving = ref(false)
const showModal = ref(false)
const editing = ref<Student | null>(null)
const form = ref({ student_no: '', display_name: '', nickname: '', class: '', password: '', group_id: null as number | null, role_id: null as number | null })

// 分离身份组 (parent_id IS NULL) 和职位组 (parent_id IS NOT NULL)
const identityGroups = computed(() => allGroups.value.filter(g => !g.parent_id))
const roleGroups = computed(() => allGroups.value.filter(g => g.parent_id))

// 根据所选身份过滤可用职位
const availableRoles = computed(() => {
  if (!form.value.group_id) return []
  return roleGroups.value.filter(g => g.parent_id === form.value.group_id)
})

// 根据 group_id / role_id 查找组名
function groupName(id: number | null | undefined): string {
  if (!id) return ''
  const g = allGroups.value.find(g => g.id === id)
  return g?.name || ''
}

const classOptions = computed(() => [
  { label: '全部班级', value: '' },
  ...classList.value.map(c => ({ label: c, value: c })),
])

const filteredStudents = computed(() =>
  filterClass.value
    ? students.value.filter(s => s.class === filterClass.value)
    : students.value,
)

// ── 多选状态 ──
const selectedStudentIds = ref<Set<number>>(new Set())
const selectedTeacherIds = ref<Set<number>>(new Set())
const selectedClassIds = ref<Set<number>>(new Set())

function toggleStudent(id: number) {
  const next = new Set(selectedStudentIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedStudentIds.value = next
}
function toggleTeacher(id: number) {
  const next = new Set(selectedTeacherIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedTeacherIds.value = next
}
function toggleClass(id: number) {
  const next = new Set(selectedClassIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedClassIds.value = next
}

function toggleAllStudents() {
  if (selectedStudentIds.value.size === filteredStudents.value.length) {
    selectedStudentIds.value.clear()
  } else {
    selectedStudentIds.value = new Set(filteredStudents.value.map(s => s.id))
  }
}
function toggleAllTeachers() {
  if (selectedTeacherIds.value.size === teachers.value.length) {
    selectedTeacherIds.value.clear()
  } else {
    selectedTeacherIds.value = new Set(teachers.value.map(t => t.id))
  }
}
function toggleAllClasses() {
  if (selectedClassIds.value.size === classData.value.length) {
    selectedClassIds.value.clear()
  } else {
    selectedClassIds.value = new Set(classData.value.map(c => c.id))
  }
}

const allStudentsSelected = computed(() => filteredStudents.value.length > 0 && selectedStudentIds.value.size === filteredStudents.value.length)
const someStudentsSelected = computed(() => selectedStudentIds.value.size > 0 && !allStudentsSelected.value)
const allTeachersSelected = computed(() => teachers.value.length > 0 && selectedTeacherIds.value.size === teachers.value.length)
const someTeachersSelected = computed(() => selectedTeacherIds.value.size > 0 && !allTeachersSelected.value)
const allClassesSelected = computed(() => classData.value.length > 0 && selectedClassIds.value.size === classData.value.length)
const someClassesSelected = computed(() => selectedClassIds.value.size > 0 && !allClassesSelected.value)

// ── 批量删除 ──
async function batchDeleteStudents() {
  const ids = Array.from(selectedStudentIds.value)
  if (ids.length === 0) return
  const names = filteredStudents.value.filter(s => ids.includes(s.id)).map(s => s.display_name)
  dialog.warning({
    title: '批量删除学生',
    content: `确定删除选中的 ${ids.length} 名学生（${names.slice(0, 3).join('、')}${names.length > 3 ? '...' : ''}）及其所有相关记录？此操作不可撤销。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      let success = 0
      const errors: string[] = []
      for (const id of ids) {
        const s = filteredStudents.value.find(x => x.id === id)
        try { await api.delete(`/students/${id}`); success++ } catch (e: any) { errors.push(s?.display_name || `#${id}`) }
      }
      selectedStudentIds.value = new Set()
      await load()
      if (errors.length === 0) message.success(`已删除 ${success} 名学生`)
      else message.warning(`成功 ${success}，失败 ${errors.length}（${errors.join('、')}）`)
    },
  })
}

async function batchDeleteTeachers() {
  const ids = Array.from(selectedTeacherIds.value)
  if (ids.length === 0) return
  const names = teachers.value.filter(t => ids.includes(t.id)).map(t => t.display_name)
  dialog.warning({
    title: '批量删除教师',
    content: `确定删除选中的 ${ids.length} 名教师（${names.slice(0, 3).join('、')}${names.length > 3 ? '...' : ''}）？此操作不可撤销。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      let success = 0
      const errors: string[] = []
      for (const id of ids) {
        const t = teachers.value.find(x => x.id === id)
        try { await api.delete(`/teachers/${id}`); success++ } catch (e: any) { errors.push(t?.display_name || `#${id}`) }
      }
      selectedTeacherIds.value = new Set()
      await loadTeachers()
      if (errors.length === 0) message.success(`已删除 ${success} 名教师`)
      else message.warning(`成功 ${success}，失败 ${errors.length}（${errors.join('、')}）`)
    },
  })
}

async function batchDeleteClasses() {
  const ids = Array.from(selectedClassIds.value)
  if (ids.length === 0) return
  const names = classData.value.filter(c => ids.includes(c.id)).map(c => c.name)
  dialog.warning({
    title: '批量删除班级',
    content: `确定删除选中的 ${ids.length} 个班级（${names.slice(0, 3).join('、')}${names.length > 3 ? '...' : ''}）？该班级所有学生的班级信息将被清空。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      let success = 0
      const errors: string[] = []
      for (const id of ids) {
        const c = classData.value.find(x => x.id === id)
        try { await api.delete(`/classes/${id}`); success++ } catch (e: any) { errors.push(c?.name || `#${id}`) }
      }
      selectedClassIds.value = new Set()
      await loadClasses()
      await load()
      if (errors.length === 0) message.success(`已删除 ${success} 个班级`)
      else message.warning(`成功 ${success}，失败 ${errors.length}（${errors.join('、')}）`)
    },
  })
}

// ── 导出 xlsx ──
function safeFilename(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 50)
}

function exportStudents() {
  const data = selectedStudentIds.value.size > 0
    ? filteredStudents.value.filter(s => selectedStudentIds.value.has(s.id))
    : filteredStudents.value
  if (data.length === 0) { message.warning('没有可导出的数据'); return }

  const rows = [
    ['学号', '姓名', '昵称', '班级', '身份', '职位'],
    ...data.map(s => [
      s.student_no || '',
      s.display_name,
      s.nickname || '',
      s.class || '',
      groupName(s.group_id),
      groupName(s.role_id),
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  // 设置列宽
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '学生列表')
  XLSX.writeFile(wb, safeFilename(`学生列表_${new Date().toLocaleDateString('zh-CN')}.xlsx`))
  message.success(`已导出 ${data.length} 条记录`)
}

function exportTeachers() {
  const data = selectedTeacherIds.value.size > 0
    ? teachers.value.filter(t => selectedTeacherIds.value.has(t.id))
    : teachers.value
  if (data.length === 0) { message.warning('没有可导出的数据'); return }

  const rows = [
    ['用户名', '姓名', '昵称', '管理班级', '身份', '职位'],
    ...data.map(t => [
      t.username,
      t.display_name,
      t.nickname || '',
      t.class || '',
      groupName(t.group_id),
      groupName(t.role_id),
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '教师列表')
  XLSX.writeFile(wb, safeFilename(`教师列表_${new Date().toLocaleDateString('zh-CN')}.xlsx`))
  message.success(`已导出 ${data.length} 条记录`)
}

function exportClasses() {
  const data = selectedClassIds.value.size > 0
    ? classData.value.filter(c => selectedClassIds.value.has(c.id))
    : classData.value
  if (data.length === 0) { message.warning('没有可导出的数据'); return }

  const rows = [
    ['班级名称', '学生人数'],
    ...data.map(c => [c.name, String(c.student_count)]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 20 }, { wch: 12 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '班级列表')
  XLSX.writeFile(wb, safeFilename(`班级列表_${new Date().toLocaleDateString('zh-CN')}.xlsx`))
  message.success(`已导出 ${data.length} 条记录`)
}

// ── 教师管理 ──
interface Teacher {
  id: number
  username: string
  display_name: string
  class: string
  avatar: string
  student_no: string | null
  nickname: string | null
  group_id?: number | null
  role_id?: number | null
}
const teachers = ref<Teacher[]>([])
const teachersLoading = ref(false)

const showTeacherModal = ref(false)
const editingTeacher = ref<Teacher | null>(null)
const teacherForm = ref({ display_name: '', username: '', class: [] as string[], nickname: '', password: '', group_id: null as number | null, role_id: null as number | null })
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

function openNewTeacher() {
  editingTeacher.value = null
  teacherForm.value = {
    display_name: '',
    username: '',
    class: [],
    nickname: '',
    password: '',
    group_id: null,
    role_id: null,
  }
  showTeacherModal.value = true
}

function openEditTeacher(t: Teacher) {
  editingTeacher.value = t
  teacherForm.value = {
    display_name: t.display_name,
    username: t.username,
    class: (t.class || '').split(',').filter(Boolean),
    nickname: t.nickname || '',
    password: '',
    group_id: t.group_id ?? null,
    role_id: t.role_id ?? null,
  }
  showTeacherModal.value = true
}

async function saveTeacher() {
  if (!teacherForm.value.display_name) { message.error('请输入姓名'); return }
  if (!editingTeacher.value && !teacherForm.value.username) { message.error('请输入用户名'); return }
  teacherSaving.value = true
  try {
    const payload: any = { display_name: teacherForm.value.display_name }
    if (teacherForm.value.username) payload.username = teacherForm.value.username
    if (teacherForm.value.class.length > 0) payload.class = teacherForm.value.class.join(',')
    if (teacherForm.value.nickname) payload.nickname = teacherForm.value.nickname
    if (teacherForm.value.password) payload.password = teacherForm.value.password
    if (teacherForm.value.group_id) payload.group_id = teacherForm.value.group_id
    if (teacherForm.value.role_id) payload.role_id = teacherForm.value.role_id

    if (editingTeacher.value) {
      await api.put(`/teachers/${editingTeacher.value.id}`, payload)
    } else {
      await api.post('/teachers', payload)
    }
    showTeacherModal.value = false
    await loadTeachers()
    message.success(editingTeacher.value ? '教师信息已更新' : '教师已创建')
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
    // 加载全部权限组（身份+职位）
    allGroups.value = await api.get<PermissionGroup[]>('/roles/groups').catch(() => [])
  } catch (e: any) {
    message.error(e.message || '加载班级数据失败')
  } finally {
    classLoading.value = false
  }
}

function autoGenerateStudentNo(): string {
  return String(Date.now()).slice(-8)
}

function openNew() {
  const no = autoGenerateStudentNo()
  editing.value = null
  form.value = { student_no: no, display_name: '', nickname: '', class: '', password: no, group_id: null, role_id: null }
  showModal.value = true
}

function openEdit(s: Student) {
  editing.value = s
  form.value = {
    student_no: s.student_no || '',
    display_name: s.display_name,
    nickname: s.nickname || '',
    class: s.class,
    password: '',
    group_id: s.group_id ?? null,
    role_id: s.role_id ?? null,
  }
  showModal.value = true
}

async function save() {
  if (!form.value.group_id) { message.error('请选择身份'); return }
  const canCreate = identityGroups.value.some(g => g.id === form.value.group_id)
  if (!canCreate) { message.error('请选择有效的身份组'); return }
  const student_no = form.value.student_no || autoGenerateStudentNo()
  // 学号只能为数字
  if (!/^\d+$/.test(student_no)) { message.error('学号只能为数字'); return }
  saving.value = true
  try {
    const payload: any = {
      display_name: form.value.display_name,
      nickname: form.value.nickname || undefined,
      class: form.value.class,
      student_no,
      password: form.value.password || student_no,
      group_id: form.value.group_id,
      role_id: form.value.role_id,
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
        <!-- Top bar: filter + batch actions + add -->
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
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <!-- 批量操作按钮 -->
            <template v-if="selectedStudentIds.size > 0">
              <n-button size="small" type="error" @click="batchDeleteStudents" round>
                <template #icon><Trash2 :size="14" /></template>
                删除选中 ({{ selectedStudentIds.size }})
              </n-button>
            </template>
            <n-button size="small" quaternary @click="exportStudents" round>
              <template #icon><Download :size="14" /></template>
              {{ selectedStudentIds.size > 0 ? `导出选中 (${selectedStudentIds.size})` : '导出全部' }}
            </n-button>
            <n-button type="primary" @click="openNew" round size="small">
              <template #icon><Plus :size="16" /></template>
              添加学生
            </n-button>
          </div>
        </div>

        <n-spin :show="loading" style="min-height: 200px">
          <n-list
            v-if="filteredStudents.length > 0"
            hoverable
            clickable
            style="background: transparent"
          >
            <!-- 全选行 -->
            <n-list-item style="padding: 8px 16px; cursor: pointer; border-bottom: 1px solid var(--border-color);" @click="toggleAllStudents">
              <template #prefix>
                <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
                  <n-icon :size="20" :component="allStudentsSelected ? CheckSquare : someStudentsSelected ? MinusSquare : Square" :style="{ color: allStudentsSelected || someStudentsSelected ? 'var(--primary-color)' : 'var(--text-muted)' }" />
                </div>
              </template>
              <span style="font-size: 13px; color: var(--text-muted);">
                {{ allStudentsSelected ? '取消全选' : '全选' }}
                {{ selectedStudentIds.size > 0 ? `（已选 ${selectedStudentIds.size} 人）` : '' }}
              </span>
            </n-list-item>

            <n-list-item v-for="s in filteredStudents" :key="s.id" @click="toggleStudent(s.id)">
              <template #prefix>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <n-icon :size="20" :component="selectedStudentIds.has(s.id) ? CheckSquare : Square" :style="{ color: selectedStudentIds.has(s.id) ? 'var(--primary-color)' : 'var(--text-muted)' }" />
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
                </div>
              </template>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-weight: 600; font-size: 15px; color: var(--text-primary);">{{ s.display_name }}</span>
                <span v-if="s.student_no" style="font-size: 12px; color: var(--text-muted); font-family: monospace;">#{{ s.student_no }}</span>
                <span v-if="s.class" style="font-size: 12px; color: var(--text-muted);">{{ s.class }}</span>
                <span v-if="s.nickname" style="font-size: 12px; color: var(--text-muted); display:inline-flex;align-items:center;gap:3px;"><Tag :size="11" /> {{ s.nickname }}</span>
                <!-- 身份标签 -->
                <n-tag v-if="groupName(s.group_id)" size="tiny" :bordered="false" round style="font-size: 11px">{{ groupName(s.group_id) }}</n-tag>
                <!-- 职位标签 -->
                <n-tag v-if="groupName(s.role_id)" size="tiny" :bordered="false" type="info" round style="font-size: 11px">{{ groupName(s.role_id) }}</n-tag>
              </div>
              <template #suffix>
                <div style="display: flex; gap: 4px; flex-shrink: 0;" @click.stop>
                  <n-button quaternary size="small" @click="openEdit(s)" round>
                    <template #icon><Pencil :size="14" /></template>
                    编辑
                  </n-button>
                  <n-button quaternary size="small" type="error" @click="remove(s.id)" round>
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
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; gap: 12px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 14px; color: var(--text-primary); font-weight: 600;">教师账号</span>
            <span style="font-size: 12px; color: var(--text-muted);">共 {{ teachers.length }} 人</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <template v-if="selectedTeacherIds.size > 0">
              <n-button size="small" type="error" @click="batchDeleteTeachers" round>
                <template #icon><Trash2 :size="14" /></template>
                删除选中 ({{ selectedTeacherIds.size }})
              </n-button>
            </template>
            <n-button size="small" quaternary @click="exportTeachers" round>
              <template #icon><Download :size="14" /></template>
              {{ selectedTeacherIds.size > 0 ? `导出选中 (${selectedTeacherIds.size})` : '导出全部' }}
            </n-button>
            <n-button type="primary" @click="openNewTeacher" round size="small">
              <template #icon><Plus :size="16" /></template>
              添加教师
            </n-button>
          </div>
        </div>

        <n-spin :show="teachersLoading" style="min-height: 200px">
          <n-list
            v-if="teachers.length > 0"
            hoverable
            style="background: transparent"
          >
            <!-- 全选行 -->
            <n-list-item style="padding: 8px 16px; cursor: pointer; border-bottom: 1px solid var(--border-color);" @click="toggleAllTeachers">
              <template #prefix>
                <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
                  <n-icon :size="20" :component="allTeachersSelected ? CheckSquare : someTeachersSelected ? MinusSquare : Square" :style="{ color: allTeachersSelected || someTeachersSelected ? 'var(--primary-color)' : 'var(--text-muted)' }" />
                </div>
              </template>
              <span style="font-size: 13px; color: var(--text-muted);">
                {{ allTeachersSelected ? '取消全选' : '全选' }}
                {{ selectedTeacherIds.size > 0 ? `（已选 ${selectedTeacherIds.size} 人）` : '' }}
              </span>
            </n-list-item>

            <n-list-item v-for="t in teachers" :key="t.id" @click="toggleTeacher(t.id)">
              <template #prefix>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <n-icon :size="20" :component="selectedTeacherIds.has(t.id) ? CheckSquare : Square" :style="{ color: selectedTeacherIds.has(t.id) ? 'var(--primary-color)' : 'var(--text-muted)' }" />
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
                </div>
              </template>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-weight: 600; font-size: 15px; color: var(--text-primary);">{{ t.display_name }}</span>
                <span style="font-size: 12px; color: var(--text-muted); font-family: monospace;">@{{ t.username }}</span>
                <span v-if="t.class" style="font-size: 12px; color: var(--text-muted);">{{ t.class }}</span>
                <span v-if="t.nickname" style="font-size: 12px; color: var(--text-muted);">📛 {{ t.nickname }}</span>
                <!-- 身份标签 -->
                <n-tag v-if="groupName(t.group_id)" size="tiny" :bordered="false" round style="font-size: 11px">{{ groupName(t.group_id) }}</n-tag>
                <!-- 职位标签 -->
                <n-tag v-if="groupName(t.role_id)" size="tiny" :bordered="false" type="info" round style="font-size: 11px">{{ groupName(t.role_id) }}</n-tag>
              </div>
              <template #suffix>
                <div @click.stop>
                  <n-button quaternary size="small" @click="openEditTeacher(t)" round>
                    <template #icon><Pencil :size="14" /></template>
                    编辑
                  </n-button>
                </div>
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
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; gap: 12px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <School :size="16" style="color: var(--text-muted);" />
            <span style="font-size: 14px; color: var(--text-primary); font-weight: 600;">班级列表</span>
            <span style="font-size: 12px; color: var(--text-muted);">共 {{ classData.length }} 个班级</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <template v-if="selectedClassIds.size > 0">
              <n-button size="small" type="error" @click="batchDeleteClasses" round>
                <template #icon><Trash2 :size="14" /></template>
                删除选中 ({{ selectedClassIds.size }})
              </n-button>
            </template>
            <n-button size="small" quaternary @click="exportClasses" round>
              <template #icon><Download :size="14" /></template>
              {{ selectedClassIds.size > 0 ? `导出选中 (${selectedClassIds.size})` : '导出全部' }}
            </n-button>
            <n-button type="primary" @click="openNewClass" round size="small">
              <template #icon><Plus :size="16" /></template>
              创建班级
            </n-button>
          </div>
        </div>

        <n-spin :show="classLoading" style="min-height: 200px">
          <n-list
            v-if="classData.length > 0"
            hoverable
            clickable
            style="background: transparent"
          >
            <!-- 全选行 -->
            <n-list-item style="padding: 8px 16px; cursor: pointer; border-bottom: 1px solid var(--border-color);" @click="toggleAllClasses">
              <template #prefix>
                <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
                  <n-icon :size="20" :component="allClassesSelected ? CheckSquare : someClassesSelected ? MinusSquare : Square" :style="{ color: allClassesSelected || someClassesSelected ? 'var(--primary-color)' : 'var(--text-muted)' }" />
                </div>
              </template>
              <span style="font-size: 13px; color: var(--text-muted);">
                {{ allClassesSelected ? '取消全选' : '全选' }}
                {{ selectedClassIds.size > 0 ? `（已选 ${selectedClassIds.size} 个）` : '' }}
              </span>
            </n-list-item>

            <n-list-item v-for="c in classData" :key="c.id" @click="toggleClass(c.id)">
              <template #prefix>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <n-icon :size="20" :component="selectedClassIds.has(c.id) ? CheckSquare : Square" :style="{ color: selectedClassIds.has(c.id) ? 'var(--primary-color)' : 'var(--text-muted)' }" />
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
                </div>
              </template>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-weight: 600; font-size: 15px; color: var(--text-primary);">{{ c.name }}</span>
                <n-tag :bordered="false" size="small" type="info">
                  {{ c.student_count }} 人
                </n-tag>
              </div>
              <template #suffix>
                <div style="display: flex; gap: 4px; flex-shrink: 0;" @click.stop>
                  <n-button quaternary size="small" @click="openEditClass(c)" round>
                    <template #icon><Pencil :size="14" /></template>
                    重命名
                  </n-button>
                  <n-button quaternary size="small" type="error" @click="removeClass(c.id, c.name)" round>
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
          <n-input v-model:value="form.student_no" placeholder="留空自动生成，只能为数字" :input-props="{ inputMode: 'numeric', pattern: '[0-9]*' }" />
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
        <n-form-item label="身份（必选）" path="group_id">
          <n-select
            v-model:value="form.group_id"
            :options="identityGroups.map(g => ({ label: g.name, value: g.id }))"
            placeholder="选择身份组"
          />
        </n-form-item>
        <n-form-item label="职位（可选）" path="role_id">
          <n-select
            v-model:value="form.role_id"
            :options="availableRoles.map(g => ({ label: g.name, value: g.id }))"
            placeholder="选择职位"
            clearable
            :disabled="!form.group_id || availableRoles.length === 0"
          />
        </n-form-item>
        <n-form-item label="密码" path="password">
          <n-input v-model:value="form.password" placeholder="留空则保持原密码（编辑时）或使用默认密码" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showModal = false" quaternary>取消</n-button>
          <n-button type="primary" @click="save" :disabled="!form.display_name || !form.group_id" :loading="saving" round>保存</n-button>
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

    <!-- ── 教师编辑/创建 Modal ── -->
    <n-modal
      v-model:show="showTeacherModal"
      preset="card"
      :title="editingTeacher ? '编辑教师' : '添加教师'"
      style="width: 420px"
      :mask-closable="false"
      header-style="padding: 20px 24px 0; font-size: 18px; font-weight: 600"
      content-style="padding: 16px 24px"
      footer-style="padding: 16px 24px"
    >
      <n-form :model="teacherForm" label-placement="top">
        <n-form-item label="姓名 *" path="display_name">
          <n-input v-model:value="teacherForm.display_name" placeholder="教师真实姓名" />
        </n-form-item>
        <n-form-item label="用户名 *" path="username">
          <n-input v-model:value="teacherForm.username" placeholder="登录用户名（字母数字下划线）" :disabled="!!editingTeacher" />
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
        <n-form-item label="身份 *" path="group_id">
          <n-select
            v-model:value="teacherForm.group_id"
            :options="identityGroups.map(g => ({ label: g.name, value: g.id }))"
            placeholder="选择身份组"
          />
        </n-form-item>
        <n-form-item label="职位" path="role_id">
          <n-select
            v-model:value="teacherForm.role_id"
            :options="availableRoles.map(g => ({ label: g.name, value: g.id }))"
            placeholder="选择职位"
            clearable
            :disabled="!teacherForm.group_id || availableRoles.length === 0"
          />
        </n-form-item>
        <n-form-item label="密码" path="password">
          <n-input v-model:value="teacherForm.password" :placeholder="editingTeacher ? '留空则保持原密码' : '留空则默认 123456'" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showTeacherModal = false" quaternary>取消</n-button>
          <n-button type="primary" @click="saveTeacher" :disabled="!teacherForm.display_name || (!editingTeacher && !teacherForm.username) || !teacherForm.group_id" :loading="teacherSaving" round>
            {{ editingTeacher ? '保存' : '创建' }}
          </n-button>
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
