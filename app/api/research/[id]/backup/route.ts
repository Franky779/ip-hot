import { isAdminAuthenticated } from '@/lib/admin-auth'
import { backupResearchToGithub } from '@/lib/research-backup'
import { createServiceClient } from '@/lib/supabase'
import type { ResearchReport } from '@/lib/research'
import { previewReports, researchPreviewEnabled, updatePreviewReport } from '@/lib/research-preview'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthenticated(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (researchPreviewEnabled()) {
    const report = previewReports().find((item) => item.id === id)
    if (!report) return Response.json({ error: '报告不存在' }, { status: 404 })
    try {
      const backup = await backupResearchToGithub(report)
      updatePreviewReport(id, { github_backup_status: 'backed_up', github_backup_path: backup.path, github_backup_error: null, github_backed_up_at: new Date().toISOString() })
      return Response.json({ ok: true, path: backup.path })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub 备份失败'
      updatePreviewReport(id, { github_backup_status: 'failed', github_backup_error: message })
      return Response.json({ error: message }, { status: 502 })
    }
  }
  const client = createServiceClient()
  const result = await client.from('research_reports').select('id, slug, category, title, published_at, markdown_content').eq('id', id).maybeSingle()
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 })
  if (!result.data) return Response.json({ error: '报告不存在' }, { status: 404 })
  const report = result.data as Pick<ResearchReport, 'slug' | 'category' | 'title' | 'published_at' | 'markdown_content'>
  try {
    const backup = await backupResearchToGithub(report)
    await client.from('research_reports').update({ github_backup_status: 'backed_up', github_backup_path: backup.path, github_backup_error: null, github_backed_up_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id)
    return Response.json({ ok: true, path: backup.path })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub 备份失败'
    await client.from('research_reports').update({ github_backup_status: 'failed', github_backup_error: message, updated_at: new Date().toISOString() }).eq('id', id)
    return Response.json({ error: message }, { status: 502 })
  }
}
