import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildFactoryIndex, buildIpIndex, buildLicenseeIndex, entityDetailHref, resolveEntityHref, resolveEntityId } from './entity-links.ts'

test('buildLicenseeIndex maps name and name_en to id', () => {
  const index = buildLicenseeIndex([
    { id: 4, name: '上海静安大悦城', name_en: 'Joy City' },
    { id: 7, name: '北京朝阳大悦城' },
  ])
  assert.equal(index.get('上海静安大悦城'), 4)
  assert.equal(index.get('Joy City'), 4)
  assert.equal(index.get('北京朝阳大悦城'), 7)
})

test('buildIpIndex maps name_cn and name_en to id', () => {
  const index = buildIpIndex([
    { id: 12, name_cn: '线条小狗', name_en: 'Line Friends' },
    { id: 13, name_cn: '米老鼠' },
  ])
  assert.equal(index.get('线条小狗'), 12)
  assert.equal(index.get('Line Friends'), 12)
  assert.equal(index.get('米老鼠'), 13)
})

test('buildFactoryIndex skips id <= 0', () => {
  const index = buildFactoryIndex([{ id: 0, name: '未关联工厂' }, { id: 9, name: '东莞某厂' }])
  assert.equal(index.has('未关联工厂'), false)
  assert.equal(index.get('东莞某厂'), 9)
})

test('resolveEntityId exact match wins', () => {
  const index = buildLicenseeIndex([{ id: 4, name: '上海静安大悦城' }, { id: 7, name: '北京朝阳大悦城' }])
  assert.equal(resolveEntityId(index, '上海静安大悦城'), 4)
})

test('resolveEntityId unique substring fallback (案例写简称，库里是全名)', () => {
  const index = buildLicenseeIndex([{ id: 4, name: '上海静安大悦城' }])
  // 案例里只存了「大悦城」，库里只有一条包含它 → 视为同一家
  assert.equal(resolveEntityId(index, '大悦城'), 4)
})

test('resolveEntityId ambiguous substring (多家都包含简称) returns null', () => {
  const index = buildLicenseeIndex([
    { id: 4, name: '上海静安大悦城' },
    { id: 7, name: '北京朝阳大悦城' },
  ])
  // 「大悦城」同时出现在两条 → 歧义，不跳，避免错链
  assert.equal(resolveEntityId(index, '大悦城'), null)
})

test('resolveEntityHref: id>0 直接跳；名字匹配跳；都不行返回 null', () => {
  const index = buildLicenseeIndex([{ id: 4, name: '上海静安大悦城' }])
  assert.equal(resolveEntityHref('licensee', { id: 9, name: '其它', index }), '/licensee/detail?id=9')
  assert.equal(resolveEntityHref('licensee', { id: 0, name: '上海静安大悦城', index }), '/licensee/detail?id=4')
  assert.equal(resolveEntityHref('licensee', { id: 0, name: '不存在的品牌', index }), null)
  assert.equal(resolveEntityHref('licensee', { id: 0, name: '有名字但索引为空', index: null }), null)
})

test('entityDetailHref routes per kind', () => {
  assert.equal(entityDetailHref('ip', 3), '/ipbrand/detail?id=3')
  assert.equal(entityDetailHref('licensee', 4), '/licensee/detail?id=4')
  assert.equal(entityDetailHref('factory', 5), '/factory/detail?id=5')
})
