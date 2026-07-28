import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')

test('ships the package-hanger report with all ECharts visualizations', async () => {
  const reports = JSON.parse(await readFile(resolve(root, 'ops/migration/research-html-reports.json'), 'utf8'))
  const report = reports.find((item) => item.slug === 'baogua-industry-research-2026-07')
  assert.ok(report)
  assert.equal(report.category, '品类研究')
  assert.equal(report.title, '【品类报告】包挂产业深度研究报告-2026年7月')
  assert.equal(report.content_format, 'html')

  const html = await readFile(resolve(root, report.content_file), 'utf8')
  assert.match(html, /<script src="echarts\.min\.js"><\/script>/)
  assert.equal((html.match(/echarts\.init\(/g) || []).length, 10)
  assert.equal((html.match(/id="chart-/g) || []).length, 10)
  assert.match(html, /价格-销量散点分布/)
  assert.match(html, /小红书互动分布/)
  assert.doesNotMatch(html, /数据来源说明/)
  assert.doesNotMatch(html, /采集时间：2026年7月27日/)

  const echarts = await readFile(resolve(root, 'public/research-assets/echarts.min.js'), 'utf8')
  assert.ok(echarts.length > 1_000_000)
})
