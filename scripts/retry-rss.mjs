// 重试11个失败的RSS源
import Parser from 'rss-parser'
import { execFile } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const parser = new Parser()

const sources = [
  { name: 'Anime News Network', url: 'https://www.animenewsnetwork.com/all/rss.xml', status: '403' },
  { name: 'Crunchyroll News', url: 'https://feeds.feedburner.com/crunchyroll/animenews', status: 'timeout' },
  { name: 'Animation World Network', url: 'https://www.awn.com/news.xml', status: '403' },
  { name: 'Deadline', url: 'https://deadline.com/feed', status: 'timeout' },
  { name: 'Polygon', url: 'https://www.polygon.com/rss/index.xml', status: 'hang' },
  { name: 'Kotaku', url: 'https://kotaku.com/rss', status: '403' },
  { name: 'The Art Newspaper', url: 'https://www.theartnewspaper.com/rss.xml', status: 'timeout' },
  { name: 'Anime Anime', url: 'https://animeanime.jp/rss20.xml', status: '404' },
  { name: 'Famitsu', url: 'https://www.famitsu.com/rss/news.rdf', status: '404' },
  { name: '36氪', url: 'https://36kr.com/feed', status: 'xml_error' },
  { name: '虎嗅', url: 'https://www.huxiu.com/rss/0.xml', status: 'timeout' },
]

function log(msg) { console.log(`[${new Date().toISOString().slice(0,19)}] ${msg}`) }

async function tryRssParser(source) {
  try {
    const feed = await parser.parseURL(source.url)
    const items = (feed.items || []).filter(i => i.title && i.link)
    return { ok: true, count: items.length, error: null }
  } catch (e) {
    return { ok: false, count: 0, error: e.message }
  }
}

async function tryFetch(source) {
  try {
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml,application/xml,text/xml,*/*',
      },
      signal: AbortSignal.timeout(20000)
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const text = await res.text()
    return { ok: true, length: text.length, preview: text.slice(0, 200) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function tryScrapling(source) {
  return new Promise((resolve) => {
    const pythonExe = 'D:\\claudecode\\.venv-scrapling\\Scripts\\python.exe'
    if (!existsSync(pythonExe)) {
      resolve({ ok: false, error: 'Scrapling not installed' })
      return
    }
    const script = `
import sys
sys.path.insert(0, r'D:\\claudecode\\.venv-scrapling\\Lib\\site-packages')
from scrapling.fetchers import Fetcher
try:
    f = Fetcher()
    r = f.get('${source.url}', headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
    print('STATUS:', r.status_code)
    print('LENGTH:', len(r.text))
    print('PREVIEW:', r.text[:300])
except Exception as e:
    print('ERROR:', str(e))
`
    const tmpFile = resolve(process.cwd(), 'scripts/_tmp_scrapling.py')
    writeFileSync(tmpFile, script, 'utf-8')
    execFile(pythonExe, [tmpFile], { timeout: 30000 }, (error, stdout, stderr) => {
      try { require('fs').unlinkSync(tmpFile) } catch {}
      if (error) {
        resolve({ ok: false, error: error.message })
      } else {
        const out = stdout.toString()
        const statusMatch = out.match(/STATUS:\s*(\d+)/)
        const status = statusMatch ? parseInt(statusMatch[1]) : 0
        resolve({ ok: status === 200, status, output: out.slice(0, 500) })
      }
    })
  })
}

async function main() {
  const results = []
  for (const s of sources) {
    log(`\n测试: ${s.name} (${s.status})`)

    // 1. 先用rss-parser重试
    log('  尝试 rss-parser...')
    const rssResult = await tryRssParser(s)
    if (rssResult.ok) {
      log(`  rss-parser 成功! ${rssResult.count} 条`)
      results.push({ ...s, method: 'rss-parser', ok: true, count: rssResult.count })
      continue
    }
    log(`  rss-parser 失败: ${rssResult.error}`)

    // 2. 原生fetch
    log('  尝试 fetch...')
    const fetchResult = await tryFetch(s)
    if (fetchResult.ok) {
      log(`  fetch 成功! ${fetchResult.length} bytes`)
      // 尝试用rss-parser解析fetch的内容
      try {
        const feed = await parser.parseString(fetchResult.preview)
        log(`  解析成功! ${feed.items?.length || 0} 条`)
        results.push({ ...s, method: 'fetch+parse', ok: true, count: feed.items?.length || 0 })
      } catch (e) {
        log(`  解析失败: ${e.message}`)
        results.push({ ...s, method: 'fetch', ok: false, error: e.message })
      }
      continue
    }
    log(`  fetch 失败: ${fetchResult.error}`)

    // 3. Scrapling
    if (s.status === '403') {
      log('  尝试 Scrapling...')
      const scrapResult = await tryScrapling(s)
      if (scrapResult.ok) {
        log(`  Scrapling 成功! status=${scrapResult.status}`)
        results.push({ ...s, method: 'scrapling', ok: true })
      } else {
        log(`  Scrapling 失败: ${scrapResult.error || scrapResult.output}`)
        results.push({ ...s, method: 'scrapling', ok: false, error: scrapResult.error || 'unknown' })
      }
      continue
    }

    results.push({ ...s, method: 'none', ok: false, error: rssResult.error })
  }

  log('\n========== 汇总 ==========')
  const success = results.filter(r => r.ok)
  const failed = results.filter(r => !r.ok)
  log(`成功: ${success.length} 个`)
  success.forEach(s => log(`  ✓ ${s.name} (${s.method})`))
  log(`失败: ${failed.length} 个`)
  failed.forEach(s => log(`  ✗ ${s.name}: ${s.error}`))
}

main().catch(e => { log('异常: ' + e.message); process.exit(1) })
