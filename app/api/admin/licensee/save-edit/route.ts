import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { loadLicenseeAdmin, saveLicenseeAdmin } from '@/lib/licensee-admin'
import type { LicenseeEdit } from '@/lib/licensee-types'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: number; edit?: LicenseeEdit }
  try { body = await request.json() } catch { return NextResponse.json({ error: '请求体解析失败' }, { status: 400 }) }
  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0 || !body.edit || typeof body.edit !== 'object') {
    return NextResponse.json({ error: '缺少有效编号或编辑内容' }, { status: 400 })
  }
  const admin = loadLicenseeAdmin()
  admin.edits[String(id)] = body.edit
  saveLicenseeAdmin(admin)
  return NextResponse.json({ ok: true })
}
