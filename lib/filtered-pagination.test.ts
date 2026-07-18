import assert from 'node:assert/strict'
import test from 'node:test'
import { paginateFilteredResults } from './filtered-pagination.ts'

type Row = { id: number; visible: boolean }

function createFetcher(rows: Row[]) {
  return async (from: number, to: number) => rows.slice(from, to + 1)
}

test('keeps fetching when filtering makes a full database batch look exhausted', async () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    visible: index !== 5,
  }))

  const result = await paginateFilteredResults({
    targetCount: 20,
    batchSize: 21,
    fetchRange: createFetcher(rows),
    include: (row) => row.visible,
  })

  assert.equal(result.items.length, 20)
  assert.equal(result.hasMore, true)
  assert.equal(result.items.at(-1)?.id, 21)
})

test('reports the real end after filtering all fetched batches', async () => {
  const rows = [
    { id: 1, visible: true },
    { id: 2, visible: false },
    { id: 3, visible: true },
  ]

  const result = await paginateFilteredResults({
    targetCount: 20,
    batchSize: 2,
    fetchRange: createFetcher(rows),
    include: (row) => row.visible,
  })

  assert.deepEqual(result.items.map((row) => row.id), [1, 3])
  assert.equal(result.hasMore, false)
})
