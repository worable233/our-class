import { ref, readonly } from 'vue'

const hasUpdate = ref(false)
const latestSha = ref('')
const commits = ref<{ hash: string; message: string; author: string; date: string }[]>([])

export function useUpdateChecker() {
  return {
    hasUpdate: readonly(hasUpdate),
    latestSha: readonly(latestSha),
    commits: readonly(commits),
    setUpdate(behind: boolean, sha: string, cmts: { hash: string; message: string; author: string; date: string }[]) {
      hasUpdate.value = behind
      latestSha.value = sha
      commits.value = cmts || []
    },
    clearUpdate() {
      hasUpdate.value = false
      latestSha.value = ''
      commits.value = []
    },
  }
}
