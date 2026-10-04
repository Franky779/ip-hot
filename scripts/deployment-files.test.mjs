import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const opsRoot = join(root, 'ops')

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  }))
  return nested.flat()
}

test('deployment files use Linux line endings', async () => {
  const files = await listFiles(opsRoot)
  const crlfFiles = []

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    if (content.includes('\r\n')) crlfFiles.push(relative(root, file))
  }

  assert.deepEqual(crlfFiles, [])
})

test('deployment shell scripts have a Linux-compatible shebang', async () => {
  const scripts = await listFiles(join(opsRoot, 'scripts'))

  for (const script of scripts) {
    const content = await readFile(script, 'utf8')
    assert.ok(
      content.startsWith('#!/usr/bin/env bash\n'),
      `${relative(root, script)} has an invalid shebang`,
    )
  }
})

test('health check covers the editable site page storage', async () => {
  const healthCheck = await readFile(join(opsRoot, 'scripts', 'health-check'), 'utf8')

  assert.match(healthCheck, /\/api\/site-pages/)
  assert.match(healthCheck, /site_pages_status == 200/)
})

test('coverage repair timer calls the targeted recovery mode', async () => {
  const service = await readFile(join(opsRoot, 'systemd', 'ip-hot-coverage-repair.service'), 'utf8')
  const timer = await readFile(join(opsRoot, 'systemd', 'ip-hot-coverage-repair.timer'), 'utf8')

  assert.match(service, /fetch-and-process\?coverageRepair=1/)
  assert.match(timer, /OnCalendar=\*-\*-\* \*:10,30:00/)
})

test('source repair timer calls the hourly repair endpoint', async () => {
  const service = await readFile(join(opsRoot, 'systemd', 'ip-hot-source-repair.service'), 'utf8')
  const timer = await readFile(join(opsRoot, 'systemd', 'ip-hot-source-repair.timer'), 'utf8')

  assert.match(service, /api\/cron\/source-repair/)
  assert.match(timer, /OnCalendar=\*-\*-\* \*:45:00/)
})

test('period report timers call the endpoint and install-release enables them', async () => {
  const systemd = join(opsRoot, 'systemd')
  const cases = [
    { name: 'daily', onCalendar: '*-*-* 06:10:00' },
    { name: 'weekly', onCalendar: 'Mon *-*-* 10:00:00' },
    { name: 'monthly', onCalendar: '*-*-01 10:30:00' },
  ]

  for (const c of cases) {
    const base = 'ip-hot-' + c.name + '-report'
    const service = await readFile(join(systemd, base + '.service'), 'utf8')
    const timer = await readFile(join(systemd, base + '.timer'), 'utf8')

    assert.match(service, /api\/cron\/period-report\?period=/, base + ' service 应调用 period-report')
    assert.ok(service.includes('period=' + c.name), base + ' service 应传对 period')
    // 硬编码 date= 会随时间过期，必须由服务端推算上一周期
    assert.ok(!/period=\w+&date=/.test(service), base + ' service 不应硬编码 date')
    assert.ok(timer.includes('OnCalendar=' + c.onCalendar), base + '.timer 日程不对：' + c.onCalendar)
    assert.match(timer, /Persistent=true/, base + '.timer 缺 Persistent=true')
  }

  const install = await readFile(join(opsRoot, 'scripts', 'install-release'), 'utf8')
  for (const c of cases) {
    const timerName = 'ip-hot-' + c.name + '-report.timer'
    assert.ok(
      install.includes('enable --now ' + timerName),
      'install-release 未 enable ' + timerName,
    )
  }
  // 旧的 crontab 条目会造成同一天生成两次
  assert.match(install, /cron-daily-report\.sh/, 'install-release 应清理旧 crontab 条目')
})

test('install-release enables the event clustering timer', async () => {
  const install = await readFile(join(opsRoot, 'scripts', 'install-release'), 'utf8')
  assert.ok(install.includes('enable --now ip-hot-group.timer'), '事件聚簇 timer 未在发布时启用')
})

test('prompt files are deployed and use LF endings', async () => {
  const promptsDir = join(root, 'prompts')
  const entries = await readdir(promptsDir, { withFileTypes: true })
  const names = entries.filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name)

  for (const required of [
    'article-score.md',
    'event-relate.md',
    'event-summary.md',
    'event-industry-gate.md',
    'period-report.md',
    'source-repair.md',
  ]) {
    assert.ok(names.includes(required), 'prompts/' + required + ' 缺失，B4 提示词版本化依赖它')
  }

  // 提示词必须是 LF：release 装在 Linux 上，CRLF 会进哈希并且可能被模型当噪声
  for (const name of names) {
    const content = await readFile(join(promptsDir, name), 'utf8')
    assert.ok(!content.includes('\r\n'), 'prompts/' + name + ' 含 CRLF')
  }
})

test('prompt text lives only in prompts/*.md, not hardcoded in lib', async () => {
  const llm = await readFile(join(root, 'lib', 'llm.ts'), 'utf8')
  assert.ok(
    !llm.includes('你是一位数字创意产业新闻编辑'),
    '评分提示词正文应只存在于 prompts/article-score.md',
  )

  const relate = await readFile(join(root, 'lib', 'events', 'relate.ts'), 'utf8')
  assert.ok(!relate.includes('你是资讯聚簇判断器'), '聚簇提示词正文应只存在于 prompts/event-relate.md')
})

test('hot board filters by the industry gate and hides manually-hidden events', async () => {
  const hot = await readFile(join(root, 'lib', 'events', 'hot.ts'), 'utf8')
  // 榜单查询必须同时过三道：闸门、人工隐藏、标题去重
  assert.ok(
    hot.includes('coalesce(industry_relevant, false) = true'),
    'topEvents 缺少行业价值闸门过滤（闸门不接，榜单会重新混入影视/体育/栏目内容）',
  )
  assert.ok(
    hot.includes('coalesce(hidden, false) = false'),
    'topEvents 缺少人工隐藏过滤',
  )
  assert.ok(hot.includes('dedupeByTitle(rows)'), 'topEvents 缺少标题去重')
  // 多取候选再过滤，保证过滤后仍能凑满 limit
  assert.ok(
    hot.includes('Math.max(1, limit) * 3'),
    'topEvents 应多取候选再过滤/去重，否则闸门会让榜单变短',
  )
})

test('industry gate prompt encodes the explicit exclusion rules', async () => {
  const prompt = await readFile(join(root, 'prompts', 'event-industry-gate.md'), 'utf8')
  // 这些是线上真实判错过的类别，提示词必须显式排除，
  // 否则模型会把「体育 IP 授权是真业务」和「普通球星签约」混为一谈
  for (const mustMention of ['影视票房', '体育赛事', '每周推荐', '联名']) {
    assert.ok(prompt.includes(mustMention), `闸门提示词未覆盖「${mustMention}」这类判错过的内容`)
  }
  assert.ok(prompt.includes('拿不准') || prompt.includes('一律判 irrelevant'), '闸门提示词应写明边界情况从宽处理')
})

test('event gate columns and budget row are in the migration', async () => {
  const sql = await readFile(
    join(opsRoot, 'postgres', 'migrations', '20261004-add-event-industry-gate.sql'),
    'utf8',
  )
  for (const col of ['industry_relevant', 'gate_reason', 'gate_checked_at', 'hidden']) {
    assert.ok(sql.includes(col), `迁移缺 ${col} 列`)
  }
  assert.ok(sql.includes("'industry_gate'"), '迁移应为 industry_gate 用途初始化预算')
  assert.match(sql, /GRANT[\s\S]*TO ip_hot_app/, '迁移末尾必须给应用账号授权，否则接口 permission denied')
})

test('cron runs the gate after clustering so new events get judged', async () => {
  const route = await readFile(join(root, 'app', 'api', 'cron', 'group-events', 'route.ts'), 'utf8')
  const clusterAt = route.indexOf('clusterRound(')
  const gateAt = route.indexOf('runIndustryGate(')
  assert.ok(clusterAt > 0 && gateAt > 0, '聚簇 cron 应同时跑聚簇与闸门')
  assert.ok(gateAt > clusterAt, '闸门应在聚簇之后跑，避免同批新事件漏判')
})

test('admin events API exposes hide / unhide / relevance override', async () => {
  const route = await readFile(join(root, 'app', 'api', 'admin', 'events', 'action', 'route.ts'), 'utf8')
  for (const action of ["'hide'", "'unhide'", "'markRelevant'", "'markIrrelevant'"]) {
    assert.ok(route.includes(action), `事件管理 API 缺 ${action} 动作，后台无法自助处理`)
  }
})
