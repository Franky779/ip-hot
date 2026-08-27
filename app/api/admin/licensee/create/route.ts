import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { licenseeFolderName, licenseeImagePath, getLicenseeImageDir, loadLicenseeAdmin, saveLicenseeAdmin, uniqueLicenseeFilename } from '@/lib/licensee-admin'
import { LICENSEE_BIZ_TYPES, LICENSEE_CHANNELS, LICENSEE_AUDIENCES, LICENSEE_CATEGORIES, LICENSEE_HUBS, isLicenseeImage, type LicenseeCase, type LicenseeRecord } from '@/lib/licensee-types'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'
const MAX_BYTES = 15 * 1024 * 1024

function jsonArray(form: FormData, key: string): string[] {
  try {
    const value = JSON.parse(String(form.get(key) || '[]'))
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch { return [] }
}

function jsonCases(form: FormData): LicenseeCase[] {
  try {
    const value = JSON.parse(String(form.get('licensing_cases') || '[]'))
    if (!Array.isArray(value)) return []
    return value
      .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
      .map(item => ({
        ip_id: Math.max(0, Number(item.ip_id) || 0),
        ip_name: String(item.ip_name || '').trim(),
        category: String(item.category || '').trim(),
        license_type: String(item.license_type || '').trim(),
        factory_id: Math.max(0, Number(item.factory_id) || 0),
        factory_name: String(item.factory_name || '').trim(),
        launch_date: String(item.launch_date || '').trim(),
        sales_note: String(item.sales_note || '').trim(),
      }))
      .filter(item => item.ip_name)
  } catch { return [] }
}

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ error: '无法解析上传数据' }, { status: 400 }) }
  const name = String(form.get('name') || '').trim()
  if (!name) return NextResponse.json({ error: '请填写品牌方名称' }, { status: 400 })
  try {
    const admin = loadLicenseeAdmin()
    const staticRecords = JSON.parse(readFileSync(join(process.cwd(), 'public', 'licensee', 'licensees.json'), 'utf8')) as LicenseeRecord[]
    const maxId = Math.max(0, ...staticRecords.map(r => r.id), ...(admin.new_records || []).map(r => r.id))
    const id = maxId + 1
    const categories = jsonArray(form, 'categories').filter(v => [...LICENSEE_CATEGORIES, ...(admin.config.custom_categories || [])].includes(v))
    const bizTypes = jsonArray(form, 'biz_types').filter(v => (LICENSEE_BIZ_TYPES as readonly string[]).includes(v))
    const channels = jsonArray(form, 'channels').filter(v => (LICENSEE_CHANNELS as readonly string[]).includes(v))
    const audiences = jsonArray(form, 'audiences').filter(v => (LICENSEE_AUDIENCES as readonly string[]).includes(v))
    const hub = String(form.get('hub') || '')
    const dirName = licenseeFolderName(id, name)
    const dir = join(getLicenseeImageDir(), dirName)
    mkdirSync(dir, { recursive: true })
    const images: { local: string }[] = []
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    for (const file of files) {
      if (!isLicenseeImage(file.name) || file.size > MAX_BYTES) continue
      const filename = uniqueLicenseeFilename('licensee', file.name)
      writeFileSync(join(dir, filename), Buffer.from(await file.arrayBuffer()))
      images.push({ local: licenseeImagePath(dirName, filename) })
    }
    const qrImages: string[] = []
    const qrFiles = form.getAll('qr_files').filter((f): f is File => f instanceof File)
    for (const file of qrFiles) {
      if (!isLicenseeImage(file.name) || file.size > 10 * 1024 * 1024) continue
      const filename = uniqueLicenseeFilename('qr', file.name)
      writeFileSync(join(dir, filename), Buffer.from(await file.arrayBuffer()))
      qrImages.push(licenseeImagePath(dirName, filename))
    }
    const record: LicenseeRecord = {
      id, name,
      name_en: String(form.get('name_en') || '').trim(),
      images,
      one_line: String(form.get('one_line') || '').trim(),
      company: String(form.get('company') || '').trim(),
      founded: String(form.get('founded') || '').trim(),
      hub: [...LICENSEE_HUBS, ...(admin.config.custom_hubs || [])].includes(hub) ? hub : '',
      location: String(form.get('location') || '').trim(),
      categories,
      biz_types: bizTypes,
      channels,
      audiences,
      intro: String(form.get('intro') || '').trim(),
      licensing_cases: jsonCases(form),
      qr_images: qrImages,
      verified: String(form.get('verified') || '') === 'true',
    }
    admin.new_records = [...(admin.new_records || []), record]
    saveLicenseeAdmin(admin)
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return NextResponse.json({ error: `创建失败: ${(e as Error).message}` }, { status: 500 })
  }
}
