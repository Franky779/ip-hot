import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { loadIpBrandAdmin, saveIpBrandAdmin } from '@/lib/ipbrand-admin'

export const dynamic = 'force-dynamic'

// 管理员：从 IP品牌库删除一个 IP（写入 deleted 清单）
// POST /api/admin/ipbrand/delete  body: { id: number }
export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { id?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求体解析失败' }, { status: 400 })
  }
  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: '缺少有效的 IP 编号' }, { status: 400 })
  }

  try {
    const admin = loadIpBrandAdmin()
    if (!admin.deleted.includes(id)) {
      admin.deleted.push(id)
    }
    saveIpBrandAdmin(admin)
    return NextResponse.json({ ok: true, deleted: id })
  } catch (e) {
    return NextResponse.json({ error: `保存失败: ${(e as Error).message}` }, { status: 500 })
  }
}
