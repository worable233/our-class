<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Logo from '@/components/Logo.vue'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [v: boolean] }>()

const router = useRouter()
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
    const user = await auth.login(username.value, password.value)
    emit('update:show', false)
    router.push(user.role === 'teacher' ? '/teacher/points' : '/student/points')
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
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/20 dark:bg-black/50 backdrop-blur-sm"
      @click.self="emit('update:show', false)"
    >
      <div class="w-[400px] bg-white dark:bg-[#121314] rounded-2xl shadow-xl dark:shadow-2xl border border-gray-100 dark:border-white/6 p-8 animate-[fadeIn_0.2s_ease-out]">
        <div class="text-center mb-6">
          <div class="flex justify-center mb-3">
            <Logo :size="44" :theme="isDark ? 'dark' : 'light'" />
          </div>
          <h2 class="text-xl font-bold tracking-tight text-gray-900 dark:text-[#f5f9fe]">OurClass</h2>
          <p class="text-sm text-gray-400 dark:text-[#787d87] mt-1">班级管理系统</p>
        </div>

        <form @submit.prevent="handleLogin()" class="flex flex-col gap-3">
          <div>
            <label class="text-xs font-medium text-gray-400 dark:text-[#a6aab5] block mb-1.5">用户名</label>
            <input
              v-model="username"
              placeholder="输入用户名..."
              :disabled="loading"
              class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/6 bg-white dark:bg-[#0a0b0d] text-sm text-gray-900 dark:text-[#f5f9fe] placeholder-gray-300 dark:placeholder-[#555] outline-none focus:border-gray-400 dark:focus:border-white/20 transition-colors disabled:opacity-50"
            />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-400 dark:text-[#a6aab5] block mb-1.5">密码</label>
            <input
              v-model="password"
              type="password"
              placeholder="输入密码..."
              :disabled="loading"
              class="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/6 bg-white dark:bg-[#0a0b0d] text-sm text-gray-900 dark:text-[#f5f9fe] placeholder-gray-300 dark:placeholder-[#555] outline-none focus:border-gray-400 dark:focus:border-white/20 transition-colors disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            :disabled="loading || !username || !password"
            class="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gray-900 dark:bg-[#5E6AD2] hover:bg-gray-800 dark:hover:bg-[#7C7FDC] disabled:bg-gray-200 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-[#555] transition-colors"
          >
            <span v-if="loading" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
            {{ loading ? '登录中...' : '进入系统' }}
          </button>
        </form>

        <p v-if="error" class="text-sm text-red-400 text-center mt-4">{{ error }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style>
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.97) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
