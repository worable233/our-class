import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const KEY = JSON.parse(readFileSync('/Users/worable/.claude/settings.local.json','utf-8')).env.MIMO_API_KEY

const b = await chromium.connectOverCDP('http://127.0.0.1:9222')
const p = (await b.contexts()[0]?.pages())?.find(x => x.url().includes('5173'))
await p.goto('http://localhost:5173/teacher/traffic')
await p.waitForTimeout(8000)
await p.screenshot({path:'/tmp/_g.png'})

const r = await fetch('https://api.xiaomimimo.com/v1/chat/completions',{
  method:'POST',headers:{'Content-Type':'application/json','api-key':KEY},
  body:JSON.stringify({model:'mimo-v2.5',messages:[{role:'user',content:[{type:'text',text:'这个3D地球:1.能看到国家轮廓线吗?2.国家的填充色是什么?3.整体是半透明青绿风格吗?逐条回答'},{type:'image_url',image_url:{url:'data:image/png;base64,'+readFileSync('/tmp/_g.png').toString('base64')}}]}],max_tokens:200})
})
const d = await r.json()
console.log(d.choices?.[0]?.message?.content||'FAIL')
await b.close()
