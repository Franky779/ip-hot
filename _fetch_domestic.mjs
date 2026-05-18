// 手动抓取国内 RSS 源并插入数据库
import { createClient } from '@supabase/supabase-js'
import Parser from 'rss-parser'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !secretKey) {
  console.error('缺少环境变量')
  process.exit(1)
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const parser = new Parser({ timeout: 20000 })

const DOMESTIC_SOURCES = [
  { name: '36氪', url: 'https://36kr.com/feed' },
  { name: '虎嗅', url: 'https://www.huxiu.com/rss/0.xml' },
  { name: '钛媒体', url: 'https://www.tmtpost.com/rss.xml' },
]

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

// 链接有效性预检
const BLOCK_KEYWORDS = [
  '您的请求可能存在威胁', '已被拦截', '访问被拒绝', '拦截',
  'blocked', 'WAF', '安全检查', '安全验证', '您的访问被限制',
  'Access Denied', 'Forbidden', '请求过于频繁', '请稍后重试',
  '服务不可用', 'Service Unavailable',
]
const BLOCK_REGEX = new RegExp(BLOCK_KEYWORDS.join('|'), 'i')

async function checkLink(url, timeoutMs = 6000) {
  if (!url || !url.startsWith('http')) return { ok: false, url, reason: 'invalid url' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // 先尝试 HEAD
    let res = null
    try {
      res = await fetch(url, {
        method: 'HEAD', signal: controller.signal, redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0' },
      })
    } catch {}

    // HEAD 失败则尝试 GET
    if (!res || !res.ok) {
      try {
        res = await fetch(url, {
          method: 'GET', signal: controller.signal, redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0' },
        })
      } catch (e) {
        clearTimeout(timer)
        return { ok: false, url, reason: e.message || 'fetch failed' }
      }
    }

    clearTimeout(timer)

    if (res.status >= 400) {
      return { ok: false, url, status: res.status, reason: `HTTP ${res.status}` }
    }

    // 内容检查（GET 才有 body）
    if (res.status === 200) {
      try {
        const text = await res.text()
        if (BLOCK_REGEX.test(text)) {
          return { ok: false, url, status: res.status, reason: 'blocked by WAF/security' }
        }
      } catch {}
    }

    return { ok: true, url, status: res.status }
  } catch (e) {
    clearTimeout(timer)
    return { ok: false, url, reason: e.message || 'unknown error' }
  }
}

async function checkLinks(urls, concurrency = 5, timeoutMs = 6000) {
  const results = []
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map((url) => checkLink(url, timeoutMs)))
    results.push(...batchResults)
  }
  return results
}

async function fetchSource(source) {
  console.log(`\n抓取: ${source.name}`)
  try {
    const feed = await parser.parseURL(source.url)
    let items = feed.items
      .map((item) => ({
        source: source.name,
        url: item.link ?? '',
        title: item.title ?? '',
        published_at: item.isoDate ?? null,
      }))
      .filter((x) => x.url.length > 0 && x.title.length > 0 && !isNoise(x.title))

    if (items.length === 0) {
      console.log('  无有效文章')
      return { name: source.name, inserted: 0 }
    }

    // 链接有效性预检
    const linkChecks = await checkLinks(items.map((x) => x.url), 5, 6000)
    const validUrls = new Set(linkChecks.filter((r) => r.ok).map((r) => r.url))
    items = items.filter((x) => validUrls.has(x.url))
    const deadCount = linkChecks.length - validUrls.size

    const deadLinks = linkChecks.filter((r) => !r.ok)
    if (deadLinks.length > 0) {
      console.log(`  [链接检查] 过滤 ${deadLinks.length} 条失效链接:`)
      deadLinks.forEach((d) => console.log(`    - ${d.url} (${d.reason})`))
    }

    if (items.length === 0) {
      console.log('  全部链接失效，无文章入库')
      return { name: source.name, inserted: 0, dead: deadCount }
    }

    const { data, error } = await supabase
      .from('articles')
      .upsert(items, { onConflict: 'source,url', ignoreDuplicates: true })
      .select('id')

    if (error) {
      console.log(`  插入失败: ${error.message}`)
      return { name: source.name, inserted: 0, error: error.message, dead: deadCount }
    }

    const inserted = data?.length ?? 0
    console.log(`  抓取 ${items.length} 条, 新插入 ${inserted} 条 (过滤 ${deadCount} 条失效链接)`)
    return { name: source.name, inserted, dead: deadCount }
  } catch (e) {
    console.log(`  抓取失败: ${e.message}`)
    return { name: source.name, inserted: 0, error: e.message }
  }
}

async function main() {
  console.log('开始抓取国内 RSS 源...')
  let totalInserted = 0
  let totalDead = 0

  for (const source of DOMESTIC_SOURCES) {
    const result = await fetchSource(source)
    totalInserted += result.inserted
    totalDead += result.dead ?? 0
  }

  console.log(`\n✓ 完成, 共新插入 ${totalInserted} 条, 过滤 ${totalDead} 条失效链接`)

  // 查看当前待处理数量
  const { count } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .is('title_cn', null)

  console.log(`  待 LLM 处理: ${count ?? 0} 条`)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(1)
})
