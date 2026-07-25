import assert from 'node:assert/strict'
import test from 'node:test'

import { createArticleSearchPattern, splitSearchMatches } from './article-search.ts'

test('builds a literal case-insensitive contains pattern for PostgreSQL ILIKE', () => {
  assert.equal(createArticleSearchPattern('  50%_off\\sale  '), '%50\\%\\_off\\\\sale%')
  assert.equal(createArticleSearchPattern('   '), null)
})

test('splits every case-insensitive keyword match while preserving the original text', () => {
  assert.deepEqual(splitSearchMatches('IP授权与ip合作', 'ip'), [
    { text: 'IP', highlighted: true },
    { text: '授权与', highlighted: false },
    { text: 'ip', highlighted: true },
    { text: '合作', highlighted: false },
  ])
})

test('treats regular expression characters in keywords as literal text', () => {
  assert.deepEqual(splitSearchMatches('C++ IP 与 C# IP', 'C++'), [
    { text: 'C++', highlighted: true },
    { text: ' IP 与 C# IP', highlighted: false },
  ])
  assert.deepEqual(splitSearchMatches('普通资讯', '  '), [
    { text: '普通资讯', highlighted: false },
  ])
})
