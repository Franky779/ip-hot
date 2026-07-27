import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import * as cheerio from 'cheerio'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

const { Pool } = pg
const root = resolve(process.cwd())
const sourceFile = resolve(root, 'lib/migrated-content.ts')
const outputFile = resolve(root, process.argv[2] || 'ops/migration/research-reports.json')
const sourceText = await readFile(sourceFile, 'utf8')
const entries = [...sourceText.matchAll(/\{ id: '([^']+)', category: '([^']+)', title: '([^']+)', publishedAt: (?:'([^']+)'|null), sourceUrl: '([^']+)'/g)]
  .filter((match) => match[5].includes('github.com/Franky779/ip-news/blob/main/'))

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' })
turndown.use(gfm)
turndown.remove(['script', 'style', 'noscript', 'iframe', 'nav'])
turndown.addRule('research-chart', {
  filter: (node) => node.nodeName === 'PRE' && node.getAttribute('data-research-chart') === 'true',
  replacement: (_content, node) => `\n\n\`\`\`chart\n${node.textContent.trim()}\n\`\`\`\n\n`,
})

const researchBoxVariants = new Map([
  ['insight-box', 'highlight'],
  ['highlight', 'highlight'],
  ['info-card', 'info'],
  ['key-point', 'key'],
  ['risk-item', 'warning'],
  ['profile-block', 'profile'],
  ['solution', 'success'],
  ['section-intro', 'intro'],
  ['summary-card', 'info'],
  ['metric-card', 'info'],
])

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}

function nodeClassList(node) {
  return String(node.getAttribute?.('class') || '').split(/\s+/).filter(Boolean)
}

turndown.addRule('research-kpi-grid', {
  filter: (node) => node.nodeName === 'DIV' && nodeClassList(node).some((className) => ['kpi-row', 'kpi-grid', 'metrics-grid'].includes(className)),
  replacement: (_content, node) => {
    const cards = Array.from(node.childNodes).filter((child) => child.nodeType === 1).map((card) => {
      const value = card.querySelector?.('.kpi-number, .kpi-value, .metric-value, .summary-card-value')?.textContent?.trim() || ''
      const label = card.querySelector?.('.kpi-label, .metric-label, .summary-card-label')?.textContent?.trim() || ''
      const sub = card.querySelector?.('.kpi-sub, .metric-sub, .summary-card-sub')?.textContent?.trim() || ''
      if (!value && !label) return ''
      return `<div class="research-kpi-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</div>`
    }).filter(Boolean).join('')
    return cards ? `\n\n<div class="research-kpi-grid">${cards}</div>\n\n` : ''
  },
})

turndown.addRule('research-visual-box', {
  filter: (node) => node.nodeName === 'DIV' && nodeClassList(node).some((className) => researchBoxVariants.has(className)),
  replacement: (_content, node) => {
    const className = nodeClassList(node).find((item) => researchBoxVariants.has(item))
    const variant = researchBoxVariants.get(className) || 'info'
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    return text ? `\n\n<div class="research-callout research-callout-${variant}">${escapeHtml(text)}</div>\n\n` : ''
  },
})

turndown.addRule('research-tag', {
  filter: (node) => ['SPAN', 'DIV'].includes(node.nodeName) && nodeClassList(node).some((className) => ['tag', 'badge', 'cover-badge', 'risk-tag', 'risk-level-tag', 'sat-badge', 'conf'].includes(className)),
  replacement: (_content, node) => {
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    return text ? `<span class="research-tag">${escapeHtml(text)}</span>` : ''
  },
})

function rawUrl(blobUrl) {
  const path = blobUrl.replace('https://github.com/Franky779/ip-news/blob/main/', '')
  return `https://cdn.jsdelivr.net/gh/Franky779/ip-news@main/${path}`
}

async function fetchRaw(url, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'ip-hot-research-migration' } })
      if (response.ok) return await response.text()
      if (response.status < 500) throw new Error(`GitHub Raw ${response.status}`)
    } catch (error) {
      if (attempt === attempts) throw error
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1500))
  }
  throw new Error('GitHub Raw request failed')
}

async function readSource(sourceUrl) {
  const localRoot = process.env.IP_NEWS_LOCAL_ROOT
  if (localRoot) {
    const relativePath = decodeURIComponent(sourceUrl.replace('https://github.com/Franky779/ip-news/blob/main/', ''))
    const localPath = resolve(localRoot, relativePath)
    try {
      await access(localPath)
      return readFile(localPath, 'utf8')
    } catch {
      // Fall back to the network mirror when the local export is incomplete.
    }
  }
  return fetchRaw(rawUrl(sourceUrl))
}

function splitArguments(source) {
  const argumentsList = []
  let quote = ''
  let escaped = false
  let depth = 0
  let start = 0
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      continue
    }
    if (character === "'" || character === '"' || character === '`') quote = character
    else if ('([{'.includes(character)) depth += 1
    else if (')]}'.includes(character)) depth -= 1
    else if (character === ',' && depth === 0) {
      argumentsList.push(source.slice(start, index).trim())
      start = index + 1
    }
  }
  argumentsList.push(source.slice(start).trim())
  return argumentsList
}

function findCall(script, functionName, canvasId) {
  const marker = `${functionName}('${canvasId}'`
  const start = script.indexOf(marker)
  if (start < 0) return null
  const open = script.indexOf('(', start)
  let quote = ''
  let escaped = false
  let depth = 0
  for (let index = open; index < script.length; index += 1) {
    const character = script[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      continue
    }
    if (character === "'" || character === '"' || character === '`') quote = character
    else if (character === '(') depth += 1
    else if (character === ')') {
      depth -= 1
      if (depth === 0) return splitArguments(script.slice(open + 1, index))
    }
  }
  return null
}

function parseArray(source) {
  if (!source) return null
  try {
    return JSON.parse(source.replace(/'/g, '"').replace(/,\s*]/g, ']'))
  } catch {
    return null
  }
}

function chartForCanvas(script, canvasId, metadata) {
  const bar = findCall(script, 'drawBar', canvasId)
  if (bar) {
    const labels = parseArray(bar[1])
    const data = parseArray(bar[2])
    if (labels && data) return { type: 'bar', ...metadata, labels, data, suffix: bar[4]?.match(/suffix\s*:\s*'([^']*)'/)?.[1] || '' }
  }

  const pie = findCall(script, 'drawPie', canvasId)
  if (pie) {
    const data = parseArray(pie[1])
    const labels = parseArray(pie[3])
    if (labels && data) return { type: 'pie', ...metadata, labels, data }
  }

  const radar = findCall(script, 'drawRadar', canvasId)
  if (radar) {
    const labels = parseArray(radar[1])
    const data = parseArray(radar[2])
    if (labels && data) return { type: 'radar', ...metadata, labels, data }
  }

  const line = findCall(script, 'drawLine', canvasId)
  if (line) {
    const labels = parseArray(line[1])
    const datasets = [...line[2].matchAll(/name\s*:\s*'([^']*)'[\s\S]*?data\s*:\s*(\[[^\]]*])/g)].flatMap((match) => {
      const data = parseArray(match[2])
      return data ? [{ label: match[1], data }] : []
    })
    if (labels && datasets.length > 0) return { type: 'line', ...metadata, labels, datasets }
  }

  const marker = `getElementById('${canvasId}')`
  const start = script.indexOf(marker)
  if (start >= 0) {
    const source = script.slice(start, start + 4500)
    const labels = parseArray(source.match(/\blb\s*=\s*(\[[^\]]*])/)?.[1])
    const first = parseArray(source.match(/\b(?:s1d|s1)\s*=\s*(\[[^\]]*])/)?.[1])
    const second = parseArray(source.match(/\b(?:s1c|s2)\s*=\s*(\[[^\]]*])/)?.[1])
    if (labels && first) {
      const datasets = [{ label: '系列 1', data: first }]
      if (second) datasets.push({ label: '系列 2', data: second })
      return { type: 'bar', ...metadata, labels, datasets }
    }
  }
  return null
}

function markdownFromHtml(html) {
  const $ = cheerio.load(html)
  const embeddedMarkdown = $('#md-source').text().trim()
  const chartScript = $('script').map((_index, element) => $(element).html() || '').get().join('\n')
  $('canvas[id]').each((_index, element) => {
    const canvas = $(element)
    const chartBox = canvas.closest('.chart-box')
    const title = chartBox.find('.chart-title').first().text().trim()
      || canvas.prevAll('.chart-title').first().text().trim()
      || canvas.attr('aria-label')
      || '数据图表'
    const footerItems = chartBox.find('.chart-footer').children().map((_footerIndex, footer) => $(footer).text().trim()).get()
    const chart = chartForCanvas(chartScript, canvas.attr('id'), {
      title,
      subtitle: chartBox.find('.chart-subtitle').first().text().trim(),
      source: footerItems[0] || '',
      note: footerItems[1] || '',
    })
    if (!chart) return
    chartBox.find('.chart-header, .chart-footer').remove()
    canvas.replaceWith(`<pre data-research-chart="true">${JSON.stringify(chart).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`)
  })
  $('script, style, noscript, iframe, nav, .back-to-list, .header, .toc-sidebar, .nav').remove()
  const body = $('body').html() || html
  const markdown = turndown.turndown(body).replace(/\n{3,}/g, '\n\n').trim()
  return markdown.length >= 500 || !embeddedMarkdown ? markdown : embeddedMarkdown
}

const reports = []
for (const match of entries) {
  const [, slug, category, title, publishedAt, sourceUrl] = match
  const markdown = markdownFromHtml(await readSource(sourceUrl))
  if (markdown.length < 500) {
    console.warn(`${slug}: source contains only ${markdown.length} readable characters; preserving a manual-completion placeholder`)
    reports.push({ slug, category, title, published_at: publishedAt || new Date().toISOString().slice(0, 10), markdown_content: `# ${title}\n\n> 原始 HTML 暂未包含可提取的正文内容，需要管理员人工补全。\n\n原文件：${sourceUrl}`, legacy_source_url: sourceUrl })
    continue
  }
  reports.push({ slug, category, title, published_at: publishedAt || new Date().toISOString().slice(0, 10), markdown_content: markdown, legacy_source_url: sourceUrl })
  console.log(`${slug}: ${markdown.length} chars`)
}

await mkdir(resolve(outputFile, '..'), { recursive: true })
await writeFile(outputFile, `${JSON.stringify(reports, null, 2)}\n`, 'utf8')
console.log(`Wrote ${reports.length} reports to ${outputFile}`)

if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL is not configured; JSON export is ready for the production import step.')
  process.exit(0)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
try {
  for (const report of reports) {
    await pool.query(`
      insert into research_reports (slug, category, title, published_at, markdown_content, github_backup_status, github_backup_path, github_backed_up_at)
      values ($1, $2, $3, $4, $5, 'pending', null, null)
      on conflict (slug) do update set category = excluded.category, title = excluded.title, published_at = excluded.published_at, markdown_content = excluded.markdown_content, updated_at = now()
    `, [report.slug, report.category, report.title, report.published_at, report.markdown_content])
  }
  console.log(`Imported ${reports.length} reports into PostgreSQL.`)
} finally {
  await pool.end()
}
