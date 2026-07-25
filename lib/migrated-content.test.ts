import assert from 'node:assert/strict'
import test from 'node:test'
import { LAOJIA_TALKS, RESEARCH_CATEGORIES, RESEARCH_ITEMS } from './migrated-content.ts'

test('keeps the migrated research inventory in the three requested categories', () => {
  assert.deepEqual(RESEARCH_CATEGORIES, ['品类研究', '品牌/IP分析', '授权与营销研究'])
  assert.equal(RESEARCH_ITEMS.length, 14)
  assert.equal(RESEARCH_ITEMS.filter((item) => item.category === '品类研究').length, 8)
  assert.equal(RESEARCH_ITEMS.filter((item) => item.category === '品牌/IP分析').length, 5)
  assert.equal(RESEARCH_ITEMS.filter((item) => item.category === '授权与营销研究').length, 1)
  assert.equal(new Set(RESEARCH_ITEMS.map((item) => item.id)).size, RESEARCH_ITEMS.length)
})

test('keeps all eight 老贾有话说 entries linked to WeChat', () => {
  assert.equal(LAOJIA_TALKS.length, 8)
  assert.ok(LAOJIA_TALKS.every((item) => item.sourceUrl.startsWith('https://mp.weixin.qq.com/s/')))
})
