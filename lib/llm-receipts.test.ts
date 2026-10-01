// lib/llm-receipts.test.ts — 回执输入哈希的稳定性
// 哈希用于判断是否复用已付过钱的模型结果：碰撞会导致拿错结果，顺序不敏感会导致串味。

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInputHash } from './llm-hash.ts'

test('相同输入产生相同哈希', () => {
  const a = buildInputHash(['prompt', '标题', '正文'])
  const b = buildInputHash(['prompt', '标题', '正文'])
  assert.equal(a, b)
})

test('任一输入变化都会产生不同哈希', () => {
  const base = buildInputHash(['prompt', '标题', '正文'])
  assert.notEqual(base, buildInputHash(['prompt-v2', '标题', '正文']))
  assert.notEqual(base, buildInputHash(['prompt', '标题2', '正文']))
  assert.notEqual(base, buildInputHash(['prompt', '标题', '正文2']))
})

test('输入顺序不同视为不同请求', () => {
  assert.notEqual(
    buildInputHash(['标题', '正文']),
    buildInputHash(['正文', '标题']),
  )
})

test('拼接边界不会让不同输入产生相同哈希', () => {
  // ['ab','c'] 与 ['a','bc'] 若用空串拼接会得到相同字符串
  assert.notEqual(
    buildInputHash(['ab', 'c']),
    buildInputHash(['a', 'bc']),
  )
})
