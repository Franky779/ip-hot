import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase'
import { backupResearchToGithub } from '@/lib/research-backup'
import { currentShanghaiDate, slugFromTitle, RESEARCH_CATEGORIES, MAX_RESEARCH_TITLE_LENGTH, type ResearchReport } from '@/lib/research'
import { addPreviewReport, researchPreviewEnabled, updatePreviewReport } from '@/lib/research-preview'
import AdmZip from 'adm-zip'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

export const dynamic = 'force-dynamic'

const IMAGE_BASE = '/srv/www/research-images'
const BASE_URL = 'https://hot.laojia-ip.com/research-images'
const MAX_PAGES = 200

export async function POST(request: Request) {
  // 1. Parse form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: '无法解析上传数据' }, { status: 400 })
  }

  // 2. Auth via password field
  const password = String(formData.get('password') || '')
  if (!isAdminAuthenticated(password)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 3. Validate fields
  const title = String(formData.get('title') || '').trim()
  const category = String(formData.get('category') || '').trim()
  const file = formData.get('file') as File | null

  if (!title || title.length > MAX_RESEARCH_TITLE_LENGTH) {
    return Response.json({ error: `标题不能为空且不能超过${MAX_RESEARCH_TITLE_LENGTH}字` }, { status: 400 })
  }
  if (!RESEARCH_CATEGORIES.includes(category as typeof RESEARCH_CATEGORIES[number])) {
    return Response.json({ error: '请选择有效的报告分类' }, { status: 400 })
  }
  if (!file || !(file instanceof File)) {
    return Response.json({ error: '请上传 ZIP 文件' }, { status: 400 })
  }
  if (!file.name.toLowerCase().endsWith('.zip')) {
    return Response.json({ error: '只支持 ZIP 格式文件' }, { status: 400 })
  }

  // 4. Parse ZIP
  let zip: AdmZip
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    zip = new AdmZip(buffer)
  } catch {
    return Response.json({ error: '无法解析 ZIP 文件' }, { status: 400 })
  }

  // 5. Security: filter and validate entries
  const entries = zip.getEntries()
  const pngEntries = entries.filter(
    e => !e.isDirectory && e.entryName.toLowerCase().endsWith('.webp'),
  )

  if (pngEntries.length === 0) {
    return Response.json({ error: 'ZIP 文件中没有找到 WebP 图片' }, { status: 400 })
  }
  if (pngEntries.length > MAX_PAGES) {
    return Response.json({ error: `最多支持 ${MAX_PAGES} 页图片` }, { status: 400 })
  }

  for (const entry of pngEntries) {
    if (entry.entryName.includes('..') || entry.entryName.includes('~')) {
      return Response.json({ error: 'ZIP 文件名包含非法路径字符' }, { status: 400 })
    }
  }

  // 6. Generate slug and prepare paths
  const slug = slugFromTitle(title, crypto.randomUUID().slice(0, 8))
  const imageDir = resolve(IMAGE_BASE, slug)
  const publishedAt = currentShanghaiDate()

  // 7. Write images
  try {
    // Clean existing dir if any
    try { rmSync(imageDir, { recursive: true, force: true }) } catch { /* ignore */ }
    mkdirSync(imageDir, { recursive: true })

    const sorted = pngEntries.sort((a, b) => a.entryName.localeCompare(b.entryName, 'zh'))
    const imageNames: string[] = []

    for (let i = 0; i < sorted.length; i++) {
      const name = `page-${String(i + 1).padStart(2, '0')}.webp`
      writeFileSync(resolve(imageDir, name), sorted[i].getData())
      imageNames.push(name)
    }

    // 8. Generate markdown
    const imageLines = imageNames
      .map(name => `![${name}](${BASE_URL}/${slug}/${name})`)
      .join('\n\n')
    const markdownContent = `# ${title}\n\n${imageLines}\n`

    // 9. Preview mode
    if (researchPreviewEnabled()) {
      const now = new Date().toISOString()
      const report = {
        id: crypto.randomUUID(), slug, category, title,
        published_at: publishedAt, markdown_content: markdownContent,
        content_format: 'markdown' as const,
        github_backup_status: 'failed' as const,
        github_backup_path: null, github_backup_error: '本地预览未配置 GitHub Token',
        github_backed_up_at: null, created_at: now, updated_at: now,
      }
      addPreviewReport(report as ResearchReport)
      return Response.json({ report, url: `/research/${slug}`, warning: report.github_backup_error }, { status: 201 })
    }

    // 10. DB insert
    const client = createServiceClient()
    const inserted = await client.from('research_reports').insert({
      slug,
      category,
      title,
      published_at: publishedAt,
      markdown_content: markdownContent,
      content_format: 'markdown',
      github_backup_status: 'pending',
    }).select('id, slug, category, title, published_at, markdown_content, content_format, github_backup_status, github_backup_path, github_backup_error, github_backed_up_at, created_at, updated_at')

    if (inserted.error || !inserted.data) {
      return Response.json({ error: inserted.error?.message || '报告保存失败' }, { status: 500 })
    }
    const report = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data

    // 11. GitHub backup
    try {
      const backup = await backupResearchToGithub({ category: category as ResearchReport['category'], slug, title, published_at: publishedAt, markdown_content: markdownContent, content_format: 'markdown' })
      await client.from('research_reports').update({ github_backup_status: 'backed_up', github_backup_path: backup.path, github_backup_error: null, github_backed_up_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', report.id)
      return Response.json({ report: { ...report, github_backup_status: 'backed_up', github_backup_path: backup.path }, url: `/research/${slug}` }, { status: 201 })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub 备份失败'
      await client.from('research_reports').update({ github_backup_status: 'failed', github_backup_error: message, updated_at: new Date().toISOString() }).eq('id', report.id)
      return Response.json({ report: { ...report, github_backup_status: 'failed', github_backup_error: message }, url: `/research/${slug}`, warning: message }, { status: 201 })
    }
  } catch (error) {
    try { rmSync(imageDir, { recursive: true, force: true }) } catch { /* ignore */ }
    const message = error instanceof Error ? error.message : '文件处理失败'
    return Response.json({ error: message }, { status: 500 })
  }
}
