import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { loadIpBrandAdmin, saveIpBrandAdmin } from '@/lib/ipbrand-admin'
import type { IpBrandEdit } from '@/lib/ipbrand-types'

export const dynamic = 'force-dynamic'

// 管理员：保存某个 IP 的字段编辑（整体替换该 IP 的 edit，前端提交完整可变字段快照）
// POST /api/admin/ipbrand/save-edit  body: { id: number, edit: IpBrandEdit }
export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { id?: number; edit?: IpBrandEdit }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求体解析失败' }, { status: 400 })
  }
  const id = Number(body.id)
  const edit = body.edit
  if (!Number.isInteger(id) || id <= 0 || !edit || typeof edit !== 'object') {
    return NextResponse.json({ error: '缺少有效的 IP 编号或编辑内容' }, { status: 400 })
  }

  try {
    const admin = loadIpBrandAdmin()
    admin.edits[String(id)] = edit
    saveIpBrandAdmin(admin)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: `保存失败: ${(e as Error).message}` }, { status: 500 })
  }
}
