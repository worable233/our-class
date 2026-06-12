<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import type { Score, PointRecord, Assignment } from '@/types'
import { NCard, NGrid, NGi, NTag, NText, NSpin, NEmpty, NAvatar, NModal, NForm, NFormItem, NInput, NButton, NSpace } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { Pencil, Camera, Lock, BookOpen, Trophy, Star, ClipboardList } from '@lucide/vue'

const auth = useAuthStore()
const message = useMessage()
const scores = ref<Score[]>([])
const points = ref<PointRecord[]>([])
const assignments = ref<Assignment[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [scs, pts, asgns] = await Promise.all([
      api.get<Score[]>(`/scores?student_id=${auth.user?.id}`),
      api.get<PointRecord[]>(`/points?student_id=${auth.user?.id}`),
      api.get<Assignment[]>(`/assignments?student_id=${auth.user?.id}`),
    ])
    scores.value = scs
    points.value = pts
    assignments.value = asgns
  } catch (e: any) {
    message.error(e.message || '加载数据失败')
  } finally {
    loading.value = false
  }
})

const avgScore = computed(() => scores.value.length > 0
  ? Math.round(scores.value.reduce((a, b) => a + b.score, 0) / scores.value.length)
  : 0)
const totalPoints = computed(() => points.value.reduce((a, b) => a + (b.type === 'add' ? b.amount : -b.amount), 0))
const completedAssignments = computed(() => assignments.value.filter(a => a.submit_status === 'graded' || a.submit_status === 'pending').length)

const showProfileModal = ref(false)
const profileForm = ref({ nickname: '', avatar: '' })
const saving = ref(false)

function openEditProfile() {
  profileForm.value = { nickname: auth.user?.nickname || '', avatar: auth.user?.avatar || '' }
  avatarError.value = false
  showProfileModal.value = true
}

const avatarError = ref(false)

async function saveProfile() {
  if (profileForm.value.avatar && !/^https?:\/\/.+/.test(profileForm.value.avatar)) {
    message.error('头像必须是有效的 HTTP/HTTPS 链接')
    return
  }
  saving.value = true
  try {
    const payload: any = {}
    if (profileForm.value.nickname !== (auth.user?.nickname || '')) payload.nickname = profileForm.value.nickname
    if (profileForm.value.avatar !== (auth.user?.avatar || '')) payload.avatar = profileForm.value.avatar
    if (Object.keys(payload).length === 0) { showProfileModal.value = false; return }
    const updated = await api.put<any>('/auth/profile', payload)
    if (auth.user) {
      auth.user.nickname = updated.nickname
      auth.user.avatar = updated.avatar
      localStorage.setItem('ourclass_user', JSON.stringify(auth.user))
    }
    showProfileModal.value = false
    message.success('个人资料已更新')
  } catch (e: any) {
    message.error(e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const showPasswordModal = ref(false)
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })
const changingPassword = ref(false)

function openChangePassword() {
  passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  showPasswordModal.value = true
}

async function changePassword() {
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) { message.error('两次输入的密码不一致'); return }
  if (passwordForm.value.newPassword.length < 6) { message.error('密码长度不能少于 6 位'); return }
  changingPassword.value = true
  try {
    await api.put('/auth/profile', { old_password: passwordForm.value.oldPassword, password: passwordForm.value.newPassword })
    showPasswordModal.value = false
    passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
    message.success('密码已修改')
  } catch (e: any) {
    message.error(e.message || '修改失败')
  } finally {
    changingPassword.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <n-spin :show="loading" style="min-height: 200px;">
      <!-- Profile Header -->
      <n-card class="profile-card">
        <div class="profile-header">
          <div class="avatar-wrapper">
            <n-avatar v-if="auth.user?.avatar" :size="72" round :src="auth.user.avatar" class="profile-avatar" />
            <n-avatar v-else :size="72" round class="profile-avatar avatar-placeholder">
              {{ auth.displayName.charAt(0) }}
            </n-avatar>
            <div class="avatar-edit" @click="openEditProfile" title="编辑头像">
              <Camera :size="14" />
            </div>
          </div>
          <div class="profile-info">
            <div class="profile-name">{{ auth.displayName }}</div>
            <div v-if="auth.user?.nickname" class="profile-nickname">昵称：{{ auth.user.nickname }}</div>
            <div class="profile-class">{{ auth.userClass }}</div>
            <n-tag size="small" :bordered="false" round>学生</n-tag>
          </div>
          <div class="profile-actions">
            <n-button size="small" quaternary @click="openEditProfile">
              <template #icon><Pencil :size="14" /></template>
              编辑资料
            </n-button>
            <n-button size="small" quaternary @click="openChangePassword">
              <template #icon><Lock :size="14" /></template>
              修改密码
            </n-button>
          </div>
        </div>
      </n-card>

      <!-- Stats -->
      <n-grid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" :item-responsive="true">
        <n-gi span="4 m:1">
          <n-card size="small" class="stat-card">
            <div class="stat-icon" style="background:rgba(59,130,246,0.1);color:#3b82f6"><BookOpen :size="20" /></div>
            <div class="stat-value">{{ scores.length }}</div>
            <div class="stat-label">考试次数</div>
          </n-card>
        </n-gi>
        <n-gi span="4 m:1">
          <n-card size="small" class="stat-card">
            <div class="stat-icon bg-accent text-accent"><Trophy :size="20" /></div>
            <div class="stat-value">{{ avgScore }}</div>
            <div class="stat-label">平均分</div>
          </n-card>
        </n-gi>
        <n-gi span="4 m:1">
          <n-card size="small" class="stat-card">
            <div class="stat-icon" style="background:rgba(245,158,11,0.1);color:#f59e0b"><Star :size="20" /></div>
            <div class="stat-value">{{ totalPoints }}</div>
            <div class="stat-label">总积分</div>
          </n-card>
        </n-gi>
        <n-gi span="4 m:1">
          <n-card size="small" class="stat-card">
            <div class="stat-icon bg-positive text-positive"><ClipboardList :size="20" /></div>
            <div class="stat-value">{{ completedAssignments }}</div>
            <div class="stat-label">已完成作业</div>
          </n-card>
        </n-gi>
      </n-grid>

      <!-- Points Records -->
      <n-card class="records-card">
        <template #header>
          <span class="card-title">积分记录</span>
        </template>
        <div v-if="points.length > 0" class="records-list">
          <div v-for="r in points.slice(0, 10)" :key="r.id" class="record-item">
            <div class="record-icon" :class="r.type === 'add' ? 'bg-positive text-positive' : 'bg-negative text-negative'">
              {{ r.type === 'add' ? '+' : '−' }}
            </div>
            <div class="record-content">
              <div class="record-reason">{{ r.reason }}</div>
              <div class="record-date">{{ r.date }}</div>
            </div>
            <div class="record-amount" :class="r.type === 'add' ? 'text-positive' : 'text-negative'">
              {{ r.type === 'add' ? '+' : '-' }}{{ r.amount }}
            </div>
          </div>
          <n-text v-if="points.length > 10" depth="3" class="records-hint">仅显示最近 10 条记录</n-text>
        </div>
        <n-empty v-else description="暂无积分记录" />
      </n-card>
    </n-spin>

    <!-- Edit Profile Modal -->
    <n-modal v-model:show="showProfileModal" preset="card" title="编辑个人资料" style="width:420px" :mask-closable="false">
      <n-form :model="profileForm" label-placement="top">
        <n-form-item label="昵称">
          <n-input v-model:value="profileForm.nickname" placeholder="设置一个昵称（可选）" maxlength="50" show-count />
        </n-form-item>
        <n-form-item label="头像 URL">
          <n-input v-model:value="profileForm.avatar" placeholder="https://example.com/avatar.jpg" />
        </n-form-item>
        <div v-if="profileForm.avatar" class="avatar-preview">
          <n-avatar v-if="!avatarError" :size="80" round :src="profileForm.avatar" @error="avatarError = true" />
          <div v-else class="avatar-error"><n-text depth="3" style="font-size:12px">加载失败</n-text></div>
          <n-text depth="3" style="display:block;font-size:12px;margin-top:8px">{{ avatarError ? '图片链接无效' : '头像预览' }}</n-text>
        </div>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button quaternary @click="showProfileModal = false">取消</n-button>
          <n-button type="primary" @click="saveProfile" :loading="saving" round>保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Change Password Modal -->
    <n-modal v-model:show="showPasswordModal" preset="card" title="修改密码" style="width:400px" :mask-closable="false">
      <n-form :model="passwordForm" label-placement="top">
        <n-form-item label="原密码">
          <n-input v-model:value="passwordForm.oldPassword" type="password" placeholder="输入原密码" show-password-on="click" />
        </n-form-item>
        <n-form-item label="新密码">
          <n-input v-model:value="passwordForm.newPassword" type="password" placeholder="至少 6 位" show-password-on="click" />
        </n-form-item>
        <n-form-item label="确认新密码">
          <n-input v-model:value="passwordForm.confirmPassword" type="password" placeholder="再次输入新密码" show-password-on="click" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button quaternary @click="showPasswordModal = false">取消</n-button>
          <n-button type="primary" @click="changePassword" :loading="changingPassword" :disabled="!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword" round>修改密码</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
/* Profile Header */
.profile-card {
  border: 1px solid var(--hairline);
}

.profile-header {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.profile-avatar {
  background: var(--accent);
}

.avatar-placeholder {
  color: #fff;
  font-weight: var(--weight-bold);
  font-size: 28px;
}

.avatar-edit {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--surface-1);
  border: 2px solid var(--hairline);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--duration-fast), border-color var(--duration-fast), color var(--duration-fast);
  color: var(--text-muted);
}

.avatar-edit:hover {
  background: var(--surface-3);
  border-color: var(--accent);
  color: var(--accent);
}

.profile-info {
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-weight: var(--weight-bold);
  font-size: var(--text-title);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--text-primary);
}

.profile-nickname {
  font-size: var(--text-body);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}

.profile-class {
  font-size: var(--text-body);
  color: var(--text-muted);
  margin-top: var(--space-1);
  margin-bottom: var(--space-2);
}

.profile-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* Records */
.records-card {
  border: 1px solid var(--hairline);
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.record-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  transition: background var(--duration-fast), transform var(--duration-fast);
}

.record-item:hover {
  background: var(--surface-3);
  transform: translateX(2px);
}

.record-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--weight-bold);
  font-size: var(--text-subtitle);
  flex-shrink: 0;
}

.record-content {
  flex: 1;
  min-width: 0;
}

.record-reason {
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  line-height: var(--leading-normal);
  color: var(--text-primary);
}

.record-date {
  font-size: var(--text-overline);
  color: var(--text-muted);
  margin-top: var(--space-1);
}

.record-amount {
  font-weight: var(--weight-bold);
  font-size: var(--text-body);
  flex-shrink: 0;
}

.records-hint {
  font-size: var(--text-caption);
  text-align: center;
  padding: var(--space-2) 0 var(--space-1);
  display: block;
}

/* Avatar Preview */
.avatar-preview {
  margin-bottom: var(--space-4);
  text-align: center;
}

.avatar-error {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

/* Mobile */
@media (max-width: 768px) {
  .profile-header {
    flex-direction: column;
    text-align: center;
    gap: var(--space-4);
  }

  .profile-actions {
    flex-direction: row;
    width: 100%;
  }

  .profile-actions .n-button {
    flex: 1;
  }
}
</style>
