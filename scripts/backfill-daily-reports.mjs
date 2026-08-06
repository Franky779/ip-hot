// scripts/backfill-daily-reports.mjs
// 一次性预生成所有日报/周报/月报，写入 daily_reports 缓存表
// 用法：服务器上 source .env.production.local && node scripts/backfill-daily-reports.mjs

import pg from 'pg'

const { Pool } = pg

// ─── 配置 ─────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ 请先设置 DATABASE_URL 环境变量')
  console.error('   source .env.production.local && node scripts/backfill-daily-reports.mjs')
  process.exit(1)
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 3 })

const LLM_PROVIDERS = [
  { name: 'DeepSeek', baseUrl: process.env.LLM_BASE_URL, apiKey: process.env.LLM_API_KEY, model: process.env.LLM_MODEL || 'deepseek-v4-flash', attempts: 3 },
  { name: 'Kimi', baseUrl: process.env.LLM_BACKUP_URL, apiKey: process.env.LLM_BACKUP_KEY, model: process.env.LLM_BACKUP_MODEL || 'kimi-k2.6', attempts: 2 },
  { name: 'Kimi Coding', baseUrl: process.env.LLM_BACKUP2_URL, apiKey: process.env.LLM_BACKUP2_KEY, model: process.env.LLM_BACKUP2_MODEL || 'kimi-for-coding', attempts: 2 },
].filter(p => p.baseUrl && p.apiKey)

const PUBLIC_CATEGORIES = [
  '创作/上新', 'IP/品牌/授权', '潮玩谷子', '零售/渠道',
  '影视综艺', '游戏/体育', 'AI/新技术', '展会活动',
  '文旅及商品', '艺术/亚文化', '政策规则', '版权保护',
]

const PERIODS = ['daily', 'weekly', 'monthly']

// ─── 工具函数 ─────────────────────────────────────────────────

function toPeriodDate(period, d) {
  const date = new Date(d)
  if (period === 'daily') return date.toISOString().slice(0, 10)
  if (period === 'weekly') {
    const day = date.getDay()
    const diff = day === 0 ? -6 : 1 - day
    date.setDate(date.getDate() + diff)
    return date.toISOString().slice(0, 10)
  }
  date.setDate(1)
  return date.toISOString().slice(0, 10)
}

function formatPeriodLabel(period, dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const y = d.getFullYear(), m = d.getMonth() + 1
  if (period === 'daily') return `${y}年${m}月${d.getDate()}日`
  if (period === 'weekly') return `${y}年${m}月 - 第${Math.ceil(d.getDate() / 7)}周`
  return `${y}年${m}月`
}

function getPeriodRange(period, dateStr) {
  const start = new Date(dateStr + 'T00:00:00')
  const end = new Date(dateStr + 'T00:00:00')
  if (period === 'daily') {
    end.setHours(23, 59, 59, 999)
  } else if (period === 'weekly') {
    end.setDate(end.getDate() + 6)
    end.setHours(23, 59, 59, 999)
  } else {
    end.setMonth(end.getMonth() + 1)
    end.setDate(0)
    end.setHours(23, 59, 59, 999)
  }
  return { start, end }
}

function buildCategoryGroups(articles) {
  const map = {}
  for (const a of articles) {
    const cat = a.category || '其他'
    if (!map[cat]) map[cat] = []
    map[cat].push({ id: a.id, title_cn: a.title_cn, url: a.url, category: cat })
  }
  return PUBLIC_CATEGORIES.filter(c => map[c] && map[c].length > 0)
    .map(c => ({ category: c, count: map[c].length, articles: map[c] }))
}

// ─── 数据库查询 ───────────────────────────────────────────────

async function getAvailableDates(period) {
  const { rows } = await pool.query(
    `SELECT published_at FROM articles
     WHERE published_at IS NOT NULL
       AND category IS NOT NULL
       AND category NOT IN ('待分类', '待人工复核')
     ORDER BY published_at DESC
     LIMIT 5000`
  )
  const seen = new Set()
  const result = []
  for (const row of rows) {
    const key = toPeriodDate(period, row.published_at)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(key)
  }
  return result
}

async function getArticlesForPeriod(period, dateStr) {
  const { start, end } = getPeriodRange(period, dateStr)
  const { rows } = await pool.query(
    `SELECT id, title_cn, url, category FROM articles
     WHERE title_cn IS NOT NULL
       AND category IS NOT NULL
       AND published_at >= $1 AND published_at <= $2
       AND category NOT IN ('待分类', '待人工复核')
     ORDER BY published_at DESC
     LIMIT 500`,
    [start.toISOString(), end.toISOString()]
  )
  return rows
}

async function checkCache(period, dateStr) {
  const { rows } = await pool.query(
    `SELECT summary FROM daily_reports WHERE period = $1 AND period_date = $2`,
    [period, dateStr]
  )
  return rows.length > 0 && rows[0].summary
}

async function writeCache(period, dateStr, summary, highlights, categoryCounts, articles, totalCount) {
  await pool.query(
    `INSERT INTO daily_reports (period, period_date, summary, highlights, category_counts, article_data, total_count, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (period, period_date) DO UPDATE SET
       summary = EXCLUDED.summary, highlights = EXCLUDED.highlights,
       category_counts = EXCLUDED.category_counts, article_data = EXCLUDED.article_data,
       total_count = EXCLUDED.total_count, created_at = NOW()`,
    [period, dateStr, summary, highlights, JSON.stringify(categoryCounts), JSON.stringify(articles), totalCount]
  )
}

// ─── LLM 调用 ─────────────────────────────────────────────────

async function callLLM(prompt) {
  const systemPrompt = `你是一位资深IP行业分析师，负责撰写每日/每周/每月的IP行业资讯汇总。你的写作风格：犀利、有洞察、口语化，像一位懂行的朋友在聊天。避免套话、官腔、AI味。

请严格按以下JSON格式返回，不要添加任何其他文字：
{"summary":"2-3段分析文字(每段不超过200字)，总结该周期IP行业动态趋势、值得关注的变化、以及背后的行业信号","highlights":"2-3条本期最值得关注的资讯要点，每条以"• "开头，每条不超过60字，用换行分隔"}`

  for (const provider of LLM_PROVIDERS) {
    for (let i = 0; i < provider.attempts; i++) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 90_000)
        const endpoint = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`
        const res = await fetch(endpoint, {
          signal: controller.signal, method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
          body: JSON.stringify({
            model: provider.model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
            temperature: 0.5, max_tokens: 2000,
          }),
        })
        clearTimeout(timeout)
        if (!res.ok) { await res.text(); throw new Error(`API ${res.status}`) }
        const data = await res.json()
        const raw = data.choices?.[0]?.message?.content ?? ''
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error(`No JSON in response`)
        return JSON.parse(jsonMatch[0])
      } catch (e) {
        console.warn(`  [LLM] ${provider.name} #${i + 1} 失败: ${e.message?.slice(0, 80)}`)
      }
      if (i < provider.attempts - 1) await new Promise(r => setTimeout(r, 2000))
    }
  }
  return null
}

function buildPrompt(period, dateStr, categoryGroups) {
  const label = formatPeriodLabel(period, dateStr)
  const lines = [`以下是${label}IP行业资讯的分类汇总：`, '']
  for (const g of categoryGroups) {
    lines.push(`【${g.category}】（${g.count}条）`)
    for (const a of g.articles) lines.push(`  - ${a.title_cn}`)
    lines.push('')
  }
  lines.push(`请基于以上资讯，撰写${label}IP行业动态分析。`)
  return lines.join('\n')
}

// ─── 主流程 ───────────────────────────────────────────────────

async function main() {
  console.log(`LLM 可用: ${LLM_PROVIDERS.map(p => p.name).join(', ')}`)
  if (!LLM_PROVIDERS.length) { console.error('❌ 没有可用的 LLM 配置'); process.exit(1) }

  const totalStart = Date.now()
  let totalGen = 0, totalSkip = 0, totalFail = 0

  for (const period of PERIODS) {
    console.log(`\n━━━ ${period} ━━━`)
    const dates = await getAvailableDates(period)
    console.log(`${dates.length} 个周期`)

    for (let i = 0; i < dates.length; i++) {
      const dateStr = dates[i]
      const label = `[${String(i + 1).padStart(String(dates.length).length, '0')}/${dates.length}] ${period} ${dateStr}`

      // 跳过已有缓存的
      const cached = await checkCache(period, dateStr)
      if (cached) {
        console.log(`  ⏭️  ${label} — 已有缓存，跳过`)
        totalSkip++
        continue
      }

      try {
        const articles = await getArticlesForPeriod(period, dateStr)
        if (articles.length === 0) {
          console.log(`  ⚠️  ${label} — 无文章`)
          totalSkip++
          continue
        }

        const categoryGroups = buildCategoryGroups(articles)
        const categoryCounts = {}
        for (const g of categoryGroups) categoryCounts[g.category] = g.count

        const prompt = buildPrompt(period, dateStr, categoryGroups)
        const result = await callLLM(prompt)
        const summary = result?.summary || null
        const highlights = result?.highlights || null

        await writeCache(period, dateStr, summary, highlights, categoryCounts, articles, articles.length)
        console.log(`  ✅ ${label} — ${articles.length}条${summary ? `, 摘要${summary.length}字` : ', LLM未生成'}`)
        totalGen++
      } catch (e) {
        console.error(`  ❌ ${label} — ${e.message?.slice(0, 120)}`)
        totalFail++
      }

      // 间隔
      if (i < dates.length - 1) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  const elapsed = ((Date.now() - totalStart) / 1000 / 60).toFixed(1)
  console.log(`\n━━━ 完成 ━━━`)
  console.log(`生成: ${totalGen} | 跳过: ${totalSkip} | 失败: ${totalFail} | 耗时: ${elapsed}分钟`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
