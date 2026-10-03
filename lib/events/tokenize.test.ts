import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractFeatures, featureOverlap, extractPrimaryEntity } from './tokenize.ts'

test('same entity in different titles shares >=2 features', () => {
  const a = '三丽鸥发布2026财年财报，Hello Kitty授权收入创新高'
  const b = '三丽鸥2026财年财报解读：Hello Kitty 授权业务增长'
  assert.ok(featureOverlap(a, b) >= 2, `overlap=${featureOverlap(a, b)}`)
})

test('unrelated titles about different events share few features', () => {
  const a = '泡泡玛特新店开业，LABUBU系列首发'
  const b = '万代南梦宫公布新作游戏计划'
  assert.ok(featureOverlap(a, b) < 2, `overlap=${featureOverlap(a, b)}`)
})

test('latin brand names are extracted case-insensitively', () => {
  const f = extractFeatures('PEZ x GUNDAM 联名 dispenser 登场')
  assert.ok(f.has('l:pez'))
  assert.ok(f.has('l:gundam'))
})

test('stopwords and tiny words are excluded', () => {
  const f = extractFeatures('The New Official News of 2026')
  assert.ok(!f.has('l:the'))
  assert.ok(!f.has('l:new'))
  assert.ok(f.has('l:2026'))
})

test('primary entity picks the longest latin brand word', () => {
  assert.equal(extractPrimaryEntity('PEZ x GUNDAM 联名'), 'GUNDAM')
  assert.equal(extractPrimaryEntity('三丽鸥2026财报'), '2026')
  assert.equal(extractPrimaryEntity('纯中文标题没有拉丁词'), null)
})
