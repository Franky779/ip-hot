import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { caseFolderName, caseImagePath, getCaseImageDir, loadCaseAdmin, saveCaseAdmin, uniqueCaseFilename } from '@/lib/case-admin'
import { CASE_CITIES, CASE_LICENSE_KINDS, CASE_PRODUCT_CATEGORIES, isCaseImage, type CaseRecord, type CaseSocial } from '@/lib/case-types'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'
const MAX_BYTES = 15 * 1024 * 1024

function jsonSocial(form: FormData): CaseSocial | null {
  try {
    const value = JSON.parse(String(form.get('social') || 'null'))
    if (!value || typeof value !== 'object') return null
    const item = value as Record<string, unknown>
    return {
      note_url: String(item.note_url || '').trim(),
      note_title: String(item.note_title || '').trim(),
      note_published: String(item.note_published || '').trim(),
      like_count: Math.max(0, Number(item.like_count) || 0),
      collect_count: Math.max(0, Number(item.collect_count) || 0),
      comment_count: Math.max(0, Number(item.comment_count) || 0),
    }
  } catch { return null }
}

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: '无法解析上传数据' }, { status: 400 }) }
  const ipName = String(form.get('ip_name') || '').trim()
  const licenseeName = String(form.get('licensee_name') || '').trim()
  if (!ipName && !licenseeName) return NextResponse.json({ error: '请至少填写 IP 名称或品牌方名称' }, { status: 400 })
  try {
    const admin = loadCaseAdmin()
    const staticRecords = JSON.parse(readFileSync(join(process.cwd(), 'public', 'case', 'cases.json'), 'utf8')) as CaseRecord[]
    const maxId = Math.max(0, ...staticRecords.map(r => r.id), ...(admin.new_records || []).map(r => r.id))
    const id = maxId + 1
    const licenseKind = String(form.get('license_kind') || '')
    const productCategory = String(form.get('product_category') || '')
    const city = String(form.get('city') || '')
    const dirName = caseFolderName(id, ipName || licenseeName)
    const dir = join(getCaseImageDir(), dirName)
    mkdirSync(dir, { recursive: true })
    const images: { local: string }[] = []
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    for (const file of files) {
      if (!isCaseImage(file.name) || file.size > MAX_BYTES) continue
      const filename = uniqueCaseFilename('case', file.name)
      writeFileSync(join(dir, filename), Buffer.from(await file.arrayBuffer()))
      images.push({ local: caseImagePath(dirName, filename) })
    }
    const record: CaseRecord = {
      id,
      ip_id: Math.max(0, Number(form.get('ip_id')) || 0),
      ip_name: ipName,
      licensee_id: Math.max(0, Number(form.get('licensee_id')) || 0),
      licensee_name: licenseeName,
      factory_id: Math.max(0, Number(form.get('factory_id')) || 0),
      factory_name: String(form.get('factory_name') || '').trim(),
      images,
      license_kind: (CASE_LICENSE_KINDS as readonly string[]).includes(licenseKind) ? licenseKind as CaseRecord['license_kind'] : '',
      product_category: [...CASE_PRODUCT_CATEGORIES, ...(admin.config.custom_categories || [])].includes(productCategory) ? productCategory : '',
      city: [...CASE_CITIES, ...(admin.config.custom_cities || [])].includes(city) ? city : String(form.get('city') || '').trim(),
      case_date: String(form.get('case_date') || '').trim(),
      description: String(form.get('description') || '').trim(),
      source_url: String(form.get('source_url') || '').trim(),
      social: jsonSocial(form),
      analysis_blocks: [],
      promo_timeline: [],
      gated: false,
    }
    admin.new_records = [...(admin.new_records || []), record]
    saveCaseAdmin(admin)
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return NextResponse.json({ error: `创建失败: ${(e as Error).message}` }, { status: 500 })
  }
}
