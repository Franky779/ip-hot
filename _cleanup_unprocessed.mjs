// 删除所有未处理/处理失败的文章（category IS NULL 或 title_cn IS NULL）
// 用法：node _cleanup_unprocessed.mjs

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

async function main() {
  console.log('1) 查询所有未处理/失败记录（category IS NULL 或 title_cn IS NULL）...')
  let unprocessed = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('articles')
      .select('id, title, category, title_cn')
      .or('category.is.null,title_cn.is.null')
      .range(from, from + pageSize - 1)
    if (error) {
      console.error('查询失败:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    unprocessed.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  console.log(`   待删除: ${unprocessed.length} 条`)

  if (unprocessed.length === 0) {
    console.log('无需清理')
    process.exit(0)
  }

  console.log('2) 抽样前 20 条待删标题:')
  unprocessed.slice(0, 20).forEach((a, i) => {
    console.log(`   ${i + 1}. ${a.title.slice(0, 70)}`)
  })

  console.log('3) 批量删除...')
  const ids = unprocessed.map((a) => a.id)
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
  console.log(`   已删除 ${deleted} / ${unprocessed.length} 条`)

  console.log('4) 删除后剩余统计...')
  const { count: total } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
  const { count: pending } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .or('category.is.null,title_cn.is.null')
  console.log(`   剩余总数: ${total} 条 | 仍未处理: ${pending} 条`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
