import assert from 'node:assert/strict'
import test from 'node:test'
import { currentShanghaiDate, githubResearchPath, renderResearchMarkdown, researchCategoryLink, researchTags, slugFromTitle, validateResearchInput } from './research.ts'

test('validates report metadata and markdown size', () => {
  const result = validateResearchInput({ title: '报告', category: '品类报告', published_at: '1999-01-01', markdown_content: '# 正文' })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal('published_at' in result.value, false)
    assert.equal(result.value.content_format, 'markdown')
  }
  assert.equal(validateResearchInput({ title: '', category: '品类报告', markdown_content: '# 正文' }).ok, false)
  assert.equal(validateResearchInput({ title: '报告', category: '未知', markdown_content: '# 正文' }).ok, false)
})

test('creates stable readable slugs', () => {
  assert.equal(slugFromTitle('Toy Industry Report', 'abc'), 'toy-industry-report-abc')
  assert.match(slugFromTitle('棉花娃娃报告', 'abc'), /^research-report-abc$/)
})

test('maps research categories to GitHub backup folders', () => {
  assert.equal(githubResearchPath('深度分析', 'report-1'), '行业报告/深度分析/report-1.md')
  assert.equal(
    githubResearchPath('品类报告', 'ignored', 'html', '【品类报告】包挂产业深度研究报告-2026年7月'),
    '行业报告/品类报告/【品类报告】包挂产业深度研究报告-2026年7月.html',
  )
})

test('links report details back to their selected research category', () => {
  assert.deepEqual(researchCategoryLink('品类报告'), {
    href: '/research?category=%E5%93%81%E7%B1%BB%E6%8A%A5%E5%91%8A',
    label: '← 返回品类报告',
  })
  assert.deepEqual(researchCategoryLink('深度分析'), {
    href: '/research?category=%E6%B7%B1%E5%BA%A6%E5%88%86%E6%9E%90',
    label: '← 返回深度分析',
  })
})

test('normalizes legacy category names to current ones', () => {
  // Old names should map to new canonical names
  assert.deepEqual(researchCategoryLink('品类研究'), {
    href: '/research?category=%E5%93%81%E7%B1%BB%E6%8A%A5%E5%91%8A',
    label: '← 返回品类报告',
  })
  assert.deepEqual(researchCategoryLink('品牌/IP与授权营销研究'), {
    href: '/research?category=%E6%B7%B1%E5%BA%A6%E5%88%86%E6%9E%90',
    label: '← 返回深度分析',
  })
  assert.deepEqual(researchCategoryLink('品牌/IP分析'), {
    href: '/research?category=%E6%B7%B1%E5%BA%A6%E5%88%86%E6%9E%90',
    label: '← 返回深度分析',
  })
})

test('extracts report keyword tags from title templates', () => {
  assert.deepEqual(researchTags({ title: '【品类报告】棉花娃娃产业深度研究报告', category: '品类报告' }), ['研究报告', '棉花娃娃产业'])
  assert.deepEqual(researchTags({ title: '【IP评估报告】初音未来', category: '深度分析' }), ['研究报告', '初音未来'])
})

test('sanitizes executable markdown HTML while retaining report content', () => {
  const html = renderResearchMarkdown('# 标题\n\n正文\n\n<script>alert(1)</script>\n\n[链接](https://example.com)')
  assert.match(html, /<h1>标题<\/h1>/)
  assert.match(html, /正文/)
  assert.doesNotMatch(html, /script|alert/)
  assert.match(html, /rel="noreferrer noopener"/)
})

test('renders markdown tables and controlled chart blocks', () => {
  const html = renderResearchMarkdown('| 项目 | 数值 |\n| --- | ---: |\n| A | 10 |\n\n```chart\n{"type":"bar","title":"测试图","subtitle":"测试副标题","source":"数据来源：测试","labels":["A","B"],"data":[10,20]}\n```')
  assert.match(html, /<table>/)
  assert.match(html, /research-chart/)
  assert.match(html, /research-chart-subtitle/)
  assert.match(html, /数据来源：测试/)
  assert.match(html, /<svg/)
  assert.doesNotMatch(html, /<script/)
})

test('centers pie charts in the SVG viewport', () => {
  const html = renderResearchMarkdown('```chart\n{"type":"pie","title":"饼图","labels":["A","B"],"datasets":[{"data":[40,60]}]}\n```')
  assert.match(html, /M 380 125 L/)
})

test('retains whitelisted report cards and highlight boxes', () => {
  const html = renderResearchMarkdown('<div class="research-kpi-grid"><div class="research-kpi-card"><strong>100</strong><span>样本量</span></div></div>\n\n<div class="research-callout research-callout-highlight">核心发现</div>')
  assert.match(html, /class="research-kpi-grid"/)
  assert.match(html, /class="research-kpi-card"/)
  assert.match(html, /class="research-callout research-callout-highlight"/)
})

test('uses Shanghai calendar date for uploads', () => {
  assert.equal(currentShanghaiDate(new Date('2026-07-25T16:30:00.000Z')), '2026-07-26')
})
