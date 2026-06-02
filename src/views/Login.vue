<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { NButton, NCard, NInput, NForm, NText, NDivider } from 'naive-ui'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const loading = ref(false)
const error = ref('')

const demoAccounts = [
  { label: '张老师', value: 'teacher1', role: 'teacher' },
  { label: '张明（学生）', value: 'zhangming', role: 'student' },
  { label: '李华（学生）', value: 'lihua', role: 'student' },
  { label: '王芳（学生）', value: 'wangfang', role: 'student' },
]

async function handleLogin(val?: string) {
  const name = val || username.value
  if (!name) return
  loading.value = true
  error.value = ''
  try {
    const user = await auth.login(name, '123456')
    router.push(user.role === 'teacher' ? '/teacher/points' : '/student/points')
  } catch (e: unknown) {
    error.value = (e instanceof Error ? e.message : '') || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-bg" />
    <n-card class="login-card" :bordered="true" size="large">
      <div class="login-header">
        <div class="login-logo">
          <span class="logo-icon">O</span>
        </div>
        <h1 class="login-title">OurClass</h1>
        <p class="login-subtitle">班级管理系统</p>
      </div>

      <div class="login-body">
        <div class="input-group">
          <n-text depth="3" class="input-label">选择账号登录</n-text>
          <div class="account-list">
            <n-button
              v-for="acc in demoAccounts"
              :key="acc.value"
              class="account-btn"
              @click="handleLogin(acc.value)"
              :disabled="loading"
              block
            >
              <span class="account-avatar" :class="{ teacher: acc.role === 'teacher' }">{{ acc.label.charAt(0) }}</span>
              <span class="account-info">
                <span class="account-name">{{ acc.label }}</span>
                <span class="account-role-badge" :class="acc.role">{{ acc.role === 'teacher' ? '教师' : '学生' }}</span>
              </span>
            </n-button>
          </div>
        </div>

        <n-divider>或直接输入用户名</n-divider>

        <n-form @submit.prevent="handleLogin()" class="login-form">
          <div class="input-group">
            <n-text depth="3" class="input-label">用户名</n-text>
            <n-input
              v-model:value="username"
              placeholder="输入用户名..."
              :disabled="loading"
              clearable
            />
          </div>
          <n-button
            type="primary"
            block
            :disabled="loading || !username"
            :loading="loading"
            attr-type="submit"
          >
            进入系统
          </n-button>
        </n-form>

        <n-text v-if="error" type="error" class="login-error">{{ error }}</n-text>
      </div>
    </n-card>
  </div>
</template>

<style>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.login-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.login-card {
  width: 400px;
}

.login-header {
  text-align: center;
  padding-top: 8px;
  padding-bottom: 8px;
}

.login-logo {
  margin-bottom: 16px;
}

.logo-icon {
  display: inline-flex;
  width: 52px;
  height: 52px;
  border-radius: 8px;
  background: linear-gradient(135deg, #5E6AD2, #7C5CFC);
  align-items: center;
  justify-content: center;
  font-size: 26px;
  color: white;
  font-weight: 700;
}

.login-title {
  font-family: 'Inter Tight', sans-serif;
  font-weight: 700;
  font-size: 24px;
  letter-spacing: -0.03em;
  margin: 0 0 4px;
}

.login-subtitle {
  font-size: 14px;
  margin: 0;
}

.input-group {
  margin-bottom: 16px;
}

.input-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 8px;
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.account-btn {
  height: auto !important;
  padding: 10px 16px !important;
}

.account-btn .n-button__content {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  width: 100% !important;
}

.account-avatar {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: #5E6AD2;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 15px;
  flex-shrink: 0;
}

.account-avatar.teacher {
  background: #7C5CFC;
}

.account-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.account-name {
  font-size: 14px;
  font-weight: 500;
  text-align: left;
}

.account-role-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 100px;
  display: inline-block;
  width: fit-content;
  font-weight: 500;
}

.account-role-badge.teacher {
  background: rgba(124, 92, 252, 0.12);
  color: #7C5CFC;
}

.account-role-badge.student {
  background: rgba(94, 106, 210, 0.12);
  color: #5E6AD2;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-error {
  display: block;
  margin-top: 16px;
  font-size: 13px;
  text-align: center;
}
</style>
