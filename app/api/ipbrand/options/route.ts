import { NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadIpBrandAdmin } from '@/lib/ipbrand-admin'
import { buildIpBrandOptions, mergeIpRecords, type IpBrandOptionField, type IpRecord } from '@/lib/ipbrand-types'

export const dynamic = 'force-dynamic'

const EMPTY_RESPONSE: Record<IpBrandOptionField, string[]> = {
  category: [],
  place_origin: [],
  ages: [],
  industries: [],
}

// 公开接口：返回四类全站词库当前可用选项（分类/出品国/受众/重点品类）
// GET /api/ipbrand/options
export async function GET() {
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'ipbrand', 'ips.json'), 'utf8')
    const records = JSON.parse(raw) as IpRecord[]
    const admin = loadIpBrandAdmin()
    return NextResponse.json(buildIpBrandOptions(mergeIpRecords(records, admin), admin))
  } catch {
    // 读取失败返回空数组，避免编辑页崩溃
    return NextResponse.json(EMPTY_RESPONSE)
  }
}
