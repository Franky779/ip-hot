import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase'
import { backupResearchToGithub } from '@/lib/research-backup'
import { currentShanghaiDate, formatResearchDate, slugFromTitle, validateResearchInput } from '@/lib/research'
import { addPreviewReport, previewReports, researchPreviewEnabled, updatePreviewReport } from '@/lib/research-preview'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (researchPreviewEnabled()) return Response.json({ reports: previewReports() })
  const { data, error } = await createServiceClient()
    .from('research_reports')
    .select('id, slug, category, title, published_at, markdown_content, github_backup_status, github_backup_path, github_backup_error, github_backed_up_at, created_at, updated_at')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ reports: (data ?? []).map((report) => ({ ...report, published_at: formatResearchDate(report.published_at) })) })
}

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const result = validateResearchInput(await request.json())
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 })

  const value = result.value
  const publishedAt = currentShanghaiDate()
  const slug = slugFromTitle(value.title, crypto.randomUUID().slice(0, 8))
  if (researchPreviewEnabled()) {
    const now = new Date().toISOString()
    const report = { id: crypto.randomUUID(), slug, ...value, published_at: publishedAt, github_backup_status: 'failed' as const, github_backup_path: null, github_backup_error: '本地预览未配置 GitHub Token', github_backed_up_at: null, created_at: now, updated_at: now }
    addPreviewReport(report)
    return Response.json({ report, warning: report.github_backup_error }, { status: 201 })
  }
  const client = createServiceClient()
  const inserted = await client.from('research_reports').insert({
    slug,
    category: value.category,
    title: value.title,
    published_at: publishedAt,
    markdown_content: value.markdown_content,
    github_backup_status: 'pending',
  }).select('id, slug, category, title, published_at, markdown_content, github_backup_status, github_backup_path, github_backup_error, github_backed_up_at, created_at, updated_at')
  if (inserted.error || !inserted.data) return Response.json({ error: inserted.error?.message || '报告保存失败' }, { status: 500 })
  const report = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data

  try {
    const backup = await backupResearchToGithub({ ...value, published_at: publishedAt, slug })
    await client.from('research_reports').update({ github_backup_status: 'backed_up', github_backup_path: backup.path, github_backup_error: null, github_backed_up_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', report.id)
    updatePreviewReport(report.id, { github_backup_status: 'backed_up', github_backup_path: backup.path, github_backup_error: null })
    return Response.json({ report: { ...report, published_at: formatResearchDate(report.published_at), github_backup_status: 'backed_up', github_backup_path: backup.path, github_backup_error: null } }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GitHub 备份失败'
    await client.from('research_reports').update({ github_backup_status: 'failed', github_backup_error: message, updated_at: new Date().toISOString() }).eq('id', report.id)
    return Response.json({ report: { ...report, published_at: formatResearchDate(report.published_at), github_backup_status: 'failed', github_backup_error: message }, warning: message }, { status: 201 })
  }
}
