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
