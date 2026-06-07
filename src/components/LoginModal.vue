<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import Logo from '@/components/Logo.vue'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [v: boolean] }>()

const auth = useAuthStore()
const { isDark } = useTheme()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!username.value || !password.value) return
  loading.value = true
  error.value = ''
  try {
    await auth.login(username.value, password.value)
    emit('update:show', false)
  } catch (e: unknown) {
    error.value = (e instanceof Error ? e.message : '') || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="login-overlay"
      @click.self="emit('update:show', false)"
    >
      <div class="login-card">
        <div class="login-head">
          <div class="login-logo">
            <Logo :size="44" :theme="isDark ? 'dark' : 'light'" />
          </div>
          <h2 class="login-title">OurClass</h2>
          <p class="login-subtitle">班级管理系统</p>
        </div>

        <form class="login-form" @submit.prevent="handleLogin()">
          <div class="login-field">
            <label class="login-label">用户名</label>
            <input
              v-model="username"
              class="login-input"
              placeholder="输入用户名..."
              :disabled="loading"
            />
          </div>
          <div class="login-field">
            <label class="login-label">密码</label>
            <input
              v-model="password"
              type="password"
              class="login-input"
              placeholder="输入密码..."
              :disabled="loading"
            />
          </div>

          <div v-if="error" class="login-error">{{ error }}</div>

          <button
            type="submit"
            class="login-btn"
            :class="{ loading }"
            :disabled="loading || !username || !password"
          >
            <span v-if="loading" class="login-spinner" />
            {{ loading ? '登录中...' : '进入系统' }}
          </button>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.login-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.2);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
:root.dark .login-overlay {
  background: rgba(0,0,0,0.5);
}

.login-card {
  width: 90vw;
  max-width: 400px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,0.06);
  box-shadow: 0 8px 40px rgba(0,0,0,0.12);
  padding: 28px 28px 24px;
  animation: fadeIn 0.2s ease-out;
}
:root.dark .login-card {
  background: #121314;
  border-color: rgba(255,255,255,0.06);
  box-shadow: 0 8px 40px rgba(0,0,0,0.4);
}

.login-head {
  text-align: center;
  margin-bottom: 24px;
}
.login-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}
.login-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
  color: #1a1a2e;
}
:root.dark .login-title {
  color: #f5f9fe;
}
.login-subtitle {
  font-size: 13px;
  margin: 4px 0 0;
  color: #787d87;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.login-field {
  margin-bottom: 16px;
}
.login-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #a6aab5;
  margin-bottom: 6px;
}
.login-input {
  display: block;
  width: 100%;
  padding: 9px 12px;
  font-size: 14px;
  font-family: inherit;
  color: #1a1a2e;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
}
.login-input::placeholder { color: #bbb; }
.login-input:focus {
  border-color: #5E6AD2;
  box-shadow: 0 0 0 2px rgba(94,106,210,0.2);
}
.login-input:disabled { opacity: 0.5; }
:root.dark .login-input {
  color: #f5f9fe;
  background: #0a0b0d;
  border-color: rgba(255,255,255,0.1);
}
:root.dark .login-input::placeholder { color: #555; }
:root.dark .login-input:focus {
  border-color: #5E6AD2;
  box-shadow: 0 0 0 2px rgba(94,106,210,0.3);
}

.login-error {
  font-size: 13px;
  color: #f0a020;
  background: rgba(240,160,32,0.1);
  border: 1px solid rgba(240,160,32,0.25);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 16px;
  text-align: center;
}

.login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 0;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  color: #fff;
  background: #5E6AD2;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}
.login-btn:hover { background: #7C7FDC; }
.login-btn:active { background: #4D59C2; }
.login-btn:disabled {
  background: #e0e0e0;
  color: #bbb;
  cursor: not-allowed;
}
.login-btn.loading:disabled {
  background: #5E6AD2;
  opacity: 0.7;
}
:root.dark .login-btn:disabled {
  background: rgba(255,255,255,0.1);
  color: #555;
}

.login-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.97) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
