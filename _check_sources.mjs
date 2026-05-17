// 批量检查国内信息源的可访问性
// 用法: node _check_sources.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !secretKey) {
  console.error('缺少环境变量: NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function checkUrl(u) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15秒超时
    const res = await fetch(u, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    clearTimeout(timeout)
    return { status: res.status, ok: res.status >= 200 && res.status < 400 }
  } catch (e) {
    if (e.name === 'AbortError') {
      return { status: 'TIMEOUT', ok: false }
    }
    return { status: 'ERROR', ok: false, msg: e.message }
  }
}

async function main() {
  console.log('1) 查询国内信息源...')
  const { data: sources, error } = await supabase
    .from('info_sources')
    .select('id, name, url, section_title')
    .eq('region', 'domestic')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('查询失败:', error.message)
    process.exit(1)
  }

  console.log(`   共 ${sources.length} 条国内信息源\n`)

  const okList = []
  const failList = []

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]
    console.log(`[${i + 1}/${sources.length}] ${s.name}`)
    console.log(`    URL: ${s.url}`)

    const result = await checkUrl(s.url)
    console.log(`    状态: ${result.status} ${result.ok ? '✓' : '✗'}`)

    if (result.ok) {
      okList.push({ ...s, status: result.status })
    } else {
      failList.push({ ...s, status: result.status, msg: result.msg })
    }
  }

  console.log('\n========================================')
  console.log('检查结果汇总')
  console.log('========================================')
  console.log(`正常: ${okList.length} 条`)
  console.log(`异常: ${failList.length} 条`)
  console.log('')

  if (failList.length > 0) {
    console.log('--- 异常列表 ---\n')
    for (const s of failList) {
      console.log(`[${s.status}] ${s.name}`)
      console.log(`    分类: ${s.section_title}`)
      console.log(`    URL: ${s.url}`)
      if (s.msg) console.log(`    错误: ${s.msg}`)
      console.log('')
    }
  }

  if (okList.length > 0) {
    console.log('--- 正常列表 ---\n')
    for (const s of okList) {
      console.log(`[${s.status}] ${s.name} (${s.url})`)
    }
  }
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
