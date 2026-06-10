<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useMessage, useDialog } from 'naive-ui'
import {
  NCard, NButton, NModal, NForm, NFormItem, NInput, NSelect, NSpace,
  NSpin, NEmpty, NTag, NText, NButtonGroup,
} from 'naive-ui'
import { Plus, Trash2, Edit3, BookOpen, Upload, Image } from '@lucide/vue'
import FilePicker from '@/components/FilePicker.vue'

const message = useMessage()
const dialog = useDialog()
const auth = useAuthStore()

interface Course {
  id: number; name: string; description: string; class: string
  cover_url: string; created_by: number; creator_name: string
  created_at: string; updated_at: string
}

const courses = ref<Course[]>([])
const classList = ref<string[]>([])
const loading = ref(false)
const showModal = ref(false)
const editing = ref<Course | null>(null)
const form = ref({ name: '', description: '', class: '' })
const saving = ref(false)
const coverUploading = ref(false)
const showCoverPicker = ref(false)
const pickingCourseId = ref<number | null>(null)
const filterClass = ref('')

const hasViewAll = computed(() => auth.permissions.includes('classes.view_all'))

async function load() {
  loading.value = true
  try {
    const params = filterClass.value ? `?class=${encodeURIComponent(filterClass.value)}` : ''
    const [c, cls] = await Promise.all([
      api.get<Course[]>(`/courses${params}`),
      api.get<string[]>('/courses/classes'),
    ])
    courses.value = c
    classList.value = cls
  } catch (e: any) { message.error(e.message || '加载失败') }
  finally { loading.value = false }
}

async function loadClasses() {
  try { classList.value = await api.get<string[]>('/courses/classes') } catch {}
}

function reset() { load() }

function openNew() {
  editing.value = null
  // 没有 viewAll 权限时，默认选自己班级
  const defaultClass = hasViewAll.value ? (classList.value[0] || '') : (auth.user?.class?.split(',')[0]?.trim() || classList.value[0] || '')
  form.value = { name: '', description: '', class: defaultClass }
  showModal.value = true
}

function openEdit(c: Course) {
  editing.value = c
  form.value = { name: c.name, description: c.description, class: c.class }
  showModal.value = true
}

async function save() {
  if (!form.value.name || !form.value.class) { message.warning('请填写完整信息'); return }
  saving.value = true
  try {
    if (editing.value) {
      await api.put(`/courses/${editing.value.id}`, form.value)
      message.success('课程已更新')
    } else {
      await api.post('/courses', form.value)
      message.success('课程已创建')
    }
    showModal.value = false
    await load()
  } catch (e: any) { message.error(e.message || '保存失败') }
  finally { saving.value = false }
}

async function remove(id: number) {
  dialog.warning({
    title: '确认删除',
    content: '确定删除该课程？此操作不可撤销。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try { await api.delete(`/courses/${id}`); message.success('已删除'); await load() }
      catch (e: any) { message.error(e.message || '删除失败') }
    },
  })
}

async function uploadCover(courseId: number) {
  pickingCourseId.value = courseId
  showCoverPicker.value = true
}

async function onCoverPick(files: { name: string; path: string; size: number }[]) {
  if (files.length === 0 || pickingCourseId.value === null) return
  const f = files[0]; if (!f) return
  coverUploading.value = true
  try {
    const r = await api.post<{ cover_url: string }>(`/courses/${pickingCourseId.value}/cover-from-disk`, {
      disk_path: f.path,
    })
    message.success('封面已设置')
    await load()
  } catch (e: any) { message.error(e.message || '设置封面失败') }
  finally {
    coverUploading.value = false
    showCoverPicker.value = false
    pickingCourseId.value = null
  }
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

onMounted(load)
</script>

<template>
  <div style="display:flex;flex-direction:column;gap:20px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <NText tag="h1" depth="1" style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.03em;">课程管理</NText>
        <NText depth="3" style="margin-top:4px;display:block;font-size:13px;">创建和管理课程，用于布置和收集作业</NText>
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
        <NButton type="primary" @click="openNew" round size="small">
          <template #icon><Plus :size="16" /></template>
          创建课程
        </NButton>
      </div>
    </div>

    <n-spin :show="loading" style="min-height:200px;">
      <div v-if="courses.length > 0" class="course-grid">
        <n-card v-for="c in courses" :key="c.id" :bordered="true" size="small" class="course-card">
          <!-- Cover -->
          <div class="course-cover" @click="uploadCover(c.id)">
            <img v-if="c.cover_url" :src="c.cover_url" :alt="c.name" class="course-cover-img" />
            <div v-else class="course-cover-placeholder">
              <Image :size="32" />
              <span>点击上传封面</span>
            </div>
            <div class="course-cover-overlay">
              <Upload :size="18" />
              <span>更换封面</span>
            </div>
          </div>
          <!-- Info -->
          <div class="course-info">
            <span class="course-name">{{ c.name }}</span>
            <NTag v-if="c.class" size="tiny" :bordered="false" round style="font-size:10px;">{{ c.class }}</NTag>
          </div>
          <div v-if="c.description" class="course-desc">{{ c.description }}</div>
          <div class="course-meta">
            <span>{{ c.creator_name }}</span>
            <span>{{ fmtDate(c.created_at) }}</span>
          </div>
          <!-- Actions -->
          <div class="course-actions">
            <NButton v-if="hasViewAll || auth.user?.class?.split(',').map(c=>c.trim()).includes(c.class)" size="tiny" quaternary @click="openEdit(c)" round><template #icon><Edit3 :size="13" /></template>编辑</NButton>
            <NButton v-if="hasViewAll || auth.user?.class?.split(',').map(c=>c.trim()).includes(c.class)" size="tiny" quaternary type="error" @click="remove(c.id)" round><template #icon><Trash2 :size="13" /></template>删除</NButton>
          </div>
        </n-card>
      </div>
      <NEmpty v-else-if="!loading" description="暂无课程，点击右上角创建" />
    </n-spin>

    <!-- Create/Edit Modal -->
    <n-modal v-model:show="showModal" preset="card" :title="editing?'编辑课程':'创建课程'" style="width:460px;" :mask-closable="false">
      <n-form label-placement="top">
        <n-form-item label="课程名称"><n-input v-model:value="form.name" placeholder="例如：高等数学" /></n-form-item>
        <n-form-item label="所属班级">
          <n-select v-model:value="form.class" :options="classList.map(c=>({label:c,value:c}))" placeholder="选择班级" :disabled="!hasViewAll && !!editing" />
        </n-form-item>
        <n-form-item label="课程描述"><n-input v-model:value="form.description" type="textarea" :rows="3" placeholder="可选课程说明" /></n-form-item>
      </n-form>
      <template #footer>
        <NSpace justify="end">
          <NButton quaternary @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="save" :loading="saving" :disabled="!form.name||!form.class" round>{{ editing?'保存':'创建' }}</NButton>
        </NSpace>
      </template>
    </n-modal>

    <!-- ═══ 封面选择器 ═══ -->
    <FilePicker
      v-model:show="showCoverPicker"
      :accept="['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']"
      :multiple="false"
      @confirm="onCoverPick"
    />
  </div>
</template>

<style scoped>
.course-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.course-card {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.course-cover {
  height: 140px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  background: var(--surface-2);
  margin-bottom: 10px;
}
.course-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.course-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 12px;
}
.course-cover-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(0,0,0,.45);
  color: #fff;
  font-size: 12px;
  opacity: 0;
  transition: opacity .2s;
}
.course-cover:hover .course-cover-overlay { opacity: 1; }
.course-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.course-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.course-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.course-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.course-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  border-top: 1px solid var(--hairline);
  padding-top: 8px;
}
</style>
