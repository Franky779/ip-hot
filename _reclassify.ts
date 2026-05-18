// 批量重分类：对 category='待分类' 的文章重新跑 LLM 分类
// 用法：npx tsx _reclassify.ts

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// 加载 .env.local
const envContent = readFileSync('.env.local', 'utf8')
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=')
  if (idx > 0) {
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key && !process.env[key]) process.env[key] = value
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function main() {
  // 动态 import lib/llm.ts（确保环境变量先设置好）
  const { summarizeArticle } = await import('./lib/llm.js')
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title')
    .eq('category', '待分类')
    .order('published_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('查询失败:', error.message)
    process.exit(1)
  }

  if (!articles || articles.length === 0) {
    console.log('没有待分类的文章')
    process.exit(0)
  }

  console.log(`找到 ${articles.length} 条待分类文章`)
  console.log(`模型: ${process.env.LLM_MODEL || 'gpt-5-mini'}`)
  console.log()

  let success = 0
  let failed = 0
  let unchanged = 0

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]
    const tag = `[${i + 1}/${articles.length}]`

    try {
      const result = await summarizeArticle(article.title, '')

      if (!result) {
        console.log(`${tag} ❌ LLM 返回空`)
        failed++
        continue
      }

      if (result.category === '待分类') {
        console.log(`${tag} ⏭️  仍为待分类 | ${result.title_cn.slice(0, 40)}`)
        unchanged++
        continue
      }

      const { error: updateError } = await supabase
        .from('articles')
        .update({
          title_cn: result.title_cn,
          summary_cn: result.summary_cn,
          category: result.category,
          relevance_score: result.relevance_score,
          is_selected: result.is_selected,
          commentary: result.commentary,
        })
        .eq('id', article.id)

      if (updateError) {
        console.log(`${tag} ❌ 更新失败: ${updateError.message}`)
        failed++
      } else {
        const star = result.is_selected ? '⭐' : '  '
        console.log(`${tag} ${star} ${result.category}(${result.relevance_score}) | ${result.title_cn.slice(0, 40)}`)
        success++
      }
    } catch (e) {
      console.log(`${tag} ❌ ${e instanceof Error ? e.message : String(e)}`)
      failed++
    }

    if (i < articles.length - 1) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  console.log()
  console.log('====================================')
  console.log(`成功归类: ${success} | 仍为待分类: ${unchanged} | 失败: ${failed}`)
  console.log('====================================')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
