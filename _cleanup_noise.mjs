// 清理数据库里"无 IP 商业角度"的英文新闻(选角/评论/回顾)
// 关键词清单与 app/api/cron/fetch-rss/route.ts 保持一致
// 用法:node _cleanup_noise.mjs

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const [k, ...v] = l.split('=')
      return [k.trim(), v.join('=').trim()]
    })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('缺少 SUPABASE_URL 或 SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const BLOCK_PATTERNS = [
  /\bto star (as|in)\b/i,
  /\bcast as\b/i,
  /\bstars? in\b/i,
  /\bjoins?\s+(the\s+)?(cast|film|movie|series)\b/i,
  /\b(manga|anime|movie|film|book|series) review\b/i,
  /^review[:\s]/i,
  /^retrospective[:\s]/i,
]

function isNoise(title) {
  return BLOCK_PATTERNS.some((p) => p.test(title))
}

async function main() {
  console.log('1) 拉取所有 articles 记录...')
  let allArticles = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('articles')
      .select('id, title, title_cn')
      .range(from, from + pageSize - 1)
    if (error) {
      console.error('查询失败:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    allArticles.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  console.log(`   总计 ${allArticles.length} 条`)

  const noise = allArticles.filter((a) => isNoise(a.title))
  console.log(`2) 命中过滤规则: ${noise.length} 条`)

  if (noise.length === 0) {
    console.log('无需清理')
    process.exit(0)
  }

  const processedNoise = noise.filter((a) => a.title_cn != null).length
  const unprocessedNoise = noise.length - processedNoise
  console.log(`   其中: 已处理 ${processedNoise} 条 | 未处理 ${unprocessedNoise} 条`)

  console.log('3) 抽样前 20 条待删标题:')
  noise.slice(0, 20).forEach((a, i) => {
    const flag = a.title_cn ? '[已处理]' : '[未处理]'
    console.log(`   ${i + 1}. ${flag} ${a.title.slice(0, 70)}`)
  })

  console.log('4) 批量删除...')
  const ids = noise.map((a) => a.id)
  let deleted = 0
  const batchSize = 100
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const { error } = await supabase.from('articles').delete().in('id', batch)
    if (error) {
      console.error(`批次 ${i / batchSize + 1} 删除失败: ${error.message}`)
    } else {
      deleted += batch.length
    }
  }
  console.log(`   已删除 ${deleted} / ${noise.length} 条`)

  console.log('5) 删除后剩余统计...')
  const { count: total } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
  const { count: pending } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .or('category.is.null,title_cn.is.null')
  console.log(`   剩余总数: ${total} 条 | 待处理: ${pending} 条`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
