import { NextRequest, NextResponse } from 'next/server'
import { loadIpBrandAdmin } from '@/lib/ipbrand-admin'

export const dynamic = 'force-dynamic'

// 公开接口：返回 IP品牌库管理员增量数据（已删IP/字段编辑/品牌手册），前端与 ips.json 合并渲染
// GET /api/ipbrand/overrides
export async function GET(_request: NextRequest) {
  try {
    return NextResponse.json(loadIpBrandAdmin())
  } catch {
    // 异常时补齐完整结构，保证前端 mergeIpRecords 和词库读取不崩
    return NextResponse.json({ deleted: [], edits: {}, manuals: {}, new_records: [], options: {} })
  }
}
