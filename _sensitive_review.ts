// 敏感内容关键词检测：无需 LLM，纯关键词匹配
// 用法：npx tsx _sensitive_review.ts

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const envContent = readFileSync('.env.local', 'utf8')
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=')
  if (idx > 0) {
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key && !process.env[key]) process.env[key] = value
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const SENSITIVE_RULES = [
  // 国家主权与领土完整
  { tag: '台湾问题', patterns: [/台湾独立|台独|一中一台|两个中国|一中一臺|台湾主权|台湾自决|台湾共和国/i] },
  { tag: '西藏问题', patterns: [/西藏独立|西藏主权|东突厥斯坦/i] },
  { tag: '香港问题', patterns: [/香港独立|香港主权|香港自治|香港自决|光复香港/i] },
  { tag: '新疆问题', patterns: [/新疆独立|东伊运|新疆分裂/i] },
  // LGBT
  { tag: 'LGBT', patterns: [/LGBTQ?[A-Z]?|同性恋|同性婚姻|跨性别|transgender|queer\b|性别认同|性别重置|彩虹旗|🌈|出柜|性取向|酷儿/i] },
  // 政治敏感
  { tag: '政治敏感', patterns: [/法轮功|falun\s*gong|法輪功|六四|天安门事件|八九学[潮运]|民主运动/i] },
  { tag: '宗教极端', patterns: [/宗教极端|圣战|伊斯兰国|ISIS|基地组织/i] },
  { tag: '种族', patterns: [/种族主义|种族隔离|白人至上|黑命贵|BLM|纳粹|新纳粹/i] },
  { tag: '战争冲突', patterns: [/核武器|生化武器|大规模杀伤性武器/i] },
]

async function main() {
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, title_cn, category')
    .order('published_at', { ascending: false })
    .limit(500)

  if (error) { console.error('查询失败:', error.message); process.exit(1) }
  if (!articles?.length) { console.log('没有文章'); process.exit(0) }

  console.log(`共 ${articles.length} 条，纯关键词检测，无需 LLM\n`)

  let flagged = 0
  let skipped = 0

  for (const article of articles) {
    const title = article.title_cn || article.title || ''
    if (!title) { skipped++; continue }

    if (article.category === '待分类') { skipped++; continue }

    const matched = SENSITIVE_RULES.find((r) =>
      r.patterns.some((p) => p.test(title))
    )

    if (matched) {
      const { error: updateError } = await supabase
        .from('articles')
        .update({ category: '待分类' })
        .eq('id', article.id)

      if (updateError) {
        console.log(`❌ 更新失败: ${updateError.message.slice(0, 60)} | ${title.slice(0, 30)}`)
      } else {
        console.log(`🚩 [${matched.tag}] ${article.category} → 待分类 | ${title.slice(0, 50)}`)
        flagged++
      }
    }
  }

  console.log(`\n==============================`)
  console.log(`标记: ${flagged} | 原待分类/跳过: ${skipped}`)
  console.log(`==============================`)
}

main().catch((e) => { console.error(e); process.exit(1) })
