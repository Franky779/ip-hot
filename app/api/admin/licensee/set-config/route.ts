import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { loadLicenseeAdmin, saveLicenseeAdmin } from '@/lib/licensee-admin'
import { mergeLicenseeRecords, type LicenseeRecord } from '@/lib/licensee-types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { contact_public?: boolean; custom_hubs?: unknown; custom_categories?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: '请求体解析失败' }, { status: 400 }) }
  const hasConfigChange = typeof body.contact_public === 'boolean' || Array.isArray(body.custom_hubs) || Array.isArray(body.custom_categories)
  if (!hasConfigChange) return NextResponse.json({ error: '没有可保存的配置项' }, { status: 400 })
  const clean = (value: unknown) => Array.isArray(value) ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))) : []
  const admin = loadLicenseeAdmin()
  if (Array.isArray(body.custom_categories)) {
    const nextCategories = clean(body.custom_categories)
    const currentCategories = admin.config.custom_categories
    const removed = currentCategories.filter(item => !nextCategories.includes(item))
    if (removed.length) {
      const records = JSON.parse(readFileSync(join(process.cwd(), 'public', 'licensee', 'licensees.json'), 'utf8')) as LicenseeRecord[]
      const allRecords = mergeLicenseeRecords(records, admin)
      const related = removed.flatMap(category => allRecords.filter(record => record.categories.includes(category)).map(record => ({ category, name: record.name })))
      if (related.length) return NextResponse.json({ error: `无法删除品类“${related[0].category}”：仍有品牌方“${related[0].name}”使用该品类，请先调整关联信息` }, { status: 409 })
    }
    admin.config.custom_categories = nextCategories
  }
  if (typeof body.contact_public === 'boolean') admin.config.contact_public = body.contact_public
  if (Array.isArray(body.custom_hubs)) admin.config.custom_hubs = clean(body.custom_hubs)
  saveLicenseeAdmin(admin)
  return NextResponse.json({ ok: true, config: admin.config })
}
