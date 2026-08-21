import { NextResponse } from 'next/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { loadIpBrandAdmin, saveIpBrandAdmin, createOption, renameOption, removeOption } from '@/lib/ipbrand-admin'
import {
  buildIpBrandOptions,
  mergeIpRecords,
  countOptionUsage,
  applyOptionRename,
  type IpBrandOptionField,
  type IpRecord,
} from '@/lib/ipbrand-types'

export const dynamic = 'force-dynamic'

const OPTION_FIELDS: IpBrandOptionField[] = ['category', 'place_origin', 'ages', 'industries']
const ARRAY_FIELDS = new Set<IpBrandOptionField>(['ages', 'industries'])

// 读取静态基线 IP 记录
function readIpBrandRecords(): IpRecord[] {
  const raw = readFileSync(join(process.cwd(), 'public', 'ipbrand', 'ips.json'), 'utf8')
  return JSON.parse(raw) as IpRecord[]
}

// 比较单个选项字段在两个记录间是否变化（数组字段按内容比较）
function optionFieldChanged(field: IpBrandOptionField, before: unknown, after: unknown): boolean {
  if (ARRAY_FIELDS.has(field)) {
    const a = Array.isArray(before) ? before : []
    const b = Array.isArray(after) ? after : []
    if (a.length !== b.length) return true
    return a.some((value, index) => value !== b[index])
  }
  return before !== after
}

// 管理员：维护全站词库选项（新增/改名/删除）
// POST /api/admin/ipbrand/options  body: { action, field, value, newValue? }
export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { action?: string; field?: string; value?: string; newValue?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求体解析失败' }, { status: 400 })
  }

  const action = body.action
  const field = body.field as IpBrandOptionField | undefined
  if (action !== 'add' && action !== 'rename' && action !== 'delete') {
    return NextResponse.json({ error: '无效的操作类型' }, { status: 400 })
  }
  if (!field || !OPTION_FIELDS.includes(field)) {
    return NextResponse.json({ error: '无效的字段' }, { status: 400 })
  }
  const value = body.value ?? ''
  const newValue = body.newValue ?? ''

  try {
    const admin = loadIpBrandAdmin()
    const records = readIpBrandRecords()
    const current = mergeIpRecords(records, admin)
    const config = admin.options[field] || { added: [], removed: [] }

    if (action === 'add') {
      admin.options[field] = createOption(config, value)
      saveIpBrandAdmin(admin)
      return NextResponse.json(buildIpBrandOptions(mergeIpRecords(records, admin), admin))
    }

    if (action === 'delete') {
      const usage = countOptionUsage(current, field, value.trim())
      if (usage > 0) {
        return NextResponse.json(
          { error: `还有 ${usage} 条信息与该选项关联，请批量调整`, usageCount: usage },
          { status: 409 },
        )
      }
      admin.options[field] = removeOption(config, value, 0)
      saveIpBrandAdmin(admin)
      return NextResponse.json(buildIpBrandOptions(mergeIpRecords(records, admin), admin))
    }

    // action === 'rename'
    const renamed = applyOptionRename(current, field, value.trim(), newValue.trim())
    for (let index = 0; index < current.length; index++) {
      const before = current[index]
      const after = renamed[index]
      if (!optionFieldChanged(field, before[field], after[field])) continue
      const key = String(before.id)
      admin.edits[key] = { ...(admin.edits[key] || {}), [field]: after[field] }
    }
    admin.options[field] = renameOption(config, value, newValue)
    saveIpBrandAdmin(admin)
    return NextResponse.json(buildIpBrandOptions(mergeIpRecords(records, admin), admin))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || '操作失败' }, { status: 400 })
  }
}
