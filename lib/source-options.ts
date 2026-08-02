// 信息源表单与信息源管理页筛选共用同一份选项，保证两边关键词一一对应。

export const REGION_OPTIONS = [
  { value: 'domestic', label: '国内' },
  { value: 'japan', label: '日本' },
  { value: 'us', label: '美国' },
  { value: 'uk', label: '英国' },
  { value: 'kr', label: '韩国' },
  { value: 'overseas', label: '其他海外' },
] as const

export const REGION_LABELS: Record<string, string> = Object.fromEntries(
  REGION_OPTIONS.map((option) => [option.value, option.label])
)

export const FETCH_TYPE_OPTIONS = [
  { value: 'rss', label: 'RSS' },
  { value: 'web', label: '普通网页' },
] as const

export const FETCH_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  FETCH_TYPE_OPTIONS.map((option) => [option.value, option.label])
)
