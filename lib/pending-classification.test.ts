import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FILTERED_CATEGORY,
  PENDING_CATEGORY,
  REVIEW_CATEGORY,
  getPendingClassificationOutcome,
  resolveClassificationResult,
} from './pending-classification.ts'

test('keeps ambiguous and pending model results in manual review', () => {
  assert.equal(getPendingClassificationOutcome({ category: PENDING_CATEGORY, relevance_score: 8 }), 'reviewed')
  assert.equal(getPendingClassificationOutcome({ category: 'IP/品牌/授权', relevance_score: 5 }), 'reviewed')
})

test('filters low-score results without deleting the article', () => {
  assert.equal(getPendingClassificationOutcome({ category: '创作/上新', relevance_score: 3 }), 'filtered')
  assert.equal(FILTERED_CATEGORY, '已过滤')
})

test('classifies direct industry results', () => {
  assert.equal(getPendingClassificationOutcome({ category: '潮玩谷子', relevance_score: 6 }), 'classified')
  assert.equal(REVIEW_CATEGORY, '待人工复核')
})

test('uses the configured threshold for newly classified articles', () => {
  assert.equal(
    getPendingClassificationOutcome({ category: 'IP/品牌/授权', relevance_score: 4 }, 4),
    'classified',
  )
  assert.equal(
    getPendingClassificationOutcome({ category: 'IP/品牌/授权', relevance_score: 5 }, 6),
    'reviewed',
  )
})

test('routes every first-pass LLM result to a terminal category', () => {
  assert.deepEqual(
    resolveClassificationResult({ category: PENDING_CATEGORY, relevance_score: 8, is_selected: true }),
    { category: REVIEW_CATEGORY, is_selected: false },
  )
  assert.deepEqual(
    resolveClassificationResult({ category: 'AI/新技术', relevance_score: 3, is_selected: false }),
    { category: FILTERED_CATEGORY, is_selected: false },
  )
  assert.deepEqual(
    resolveClassificationResult({ category: 'IP/品牌/授权', relevance_score: 8, is_selected: true }),
    { category: 'IP/品牌/授权', is_selected: true },
  )
})
