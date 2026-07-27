import assert from 'node:assert/strict'
import test from 'node:test'

import { selectCoverageRecoverySourceIds, type SourceCoverage, type SourceFetchRun } from './source-coverage.ts'

const coverage: SourceCoverage = {
  summary: {
    planned: 3,
    completed: 0,
    success: 0,
    empty: 0,
    failed: 1,
    running: 0,
    skipped: 1,
    pending: 0,
    overdue: 1,
    notDue: 0,
    excluded: 0,
  },
  rows: [
    { sourceId: 'failed-new', sourceName: 'Failed', sourceUrl: 'https://failed.example', executionMode: 'cloud', scheduleTier: 'daily', status: 'failed', scheduledAt: '2026-07-26T04:00:00.000Z', nextScheduledAt: null, lastRun: null },
    { sourceId: 'overdue', sourceName: 'Overdue', sourceUrl: 'https://overdue.example', executionMode: 'cloud', scheduleTier: 'daily', status: 'overdue', scheduledAt: '2026-07-26T09:00:00.000Z', nextScheduledAt: null, lastRun: null },
    { sourceId: 'skipped-local', sourceName: 'Local', sourceUrl: 'https://local.example', executionMode: 'local', scheduleTier: 'daily', status: 'skipped', scheduledAt: '2026-07-26T14:00:00.000Z', nextScheduledAt: null, lastRun: null },
    { sourceId: 'failed-retried', sourceName: 'Retried', sourceUrl: 'https://retried.example', executionMode: 'cloud', scheduleTier: 'daily', status: 'failed', scheduledAt: '2026-07-26T04:00:00.000Z', nextScheduledAt: null, lastRun: null },
  ],
  nextBatches: [],
}

function recoveryRun(sourceId: string): SourceFetchRun {
  return {
    source_id: sourceId,
    source_name: sourceId,
    source_url: `https://${sourceId}.example`,
    trigger_type: 'coverage_repair',
    execution_mode: 'cloud',
    status: 'failed',
    started_at: '2026-07-26T12:00:00.000Z',
    ended_at: '2026-07-26T12:01:00.000Z',
    discovered_count: 0,
    fetched_count: 0,
    blocked_count: 0,
    dead_count: 0,
    duplicate_count: 0,
    inserted_count: 0,
    error_message: 'HTTP 403',
  }
}

test('recovers failed and overdue cloud sources without retrying local or exhausted sources', () => {
  const selected = selectCoverageRecoverySourceIds(coverage, [
    recoveryRun('failed-retried'),
    recoveryRun('failed-retried'),
  ])

  assert.deepEqual(selected, ['failed-new', 'overdue'])
})
