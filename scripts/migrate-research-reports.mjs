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
  ['highlight-box', 'highlight'],
  ['verdict-box', 'highlight'],
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
  filter: (node) => node.nodeName === 'DIV' && nodeClassList(node).some((className) => ['kpi-row', 'kpi-grid', 'metrics-grid', 'summary-grid', 'stats-grid'].includes(className)),
  replacement: (_content, node) => {
    const cards = Array.from(node.childNodes).filter((child) => child.nodeType === 1).map((card) => {
      const value = card.querySelector?.('.kpi-number, .kpi-value, .metric-value, .summary-card-value, .stat-value')?.textContent?.trim() || ''
      const label = card.querySelector?.('.kpi-label, .metric-label, .summary-card-label, .stat-label')?.textContent?.trim() || ''
      const sub = card.querySelector?.('.kpi-sub, .metric-sub, .summary-card-sub, .summary-card-note, .stat-note')?.textContent?.trim() || ''
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

function findChartConstructor(script, canvasId) {
  const markers = [`new Chart(document.getElementById('${canvasId}')`, `new Chart(document.getElementById("${canvasId}")`]
  const start = markers.map((marker) => script.indexOf(marker)).find((index) => index >= 0)
  if (start === undefined) return null
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
    else if (character === ')' && --depth === 0) return splitArguments(script.slice(open + 1, index))[1] || null
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

function chartForChartJs(script, canvasId, metadata) {
  const source = findChartConstructor(script, canvasId)
  if (!source) return null
  const sourceType = source.match(/\btype\s*:\s*['"](bar|line|pie|doughnut|radar)['"]/)?.[1]
  const labels = parseArray(source.match(/\blabels\s*:\s*(\[[^\]]*])/)?.[1])
  if (!sourceType || !labels) return null
  const datasets = [...source.matchAll(/\bdata\s*:\s*(\[[^\]]*])/g)].flatMap((match) => {
    const data = parseArray(match[1])
    if (!data) return []
    const labelMatches = [...source.slice(0, match.index).matchAll(/\blabel\s*:\s*['"]([^'"]*)['"]/g)]
    return [{ label: labelMatches.at(-1)?.[1] || '', data }]
  })
  if (datasets.length === 0) return null
  return { type: sourceType === 'doughnut' ? 'pie' : sourceType, ...metadata, labels, datasets }
}

function chartMarkup(chart) {
  return `<pre data-research-chart="true">${JSON.stringify(chart).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`
}

function numericValue(value) {
  const number = Number(String(value || '').replace(/,/g, '').match(/-?[\d.]+/)?.[0])
  return Number.isFinite(number) ? number : null
}

function chartMetadata(container, fallback = '数据图表') {
  const chartBox = container.closest('.chart-box, .chart-card, .chart-container, .section')
  return {
    title: chartBox.find('.chart-title, h4, h3').first().text().trim() || fallback,
    subtitle: chartBox.find('.chart-subtitle, .section-desc').first().text().trim(),
    source: '',
    note: chartBox.find('.chart-note').first().text().trim(),
  }
}

function removeOriginalChartHeading(container) {
  const parent = container.parent('.chart-box, .chart-card')
  const wrapper = parent.length ? parent : container.closest('.chart-container')
  wrapper.children('.chart-title, h4, h3').first().remove()
}

function replaceBarCharts($) {
  $('.bar-chart').each((_index, element) => {
    const container = $(element)
    const labels = []
    const data = []
    container.find('.bar-row').each((_rowIndex, row) => {
      const label = $(row).find('.bar-label').text().replace(/\s+/g, ' ').trim()
      const value = numericValue($(row).find('.bar-val').text())
      if (!label || value === null) return
      labels.push(label)
      data.push(value)
    })
    if (labels.length < 2) return
    const metadata = chartMetadata(container)
    removeOriginalChartHeading(container)
    container.replaceWith(chartMarkup({ type: 'bar', ...metadata, labels, data }))
  })
}

function replaceDataCharts($, script) {
  const dataSource = script.match(/\bconst\s+DATA\s*=\s*(\{[\s\S]*?\});/)?.[1]
  if (!dataSource) return
  try {
    const notes = JSON.parse(dataSource).notes
    if (!Array.isArray(notes)) return
    for (const [id, field, title] of [['chart-ct', 'contentType', '内容类型分布'], ['chart-mt', 'marketingTactic', '营销手法分布']]) {
      const container = $(`#${id}`)
      if (!container.length) continue
      const counts = new Map()
      for (const note of notes) {
        const label = String(note?.[field] || '').trim()
        if (label) counts.set(label, (counts.get(label) || 0) + 1)
      }
      const entries = [...counts.entries()].sort((left, right) => right[1] - left[1])
      if (entries.length < 2) continue
      const metadata = chartMetadata(container, title)
      removeOriginalChartHeading(container)
      container.replaceWith(chartMarkup({ type: 'bar', ...metadata, title, labels: entries.map(([label]) => label), data: entries.map(([, value]) => value) }))
    }
  } catch {
    // Leave malformed embedded datasets as readable source text.
  }
}

function assignedObject(script, name) {
  const marker = new RegExp(`\\bconst\\s+${name}\\s*=\\s*\\{`).exec(script)
  if (!marker) return ''
  const start = script.indexOf('{', marker.index)
  let depth = 0
  for (let index = start; index < script.length; index += 1) {
    if (script[index] === '{') depth += 1
    else if (script[index] === '}' && --depth === 0) return script.slice(start + 1, index)
  }
  return ''
}

function numberMap(source) {
  return [...source.matchAll(/['"]([^'"]+)['"]\s*:\s*(-?[\d.]+)/g)].map((match) => [match[1], Number(match[2])])
}

function replaceCustomSvgCharts($, script) {
  const monthly = numberMap(assignedObject(script, 'monthly'))
  const distribution = numberMap(assignedObject(script, 'distribution'))
  const categories = [...assignedObject(script, 'categories').matchAll(/['"]([^'"]+)['"]\s*:\s*\{\s*count:\s*([\d.]+),\s*avg:\s*([\d.]+)/g)]
  const topNotes = [...(script.match(/\bconst\s+topNotes\s*=\s*\[([\s\S]*?)\];/)?.[1] || '').matchAll(/\{\s*title:\s*['"]([^'"]+)['"],\s*count:\s*([\d.]+)\s*\}/g)]
  const charts = [
    ['trend-chart', 'line', monthly, '月度发布趋势'],
    ['category-pie', 'pie', categories.map((match) => [match[1], Number(match[2])]), '笔记分类占比'],
    ['category-bar', 'bar', categories.map((match) => [match[1], Number(match[3])]), '分类平均互动'],
    ['distribution-chart', 'bar', distribution, '互动量分布'],
    ['topnotes-chart', 'bar', topNotes.map((match) => [match[1], Number(match[2])]), 'Top 12 爆款笔记'],
  ]
  for (const [id, type, entries, fallbackTitle] of charts) {
    const container = $(`#${id}`)
    if (!container.length || entries.length < 2) continue
    const metadata = chartMetadata(container, fallbackTitle)
    removeOriginalChartHeading(container)
    container.replaceWith(chartMarkup({ type, ...metadata, labels: entries.map(([label]) => label), data: entries.map(([, value]) => value) }))
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

  const chartJs = chartForChartJs(script, canvasId, metadata)
  if (chartJs) return chartJs

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
  replaceDataCharts($, chartScript)
  replaceCustomSvgCharts($, chartScript)
  $('canvas[id]').each((_index, element) => {
    const canvas = $(element)
    const chartBox = canvas.closest('.chart-box, .chart-container')
    const title = chartBox.find('.chart-title, h4, h3').first().text().trim()
      || canvas.prevAll('.chart-title').first().text().trim()
      || canvas.attr('aria-label')
      || '数据图表'
    const footerItems = chartBox.find('.chart-footer').children().map((_footerIndex, footer) => $(footer).text().trim()).get()
    const chart = chartForCanvas(chartScript, canvas.attr('id'), {
      title,
      subtitle: chartBox.find('.chart-subtitle').first().text().trim(),
      source: footerItems[0] || '',
      note: footerItems[1] || chartBox.find('.chart-note').first().text().trim(),
    })
    if (!chart) return
    removeOriginalChartHeading(canvas)
    chartBox.find('.chart-header, .chart-footer, .chart-note').remove()
    canvas.replaceWith(chartMarkup(chart))
  })
  replaceBarCharts($)
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
