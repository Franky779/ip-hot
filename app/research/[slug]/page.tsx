import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { formatResearchDate, renderResearchMarkdown, researchCategoryLink, type ResearchReport } from '@/lib/research'
import { previewReports, researchPreviewEnabled } from '@/lib/research-preview'
import { ResearchHtmlFrame } from './ResearchHtmlFrame'
import { ImageRetry } from './ImageRetry'

export const dynamic = 'force-dynamic'

export default async function ResearchReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (researchPreviewEnabled()) {
    const report = previewReports().find((item) => item.slug === slug)
    if (!report) notFound()
    return <ReportPage report={report} />
  }
  const { data, error } = await createServiceClient().from('research_reports').select('id, slug, category, title, published_at, markdown_content, content_format, github_backup_status, github_backup_path, github_backup_error, github_backed_up_at, created_at, updated_at').eq('slug', slug).maybeSingle()
  if (error || !data) notFound()
  return <ReportPage report={data as ResearchReport} />
}

function ReportPage({ report }: { report: ResearchReport }) {
  report = { ...report, published_at: formatResearchDate(report.published_at) }
  const backLink = researchCategoryLink(report.category)
  if (report.content_format === 'html') {
    return <><header className="page-header research-html-toolbar"><Link className="research-back-link" href={backLink.href}>{backLink.label}</Link><p className="eyebrow">{report.category} · {report.published_at}</p></header><article className="research-html-page"><ResearchHtmlFrame slug={report.slug} title={report.title} /></article></>
  }
  return <><header className="page-header"><div className="research-report-header"><div><Link className="research-back-link" href={backLink.href}>{backLink.label}</Link><p className="eyebrow">{report.category} · {report.published_at}</p><h1 className="page-title font-serif">{report.title}</h1></div></div></header><article className="research-report-page"><div className="research-report-content" dangerouslySetInnerHTML={{ __html: renderResearchMarkdown(report.markdown_content) }} /><ImageRetry /></article></>
}
