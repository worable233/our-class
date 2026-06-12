<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import type { Score, PointRecord, Assignment } from '@/types'
import { NCard, NGrid, NGi, NTag, NText, NSpace, NSpin, NEmpty, NAvatar, NModal, NForm, NFormItem, NInput, NButton } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { Pencil, Camera, Lock } from '@lucide/vue'

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

// ── Profile Edit ──
const showProfileModal = ref(false)
const profileForm = ref({ nickname: '', avatar: '' })
const saving = ref(false)

function openEditProfile() {
  profileForm.value = {
    nickname: auth.user?.nickname || '',
    avatar: auth.user?.avatar || '',
  }
  showProfileModal.value = true
}

async function saveProfile() {
  saving.value = true
  try {
    const payload: any = {}
    if (profileForm.value.nickname !== (auth.user?.nickname || '')) {
      payload.nickname = profileForm.value.nickname
    }
    if (profileForm.value.avatar !== (auth.user?.avatar || '')) {
      payload.avatar = profileForm.value.avatar
    }
    if (Object.keys(payload).length === 0) {
      showProfileModal.value = false
      return
    }
    const updated = await api.put<any>('/auth/profile', payload)
    // Update local storage
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

// ── Password Change ──
const showPasswordModal = ref(false)
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })
const changingPassword = ref(false)

function openChangePassword() {
  passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  showPasswordModal.value = true
}

async function changePassword() {
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    message.error('两次输入的密码不一致')
    return
  }
  if (passwordForm.value.newPassword.length < 6) {
    message.error('密码长度不能少于 6 位')
    return
  }
  changingPassword.value = true
  try {
    await api.put('/auth/profile', {
      old_password: passwordForm.value.oldPassword,
      password: passwordForm.value.newPassword,
    })
    showPasswordModal.value = false
    message.success('密码已修改')
  } catch (e: any) {
    message.error(e.message || '修改失败')
  } finally {
    changingPassword.value = false
  }
}
</script>

<template>
  <div>
    <n-spin :show="loading" style="min-height: 200px;">
      <!-- Profile Header -->
      <div
        style="display: flex; align-items: center; gap: 24px; background: var(--surface-1); border: 1px solid var(--hairline); border-radius: var(--radius-lg); padding: 32px; margin-bottom: 24px;"
      >
        <div style="position: relative; flex-shrink: 0;">
          <n-avatar
            v-if="auth.user?.avatar"
            :size="64"
            round
            :src="auth.user.avatar"
            style="background: var(--accent);"
          />
          <n-avatar
            v-else
            :size="64"
            round
            style="background: var(--accent); color: #fff; font-weight: 700; font-size: 28px;"
          >
            {{ auth.displayName.charAt(0) }}
          </n-avatar>
          <div
            style="position: absolute; bottom: -2px; right: -2px; width: 24px; height: 24px; border-radius: 50%; background: var(--surface-1); border: 2px solid var(--hairline); display: flex; align-items: center; justify-content: center; cursor: pointer;"
            @click="openEditProfile"
            title="编辑头像"
          >
            <Camera :size="12" style="color: var(--text-muted);" />
          </div>
        </div>
        <div style="flex: 1;">
          <n-text
            strong
            style="font-size: 22px; letter-spacing: -0.02em; line-height: 1.3; display: block; margin-bottom: 2px;"
          >
            {{ auth.displayName }}
          </n-text>
          <n-text depth="3" style="font-size: 14px; display: block; margin-bottom: 4px;">
            {{ auth.user?.nickname ? `昵称：${auth.user.nickname}` : '' }}
          </n-text>
          <n-text depth="3" style="font-size: 14px; display: block; margin-bottom: 12px;">
            {{ auth.userClass }}
          </n-text>
          <n-space size="small">
            <n-tag size="small" :bordered="false">学生</n-tag>
          </n-space>
        </div>
        <n-space vertical size="small">
          <n-button size="small" quaternary @click="openEditProfile">
            <template #icon><Pencil :size="14" /></template>
            编辑资料
          </n-button>
          <n-button size="small" quaternary @click="openChangePassword">
            <template #icon><Lock :size="14" /></template>
            修改密码
          </n-button>
        </n-space>
      </div>

      <!-- Stats Row -->
      <n-grid :cols="4" :x-gap="16" style="margin-bottom: 24px;">
        <n-gi>
          <n-card size="small">
            <n-text
              style="font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; display: block; margin-bottom: 4px;"
            >
              {{ scores.length }}
            </n-text>
            <n-text depth="3" style="font-size: 14px;">考试次数</n-text>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card size="small" style="border-color: rgba(94, 106, 210, 0.15);">
            <n-text
              style="font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; display: block; margin-bottom: 4px;"
            >
              {{ avgScore }}
            </n-text>
            <n-text depth="3" style="font-size: 14px;">平均分</n-text>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card size="small">
            <n-text
              style="font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; display: block; margin-bottom: 4px;"
            >
              {{ totalPoints }}
            </n-text>
            <n-text depth="3" style="font-size: 14px;">总积分</n-text>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card size="small">
            <n-text
              style="font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; display: block; margin-bottom: 4px;"
            >
              {{ completedAssignments }}
            </n-text>
            <n-text depth="3" style="font-size: 14px;">已完成作业</n-text>
          </n-card>
        </n-gi>
      </n-grid>

      <!-- Points Records Section -->
      <n-card>
        <template #header>
          <n-text strong style="font-size: 16px; letter-spacing: -0.01em;">积分记录</n-text>
        </template>
        <div v-if="points.length > 0" style="display: flex; flex-direction: column; gap: 8px;">
          <div
            v-for="r in points.slice(0, 10)"
            :key="r.id"
            style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 6px; background: var(--surface-2); border: 1px solid var(--hairline);"
          >
            <div
              style="width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0;"
              :style="{
                background: r.type === 'add' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                color: r.type === 'add' ? '#22c55e' : '#ef4444',
              }"
            >
              {{ r.type === 'add' ? '+' : '−' }}
            </div>
            <div style="flex: 1; min-width: 0;">
              <n-text style="font-size: 13px; font-weight: 500; line-height: 1.4; display: block;">
                {{ r.reason }}
              </n-text>
              <n-text depth="3" style="font-size: 12px; display: block; margin-top: 2px;">
                {{ r.date }}
              </n-text>
            </div>
            <span
              style="font-weight: 700; font-size: 15px; flex-shrink: 0;"
              :style="{ color: r.type === 'add' ? '#22c55e' : '#ef4444' }"
            >
              {{ r.type === 'add' ? '+' : '-' }}{{ r.amount }}
            </span>
          </div>
          <n-text v-if="points.length > 10" depth="3" style="font-size: 12px; text-align: center; padding: 8px;">
            仅显示最近 10 条记录
          </n-text>
        </div>
        <n-empty v-else description="暂无积分记录" />
      </n-card>
    </n-spin>

    <!-- Edit Profile Modal -->
    <n-modal v-model:show="showProfileModal" preset="card" title="编辑个人资料" style="width: 420px;" :mask-closable="false">
      <n-form :model="profileForm" label-placement="top">
        <n-form-item label="昵称">
          <n-input v-model:value="profileForm.nickname" placeholder="设置一个昵称（可选）" maxlength="50" show-count />
        </n-form-item>
        <n-form-item label="头像 URL">
          <n-input v-model:value="profileForm.avatar" placeholder="输入头像图片链接（可选）" />
        </n-form-item>
        <div v-if="profileForm.avatar" style="margin-bottom: 16px; text-align: center;">
          <n-avatar :size="80" round :src="profileForm.avatar" />
          <n-text depth="3" style="display: block; font-size: 12px; margin-top: 8px;">头像预览</n-text>
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
    <n-modal v-model:show="showPasswordModal" preset="card" title="修改密码" style="width: 400px;" :mask-closable="false">
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
          <n-button type="primary" @click="changePassword" :loading="changingPassword" :disabled="!passwordForm.oldPassword || !passwordForm.newPassword || !passwordForm.confirmPassword" round>
            修改密码
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 12px; }
}
</style>
