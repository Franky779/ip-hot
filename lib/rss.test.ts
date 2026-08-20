import assert from 'node:assert/strict'
import test from 'node:test'

import { sanitizeAmpersand } from './rss.ts'

test('escapes a raw ampersand before a tag (ifanr malformed image URL)', () => {
  const xml = '<image>https://ifanr.feishu.cn/...?code=abc&</image>'
  const out = sanitizeAmpersand(xml)
  assert.equal(out, '<image>https://ifanr.feishu.cn/...?code=abc&amp;</image>')
})

test('keeps valid named entities untouched', () => {
  const xml = '<a href="x?a=1&amp;b=2">Tom &amp; Jerry &lt;x&gt; &quot;q&quot; &apos;a&apos;</a>'
  assert.equal(sanitizeAmpersand(xml), xml)
})

test('keeps numeric and hex entities untouched', () => {
  const xml = '<p>&#65; &#x41; &amp;</p>'
  assert.equal(sanitizeAmpersand(xml), xml)
})

test('escapes multiple raw ampersands', () => {
  const xml = '<image>?a=1&b=2&c=3</image>'
  assert.equal(sanitizeAmpersand(xml), '<image>?a=1&amp;b=2&amp;c=3</image>')
})

test('escapes a raw ampersand mid-tag', () => {
  const xml = '<description>price $5 & is cheap</description>'
  assert.equal(sanitizeAmpersand(xml), '<description>price $5 &amp; is cheap</description>')
})

test('handles entity-like but invalid sequences as raw', () => {
  // "&amp" 缺分号 → 视为裸 &，应转义
  const xml = '<x>&amp</x>'
  assert.equal(sanitizeAmpersand(xml), '<x>&amp;amp</x>')
})
