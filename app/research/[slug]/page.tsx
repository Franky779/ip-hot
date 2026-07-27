import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase'
import { renderResearchMarkdown, type ResearchReport } from '@/lib/research'
import { previewReports, researchPreviewEnabled } from '@/lib/research-preview'

export const dynamic = 'force-dynamic'

export default async function ResearchReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (researchPreviewEnabled()) {
    const report = previewReports().find((item) => item.slug === slug)
    if (!report) notFound()
    return <ReportPage report={report} />
  }
  const { data, error } = await createServiceClient().from('research_reports').select('id, slug, category, title, published_at, markdown_content, github_backup_status, github_backup_path, github_backup_error, github_backed_up_at, created_at, updated_at').eq('slug', slug).maybeSingle()
  if (error || !data) notFound()
  return <ReportPage report={data as ResearchReport} />
}

function ReportPage({ report }: { report: ResearchReport }) {
  return <><header className="page-header"><div className="research-report-header"><div><Link className="research-back-link" href="/research">← 返回深度研究</Link><p className="eyebrow">{report.category} · {report.published_at}</p><h1 className="page-title font-serif">{report.title}</h1></div></div></header><article className="research-report-page"><div className="research-report-content" dangerouslySetInnerHTML={{ __html: renderResearchMarkdown(report.markdown_content) }} /></article></>
}
