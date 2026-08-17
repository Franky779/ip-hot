import assert from 'node:assert/strict'
import test from 'node:test'

import { SOURCE_HEALTH_FILTER_OPTIONS, type SourceHealthStatus } from './source-health.ts'
import {
  resolveHealthFilterValue,
  summarizeSourceHealth,
  type HealthCountableSource,
  type HealthCountRow,
} from './source-health-summary.ts'

const ALL_STATUSES: SourceHealthStatus[] = [
  'repair',
  'dead_links',
  'no_articles',
  'overdue',
  'untested',
  'running',
  'healthy',
  'inactive',
]

function makeFullFixture() {
  const sources: HealthCountableSource[] = []
  const rows: HealthCountRow[] = []
  for (const status of ALL_STATUSES) {
    for (const runState of ['active', 'paused'] as const) {
      const id = `${runState}-${status}`
      sources.push({ id, enabled: runState === 'active' })
      rows.push({ sourceId: id, status, filterValue: `${runState}:${status}` })
    }
  }
  return { sources, rows }
}

test('恒等式：选项计数之和 = 状态计数之和 = 源总数，16 个组合全覆盖', () => {
  const { sources, rows } = makeFullFixture()
  const summary = summarizeSourceHealth(sources, rows)

  assert.equal(summary.total, 16)
  assert.equal(summary.available, true)
  assert.equal(Object.values(summary.byOptionValue).reduce((a, b) => a + b, 0), 16)
  assert.equal(Object.values(summary.byStatus).reduce((a, b) => a + b, 0), 16)

  for (const option of SOURCE_HEALTH_FILTER_OPTIONS) {
    assert.equal(summary.byOptionValue[option.value], 1, option.value)
  }
  for (const status of ALL_STATUSES) {
    assert.equal(summary.byStatus[status], 2, status)
  }

  const cardSum = Object.values(summary.cards).reduce((a, b) => a + b, 0)
  assert.equal(cardSum + summary.running + summary.inactive, 16)
})

test('缺失健康行的源按尚未验证兜底（启动/暂停按执行方式归桶）', () => {
  const sources: HealthCountableSource[] = [
    { id: 'a', enabled: true },
    { id: 'b', enabled: false },
  ]
  const summary = summarizeSourceHealth(sources, [])

  assert.equal(summary.byOptionValue['active:untested'], 1)
  assert.equal(summary.byOptionValue['paused:untested'], 1)
  assert.equal(summary.byStatus.untested, 2)
  assert.equal(summary.cards.untested, 2)
})

test('新增 6 个组合在推导路径下正确入桶', () => {
  const cases = [
    [{ id: 'x1', enabled: true }, 'no_articles', 'active:no_articles'],
    [{ id: 'x2', enabled: true }, 'overdue', 'active:overdue'],
    [{ id: 'x3', enabled: true }, 'inactive', 'active:inactive'],
    [{ id: 'x4', enabled: false }, 'healthy', 'paused:healthy'],
    [{ id: 'x5', enabled: false }, 'running', 'paused:running'],
    [{ id: 'x6', enabled: false }, 'dead_links', 'paused:dead_links'],
  ] as const

  for (const [source, status, expected] of cases) {
    const row: HealthCountRow = { sourceId: source.id, status, filterValue: null }
    assert.equal(resolveHealthFilterValue(source, row), expected)
  }
})

test('服务端 filterValue 优先于客户端推导', () => {
  const source: HealthCountableSource = { id: 's', enabled: true }
  const row: HealthCountRow = { sourceId: 's', status: 'healthy', filterValue: 'paused:healthy' }

  assert.equal(resolveHealthFilterValue(source, row), 'paused:healthy')

  const summary = summarizeSourceHealth([source], [row])
  assert.equal(summary.byOptionValue['paused:healthy'], 1)
  assert.equal(summary.byStatus.healthy, 1)
  assert.equal(summary.cards.healthy, 1)
})

test('healthRows 为 null 时标记不可用、计数全零、total 仍为源总数', () => {
  const sources: HealthCountableSource[] = [
    { id: 'a', enabled: true },
    { id: 'b', enabled: false },
  ]
  const summary = summarizeSourceHealth(sources, null)

  assert.equal(summary.available, false)
  assert.equal(summary.total, 2)
  assert.equal(Object.values(summary.byOptionValue).reduce((a, b) => a + b, 0), 0)
  assert.equal(Object.values(summary.byStatus).reduce((a, b) => a + b, 0), 0)
  assert.equal(Object.values(summary.cards).reduce((a, b) => a + b, 0), 0)
})

test('未知 filterValue 回退到推导结果', () => {
  const source: HealthCountableSource = { id: 's', enabled: true }
  const row: HealthCountRow = { sourceId: 's', status: 'dead_links', filterValue: 'bogus:x' }

  assert.equal(resolveHealthFilterValue(source, row), 'active:dead_links')
})

test('已删除源的残留健康行不影响计数', () => {
  const sources: HealthCountableSource[] = [{ id: 'a', enabled: true }]
  const rows: HealthCountRow[] = [
    { sourceId: 'a', status: 'healthy', filterValue: 'active:healthy' },
    { sourceId: 'ghost', status: 'repair', filterValue: 'active:repair' },
  ]
  const summary = summarizeSourceHealth(sources, rows)

  assert.equal(summary.total, 1)
  assert.equal(summary.byStatus.repair, 0)
  assert.equal(Object.values(summary.byOptionValue).reduce((a, b) => a + b, 0), 1)
})
