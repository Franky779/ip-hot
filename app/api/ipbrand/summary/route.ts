import { NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadIpBrandAdmin } from '@/lib/ipbrand-admin'
import { mergeIpRecords, toIpSummary, type IpRecord } from '@/lib/ipbrand-types'
import { pinyinInitial } from '@/lib/pinyin-initial'

export const dynamic = 'force-dynamic'

// 公开接口：返回 IP品牌库列表轻量摘要（服务端合并管理员增量并算好首字母）
// 列表页/编辑器搜索共用，避免每次下载 4.7MB 全量 ips.json
// 短缓存：admin 改动 60s 内生效；失败返 500 让客户端进 loadError 分支
// GET /api/ipbrand/summary
export async function GET() {
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'ipbrand', 'ips.json'), 'utf8')
    const records = JSON.parse(raw) as IpRecord[]
    const admin = loadIpBrandAdmin()
    const summary = mergeIpRecords(records, admin).map(r =>
      toIpSummary(r, pinyinInitial(r.name_cn || r.name_en || '')),
    )
    const resp = NextResponse.json(summary)
    resp.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return resp
  } catch {
    return NextResponse.json({ error: '数据读取失败' }, { status: 500 })
  }
}
