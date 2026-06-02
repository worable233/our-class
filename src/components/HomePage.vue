<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Logo from '@/components/Logo.vue'
import LoginModal from '@/components/LoginModal.vue'
import { Plus, ArrowRight, Star, BarChart3, FileText, MessageSquare } from '@lucide/vue'

const router = useRouter()
const auth = useAuthStore()
auth.loadFromStorage()

const input = ref('')
const showLogin = ref(false)

function handleSubmit() {
  if (!input.value.trim()) return
  if (auth.isLoggedIn && auth.isTeacher) {
    router.push('/chat')
  } else if (auth.isLoggedIn) {
    showLogin.value = true
  } else {
    showLogin.value = true
  }
}
</script>

<template>
  <div class="h-screen w-full flex flex-col bg-white">
    <!-- Nav -->
    <header class="shrink-0 h-14 flex items-center justify-between px-6">
      <Logo :size="20" theme="light" />
      <div class="flex items-center gap-4">
        <button v-if="auth.isLoggedIn" class="text-sm text-gray-400 hover:text-gray-900 transition-colors" @click="router.push(auth.isTeacher ? '/teacher/points' : '/student/points')">进入系统</button>
        <button v-else class="text-sm text-gray-400 hover:text-gray-900 transition-colors" @click="showLogin = true">登录</button>
        <button class="text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 px-4 py-2 rounded-lg transition-colors" @click="showLogin = true">注册</button>
      </div>
    </header>

    <!-- Center -->
    <div class="flex-1 flex flex-col items-start justify-center px-6 max-w-6xl mx-auto w-full">
      <!-- Section label -->
      <div class="flex items-center gap-1 text-xs uppercase tracking-wide mb-4" style="font-family: var(--font-orbix);">
        <span class="text-[#5E6AD2]">/</span>
        <span class="text-gray-400">Welcome to OurClass</span>
      </div>
      <h1 class="text-[clamp(2rem,4vw,3rem)] font-medium leading-[1.2] tracking-tight text-gray-900 mb-3" style="font-family: 'Inter Tight', sans-serif;">班级管理系统</h1>

      <div class="flex flex-wrap items-center gap-2 mt-10">
        <button class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors" @click="auth.isLoggedIn && auth.isTeacher ? router.push('/chat') : showLogin = true"><Star :size="14" />积分管理</button>
        <button class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors" @click="auth.isLoggedIn && auth.isTeacher ? router.push('/chat') : showLogin = true"><BarChart3 :size="14" />成绩分析</button>
        <button class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors" @click="auth.isLoggedIn && auth.isTeacher ? router.push('/chat') : showLogin = true"><FileText :size="14" />作业管理</button>
        <button class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors" @click="auth.isLoggedIn && auth.isTeacher ? router.push('/chat') : showLogin = true"><MessageSquare :size="14" />班级圈</button>
      </div>
    </div>

    <!-- Composer -->
    <div class="shrink-0 px-4 pb-3">
      <div class="max-w-[48rem] mx-auto">
        <div class="relative border border-gray-200 rounded-2xl bg-gray-50 p-1.5 grid grid-cols-[auto_1fr_auto] items-end gap-1">
          <button class="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0">
            <Plus :size="18" />
          </button>
          <textarea
            v-model="input"
            rows="1"
            placeholder="输入你想了解的功能..."
            class="w-full resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none py-1.5 leading-5"
            @keydown.enter.prevent="handleSubmit"
          />
          <button
            class="h-8 w-8 flex items-center justify-center rounded-full text-white transition-colors shrink-0"
            :class="input.trim() ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-200'"
            :disabled="!input.trim()"
            @click="handleSubmit"
          >
            <ArrowRight :size="16" />
          </button>
        </div>
        <p class="text-xs text-gray-300 text-center mt-2">内容由 AI 生成，仅供参考</p>
      </div>
      </div>
    </div>

    <!-- Login Modal -->
    <LoginModal v-model:show="showLogin" />
</template>
