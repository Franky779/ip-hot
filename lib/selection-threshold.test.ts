import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isScoreSelected,
  normalizeSelectionThreshold,
  onlyArticlesAwaitingInitialLlm,
} from './selection-threshold.ts'

test('accepts integer selection thresholds from 4 through 10', () => {
  assert.equal(normalizeSelectionThreshold(4), 4)
  assert.equal(normalizeSelectionThreshold('10'), 10)
  assert.throws(() => normalizeSelectionThreshold(3))
  assert.throws(() => normalizeSelectionThreshold(6.5))
})

test('uses the threshold inclusively for new article selection', () => {
  assert.equal(isScoreSelected(6, 6), true)
  assert.equal(isScoreSelected(5, 6), false)
  assert.equal(isScoreSelected(7, 8), false)
})

test('LLM queue only claims articles that have never completed initial processing', () => {
  const filters: Array<{ column: string; value: unknown }> = []
  const query = {
    is(column: string, value: unknown) {
      filters.push({ column, value })
      return this
    },
  }

  assert.equal(onlyArticlesAwaitingInitialLlm(query), query)
  assert.deepEqual(filters, [{ column: 'title_cn', value: null }])
})
