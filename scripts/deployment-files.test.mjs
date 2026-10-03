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
