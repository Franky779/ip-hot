import assert from 'node:assert/strict'
import test from 'node:test'

import { isGovDomain, isOfficialCurrentAffairs } from './current-affairs-filter.ts'

test('isGovDomain 识别政府官方域名', () => {
  assert.equal(isGovDomain('https://www.gov.cn/yaowen/liebiao/202609/content_7080018.htm'), true)
  assert.equal(isGovDomain('https://www.miit.gov.cn/xwfb/szyw/art_123.html'), true)
  assert.equal(isGovDomain('https://policy.mofcom.gov.cn/a'), true)
  assert.equal(isGovDomain('https://www.gov.hk/tc/'), true)
  assert.equal(isGovDomain('https://example.com/news'), false)
  assert.equal(isGovDomain('not a url'), false)
})

test('官方源领导人/时政新闻标题命中过滤', () => {
  const gov = 'https://www.gov.cn/xxx.htm'
  assert.equal(isOfficialCurrentAffairs('习近平同埃及总统塞西会谈', gov), true)
  assert.equal(isOfficialCurrentAffairs('国家主席习近平致电祝贺挪威国王哈康八世即位', gov), true)
  assert.equal(isOfficialCurrentAffairs('习近平总书记关于文化产业的重要论述', gov), true)
  assert.equal(isOfficialCurrentAffairs('国务院总理主持国务院常务会议', gov), true)
})

test('不误伤行业内容与非政府域名', () => {
  const gov = 'https://www.gov.cn/xxx.htm'
  assert.equal(isOfficialCurrentAffairs('泡泡玛特发布2026年新品预告', gov), false)
  assert.equal(isOfficialCurrentAffairs('故宫文创上新：千里江山图盲盒', gov), false)
  assert.equal(isOfficialCurrentAffairs('国务院印发促进文旅消费若干措施', gov), false)
  // 非政府域名即使标题含领导人也放行（交给 LLM 走正常降权流程）
  assert.equal(isOfficialCurrentAffairs('习近平同埃及总统塞西会谈', 'https://www.example.com/news/123'), false)
})