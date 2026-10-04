import assert from 'node:assert/strict'
import test from 'node:test'
import { RESEARCH_CATEGORIES, RESEARCH_ITEMS } from './migrated-content.ts'

test('keeps the migrated research inventory in the requested categories', () => {
  assert.deepEqual(RESEARCH_CATEGORIES, ['品类报告', '深度分析'])
  assert.equal(RESEARCH_ITEMS.length, 14)
  assert.equal(RESEARCH_ITEMS.filter((item) => item.category === '品类报告').length, 8)
  assert.equal(RESEARCH_ITEMS.filter((item) => item.category === '深度分析').length, 6)
  assert.equal(new Set(RESEARCH_ITEMS.map((item) => item.id)).size, RESEARCH_ITEMS.length)
})

// 2026-10-04：「公众号文章」分类下线，LAOJIA_TALKS 及其断言一并移除。
// 本文件仍需保留——上面的 RESEARCH_ITEMS 是 14 篇行业报告的迁移清单守门测试。
