import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { loadIpBrandAdmin, saveIpBrandAdmin, getIpbrandManualDir } from '@/lib/ipbrand-admin'
import { unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'

// 管理员：删除某 IP 的一张「IP快闪/美陈方案」图片（删磁盘文件 + 移除元数据）
// POST /api/admin/ipbrand/delete-event-plan  body: { id: number, name: string }
export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { id?: number; name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求体解析失败' }, { status: 400 })
  }
  const id = Number(body.id)
  const name = String(body.name || '').trim()
  if (!Number.isInteger(id) || id <= 0 || !name || name.includes('/') || name.includes('\\')) {
    return NextResponse.json({ error: '缺少有效的 IP 编号或文件名' }, { status: 400 })
  }

  try {
    const admin = loadIpBrandAdmin()
    const key = String(id)
    const list = admin.event_plans[key] || []
    const item = list.find(x => x.name === name)
    if (!item) {
      return NextResponse.json({ error: '方案图片不存在' }, { status: 404 })
    }

    // 删磁盘文件（容错：不存在也继续）
    const filePath = join(getIpbrandManualDir(), key, name)
    if (existsSync(filePath)) {
      try { unlinkSync(filePath) } catch { /* 忽略删除失败，仍移除元数据 */ }
    }

    admin.event_plans[key] = list.filter(x => x.name !== name)
    if (admin.event_plans[key].length === 0) delete admin.event_plans[key]
    saveIpBrandAdmin(admin)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: `删除失败: ${(e as Error).message}` }, { status: 500 })
  }
}
