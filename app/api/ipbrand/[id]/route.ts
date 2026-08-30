import { NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadIpBrandAdmin } from '@/lib/ipbrand-admin'
import { mergeIpRecords, type IpRecord } from '@/lib/ipbrand-types'

export const dynamic = 'force-dynamic'

// 公开接口：按 id 返回合并后的单条 IP 记录（含管理员编辑/删除增量）
// 短缓存：admin 改动 60s 内生效；stale-while-revalidate 让刷新用户不等待
// GET /api/ipbrand/{id}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const num = Number(id)
  if (!Number.isInteger(num) || num <= 0) {
    return NextResponse.json({ error: '无效的 IP 编号' }, { status: 400 })
  }
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'ipbrand', 'ips.json'), 'utf8')
    const records = JSON.parse(raw) as IpRecord[]
    const admin = loadIpBrandAdmin()
    const rec = mergeIpRecords(records, admin).find(r => r.id === num)
    if (!rec) return NextResponse.json({ error: 'IP 不存在' }, { status: 404 })
    const resp = NextResponse.json(rec)
    resp.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return resp
  } catch {
    return NextResponse.json({ error: '数据读取失败' }, { status: 500 })
  }
}
