// 重新抓取修复选择器后的WEB源
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { scrapeNewsList } from '../lib/scraper.ts'

function loadEnvFile(fp) {
  try {
    const content = readFileSync(fp, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim()
      if (key && !process.env[key]) process.env[key] = value
    }
  } catch {}
}
loadEnvFile(resolve(process.cwd(), '.env.local'))

const SUPABASE_URL = 'https://rbjygwpoxuutmxmkzkqz.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || ''

function log(msg) { console.log(`[${new Date().toISOString().slice(0,19)}] ${msg}`) }

const sources = [
  { name: '玩具产业网', url: 'https://www.wjyt-china.org/', config: { itemSelector: 'a[href*="detail?id="]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.wjyt-china.org', maxItems: 10 } },
  { name: '中国文化报', url: 'http://www.ccdy.cn', config: { itemSelector: 'a[href*="/details/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.ccdy.cn', maxItems: 10 } },
  { name: '新闻晨报', url: 'https://www.shxwcb.com', config: { itemSelector: 'a[href*="/detail/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.shxwcb.com', maxItems: 10 } },
  { name: '金羊网', url: 'https://www.ycwb.com', config: { itemSelector: 'a[href*="content_"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.ycwb.com', maxItems: 10 } },
  { name: '搜狐网', url: 'https://news.sohu.com/', config: { itemSelector: 'a[href*="/a/"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://news.sohu.com', maxItems: 10 } },
  { name: '中外玩具网', url: 'http://www.ctoy.com.cn', config: { itemSelector: 'a[href*="/n/d"]', titleSelector: '', linkSelector: '', linkPrefix: 'https://www.ctoy.com.cn', maxItems: 10 } },
]

async function insertSupabase(articles, source) {
  if (!articles.length) return 0
  const seen = new Set()
  const unique = articles.filter(a => {
    if (seen.has(a.url)) return false
    seen.add(a.url)
    return true
  })
  let inserted = 0
  for (let i = 0; i < unique.length; i += 10) {
    const batch = unique.slice(i, i + 10).map(a => ({
      source, url: a.url, title: a.title, published_at: null,
      title_cn: a.title.slice(0, 100), summary_cn: '', category: '待分类', relevance_score: 5, is_selected: false, commentary: ''
    }))
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?on_conflict=source,url`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(batch),
      })
      if (res.ok) {
        const data = await res.json().catch(() => [])
        inserted += Array.isArray(data) ? data.length : 0
      }
    } catch (e) { log(`  upsert error: ${e.message}`) }
  }
  return inserted
}

async function main() {
  let totalInserted = 0
  for (const s of sources) {
    log(`\n抓取: ${s.name}`)
    try {
      const result = await scrapeNewsList(s.name, s.url, s.config)
      if (result.error) {
        log(`  失败: ${result.error}`)
        continue
      }
      const items = result.items || []
      log(`  提取: ${items.length} 条`)
      if (items.length === 0) {
        log('  无有效条目')
        continue
      }
      const n = await insertSupabase(items, s.name)
      log(`  入库: ${n} 条`)
      totalInserted += n
    } catch (e) {
      log(`  异常: ${e.message}`)
    }
  }
  log(`\n完成: 总入库 ${totalInserted} 条`)
}

main().catch(e => { log('异常: ' + e.message); process.exit(1) })
