import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const script = resolve(import.meta.dirname, 'migrate-research-reports.mjs')

test('preserves summary cards and CSS bar charts during HTML migration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ip-hot-research-'))
  const sourceRoot = join(root, 'source')
  await mkdir(join(root, 'lib'), { recursive: true })
  await mkdir(join(sourceRoot, '数据分析'), { recursive: true })
  await writeFile(join(root, 'lib', 'migrated-content.ts'), "{ id: 'visual-report', category: '品牌/IP分析', title: '视觉报告', publishedAt: '2026-07-27', sourceUrl: 'https://github.com/Franky779/ip-news/blob/main/%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90/visual.html' }", 'utf8')
  await writeFile(join(sourceRoot, '数据分析', 'visual.html'), `
    <html><body>
      <div class="summary-grid"><div class="summary-card"><div class="summary-card-label">样本量</div><div class="summary-card-value">191</div><div class="summary-card-note">近一年</div></div></div>
      <div class="chart-box"><h4>内容分布</h4><div class="bar-chart"><div class="bar-row"><span class="bar-label">开箱</span><div class="bar-track"><div class="bar-fill" style="width:80%"></div></div><span class="bar-val">8</span></div><div class="bar-row"><span class="bar-label">晒单</span><div class="bar-track"><div class="bar-fill" style="width:40%"></div></div><span class="bar-val">4</span></div></div></div>
      <div class="chart-box"><h4>营销手法</h4><div class="bar-chart" id="chart-mt"></div></div>
      <div class="chart-container"><h4>受众分布</h4><canvas id="audience-chart"></canvas></div>
      <div class="section"><h3>月度趋势</h3><div class="chart-container" id="trend-chart"></div></div>
      <p>${'正文内容。'.repeat(100)}</p>
      <script>
        const DATA = {"notes":[{"marketingTactic":"KOL种草"},{"marketingTactic":"KOL种草"},{"marketingTactic":"盲盒机制"}]};
        const monthly = { '2026-06': 4, '2026-07': 8 };
        new Chart(document.getElementById('audience-chart'), { type: 'pie', data: { labels: ['18-24岁', '25-30岁'], datasets: [{ data: [60, 40] }] } });
      </script>
    </body></html>
  `, 'utf8')

  await execFileAsync(process.execPath, [script], { cwd: root, env: { ...process.env, IP_NEWS_LOCAL_ROOT: sourceRoot } })
  const [report] = JSON.parse(await readFile(join(root, 'ops', 'migration', 'research-reports.json'), 'utf8'))
  assert.match(report.markdown_content, /class="research-kpi-grid"/)
  assert.match(report.markdown_content, /<small>近一年<\/small>/)
  assert.equal((report.markdown_content.match(/```chart/g) || []).length, 4)
  assert.match(report.markdown_content, /"title":"内容分布"/)
  assert.match(report.markdown_content, /"labels":\["开箱","晒单"\]/)
  assert.match(report.markdown_content, /"title":"营销手法分布"/)
  assert.match(report.markdown_content, /"labels":\["KOL种草","盲盒机制"\]/)
  assert.match(report.markdown_content, /"title":"受众分布"/)
  assert.match(report.markdown_content, /"type":"line".*"labels":\["2026-06","2026-07"\]/)
})
