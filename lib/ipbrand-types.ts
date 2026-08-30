// lib/ipbrand-types.ts — IP品牌库共享类型与纯函数（前后端可共用，无 node:fs 依赖）

export type IpImage = { type: string; local: string }
export type IpCase = { title?: string; image?: string; date?: string }
export type IpNews = {
  id?: string
  source?: string
  title?: string
  title_cn?: string | null
  summary_cn?: string | null
  published_at?: string | null
  created_at?: string | null
  date?: string
  url?: string
}
export type IpCustomCard = { id: string; title: string; body: string }
export type IpManualItem = { name: string; url: string }
export type IpMeta = { label: string; value: string }

export type IpBrandOptionField = 'category' | 'place_origin' | 'ages' | 'industries'
export type IpBrandOptionConfig = { added: string[]; removed: string[] }
export type IpBrandOptions = Record<IpBrandOptionField, IpBrandOptionConfig>

const IP_BRAND_OPTION_FIELDS: IpBrandOptionField[] = ['category', 'place_origin', 'ages', 'industries']
const ARRAY_OPTION_FIELDS = new Set<IpBrandOptionField>(['ages', 'industries'])

export type IpRecord = {
  id: number
  name_cn: string
  name_en: string
  initial: string
  cover: string
  images: IpImage[]
  case_len: number
  category: string
  place_origin: string
  company: string
  one_line_intro: string
  ip_intro: string
  company_intro: string
  areas: string[]
  ages: string[]
  industries: string[]
  listing_date: string
  auth_start: string
  auth_end: string
  licensor_case_list: IpCase[]
  news_list: IpNews[]
  source_url: string
  verified?: boolean
  related_news?: IpNews[]
  // 管理员增量字段
  custom_cards?: IpCustomCard[]
  cards_order?: string[]
  brand_manual_images?: string[]
  ip_event_plan_images?: string[]
  section_titles?: Record<string, string>
  custom_meta?: IpMeta[]
}

export type IpBrandEdit = Partial<{
  name_cn: string
  name_en: string
  initial: string
  one_line_intro: string
  ip_intro: string
  company_intro: string
  category: string
  place_origin: string
  company: string
  areas: string[]
  ages: string[]
  industries: string[]
  listing_date: string
  auth_start: string
  auth_end: string
  cover: string
  images: { type: string; local: string }[]
  licensor_case_list: { title?: string; image?: string; date?: string }[]
  related_news: IpNews[]
  custom_cards: IpCustomCard[]
  cards_order: string[]
  section_titles: Record<string, string>
  custom_meta: IpMeta[]
  verified: boolean
}>

export type IpBrandAdminData = {
  deleted: number[]
  edits: Record<string, IpBrandEdit>
  manuals: Record<string, IpManualItem[]>
  event_plans: Record<string, IpManualItem[]>
  new_records: IpRecord[]
  options: Partial<IpBrandOptions>
}

export const EMPTY_ADMIN: IpBrandAdminData = {
  deleted: [],
  edits: {},
  manuals: {},
  event_plans: {},
  new_records: [],
  options: {},
}

function nonEmptyStrings(values: unknown): string[] {
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && value.trim() !== '') : []
}

export function buildIpBrandOptions(records: IpRecord[], admin: IpBrandAdminData): Record<IpBrandOptionField, string[]> {
  const options = {} as Record<IpBrandOptionField, string[]>
  for (const field of IP_BRAND_OPTION_FIELDS) {
    const values = new Set<string>()
    for (const record of records) {
      const value = record[field]
      if (ARRAY_OPTION_FIELDS.has(field)) {
        for (const item of nonEmptyStrings(value)) values.add(item)
      } else if (typeof value === 'string' && value.trim() !== '') {
        values.add(value)
      }
    }
    const config = admin?.options?.[field]
    for (const value of nonEmptyStrings(config?.added)) values.add(value)
    for (const value of nonEmptyStrings(config?.removed)) values.delete(value)
    options[field] = [...values].sort((a, b) => a.localeCompare(b))
  }
  return options
}

export function countOptionUsage(records: IpRecord[], field: IpBrandOptionField, value: string): number {
  return records.reduce((count, record) => {
    const current = record[field]
    const matches = ARRAY_OPTION_FIELDS.has(field)
      ? Array.isArray(current) && current.includes(value)
      : current === value
    return count + (matches ? 1 : 0)
  }, 0)
}

export function applyOptionRename(records: IpRecord[], field: IpBrandOptionField, from: string, to: string): IpRecord[] {
  return records.map(record => {
    const current = record[field]
    if (ARRAY_OPTION_FIELDS.has(field)) {
      if (!Array.isArray(current) || !current.includes(from)) return { ...record }
      return {
        ...record,
        [field]: [...new Set(current.map(value => value === from ? to : value))],
      }
    }
    return current === from ? { ...record, [field]: to } : { ...record }
  })
}

export function dedupeIpNews(news: IpNews[]): IpNews[] {
  const seenIds = new Set<string>()
  const seenUrls = new Set<string>()
  const result: IpNews[] = []
  for (const item of news) {
    const id = typeof item.id === 'string' && item.id.trim() !== '' ? item.id : undefined
    const url = typeof item.url === 'string' && item.url.trim() !== '' ? item.url : undefined
    if (id) {
      if (seenIds.has(id)) continue
      seenIds.add(id)
    } else if (url) {
      if (seenUrls.has(url)) continue
      seenUrls.add(url)
    }
    result.push(item)
  }
  return result
}

// 校验上传文件是图片（jpg/jpeg/png/webp/gif）
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i
export function isImageFileName(name: string): boolean {
  return IMAGE_EXT.test(name)
}

// 合并静态记录与管理员增量（纯函数，客户端/服务端通用）：删掉已删除、应用编辑、追加新增记录
export function mergeIpRecords(records: IpRecord[], admin: IpBrandAdminData): IpRecord[] {
  const deletedSet = new Set(admin.deleted || [])
  const applyOne = (r: IpRecord): IpRecord => {
    const edit = admin.edits?.[String(r.id)]
    const manuals = admin.manuals?.[String(r.id)]
    const eventPlans = admin.event_plans?.[String(r.id)]
    if (!edit && !(manuals && manuals.length) && !(eventPlans && eventPlans.length)) return r
    return {
      ...r,
      ...(edit || {}),
      ...(manuals && manuals.length ? { brand_manual_images: manuals.map(m => m.url) } : {}),
      ...(eventPlans && eventPlans.length ? { ip_event_plan_images: eventPlans.map(m => m.url) } : {}),
    }
  }
  return [
    ...records.filter(r => !deletedSet.has(r.id)).map(applyOne),
    ...(admin.new_records || []).filter(r => !deletedSet.has(r.id)).map(applyOne),
  ]
}
