<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import HomeHeader from '@/components/HomeHeader.vue'
import ChatView from '@/views/Chat.vue'
import LoginModal from '@/components/LoginModal.vue'

const router = useRouter()
const auth = useAuthStore()
const sidebarOpen = ref(true)
const showLogin = ref(false)

function newSearch() { router.push('/') }
function toggleHistory() { sidebarOpen.value = !sidebarOpen.value }
</script>

<template>
  <div class="h-screen flex flex-col bg-[#f8f9fa] dark:bg-[#0a0b0d] transition-colors">
    <HomeHeader :sidebar-open="sidebarOpen" @search="newSearch" @history="toggleHistory" />
    <div class="flex-1 min-h-0 flex">
      <ChatView :sidebar-open="sidebarOpen" @login="showLogin = true" />
    </div>
    <LoginModal v-model:show="showLogin" />
  </div>
</template>
