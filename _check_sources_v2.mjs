// 二次检查：用 GET 请求模拟真实浏览器，排除 HEAD 请求被拒的假阳性
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const supabase = createClient(url, secretKey, { auth: { persistSession: false } })

async function checkUrl(u) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(u, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })
    clearTimeout(timeout)
    return { status: res.status, ok: res.status >= 200 && res.status < 500 }
  } catch (e) {
    if (e.name === 'AbortError') return { status: 'TIMEOUT', ok: false }
    return { status: 'ERROR', ok: false }
  }
}

async function main() {
  const { data: sources } = await supabase
    .from('info_sources')
    .select('id, name, url, section_title, region')
    .eq('region', 'domestic')
    .order('sort_order', { ascending: true })

  const toRecheck = sources.filter(s => {
    const u = s.url
    return u && !u.includes('rsshub.app') && u.length > 5
  })

  console.log(`二次检查 ${toRecheck.length} 个有网址的国内信息源（排除 RSSHub）\n`)

  const reallyDead = []
  const alive = []

  for (let i = 0; i < toRecheck.length; i++) {
    const s = toRecheck[i]
    const r = await checkUrl(s.url)
    if (r.ok) {
      alive.push({ name: s.name, status: r.status, url: s.url })
    } else {
      reallyDead.push({ name: s.name, status: r.status, url: s.url, section: s.section_title })
    }
  }

  console.log(`\n真正无法访问: ${reallyDead.length} 条`)
  console.log(`正常: ${alive.length} 条\n`)

  if (reallyDead.length) {
    console.log('--- 建议删除以下信息源 ---\n')
    for (const s of reallyDead) {
      console.log(`${s.name} [${s.status}]`)
      console.log(`  分类: ${s.section}`)
      console.log(`  URL: ${s.url}\n`)
    }
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
