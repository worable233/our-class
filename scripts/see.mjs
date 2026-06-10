import { readFileSync } from 'fs'
const KEY = JSON.parse(readFileSync('/Users/worable/.claude/settings.local.json','utf-8')).env.MIMO_API_KEY
const b64 = readFileSync('/tmp/_g.png').toString('base64')
const r = await fetch('https://api.xiaomimimo.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','api-key':KEY},body:JSON.stringify({model:'mimo-v2.5',messages:[{role:'user',content:[{type:'text',text:'这张3D地球上能看到红色或黄色的多边形吗？还是只有青绿球体？20字'},{type:'image_url',image_url:{url:'data:image/png;base64,'+b64}}]}],max_tokens:50})})
const d = await r.json()
console.log(d.choices?.[0]?.message?.content||JSON.stringify(d.error||'FAIL'))
