// lib/ipbrand-types.ts — IP品牌库共享类型与纯函数（前后端可共用，无 node:fs 依赖）

export type IpImage = { type: string; local: string }
export type IpCase = { title?: string; image?: string; date?: string }
export type IpNews = { title?: string; date?: string; url?: string }
export type IpCustomCard = { id: string; title: string; body: string }
export type IpManualItem = { name: string; url: string }
export type IpMeta = { label: string; value: string }

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
  // 管理员增量字段
  custom_cards?: IpCustomCard[]
  cards_order?: string[]
  brand_manual_images?: string[]
  section_titles?: Record<string, string>
  custom_meta?: IpMeta[]
}

export type IpBrandEdit = Partial<{
  name_cn: string
  name_en: string
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
  custom_cards: IpCustomCard[]
  cards_order: string[]
  section_titles: Record<string, string>
  custom_meta: IpMeta[]
}>

export type IpBrandAdminData = {
  deleted: number[]
  edits: Record<string, IpBrandEdit>
  manuals: Record<string, IpManualItem[]>
  new_records: IpRecord[]
}

export const EMPTY_ADMIN: IpBrandAdminData = { deleted: [], edits: {}, manuals: {}, new_records: [] }

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
    if (!edit && !(manuals && manuals.length)) return r
    return {
      ...r,
      ...(edit || {}),
      ...(manuals && manuals.length ? { brand_manual_images: manuals.map(m => m.url) } : {}),
    }
  }
  return [
    ...records.filter(r => !deletedSet.has(r.id)).map(applyOne),
    ...(admin.new_records || []).filter(r => !deletedSet.has(r.id)).map(applyOne),
  ]
}
