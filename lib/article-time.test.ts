import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatArticleDate,
  formatArticleDateTime,
  formatArticleTime,
  normalizePublishedAt,
  resolveArticleDisplayTime,
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
