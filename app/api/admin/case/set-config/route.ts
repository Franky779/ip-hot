import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { loadCaseAdmin, saveCaseAdmin } from '@/lib/case-admin'
import { mergeCaseRecords, type CaseRecord } from '@/lib/case-types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { custom_categories?: unknown; custom_cities?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: '请求体解析失败' }, { status: 400 }) }
  const hasConfigChange = Array.isArray(body.custom_categories) || Array.isArray(body.custom_cities)
  if (!hasConfigChange) return NextResponse.json({ error: '没有可保存的配置项' }, { status: 400 })
  const clean = (value: unknown) => Array.isArray(value) ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))) : []
  const admin = loadCaseAdmin()
  if (Array.isArray(body.custom_categories)) {
    const nextCategories = clean(body.custom_categories)
    const removed = admin.config.custom_categories.filter(item => !nextCategories.includes(item))
    if (removed.length) {
      const records = JSON.parse(readFileSync(join(process.cwd(), 'public', 'case', 'cases.json'), 'utf8')) as CaseRecord[]
      const allRecords = mergeCaseRecords(records, admin)
      const related = removed.flatMap(category => allRecords.filter(record => record.product_category === category).map(record => ({ category, name: record.ip_name || record.licensee_name })))
      if (related.length) return NextResponse.json({ error: `无法删除品类“${related[0].category}”：仍有案例“${related[0].name}”使用该品类，请先调整关联信息` }, { status: 409 })
    }
    admin.config.custom_categories = nextCategories
  }
  if (Array.isArray(body.custom_cities)) admin.config.custom_cities = clean(body.custom_cities)
  saveCaseAdmin(admin)
  return NextResponse.json({ ok: true, config: admin.config })
}
