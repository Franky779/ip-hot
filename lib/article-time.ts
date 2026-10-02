const DISPLAY_TIME_ZONE = 'Asia/Shanghai'
const FUTURE_TOLERANCE_MS = 10 * 60 * 1000

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  timeZone: DISPLAY_TIME_ZONE,
})

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: DISPLAY_TIME_ZONE,
})

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function resolveArticleDisplayTime(
  publishedAt: string | null,
  collectedAt: string | null,
): { iso: string | null; kind: 'published' | 'collected' } {
  const published = parseDate(publishedAt)
  const collected = parseDate(collectedAt)
  const sourceTimeIsTooFarAhead = published && collected
    ? published.getTime() > collected.getTime() + FUTURE_TOLERANCE_MS
    : false

  if (published && !sourceTimeIsTooFarAhead) {
    return { iso: publishedAt, kind: 'published' }
  }
  return { iso: collected ? collectedAt : null, kind: 'collected' }
}

export function normalizePublishedAt(value: string | null, collectedAt: string): string {
  const published = parseDate(value)
  const collected = parseDate(collectedAt)
  if (!collected) return published?.toISOString() ?? collectedAt
  if (!published || published.getTime() > collected.getTime() + FUTURE_TOLERANCE_MS) {
    return collected.toISOString()
  }
  return published.toISOString()
}

/**
 * A7 旧文不刷屏：单源首次导入时，缺发布时间的条目最多放行这么多条。
 * 有明确发布时间的条目不受限——normalizePublishedAt 已保证按原文时间归档、
 * 排序沉底，不会冲掉首页"今天"。
 */
export const UNKNOWN_DATE_INSERT_LIMIT = 5

export type UnknownDateItem = { published_at: string | null }

export function limitUnknownDateItems<T extends UnknownDateItem>(
  items: T[],
  limit: number = UNKNOWN_DATE_INSERT_LIMIT,
): { kept: T[]; dropped: number } {
  let unknownSeen = 0
  const kept = items.filter((item) => {
    if (item.published_at) return true
    unknownSeen += 1
    return unknownSeen <= limit
  })
  return { kept, dropped: items.length - kept.length }
}

export function formatArticleDate(iso: string | null): string {
  const date = parseDate(iso)
  if (!date) return ''
  const parts = dateFormatter.formatToParts(date)
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return month && day ? `${month}月${day}日` : ''
}

export function formatArticleTime(iso: string | null): string {
  const date = parseDate(iso)
  return date ? timeFormatter.format(date) : ''
}

export function formatArticleDateTime(iso: string | null): string {
  const date = formatArticleDate(iso)
  const time = formatArticleTime(iso)
  return date && time ? `${date} ${time}` : ''
}
