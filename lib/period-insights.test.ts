import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isPeriodKind,
  isValidDateKey,
  normalizeInsights,
  previousPeriodStart,
} from './period-utils.ts'

// ====== 周期推算：上一周期起始日 ======

test('previousPeriodStart daily returns yesterday', () => {
  assert.equal(previousPeriodStart('daily', new Date('2026-10-04T06:10:00+08:00')), '2026-10-03')
})

test('previousPeriodStart weekly returns the Monday of last week', () => {
  // 语义 = 「本周一减 7 天」，即上一个自然周的周一。
  // 周一跑（timer 的实际触发时刻）：本周一 10-05，上一周期 09-28
  assert.equal(previousPeriodStart('weekly', new Date('2026-10-05T10:00:00+08:00')), '2026-09-28')
  // 周三跑：本周尚未结束，仍生成上一周，不能提前生成本周
  assert.equal(previousPeriodStart('weekly', new Date('2026-10-07T10:00:00+08:00')), '2026-09-28')
  // 周日跑：本周（09-28~10-04）还差最后一小时没结束，最后一个完整周是 09-21
  assert.equal(previousPeriodStart('weekly', new Date('2026-10-04T10:00:00+08:00')), '2026-09-21')
  // 跨月：本周一 10-05，上一周期 09-28（同月内）
  assert.equal(previousPeriodStart('weekly', new Date('2026-10-12T10:00:00+08:00')), '2026-10-05')
  // 跨年：本周一 2027-01-04，上一周期 2026-12-28
  assert.equal(previousPeriodStart('weekly', new Date('2027-01-04T10:00:00+08:00')), '2026-12-28')
})

test('previousPeriodStart monthly returns the 1st of last month', () => {
  assert.equal(previousPeriodStart('monthly', new Date('2026-10-01T10:30:00+08:00')), '2026-09-01')
  assert.equal(previousPeriodStart('monthly', new Date('2026-10-15T10:30:00+08:00')), '2026-09-01')
  // 一月回看：上一年 12 月
  assert.equal(previousPeriodStart('monthly', new Date('2026-01-01T10:30:00+08:00')), '2025-12-01')
})

test('previousPeriodStart returns undefined for an invalid date instead of guessing', () => {
  assert.equal(previousPeriodStart('daily', new Date('not-a-date')), undefined)
})

// ====== 洞察缓存结构兼容 ======

test('normalizeInsights accepts JSON text and object', () => {
  const payload = {
    hotEvents: [{ id: 'e1', title: 'T', sourceCount: 3, reportCount: 4, heat: 2.5 }],
    snapshot: { articleCount: 10, selectedCount: 6, sourceCount: 5, avgScore: 7.2, categoryTop: null },
    activeIps: [{ name: '泡泡玛特', articleCount: 4, eventCount: 1, via: 'ip_library' }],
    licensingLeads: [{ title: 'L', url: 'https://x', source: 's', score: 8, publishedAt: null }],
  }
  const fromText = normalizeInsights(JSON.stringify(payload))
  assert.ok(fromText)
  assert.equal(fromText?.hotEvents.length, 1)
  assert.equal(fromText?.activeIps[0].name, '泡泡玛特')
  assert.equal(fromText?.snapshot.articleCount, 10)

  const fromObject = normalizeInsights(payload)
  assert.equal(fromObject?.licensingLeads.length, 1)
})

test('normalizeInsights returns undefined for missing or corrupt cache (old rows have no column)', () => {
  assert.equal(normalizeInsights(undefined), undefined)
  assert.equal(normalizeInsights(null), undefined)
  assert.equal(normalizeInsights('not json'), undefined)
  // 有 insights 但没有 snapshot（结构不完整）也当没有，避免渲染出 0 值假象
  assert.equal(normalizeInsights(JSON.stringify({ hotEvents: [] })), undefined)
})

test('normalizeInsights tolerates partially missing sub-arrays', () => {
  const result = normalizeInsights({
    snapshot: { articleCount: 3, selectedCount: 1, sourceCount: 2, avgScore: null, categoryTop: null },
  })
  assert.ok(result)
  assert.deepEqual(result?.hotEvents, [])
  assert.deepEqual(result?.activeIps, [])
  assert.deepEqual(result?.licensingLeads, [])
})

test('isValidDateKey rejects malformed and impossible dates', () => {
  assert.equal(isValidDateKey('2026-10-04'), true)
  assert.equal(isValidDateKey('2026-10-4'), false)
  assert.equal(isValidDateKey('2026-13-01'), false)
  assert.equal(isValidDateKey('2026-02-30'), false)
  assert.equal(isValidDateKey(''), false)
})

test('isPeriodKind guards the cron query param', () => {
  assert.equal(isPeriodKind('daily'), true)
  assert.equal(isPeriodKind('weekly'), true)
  assert.equal(isPeriodKind('monthly'), true)
  assert.equal(isPeriodKind('yearly'), false)
  assert.equal(isPeriodKind(null), false)
})
