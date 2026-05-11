// 本地批量处理积压的新闻（Vercel Hobby 10秒超时不够，本地无限制）
// 用法：node _process_backlog.mjs
// 需要 .env.local 里的 SUPABASE_SECRET_KEY

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// 加载 .env.local
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
const LLM_BASE_URL = env.LLM_BASE_URL
const LLM_API_KEY = env.LLM_API_KEY
const LLM_MODEL = env.LLM_MODEL || 'gpt-5-mini'

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('缺少 SUPABASE_URL 或 SUPABASE_SECRET_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const SYSTEM_PROMPT = `你是一位动漫IP/ACG/文创行业的新闻编辑。请对以下英文新闻进行分析和处理：

任务：
1. 将标题翻译为简洁、吸引人的中文标题（不超过30字）
2. 用80字以内的中文写摘要，突出IP/授权/商业角度
3. 从以下5个分类中选一个最贴切的：新作发布、IP授权、潮玩谷子、产业动态、展会活动
4. 给出0-10的相关性评分（该新闻对IP/ACG商业决策的价值，7分以上为高价值）
5. 如果相关性评分 >= 7，标记为精选

请严格按以下JSON格式返回，不要添加任何其他文字：
{"title_cn":"...","summary_cn":"...","category":"...","relevance_score":7,"is_selected":true}`

const CATEGORIES = ['新作发布', 'IP授权', '潮玩谷子', '产业动态', '展会活动']

async function summarizeArticle(title) {
  if (!LLM_BASE_URL || !LLM_API_KEY) {
    console.warn('[LLM] 未配置，跳过')
    return null
  }

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `标题: ${title}` },
      ],
      temperature: 0.2,
      max_tokens: 600,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[LLM] API 错误:', res.status, text)
    return null
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content ?? ''
  if (!raw) return null

  const jsonMatch = raw.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) {
    console.warn('[LLM] 无 JSON:', raw.slice(0, 100))
    return null
  }

  const parsed = JSON.parse(jsonMatch[0])
  const category = CATEGORIES.includes(parsed.category) ? parsed.category : '产业动态'
  const relevance_score = Math.min(10, Math.max(0, Number(parsed.relevance_score) || 5))

  return {
    title_cn: String(parsed.title_cn || title).slice(0, 100),
    summary_cn: String(parsed.summary_cn || '').slice(0, 200),
    category,
    relevance_score,
    is_selected: relevance_score >= 7,
  }
}

async function main() {
  console.log('1) 查询未处理的新闻...')
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title')
    .is('title_cn', null)
    .order('published_at', { ascending: false })

  if (error) {
    console.error('查询失败:', error.message)
    process.exit(1)
  }

  if (!articles || articles.length === 0) {
    console.log('没有待处理的新闻')
    process.exit(0)
  }

  console.log(`   共 ${articles.length} 条待处理`)
  console.log()

  let ok = 0
  let fail = 0
  let skipped = 0

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]
    const progress = `[${i + 1}/${articles.length}]`

    try {
      const result = await summarizeArticle(article.title)

      if (!result) {
        // LLM 未配置 → 降级处理
        await supabase
          .from('articles')
          .update({
            title_cn: article.title.slice(0, 60),
            summary_cn: '',
            category: null,
            relevance_score: null,
            is_selected: false,
          })
          .eq('id', article.id)
        skipped++
        console.log(`${progress} ⚠️  LLM未配置/失败 → 降级 | ${article.title.slice(0, 50)}`)
        continue
      }

      await supabase
        .from('articles')
        .update({
          title_cn: result.title_cn,
          summary_cn: result.summary_cn,
          category: result.category,
          relevance_score: result.relevance_score,
          is_selected: result.is_selected,
        })
        .eq('id', article.id)

      ok++
      const flag = result.is_selected ? '⭐' : '  '
      console.log(
        `${progress} ${flag} ${result.category}(${result.relevance_score}) | ${result.title_cn.slice(0, 40)}`
      )
    } catch (e) {
      fail++
      console.error(`${progress} ❌ 失败: ${e.message} | ${article.title.slice(0, 40)}`)
    }

    // 每处理5条停1秒，避免API限流
    if ((i + 1) % 5 === 0 && i < articles.length - 1) {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  console.log()
  console.log('========== 处理完成 ==========')
  console.log(`成功: ${ok} | 降级: ${skipped} | 失败: ${fail} | 总计: ${articles.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
