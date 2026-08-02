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
<<<<<<< HEAD

test('source repair timer calls the hourly repair endpoint', async () => {
  const service = await readFile(join(opsRoot, 'systemd', 'ip-hot-source-repair.service'), 'utf8')
  const timer = await readFile(join(opsRoot, 'systemd', 'ip-hot-source-repair.timer'), 'utf8')

  assert.match(service, /api\/cron\/source-repair/)
  assert.match(timer, /OnCalendar=\*-\*-\* \*:45:00/)
})
=======
>>>>>>> codex/migration-merge-sections
