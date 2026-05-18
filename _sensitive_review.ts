// 敏感内容审查：对已入库文章按新约束重新检测，涉及敏感话题的强制改为"待分类"
// 用法：npx tsx _sensitive_review.ts

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
  const { summarizeArticle } = await import('./lib/llm.js')

  // 读取所有已入库文章（按时间倒序，最新优先）
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, title_cn, category, relevance_score')
    .order('published_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('查询失败:', error.message)
    process.exit(1)
  }

  if (!articles || articles.length === 0) {
    console.log('没有文章需要审查')
    process.exit(0)
  }

  console.log(`找到 ${articles.length} 条文章待审查`)
  console.log(`模型: ${process.env.LLM_MODEL || 'gpt-5-mini'}`)
  console.log()

  let flagged = 0
  let clean = 0
  let failed = 0

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]
    const tag = `[${i + 1}/${articles.length}]`

    try {
      // 只传 title 重新跑分类（老数据可能没有原文内容）
      const result = await summarizeArticle(article.title, '')

      if (!result) {
        console.log(`${tag} ❌ LLM 返回空 | ${article.title_cn?.slice(0, 40) || article.title.slice(0, 40)}`)
        failed++
        continue
      }

      // 如果新分类是"待分类"，且当前分类不是"待分类"，说明触发了敏感内容约束
      if (result.category === '待分类' && article.category !== '待分类') {
        const { error: updateError } = await supabase
          .from('articles')
          .update({
            category: '待分类',
            relevance_score: result.relevance_score,
            is_selected: result.is_selected,
            commentary: result.commentary,
          })
          .eq('id', article.id)

        if (updateError) {
          console.log(`${tag} ❌ 更新失败: ${updateError.message}`)
          failed++
        } else {
          console.log(`${tag} 🚩 标记为待分类 | 原分类:${article.category} | ${article.title_cn?.slice(0, 40) || article.title.slice(0, 40)}`)
          flagged++
        }
      } else if (result.category === '待分类' && article.category === '待分类') {
        console.log(`${tag} ✓ 原本就是待分类`)
        clean++
      } else {
        console.log(`${tag} ✓ ${result.category}(${result.relevance_score}) | ${result.title_cn?.slice(0, 40)}`)
        clean++
      }
    } catch (e) {
      console.log(`${tag} ❌ ${e instanceof Error ? e.message : String(e)}`)
      failed++
    }

    // 每次请求间隔 1.5 秒，避免 API 限流
    if (i < articles.length - 1) {
      await new Promise((r) => setTimeout(r, 1500))
    }
  }

  console.log()
  console.log('====================================')
  console.log(`标记为待分类: ${flagged} | 正常: ${clean} | 失败: ${failed}`)
  console.log('====================================')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
