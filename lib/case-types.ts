// lib/case-types.ts — IP授权案例库共享类型与纯函数（前后端可共用，无 node:fs 依赖）
// 与品牌方库（licensee-types.ts）同构：静态基线 cases.json + 管理员增量 case-admin.json
// 一条案例 = 一次 IP方 → 品牌方 → 工厂 的授权关系；三方字段 id>0 硬链跳转，id=0 纯文本展示

export type CaseImage = { local: string }

// 授权分类：四选一
export const CASE_LICENSE_KINDS = [
  '商品化授权/软线',
  '商品化授权/硬线',
  '促销授权',
  'LBE主题授权',
] as const
export type CaseLicenseKind = typeof CASE_LICENSE_KINDS[number]

// 案例品类词表（商品类 + LBE空间类；可被 config.custom_categories 扩展）
export const CASE_PRODUCT_CATEGORIES = [
  '毛绒', '盲盒', 'PVC手办', '徽章', '亚克力', '树脂', '软胶', '木制',
  '服装', '杯壶', '文具', '电子配件', '食品', '饮料', '日化', '美妆',
  '家居', '宠物用品', '母婴', '图书出版',
  '美陈', '快闪', '儿童业态', '主题展', '主题餐饮', '沉浸式空间',
] as const

// 城市筛选词表（可被 config.custom_cities 扩展）
export const CASE_CITIES = [
  '北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '武汉',
  '南京', '苏州', '西安', '长沙', '天津', '青岛', '宁波', '佛山', '东莞',
] as const

// 小红书互动数据（无则整条 null，前端整块不显示）
export type CaseSocial = {
  note_url: string
  note_title: string
  note_published: string
  like_count: number
  collect_count: number
  comment_count: number
}

export type CaseRecord = {
  id: number
  // 三方关联：有档案存 id + 冗余 name（硬链跳转），无档案 id=0 纯文本展示
  ip_id: number
  ip_name: string
  licensee_id: number      // 被授权商 / 品牌方
  licensee_name: string
  factory_id: number       // 工厂，有才显示
  factory_name: string

  images: CaseImage[]
  license_kind: CaseLicenseKind | ''
  product_category: string
  city: string
  case_date: string        // yyyy-MM 或 yyyy-MM-dd
  description: string
  source_url: string
  social: CaseSocial | null

  // ---- 二期预留字段（一期不出 UI，模型先留位）----
  analysis_blocks: { title: string; body: string }[]   // 深度分析
  promo_timeline: { date: string; event: string }[]    // 新媒体宣发时间线

  gated: boolean           // 付费墙预留，一期恒 false
}

export type CaseEdit = Partial<CaseRecord>

export type CaseConfig = {
  custom_categories: string[]
  custom_cities: string[]
}

export type CaseAdminData = {
  deleted: number[]
  edits: Record<string, CaseEdit>
  new_records: CaseRecord[]
  config: CaseConfig
}

export const EMPTY_CASE_ADMIN: CaseAdminData = {
  deleted: [],
  edits: {},
  new_records: [],
  config: { custom_categories: [], custom_cities: [] },
}

export const emptyCase = (id: number): CaseRecord => ({
  id,
  ip_id: 0, ip_name: '',
  licensee_id: 0, licensee_name: '',
  factory_id: 0, factory_name: '',
  images: [],
  license_kind: '', product_category: '', city: '', case_date: '',
  description: '', source_url: '', social: null,
  analysis_blocks: [], promo_timeline: [],
  gated: false,
})

export function mergeCaseRecords(records: CaseRecord[], admin: CaseAdminData): CaseRecord[] {
  const deleted = new Set(admin.deleted || [])
  const apply = (r: CaseRecord): CaseRecord => ({ ...r, ...(admin.edits?.[String(r.id)] || {}) })
  return [
    ...records.filter(r => !deleted.has(r.id)).map(apply),
    ...(admin.new_records || []).filter(r => !deleted.has(r.id)).map(apply),
  ]
}

// 反向查询：三库详情页"相关授权案例"区块用
export function casesByIp(records: CaseRecord[], ipId: number): CaseRecord[] {
  return records.filter(r => r.ip_id === ipId)
}
export function casesByLicensee(records: CaseRecord[], licenseeId: number): CaseRecord[] {
  return records.filter(r => r.licensee_id === licenseeId)
}
export function casesByFactory(records: CaseRecord[], factoryId: number): CaseRecord[] {
  return records.filter(r => r.factory_id === factoryId)
}

// 案例展示名：IP × 品牌方
export function caseTitle(record: Pick<CaseRecord, 'ip_name' | 'licensee_name'>): string {
  if (record.ip_name && record.licensee_name) return `${record.ip_name} × ${record.licensee_name}`
  return record.ip_name || record.licensee_name || '(未命名案例)'
}

export function isCaseImage(name: string) {
  return /\.(jpe?g|png|webp|gif|svg)$/i.test(name)
}
