import { readFileSync } from 'fs'

const KEY = JSON.parse(readFileSync('/Users/worable/.claude/settings.local.json','utf-8')).env.MIMO_API_KEY
const our = readFileSync('/tmp/our_globe.png').toString('base64')
const chaitin = readFileSync('/Users/worable/Documents/大作业/our-class/_screenshot_chaitin.png').toString('base64')

const res = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
  method:'POST', headers:{'Content-Type':'application/json','api-key':KEY},
  body: JSON.stringify({
    model:'mimo-v2.5',
    messages:[{role:'user',content:[
      {type:'text',text:'对比这两张3D地球截图。图A是雷池WAF，图B是OurClass。逐条列出所有视觉差异，给出具体的颜色值、透明度、风格差异。重点：地球颜色、hexagon网格颜色、大陆填充色、整体质感。'},
      {type:'image_url',image_url:{url:'data:image/png;base64,'+chaitin}},
      {type:'image_url',image_url:{url:'data:image/png;base64,'+our}},
    ]}],
    max_tokens:2048
  })
})
const d = await res.json()
console.log(d.choices?.[0]?.message?.content || JSON.stringify(d.error||'FAIL'))
