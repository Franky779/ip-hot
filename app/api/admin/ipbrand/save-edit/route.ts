import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { loadIpBrandAdmin, saveIpBrandAdmin } from '@/lib/ipbrand-admin'
import { dedupeIpNews, type IpBrandEdit, type IpNews } from '@/lib/ipbrand-types'

// 相关新闻条目允许保留的字段（其余一律丢弃）
const NEWS_FIELDS: Array<keyof IpNews> = ['id', 'source', 'url', 'title', 'title_cn', 'summary_cn', 'published_at', 'created_at', 'date']

function sanitizeNewsItem(item: unknown): IpNews | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  const out: IpNews = {}
  for (const key of NEWS_FIELDS) {
    const value = record[key]
    if (typeof value === 'string') out[key] = value
  }
  return out
}

// 过滤到允许字段并去重；非法条目剔除
function sanitizeRelatedNews(value: unknown): IpNews[] {
  if (!Array.isArray(value)) return []
  return dedupeIpNews(value.map(sanitizeNewsItem).filter((item): item is IpNews => item !== null))
}

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

  // related_news 必须为数组；字段缺失表示动态匹配，空数组表示明确保存为空
  if ('related_news' in edit && edit.related_news !== undefined) {
    if (!Array.isArray(edit.related_news)) {
      return NextResponse.json({ error: 'related_news 必须是数组' }, { status: 400 })
    }
    edit.related_news = sanitizeRelatedNews(edit.related_news)
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
