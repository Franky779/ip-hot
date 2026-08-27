import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { deleteLicenseeFile, loadLicenseeAdmin, saveLicenseeAdmin } from '@/lib/licensee-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { id?: number; name?: string; folder?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: '请求体解析失败' }, { status: 400 }) }
  const id = Number(body.id)
  const name = String(body.name || '').trim()
  const folder = String(body.folder || '').trim()
  if (!Number.isInteger(id) || id <= 0 || !name || !folder || /[\\/]/.test(name) || /[\\/]/.test(folder)) {
    return NextResponse.json({ error: '缺少有效编号或文件名' }, { status: 400 })
  }
  try {
    deleteLicenseeFile(folder, name)
    const admin = loadLicenseeAdmin()
    const current = admin.edits[String(id)] || {}
    admin.edits[String(id)] = { ...current, qr_images: (current.qr_images || []).filter(local => !local.endsWith(`/${name}`)) }
    saveLicenseeAdmin(admin)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: `删除失败: ${(e as Error).message}` }, { status: 500 })
  }
}
