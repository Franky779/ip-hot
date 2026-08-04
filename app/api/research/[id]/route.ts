import { createServiceClient } from '@/lib/supabase'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { previewReports, removePreviewReport, researchPreviewEnabled } from '@/lib/research-preview'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (researchPreviewEnabled()) {
    const report = previewReports().find((item) => item.slug === id)
    return report ? Response.json({ report }) : Response.json({ error: '报告不存在' }, { status: 404 })
  }
  const { data, error } = await createServiceClient().from('research_reports').select('id, slug, category, title, published_at, markdown_content, content_format, github_backup_status, github_backup_path, github_backup_error, github_backed_up_at, created_at, updated_at').eq('slug', id).maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: '报告不存在' }, { status: 404 })
  return Response.json({ report: data })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthenticated(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (researchPreviewEnabled()) {
    const report = previewReports().find((item) => item.id === id)
    if (!report) return Response.json({ error: '报告不存在' }, { status: 404 })
    removePreviewReport(id)
    return Response.json({ ok: true })
  }
  const { error } = await createServiceClient().from('research_reports').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
