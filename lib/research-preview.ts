import migratedReports from '@/ops/migration/research-reports.json'
import type { ResearchReport } from './research'

declare global {
  var __ipHotResearchPreview: ResearchReport[] | undefined
}

export function researchPreviewEnabled(): boolean {
  return process.env.IP_HOT_RESEARCH_PREVIEW === '1' || (process.env.NODE_ENV === 'development' && !process.env.DATABASE_URL)
}

function initialReports(): ResearchReport[] {
  const now = new Date().toISOString()
  return migratedReports.map((report) => ({
    id: report.slug,
    slug: report.slug,
    category: report.category as ResearchReport['category'],
    title: report.title,
    published_at: report.published_at,
    markdown_content: report.markdown_content,
    github_backup_status: 'pending',
    github_backup_path: null,
    github_backup_error: null,
    github_backed_up_at: null,
    created_at: now,
    updated_at: now,
  }))
}

export function previewReports(): ResearchReport[] {
  globalThis.__ipHotResearchPreview ??= initialReports()
  return globalThis.__ipHotResearchPreview
}

export function addPreviewReport(report: ResearchReport): void {
  previewReports().unshift(report)
}

export function updatePreviewReport(id: string, patch: Partial<ResearchReport>): void {
  globalThis.__ipHotResearchPreview = previewReports().map((report) => report.id === id ? { ...report, ...patch } : report)
}
