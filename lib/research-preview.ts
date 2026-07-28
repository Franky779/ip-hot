import migratedReports from '@/ops/migration/research-reports.json'
import htmlReports from '@/ops/migration/research-html-reports.json'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeResearchCategory, type ResearchReport } from './research'

declare global {
  var __ipHotResearchPreview: ResearchReport[] | undefined
}

export function researchPreviewEnabled(): boolean {
  return process.env.IP_HOT_RESEARCH_PREVIEW === '1' || (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL)
}

function initialReports(): ResearchReport[] {
  const now = new Date().toISOString()
  const markdown = migratedReports.map((report) => ({
    id: report.slug,
    slug: report.slug,
    category: normalizeResearchCategory(report.category),
    title: report.title,
    published_at: report.published_at,
    markdown_content: report.markdown_content,
    content_format: 'markdown' as const,
    github_backup_status: 'pending' as const,
    github_backup_path: null,
    github_backup_error: null,
    github_backed_up_at: null,
    created_at: now,
    updated_at: now,
  }))
  const html = htmlReports.map((report) => ({
    id: report.slug,
    slug: report.slug,
    category: normalizeResearchCategory(report.category),
    title: report.title,
    published_at: report.published_at,
    markdown_content: readFileSync(resolve(process.cwd(), report.content_file), 'utf8'),
    content_format: 'html' as const,
    github_backup_status: 'pending' as const,
    github_backup_path: null,
    github_backup_error: null,
    github_backed_up_at: null,
    created_at: now,
    updated_at: now,
  }))
  return [...html, ...markdown]
}

export function previewReports(): ResearchReport[] {
  if (process.env.NODE_ENV === 'development') {
    const sourceReports = initialReports()
    const sourceIds = new Set(sourceReports.map((report) => report.id))
    const addedReports = (globalThis.__ipHotResearchPreview || []).filter((report) => !sourceIds.has(report.id))
    globalThis.__ipHotResearchPreview = [...sourceReports, ...addedReports]
  } else {
    globalThis.__ipHotResearchPreview ??= initialReports()
  }
  return globalThis.__ipHotResearchPreview
}

export function addPreviewReport(report: ResearchReport): void {
  previewReports().unshift(report)
}

export function updatePreviewReport(id: string, patch: Partial<ResearchReport>): void {
  globalThis.__ipHotResearchPreview = previewReports().map((report) => report.id === id ? { ...report, ...patch } : report)
}
