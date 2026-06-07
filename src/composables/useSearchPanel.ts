import { ref } from 'vue'

const show = ref(false)
const results = ref<{ title: string; url: string; snippet: string }[]>([])
const favicons = ref<string[]>([])

async function loadFavicons() {
  favicons.value = results.value.map(() => '')
  for (let i = 0; i < results.value.length; i++) {
    try {
      const res = await fetch(`https://uapis.cn/api/v1/webparse/metadata?url=${encodeURIComponent(results.value[i]!.url)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.favicon_url) favicons.value[i] = data.favicon_url
      }
    } catch {}
    if (i < results.value.length - 1) await new Promise(r => setTimeout(r, 600))
  }
}

export function useSearchPanel() {
  function setResults(data: { title: string; url: string; snippet: string }[]) {
    results.value = data
    loadFavicons()
  }
  function open() {
    show.value = true
  }
  function close() { show.value = false }
  return { show, results, favicons, setResults, open, close }
}
