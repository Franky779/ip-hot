import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatArticleDate,
  formatArticleDateTime,
  formatArticleTime,
  limitUnknownDateItems,
  normalizePublishedAt,
  resolveArticleDisplayTime,
  UNKNOWN_DATE_INSERT_LIMIT,
} from './article-time.ts'

test('formats the article date and time consistently in China Standard Time', () => {
  const iso = '2026-07-25T16:00:00.000Z'

  assert.equal(formatArticleDate(iso), '7月26日')
  assert.equal(formatArticleTime(iso), '00:00')
  assert.equal(formatArticleDateTime(iso), '7月26日 00:00')
})

test('falls back to the collected time when the source time is over ten minutes ahead', () => {
  const collectedAt = '2026-07-23T04:48:05.609Z'
  const publishedAt = '2026-07-23T12:15:00.000Z'

  assert.deepEqual(resolveArticleDisplayTime(publishedAt, collectedAt), {
    iso: collectedAt,
    kind: 'collected',
  })
})

test('keeps a valid source publication time and falls back when it is missing', () => {
  const collectedAt = '2026-07-25T16:01:00.000Z'
  const publishedAt = '2026-07-25T16:00:00.000Z'

  assert.deepEqual(resolveArticleDisplayTime(publishedAt, collectedAt), {
    iso: publishedAt,
    kind: 'published',
  })
  assert.deepEqual(resolveArticleDisplayTime(null, collectedAt), {
    iso: collectedAt,
    kind: 'collected',
  })
})

test('normalizes valid source times and replaces future source times before insertion', () => {
  const collectedAt = '2026-07-25T16:01:00.000Z'

  assert.equal(normalizePublishedAt('2026-07-25T16:00:00Z', collectedAt), '2026-07-25T16:00:00.000Z')
  assert.equal(normalizePublishedAt('2026-07-26T00:00:00Z', collectedAt), collectedAt)
  assert.equal(normalizePublishedAt(null, collectedAt), collectedAt)
})

// ===== A7 旧文不刷屏 =====

test('A7: normalizePublishedAt 保留48小时前的原文发布时间（归档不刷屏）', () => {
  const collectedAt = '2026-10-02T12:00:00.000Z'
  const tenDaysAgo = '2026-09-22T08:00:00.000Z'
  assert.equal(normalizePublishedAt(tenDaysAgo, collectedAt), tenDaysAgo)
})

function makeA7Items(spec: Array<'dated' | 'undated'>): Array<{ published_at: string | null; tag: string }> {
  return spec.map((kind, index) => ({
    published_at: kind === 'dated' ? '2026-10-01T00:00:00.000Z' : null,
    tag: `${kind}-${index}`,
  }))
}

test('A7: limitUnknownDateItems 不限制有发布时间的条目', () => {
  const items = makeA7Items(Array.from({ length: 20 }, () => 'dated' as const))
  const { kept, dropped } = limitUnknownDateItems(items)
  assert.equal(kept.length, 20)
  assert.equal(dropped, 0)
})

test('A7: limitUnknownDateItems 无日期条目超过上限时截断', () => {
  const items = makeA7Items(Array.from({ length: 12 }, () => 'undated' as const))
  const { kept, dropped } = limitUnknownDateItems(items)
  assert.equal(kept.length, UNKNOWN_DATE_INSERT_LIMIT)
  assert.equal(dropped, 12 - UNKNOWN_DATE_INSERT_LIMIT)
  // 截断保留的是先出现的条目（上游已按时间近的优先）
  assert.equal(kept[0].tag, 'undated-0')
})

test('A7: limitUnknownDateItems 混合场景：有日期全保留，无日期限量', () => {
  const items = makeA7Items([
    'undated', 'dated', 'undated', 'dated', 'undated',
    'undated', 'undated', 'undated', 'undated', 'undated',
  ])
  const { kept, dropped } = limitUnknownDateItems(items)
  assert.equal(kept.filter((x) => x.published_at).length, 2)
  assert.equal(kept.filter((x) => !x.published_at).length, UNKNOWN_DATE_INSERT_LIMIT)
  assert.equal(dropped, 10 - 2 - UNKNOWN_DATE_INSERT_LIMIT)
})

test('A7: limitUnknownDateItems 支持自定义上限', () => {
  const items = makeA7Items(Array.from({ length: 8 }, () => 'undated' as const))
  const { kept } = limitUnknownDateItems(items, 3)
  assert.equal(kept.length, 3)
})
