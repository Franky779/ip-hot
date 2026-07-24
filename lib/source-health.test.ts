import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveSourceHealth, type SourceHealthInput } from './source-health.ts'

const source: SourceHealthInput['source'] = {
  id: 'source-1',
  enabled: true,
  lastTestStatus: 'success',
}

const run: NonNullable<SourceHealthInput['latestRun']> = {
  status: 'empty',
  startedAt: '2026-07-24T06:00:00.000Z',
  discovered: 10,
  fetched: 10,
  dead: 0,
  inserted: 0,
  error: null,
}

test('treats fetched duplicates as healthy instead of empty or broken', () => {
  const health = deriveSourceHealth({ source, coverageStatus: 'empty', latestRun: run, recentRuns: [run] })
  assert.equal(health.status, 'healthy')
})

test('prioritizes explicit fetch and test failures for repair', () => {
  const failedRun = { ...run, status: 'failed' as const, fetched: 0, error: 'HTTP 502' }
  const health = deriveSourceHealth({ source, coverageStatus: 'failed', latestRun: failedRun, recentRuns: [failedRun] })
  assert.equal(health.status, 'repair')
  assert.match(health.reason, /HTTP 502/)

  const failedTest = deriveSourceHealth({
    source: { ...source, lastTestStatus: 'failed', lastTestMessage: 'selector failed' },
    coverageStatus: 'not_due',
    latestRun: null,
    recentRuns: [],
  })
  assert.equal(failedTest.status, 'repair')

  const autoDisabledAfterFailure = deriveSourceHealth({
    source: { ...source, enabled: false, lastTestStatus: 'failed', lastTestMessage: 'selector failed' },
    coverageStatus: 'paused',
    latestRun: null,
    recentRuns: [],
  })
  assert.equal(autoDisabledAfterFailure.status, 'repair')
})

test('flags excessive dead links only when at least half of fetched links fail', () => {
  const health = deriveSourceHealth({
    source,
    coverageStatus: 'empty',
    latestRun: { ...run, dead: 6 },
    recentRuns: [{ ...run, dead: 6 }],
  })
  assert.equal(health.status, 'dead_links')
})

test('requires two consecutive zero-discovery runs before flagging no articles', () => {
  const zeroRun = { ...run, discovered: 0, fetched: 0 }
  assert.equal(deriveSourceHealth({
    source,
    coverageStatus: 'empty',
    latestRun: zeroRun,
    recentRuns: [zeroRun],
  }).status, 'healthy')
  assert.equal(deriveSourceHealth({
    source,
    coverageStatus: 'empty',
    latestRun: zeroRun,
    recentRuns: [zeroRun, { ...zeroRun, startedAt: '2026-07-23T06:00:00.000Z' }],
  }).status, 'no_articles')
  assert.equal(deriveSourceHealth({
    source,
    coverageStatus: 'empty',
    latestRun: zeroRun,
    recentRuns: [
      zeroRun,
      { ...zeroRun, status: 'failed', startedAt: '2026-07-23T06:00:00.000Z' },
      { ...zeroRun, startedAt: '2026-07-22T06:00:00.000Z' },
    ],
  }).status, 'healthy')
})

test('keeps running, overdue, untested, and inactive sources distinct', () => {
  assert.equal(deriveSourceHealth({ source, coverageStatus: 'running', latestRun: run, recentRuns: [run] }).status, 'running')
  assert.equal(deriveSourceHealth({ source, coverageStatus: 'overdue', latestRun: null, recentRuns: [] }).status, 'overdue')
  assert.equal(deriveSourceHealth({
    source: { ...source, lastTestStatus: 'untested' },
    coverageStatus: 'not_due',
    latestRun: null,
    recentRuns: [],
  }).status, 'untested')
  assert.equal(deriveSourceHealth({
    source: { ...source, enabled: false },
    coverageStatus: 'paused',
    latestRun: null,
    recentRuns: [],
  }).status, 'inactive')
})
