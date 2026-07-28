import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareResearchHtmlDocument, researchHtmlResponseHeaders } from './research-html.ts'

test('rewrites the report ECharts dependency and installs the height bridge', () => {
  const source = '<!doctype html><html><body><script src="echarts.min.js"></script><main>报告</main></body></html>'
  const html = prepareResearchHtmlDocument(source)
  assert.match(html, /src="\/research-assets\/echarts\.min\.js"/)
  assert.match(html, /data-ip-hot-height-bridge/)
  assert.ok(html.indexOf('data-ip-hot-height-bridge') < html.indexOf('</body>'))
})

test('restricts executable HTML reports to the report document and local scripts', () => {
  const headers = researchHtmlResponseHeaders('http://localhost:3011')
  assert.equal(headers['Content-Type'], 'text/html; charset=utf-8')
  assert.match(headers['Content-Security-Policy'], /default-src 'none'/)
  assert.match(headers['Content-Security-Policy'], /script-src 'unsafe-inline' 'self' http:\/\/localhost:3011/)
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'self'/)
  assert.equal(headers['X-Content-Type-Options'], 'nosniff')
})
