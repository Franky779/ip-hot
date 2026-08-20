export type FactoryImage = { local: string }

export type FactorySupplyType = 'OEM' | 'ODM' | '自有品牌'

export type FactoryRecord = {
  id: number
  name: string
  images: FactoryImage[]
  one_line: string
  categories: string[]
  hub: string
  location: string
  own_brand: boolean
  supply_types: FactorySupplyType[]
  ip_project_count: number
  qr_images: string[]
  verified: boolean
}

export type FactoryEdit = Partial<FactoryRecord>

export type FactoryConfig = {
  contact_public: boolean
  custom_hubs: string[]
  custom_categories: string[]
}

export type FactoryAdminData = {
  deleted: number[]
  edits: Record<string, FactoryEdit>
  new_records: FactoryRecord[]
  config: FactoryConfig
}

export const EMPTY_FACTORY_ADMIN: FactoryAdminData = {
  deleted: [],
  edits: {},
  new_records: [],
  config: { contact_public: true, custom_hubs: [], custom_categories: [] },
}

export const FACTORY_CATEGORIES = ['毛绒', '盲盒', 'PVC手办', '徽章', '亚克力', '树脂', '服装', '杯壶', '文具', '电子配件', '软胶', '木制'] as const
export const FACTORY_HUBS = ['东莞', '澄海', '义乌', '深圳', '泉州', '温州', '宁波', '佛山', '广州'] as const
export const FACTORY_SUPPLY_TYPES = ['OEM', 'ODM', '自有品牌'] as const

export const emptyFactory = (id: number, name = ''): FactoryRecord => ({
  id, name, images: [], one_line: '', categories: [], hub: '', location: '', own_brand: false,
  supply_types: [], ip_project_count: 0, qr_images: [], verified: false,
})

// 城市前缀表（含产业带所在城市），用于把"东莞石排"拆成"东莞 · 石排"
const CITY_PREFIXES = ['深圳', '东莞', '广州', '佛山', '宁波', '温州', '泉州', '义乌', '汕头', '澄海', '厦门', '上海', '北京', '杭州', '苏州', '青岛', '南京', '武汉', '成都', '重庆', '天津', '长沙', '合肥', '中山', '惠州', '珠海', '江门', '肇庆', '金华', '台州', '嘉兴', '湖州', '绍兴', '无锡', '常州']

// 返回 [城市名, 区域/镇名]；拆不出城市时城市为空字符串
export function splitLocation(location: string): [string, string] {
  const raw = String(location || '').trim()
  const matched = CITY_PREFIXES.find(prefix => raw.startsWith(prefix))
  if (matched) return [matched, raw.slice(matched.length).replace(/^市/, '')]
  return ['', raw]
}

// 统一展示地点："城市 · 区域"；城市缺失时退回产业带
export function formatLocation(record: { hub: string; location: string }): string {
  const [city, region] = splitLocation(record.location)
  const c = city || record.hub || ''
  if (c && region) return `${c} · ${region}`
  if (c) return c
  return record.location || '未填写所在地'
}

export function mergeFactoryRecords(records: FactoryRecord[], admin: FactoryAdminData): FactoryRecord[] {
  const deleted = new Set(admin.deleted || [])
  const apply = (record: FactoryRecord): FactoryRecord => ({ ...record, ...(admin.edits?.[String(record.id)] || {}) })
  return [
    ...records.filter(r => !deleted.has(r.id)).map(apply),
    ...(admin.new_records || []).filter(r => !deleted.has(r.id)).map(apply),
  ]
}

export function isFactoryImage(name: string) {
  return /\.(jpe?g|png|webp|gif)$/i.test(name)
}
