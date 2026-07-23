import assert from 'node:assert/strict'
import test from 'node:test'

import { parseRequestedSourceIds, selectRequestedSources } from './source-run-selection.ts'

const sources = [
  { id: 'source-a', name: '来源 A' },
  { id: 'source-b', name: '来源 B' },
  { id: 'source-c', name: '来源 C' },
]

test('parses and deduplicates explicitly requested source ids', () => {
  assert.deepEqual(
    parseRequestedSourceIds('https://example.test/api?sourceId=source-b&sourceId=source-b'),
    ['source-b'],
  )
})

test('selects only explicitly requested sources in request order', () => {
  const result = selectRequestedSources(sources, ['source-c', 'source-a'])

  assert.deepEqual(result.selectedSources.map((source) => source.id), ['source-c', 'source-a'])
  assert.deepEqual(result.missingSourceIds, [])
})

test('reports unknown ids instead of falling back to the scheduled batch', () => {
  const result = selectRequestedSources(sources, ['missing-source'])

  assert.deepEqual(result.selectedSources, [])
  assert.deepEqual(result.missingSourceIds, ['missing-source'])
})
