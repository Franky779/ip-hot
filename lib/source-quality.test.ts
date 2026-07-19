import assert from 'node:assert/strict'
import test from 'node:test'

import { aggregateSourceQuality, type SourceQualityLog } from './source-quality.ts'

const now = new Date('2026-07-19T12:00:00.000Z')
const source = { id: 'source-a', name: '来源A', enabled: true, last_test_status: 'success' }

test('uses persisted score audit even when low-score articles are later deleted', () => {
  const qualityResults = Array.from({ length: 25 }, (_, index) => ({
    source: source.name,
    title: `文章${index}`,
    url: `https://example.com/${index}`,
    score: index < 15 ? 2 : 8,
    selected: index >= 15,
    commentary: index < 15 ? '主题不匹配' : '产业相关',
    status: 'scored' as const,
  }))
  const logs: SourceQualityLog[] = [{
    started_at: '2026-07-18T12:00:00.000Z',
    details: {
      fetchResults: [{ source: source.name, discovered: 40, inserted: 25, duplicates: 10, blocked: 3, dead: 2 }],
      qualityResults,
    },
  }]

  const [metric] = aggregateSourceQuality({
    logs,
    legacyRows: [{
      source: source.name,
      relevance_score: 8,
      created_at: '2026-07-18T12:00:00.000Z',
    }],
    sources: [source],
    actions: [],
    periodDays: 7,
    now,
  })

  assert.equal(metric.scored, 25)
  assert.equal(metric.low, 15)
  assert.equal(metric.lowRate, 60)
  assert.equal(metric.status, 'poor')
  assert.equal(metric.discovered, 40)
  assert.equal(metric.inserted, 25)
  assert.equal(metric.duplicates, 10)
  assert.equal(metric.legacyEstimate, false)
  assert.equal(metric.lowSamples.length, 5)
})

test('legacy fallback counts every available article and marks the estimate', () => {
  const legacyRows = Array.from({ length: 24 }, (_, index) => ({
    source: source.name,
    relevance_score: index < 6 ? 3 : 8,
    is_selected: index >= 6,
    title: `旧文章${index}`,
    url: `https://example.com/legacy-${index}`,
    created_at: '2026-07-17T12:00:00.000Z',
  }))

  const [metric] = aggregateSourceQuality({
    logs: [],
    legacyRows,
    sources: [source],
    actions: [],
    periodDays: 7,
    now,
  })

  assert.equal(metric.scored, 24)
  assert.equal(metric.low, 6)
  assert.equal(metric.lowRate, 25)
  assert.equal(metric.status, 'healthy')
  assert.equal(metric.legacyEstimate, true)
})

test('shows period trend and applies the latest manual mode', () => {
  const makeResults = (low: number, high: number) => [
    ...Array.from({ length: low }, (_, index) => ({
      source: source.name, title: `低${index}`, url: `https://example.com/l-${index}`,
      score: 2, selected: false, commentary: '', status: 'scored' as const,
    })),
    ...Array.from({ length: high }, (_, index) => ({
      source: source.name, title: `高${index}`, url: `https://example.com/h-${index}`,
      score: 8, selected: true, commentary: '', status: 'scored' as const,
    })),
  ]
  const logs: SourceQualityLog[] = [
    { started_at: '2026-07-18T12:00:00.000Z', details: { qualityResults: makeResults(8, 12) } },
    { started_at: '2026-07-10T12:00:00.000Z', details: { qualityResults: makeResults(4, 16) } },
  ]

  const [metric] = aggregateSourceQuality({
    logs,
    legacyRows: [],
    sources: [source],
    actions: [
      { sourceId: source.id, sourceName: source.name, mode: 'reduced' },
      { sourceId: source.id, sourceName: source.name, mode: 'observe' },
    ],
    periodDays: 7,
    now,
  })

  assert.equal(metric.lowRate, 40)
  assert.equal(metric.previousLowRate, 20)
  assert.equal(metric.trend, 20)
  assert.equal(metric.mode, 'reduced')
  assert.equal(metric.status, 'warning')
})
