// lib/licensee-types.ts — 品牌方库共享类型与纯函数（前后端可共用，无 node:fs 依赖）
// 与工厂模块（factory-types.ts）同构：静态基线 licensees.json + 管理员增量 licensee-admin.json

export type LicenseeImage = { local: string }

// 授权合作案例：闭环核心，一条案例把 IP方 → 品牌方 → 工厂 三方串起来
// ip_id / factory_id 为硬关联（0 表示未关联）；name 字段冗余存储，对方记录被删时仍可显示名称
export type LicenseeCase = {
  ip_id: number
  ip_name: string
  category: string
  license_type: string
  factory_id: number
  factory_name: string
  launch_date: string
  sales_note: string
}

export type LicenseeRecord = {
  id: number
  name: string
  name_en: string
  images: LicenseeImage[]
  one_line: string
  company: string
  founded: string
  hub: string
  location: string
  categories: string[]
  biz_types: string[]
  channels: string[]
  audiences: string[]
  intro: string
  licensing_cases: LicenseeCase[]
  qr_images: string[]
  verified: boolean
}

export type LicenseeEdit = Partial<LicenseeRecord>

export type LicenseeConfig = {
  contact_public: boolean
  custom_hubs: string[]
  custom_categories: string[]
}

export type LicenseeAdminData = {
  deleted: number[]
  edits: Record<string, LicenseeEdit>
  new_records: LicenseeRecord[]
  config: LicenseeConfig
}

export const EMPTY_LICENSEE_ADMIN: LicenseeAdminData = {
  deleted: [],
  edits: {},
  new_records: [],
  config: { contact_public: true, custom_hubs: [], custom_categories: [] },
}

// 主营品类：复用工厂品类表，再补品牌方常见类目
export const LICENSEE_CATEGORIES = [
  '毛绒', '盲盒', 'PVC手办', '徽章', '亚克力', '树脂', '服装', '杯壶', '文具', '电子配件', '软胶', '木制',
  '食品', '饮料', '日化', '美妆', '家居', '宠物用品', '母婴', '图书出版',
] as const

// 产业带与工厂模块保持一致（品牌方多有总部/产地属性）
export const LICENSEE_HUBS = ['东莞', '澄海', '义乌', '深圳', '泉州', '温州', '宁波', '佛山', '广州', '上海', '杭州', '北京'] as const

export const LICENSEE_BIZ_TYPES = ['品牌方', '制造商自有品牌', '渠道商自有品牌', '零售商自有品牌'] as const

export const LICENSEE_CHANNELS = [
  '天猫', '京东', '拼多多', '抖音电商', '快手', '小红书商城', '唯品会',
  '商超/KA', '便利店', '母婴店', '潮玩集合店', '百货专柜', '海外渠道',
] as const

export const LICENSEE_AUDIENCES = ['儿童', '青少年', '年轻女性', '年轻男性', '家庭亲子', '收藏玩家'] as const

export const LICENSE_TYPES = ['商品授权', '主题授权', '促销授权', '通路授权', '联名合作'] as const

export const emptyLicenseeCase = (): LicenseeCase => ({
  ip_id: 0, ip_name: '', category: '', license_type: '', factory_id: 0, factory_name: '', launch_date: '', sales_note: '',
})

export const emptyLicensee = (id: number, name = ''): LicenseeRecord => ({
  id, name, name_en: '', images: [], one_line: '', company: '', founded: '', hub: '', location: '',
  categories: [], biz_types: [], channels: [], audiences: [], intro: '',
  licensing_cases: [], qr_images: [], verified: false,
})

// 复用工厂模块的城市拆分逻辑（保持展示一致）
const CITY_PREFIXES = ['深圳', '东莞', '广州', '佛山', '宁波', '温州', '泉州', '义乌', '汕头', '澄海', '厦门', '上海', '北京', '杭州', '苏州', '青岛', '南京', '武汉', '成都', '重庆', '天津', '长沙', '合肥', '中山', '惠州', '珠海', '江门', '肇庆', '金华', '台州', '嘉兴', '湖州', '绍兴', '无锡', '常州']

export function splitLocation(location: string): [string, string] {
  const raw = String(location || '').trim()
  const matched = CITY_PREFIXES.find(prefix => raw.startsWith(prefix))
  if (matched) return [matched, raw.slice(matched.length).replace(/^市/, '')]
  return ['', raw]
}

export function formatLocation(record: { hub: string; location: string }): string {
  const [city, region] = splitLocation(record.location)
  const c = city || record.hub || ''
  if (c && region) return `${c} · ${region}`
  if (c) return c
  return record.location || '未填写所在地'
}

export function mergeLicenseeRecords(records: LicenseeRecord[], admin: LicenseeAdminData): LicenseeRecord[] {
  const deleted = new Set(admin.deleted || [])
  const apply = (record: LicenseeRecord): LicenseeRecord => ({ ...record, ...(admin.edits?.[String(record.id)] || {}) })
  return [
    ...records.filter(r => !deleted.has(r.id)).map(apply),
    ...(admin.new_records || []).filter(r => !deleted.has(r.id)).map(apply),
  ]
}

// 从案例中提取去重后的关联 IP 列表（授权IP墙用）
export function linkedIps(record: LicenseeRecord): { id: number; name: string }[] {
  const seen = new Map<number, string>()
  for (const c of record.licensing_cases || []) {
    if (c.ip_id > 0 && !seen.has(c.ip_id)) seen.set(c.ip_id, c.ip_name)
  }
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
}

// 从案例中提取去重后的关联工厂列表（合作供应链用）
export function linkedFactories(record: LicenseeRecord): { id: number; name: string }[] {
  const seen = new Map<number, string>()
  for (const c of record.licensing_cases || []) {
    if (c.factory_id > 0 && !seen.has(c.factory_id)) seen.set(c.factory_id, c.factory_name)
  }
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
}

// 反向查询：哪些品牌方的案例关联了指定 IP（IP详情页"授权该IP的品牌方"用）
export function licenseesByIp(records: LicenseeRecord[], ipId: number): LicenseeRecord[] {
  return records.filter(r => (r.licensing_cases || []).some(c => c.ip_id === ipId))
}

// 反向查询：哪些品牌方的案例关联了指定工厂（工厂详情页"服务过的品牌方"用）
export function licenseesByFactory(records: LicenseeRecord[], factoryId: number): LicenseeRecord[] {
  return records.filter(r => (r.licensing_cases || []).some(c => c.factory_id === factoryId))
}

export function isLicenseeImage(name: string) {
  return /\.(jpe?g|png|webp|gif|svg)$/i.test(name)
}
