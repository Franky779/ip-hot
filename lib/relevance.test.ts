import assert from 'node:assert/strict'
import test from 'node:test'

import { applyDirectCategoryScoreFloor, enforceDirectIndustryScore } from './relevance.ts'

test('raises direct public-category articles scored 4 or 5 to the publishable score', () => {
  assert.equal(applyDirectCategoryScoreFloor('游戏/体育', 5), 6)
  assert.equal(applyDirectCategoryScoreFloor('潮玩谷子', 4), 6)
  assert.equal(applyDirectCategoryScoreFloor('版权保护', 5), 6)
  assert.equal(applyDirectCategoryScoreFloor('展会活动', 4), 6)
})

test('keeps unclassified and clearly indirect technology articles out of the public stream', () => {
  assert.equal(applyDirectCategoryScoreFloor('待分类', 5), 5)
  assert.equal(applyDirectCategoryScoreFloor('AI/新技术', 3), 3)
  assert.equal(enforceDirectIndustryScore('医疗AI独角兽融资估值飙升', 'AI/新技术', 6), 3)
})
