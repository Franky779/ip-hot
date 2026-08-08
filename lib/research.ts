import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

export const RESEARCH_CATEGORIES = ['品类报告', '深度分析'] as const
export type ResearchCategory = (typeof RESEARCH_CATEGORIES)[number]
export const LEGACY_RESEARCH_CATEGORIES = ['品类研究', '品牌/IP与授权营销研究', '品牌/IP分析', '授权与营销研究'] as const
export const RESEARCH_CONTENT_FORMATS = ['markdown', 'html'] as const
export type ResearchContentFormat = (typeof RESEARCH_CONTENT_FORMATS)[number]

export function normalizeResearchCategory(value: string): ResearchCategory {
  if (value === '品类报告' || value === '品类研究') return '品类报告'
  return '深度分析'
}

export function researchCategoryLink(value: string): { href: string; label: string } {
  const category = normalizeResearchCategory(value)
  return {
    href: `/research?category=${encodeURIComponent(category)}`,
    label: `← 返回${category}`,
  }
}

export function researchTags(report: Pick<ResearchReport, 'title' | 'category'>): string[] {
  const keyword = report.title
    .replace(/^【[^】]*(?:报告|分析)[^】]*】|^\[[^\]]*(?:报告|分析)[^\]]*\]/, '')
    .replace(/(?:品类|品牌|IP评估|授权与营销)?深度研究报告.*$|(?:行业|产业)?分析.*$|拆解.*$/, '')
    .replace(/[（）()].*$/, '')
    .trim()
  return ['研究报告', keyword || normalizeResearchCategory(report.category)]
}

export type ResearchReport = {
  id: string
  slug: string
  category: ResearchCategory
  title: string
  published_at: string
  markdown_content: string
  content_format: ResearchContentFormat
  github_backup_status: 'pending' | 'backed_up' | 'failed'
  github_backup_path: string | null
  github_backup_error: string | null
  github_backed_up_at: string | null
  created_at: string
  updated_at: string
}

export function formatResearchDate(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export const MAX_RESEARCH_TITLE_LENGTH = 160
export const MAX_RESEARCH_MARKDOWN_LENGTH = 1_000_000

type ResearchChart = {
  type: 'bar' | 'line' | 'pie' | 'radar'
  title?: string
  subtitle?: string
  source?: string
  note?: string
  labels: string[]
  datasets: Array<{ label?: string; data: number[] }>
  suffix?: string
}

const CHART_COLORS = ['#00b48a', '#287271', '#d4a017', '#6b5b95', '#2d8a4e', '#b04a5a']

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function slugFromTitle(title: string, suffix = Date.now().toString(36)): string {
  const ascii = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${ascii || 'research-report'}-${suffix}`.slice(0, 120)
}

export function validateResearchInput(input: unknown): ValidationResult<{
  title: string
  category: ResearchCategory
  markdown_content: string
  content_format: 'markdown'
}> {
  if (!input || typeof input !== 'object') return { ok: false, error: '报告内容格式不正确' }
  const raw = input as Record<string, unknown>
  const title = textValue(raw.title)
  const category = raw.category
  const markdown = typeof raw.markdown_content === 'string' ? raw.markdown_content.trim() : ''
  if (!title || title.length > MAX_RESEARCH_TITLE_LENGTH) return { ok: false, error: `标题不能为空且不能超过 ${MAX_RESEARCH_TITLE_LENGTH} 字` }
  if (!RESEARCH_CATEGORIES.includes(category as ResearchCategory)) return { ok: false, error: '请选择有效的报告分类' }
  if (!markdown || markdown.length > MAX_RESEARCH_MARKDOWN_LENGTH) return { ok: false, error: 'Markdown 内容不能为空且不能超过 1 MB' }
  return { ok: true, value: { title, category: category as ResearchCategory, markdown_content: markdown, content_format: 'markdown' } }
}

export function currentShanghaiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}

function normalizeChart(value: unknown): ResearchChart | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (!['bar', 'line', 'pie', 'radar'].includes(String(raw.type))) return null
  if (!Array.isArray(raw.labels) || raw.labels.length < 2 || raw.labels.length > 24) return null
  const labels = raw.labels.map((label) => String(label).slice(0, 28))
  const rawDatasets = Array.isArray(raw.datasets)
    ? raw.datasets
    : Array.isArray(raw.data)
      ? [{ data: raw.data }]
      : []
  const datasets = rawDatasets.slice(0, 4).flatMap((dataset) => {
    if (!dataset || typeof dataset !== 'object') return []
    const record = dataset as Record<string, unknown>
    if (!Array.isArray(record.data)) return []
    const data = record.data.slice(0, labels.length).map(Number)
    if (data.length !== labels.length || data.some((item) => !Number.isFinite(item))) return []
    return [{ label: textValue(record.label).slice(0, 28), data }]
  })
  if (datasets.length === 0) return null
  return {
    type: raw.type as ResearchChart['type'],
    title: textValue(raw.title).slice(0, 100),
    subtitle: textValue(raw.subtitle).slice(0, 180),
    source: textValue(raw.source).slice(0, 180),
    note: textValue(raw.note).slice(0, 180),
    labels,
    datasets,
    suffix: textValue(raw.suffix).slice(0, 8),
  }
}

function chartLegend(chart: ResearchChart): string {
  if (chart.datasets.length === 1 && !chart.datasets[0].label) return ''
  return `<div class="research-chart-legend">${chart.datasets.map((dataset, index) => `<span><i class="research-chart-key color-${index + 1}"></i>${escapeHtml(dataset.label || `系列 ${index + 1}`)}</span>`).join('')}</div>`
}

function chartFrame(chart: ResearchChart, drawing: string, legend = chartLegend(chart)): string {
  const title = chart.title ? `<figcaption>${escapeHtml(chart.title)}</figcaption>` : ''
  const subtitle = chart.subtitle ? `<p class="research-chart-subtitle">${escapeHtml(chart.subtitle)}</p>` : ''
  const footer = chart.source || chart.note ? `<div class="research-chart-footer"><span>${escapeHtml(chart.source || '')}</span><span>${escapeHtml(chart.note || '')}</span></div>` : ''
  return `<figure class="research-chart">${title}${subtitle}<div class="research-chart-plot"><svg viewBox="0 0 760 360" role="img" aria-label="${escapeHtml(chart.title || '数据图表')}">${drawing}</svg></div>${legend}${footer}</figure>`
}

function renderBarChart(chart: ResearchChart): string {
  const values = chart.datasets.flatMap((dataset) => dataset.data)
  const max = Math.max(...values, 1)
  const left = 58
  const top = 24
  const width = 670
  const height = 260
  const groupWidth = width / chart.labels.length
  const barWidth = Math.max(4, Math.min(32, (groupWidth - 10) / chart.datasets.length))
  const grid = Array.from({ length: 5 }, (_, index) => {
    const y = top + (height * index) / 4
    const value = Math.round(max * (1 - index / 4) * 100) / 100
    return `<line class="chart-grid" x1="${left}" y1="${y}" x2="${left + width}" y2="${y}"></line><text class="chart-axis" x="${left - 10}" y="${y + 4}" text-anchor="end">${value}${escapeHtml(chart.suffix || '')}</text>`
  }).join('')
  const bars = chart.labels.map((label, labelIndex) => {
    const groupOffset = (groupWidth - barWidth * chart.datasets.length) / 2
    const items = chart.datasets.map((dataset, datasetIndex) => {
      const value = dataset.data[labelIndex]
      const barHeight = Math.max(1, (value / max) * height)
      const x = left + labelIndex * groupWidth + groupOffset + datasetIndex * barWidth
      return `<rect class="chart-fill-${datasetIndex + 1}" x="${x}" y="${top + height - barHeight}" width="${Math.max(2, barWidth - 3)}" height="${barHeight}" rx="3"></rect>`
    }).join('')
    const x = left + labelIndex * groupWidth + groupWidth / 2
    return `${items}<text class="chart-axis" x="${x}" y="${top + height + 24}" text-anchor="middle">${escapeHtml(label.length > 9 ? `${label.slice(0, 8)}...` : label)}</text>`
  }).join('')
  return chartFrame(chart, `${grid}${bars}`)
}

function renderLineChart(chart: ResearchChart): string {
  const values = chart.datasets.flatMap((dataset) => dataset.data)
  const max = Math.max(...values, 1)
  const min = Math.min(0, ...values)
  const range = max - min || 1
  const left = 58
  const top = 24
  const width = 670
  const height = 260
  const xAt = (index: number) => left + (width * index) / Math.max(1, chart.labels.length - 1)
  const yAt = (value: number) => top + height - ((value - min) / range) * height
  const grid = Array.from({ length: 5 }, (_, index) => {
    const y = top + (height * index) / 4
    return `<line class="chart-grid" x1="${left}" y1="${y}" x2="${left + width}" y2="${y}"></line>`
  }).join('')
  const lines = chart.datasets.map((dataset, index) => {
    const points = dataset.data.map((value, pointIndex) => `${xAt(pointIndex)},${yAt(value)}`).join(' ')
    const dots = dataset.data.map((value, pointIndex) => `<circle class="chart-fill-${index + 1}" cx="${xAt(pointIndex)}" cy="${yAt(value)}" r="4"></circle>`).join('')
    return `<polyline class="chart-stroke-${index + 1}" points="${points}"></polyline>${dots}`
  }).join('')
  const labels = chart.labels.map((label, index) => `<text class="chart-axis" x="${xAt(index)}" y="${top + height + 24}" text-anchor="middle">${escapeHtml(label.length > 9 ? `${label.slice(0, 8)}...` : label)}</text>`).join('')
  return chartFrame(chart, `${grid}${lines}${labels}`)
}

function pieSlice(cx: number, cy: number, radius: number, start: number, end: number): string {
  const startX = cx + radius * Math.cos(start)
  const startY = cy + radius * Math.sin(start)
  const endX = cx + radius * Math.cos(end)
  const endY = cy + radius * Math.sin(end)
  return `M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${endX} ${endY} Z`
}

function renderPieChart(chart: ResearchChart): string {
  const data = chart.datasets[0].data.map((value) => Math.max(0, value))
  const total = data.reduce((sum, value) => sum + value, 0) || 1
  const centerX = 380
  // Keep the pie clear of the legend below the fixed-height plot.
  const centerY = 125
  let angle = -Math.PI / 2
  const slices = data.map((value, index) => {
    const next = angle + (value / total) * Math.PI * 2
    const path = `<path class="chart-fill-${(index % CHART_COLORS.length) + 1}" d="${pieSlice(centerX, centerY, 128, angle, next)}"></path>`
    angle = next
    return path
  }).join('')
  const legend = `<div class="research-chart-legend">${chart.labels.map((label, index) => `<span><i class="research-chart-key color-${(index % CHART_COLORS.length) + 1}"></i>${escapeHtml(label)} ${Math.round((data[index] / total) * 100)}%</span>`).join('')}</div>`
  return chartFrame(chart, slices, legend)
}

function renderRadarChart(chart: ResearchChart): string {
  const data = chart.datasets[0].data
  const max = Math.max(...data, 1)
  const cx = 380
  const cy = 176
  const radius = 130
  const point = (index: number, scale: number) => {
    const angle = (Math.PI * 2 * index) / chart.labels.length - Math.PI / 2
    return [cx + Math.cos(angle) * radius * scale, cy + Math.sin(angle) * radius * scale]
  }
  const rings = [0.25, 0.5, 0.75, 1].map((scale) => `<polygon class="chart-grid-polygon" points="${chart.labels.map((_, index) => point(index, scale).join(',')).join(' ')}"></polygon>`).join('')
  const axes = chart.labels.map((label, index) => {
    const [x, y] = point(index, 1)
    const [labelX, labelY] = point(index, 1.16)
    return `<line class="chart-grid" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"></line><text class="chart-axis" x="${labelX}" y="${labelY + 4}" text-anchor="middle">${escapeHtml(label)}</text>`
  }).join('')
  const polygon = `<polygon class="chart-radar-area" points="${data.map((value, index) => point(index, value / max).join(',')).join(' ')}"></polygon>`
  return chartFrame(chart, `${rings}${axes}${polygon}`, '')
}

function renderChartBlock(source: string): string {
  try {
    const chart = normalizeChart(JSON.parse(source))
    if (!chart) return '<p class="research-chart-error">图表数据格式不正确</p>'
    if (chart.type === 'pie') return renderPieChart(chart)
    if (chart.type === 'line') return renderLineChart(chart)
    if (chart.type === 'radar') return renderRadarChart(chart)
    return renderBarChart(chart)
  } catch {
    return '<p class="research-chart-error">图表数据格式不正确</p>'
  }
}

export function renderResearchMarkdown(markdown: string): string {
  const withCharts = markdown.replace(/```chart\s*\r?\n([\s\S]*?)```/gi, (_block, source: string) => renderChartBlock(source.trim()))
  const html = marked.parse(withCharts, { async: false }) as string
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'input', 'details', 'summary',
      'div', 'span', 'figure', 'figcaption', 'svg', 'g', 'line', 'rect', 'circle', 'path', 'polyline', 'polygon', 'text', 'i',
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['class', 'role', 'aria-label'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      input: ['type', 'checked', 'disabled'],
      svg: ['viewBox', 'role', 'aria-label'],
      line: ['x1', 'x2', 'y1', 'y2'],
      rect: ['x', 'y', 'width', 'height', 'rx'],
      circle: ['cx', 'cy', 'r'],
      path: ['d'],
      polyline: ['points'],
      polygon: ['points'],
      text: ['x', 'y', 'text-anchor'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    transformTags: {
      a: (_tagName, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'noreferrer noopener', target: '_blank' } }),
      img: (_tagName, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: attribs.loading || 'lazy' } }),
    },
  })
}

function researchBackupFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 150)
}

export function githubResearchPath(category: ResearchCategory, slug: string, contentFormat: ResearchContentFormat = 'markdown', title = ''): string {
  const folder = category
  const fileName = contentFormat === 'html' && title ? `${researchBackupFileName(title)}.html` : `${slug}.md`
  return `数据分析/${folder}/${fileName}`
}
