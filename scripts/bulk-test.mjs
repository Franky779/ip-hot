// 批量测试所有数据源连通性
// 输出结果到 scripts/bulk-test-results.json

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import Parser from 'rss-parser'

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

function log(msg) { console.log(`[${new Date().toISOString().slice(0,19)}] ${msg}`) }

// ============ 解析 sources.ts（处理嵌套对象）============
const sourcesContent = readFileSync(resolve(process.cwd(), 'lib/sources.ts'), 'utf-8')

function extractSources(sectionName) {
  const sources = []
  // 找到 section 开始的索引
  const sectionStart = sourcesContent.indexOf(`const ${sectionName}`)
  if (sectionStart === -1) return sources

  // 找到 = [ 的位置
  let bracketStart = sourcesContent.indexOf('[', sectionStart)
  if (bracketStart === -1) return sources

  // 用括号深度跟踪找到匹配的 ]
  let depth = 1
  let i = bracketStart + 1
  let objStart = -1
  let objDepth = 0
  let currentObj = ''

  while (i < sourcesContent.length && depth > 0) {
    const ch = sourcesContent[i]
    if (ch === '[') depth++
    else if (ch === ']') depth--

    if (depth === 1) {
      if (ch === '{' && objDepth === 0) {
        objStart = i
        objDepth = 1
        currentObj = '{'
      } else if (objDepth > 0) {
        currentObj += ch
        if (ch === '{') objDepth++
        else if (ch === '}') {
          objDepth--
          if (objDepth === 0) {
            // 解析对象
            const id = currentObj.match(/id:\s*['"]([^'"]+)['"]/)?.[1]
            const name = currentObj.match(/name:\s*['"]([^'"]+)['"]/)?.[1]
            const url = currentObj.match(/url:\s*['"]([^'"]+)['"]/)?.[1]
            if (id && name && url) {
              const type = currentObj.includes("type: 'rss'") ? 'rss' : currentObj.includes("type: 'gov'") ? 'gov' : 'web'
              const isRss = currentObj.includes('isRss: true')
              const needsLocalCdp = currentObj.includes('needsLocalCdp: true')
              const loginRequired = currentObj.includes('loginRequired: true')
              const priority = currentObj.includes("priority: 'P0'") ? 'P0' : currentObj.includes("priority: 'P1'") ? 'P1' : 'P2'
              sources.push({ id, name, url, type, isRss, needsLocalCdp, loginRequired, priority })
            }
            currentObj = ''
          }
        }
      }
    }
    i++
  }
  return sources
}

const rssSources = extractSources('RSS_SOURCES')
const webSources = extractSources('WEB_SOURCES')
const govSources = extractSources('GOV_SOURCES')

const allSources = [
  ...rssSources.map(s => ({ ...s, category: 'RSS' })),
  ...webSources.map(s => ({ ...s, category: 'WEB' })),
  ...govSources.map(s => ({ ...s, category: 'GOV' })),
]

log(`解析到 ${allSources.length} 个源: RSS=${rssSources.length}, WEB=${webSources.length}, GOV=${govSources.length}`)

// ============ 测试函数 ============
const parser = new Parser()

async function testRss(source) {
  try {
    const feed = await parser.parseURL(source.url)
    const items = feed.items || []
    const valid = items.filter(i => i.title && i.link).length
    return { ok: true, count: valid, error: null }
  } catch (e) {
    return { ok: false, count: 0, error: e.message }
  }
}

async function testWeb(source) {
  try {
    // 使用通用选择器快速测试页面可达性
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return { ok: false, count: 0, error: `HTTP ${res.status}` }
    const html = await res.text()
    // 检查是否有常见的列表结构
    const hasLinks = /<a[^>]*href/i.test(html)
    return { ok: true, count: hasLinks ? 1 : 0, error: null }
  } catch (e) {
    return { ok: false, count: 0, error: e.message }
  }
}

// ============ 主流程 ============
async function main() {
  const results = []
  const failed = []
  const skipped = []

  for (const s of allSources) {
    if (s.loginRequired) {
      skipped.push({ ...s, reason: '需登录' })
      continue
    }
    if (s.needsLocalCdp) {
      skipped.push({ ...s, reason: '需CDP' })
      continue
    }
    if (s.category === 'GOV') {
      skipped.push({ ...s, reason: '政府源（每周跑）' })
      continue
    }

    process.stdout.write(`测试 ${s.name} (${s.category}) ... `)
    let result
    if (s.isRss || s.category === 'RSS') {
      result = await testRss(s)
    } else {
      result = await testWeb(s)
    }
    results.push({ ...s, ...result })
    if (result.ok) {
      console.log(`OK (${result.count}条)`)
    } else {
      console.log(`FAIL: ${result.error}`)
      failed.push({ ...s, error: result.error })
    }
  }

  // 汇总
  log('\n========== 测试结果汇总 ==========')
  log(`总计: ${allSources.length} 个源`)
  log(`成功: ${results.filter(r => r.ok).length} 个`)
  log(`失败: ${failed.length} 个`)
  log(`跳过: ${skipped.length} 个`)

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: allSources.length,
      success: results.filter(r => r.ok).length,
      failed: failed.length,
      skipped: skipped.length,
    },
    success: results.filter(r => r.ok),
    failed,
    skipped,
  }

  writeFileSync(resolve(process.cwd(), 'scripts/bulk-test-results.json'), JSON.stringify(report, null, 2), 'utf-8')
  log('结果已保存到 scripts/bulk-test-results.json')
}

main().catch(e => { log('异常: ' + e.message); process.exit(1) })
