import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { loadCaseAdmin, saveCaseAdmin } from '@/lib/case-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: '请求体解析失败' }, { status: 400 }) }
  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: '缺少有效的案例编号' }, { status: 400 })
  const admin = loadCaseAdmin()
  if (!admin.deleted.includes(id)) admin.deleted.push(id)
  saveCaseAdmin(admin)
  return NextResponse.json({ ok: true, deleted: id })
}
