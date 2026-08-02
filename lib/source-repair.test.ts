import assert from 'node:assert/strict'
import test from 'node:test'
import type { NewsSource } from './sources.ts'
import {
  decideRepairAction,
  effectiveFetchType,
  isRepairCandidate,
  syncMethod,
} from './source-repair.ts'

function config(overrides: Partial<NewsSource>): NewsSource {
  return {
    id: 'config-source',
    name: '测试源',
    url: 'https://example.com',
    language: 'zh',
    priority: 'P1',
    type: 'web',
    ...overrides,
  }
}

test('isRepairCandidate only accepts disabled sources with a failed test', () => {
  assert.equal(isRepairCandidate({ enabled: false, last_test_status: 'failed' }), true)
  assert.equal(isRepairCandidate({ enabled: true, last_test_status: 'failed' }), false)
  assert.equal(isRepairCandidate({ enabled: false, last_test_status: 'success' }), false)
  assert.equal(isRepairCandidate({ enabled: false, last_test_status: 'untested' }), false)
})

test('decideRepairAction skips sources the server cannot verify', () => {
  assert.deepEqual(decideRepairAction({ url: 'https://example.com' }, undefined), { action: 'test' })
  assert.equal(decideRepairAction({ url: '' }, undefined).action, 'skip')
  assert.equal(decideRepairAction({ url: 'ftp://example.com' }, undefined).action, 'skip')
  assert.equal(decideRepairAction({ url: 'https://example.com' }, config({ needsLocalCdp: true })).action, 'skip')
  assert.equal(decideRepairAction({ url: 'https://example.com' }, config({ loginRequired: true })).action, 'skip')
  assert.equal(decideRepairAction({ url: 'https://example.com' }, config({ localCdpDisabledReason: '安全挑战' })).action, 'skip')
})

test('effectiveFetchType prefers the code configuration', () => {
  assert.equal(effectiveFetchType({ fetch_type: 'web' }, config({ type: 'rss', isRss: true })), 'rss')
  assert.equal(effectiveFetchType({ fetch_type: 'rss' }, config({ type: 'web' })), 'web')
  assert.equal(effectiveFetchType({ fetch_type: 'rss' }, undefined), 'rss')
  assert.equal(effectiveFetchType({ fetch_type: 'web' }, undefined), 'web')
})

test('syncMethod preserves existing method fields and schedule slot', () => {
  const current = JSON.stringify({
    source_id: 'example',
    execution_mode: 'cloud',
    schedule_tier: 'every_2_days',
    scheduler_version: 1,
    schedule_slot: 3,
  })
  const next = syncMethod(current, config({ type: 'web', priority: 'P1', needsLocalCdp: true }))
  const parsed = JSON.parse(next ?? '{}')
  assert.equal(parsed.execution_mode, 'local')
  assert.equal(parsed.schedule_slot, 3)
  assert.equal(parsed.source_id, 'example')
  assert.equal(parsed.schedule_tier, 'every_2_days')
})

test('syncMethod defaults to cloud mode and weekly tier for government sources', () => {
  const next = syncMethod(null, config({ type: 'gov', priority: 'P2' }))
  const parsed = JSON.parse(next ?? '{}')
  assert.equal(parsed.execution_mode, 'cloud')
  assert.equal(parsed.schedule_tier, 'weekly')
  assert.equal(parsed.scheduler_version, 1)
})

test('syncMethod returns null when there is no code configuration', () => {
  assert.equal(syncMethod('{}', undefined), null)
})
