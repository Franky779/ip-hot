import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { allPromptVersions, getPrompt, loadPromptFile, resetPromptCache } from './prompts.ts'

const REQUIRED_PROMPTS = [
  'article-score',
  'event-relate',
  'event-summary',
  'period-report',
  'source-repair',
] as const

test('all required prompt files exist and are non-empty', () => {
  resetPromptCache()
  for (const name of REQUIRED_PROMPTS) {
    const { raw } = loadPromptFile(name)
    assert.ok(raw.trim().length > 0, `${name}.md 内容为空`)
  }
})

test('prompt version is a 12-hex-char content hash and changes with content', () => {
  resetPromptCache()
  const before = loadPromptFile('event-relate')
  assert.match(before.version, /^[0-9a-f]{12}$/)

  const dir = mkdtempSync(join(tmpdir(), 'prompts-test-'))
  process.env.PROMPTS_DIR = dir
  resetPromptCache()
  try {
    writeFileSync(join(dir, 'event-relate.md'), '内容甲\n')
    const a = loadPromptFile('event-relate')
    writeFileSync(join(dir, 'event-relate.md'), '内容乙\n')
    resetPromptCache()
    const b = loadPromptFile('event-relate')
    assert.notEqual(a.version, b.version, '内容变了版本号必须跟着变')
  } finally {
    delete process.env.PROMPTS_DIR
    resetPromptCache()
  }
})

test('missing prompt file throws instead of silently falling back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prompts-missing-'))
  process.env.PROMPTS_DIR = dir
  resetPromptCache()
  try {
    assert.throws(() => loadPromptFile('article-score'), /读取提示词文件失败/)
  } finally {
    delete process.env.PROMPTS_DIR
    resetPromptCache()
  }
})

test('placeholders are rendered; unknown placeholders stay visible for debugging', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prompts-render-'))
  process.env.PROMPTS_DIR = dir
  resetPromptCache()
  try {
    writeFileSync(join(dir, 'article-score.md'), 'A={{KNOWN}} B={{UNKNOWN}}\n')
    const prompt = getPrompt('article-score', { KNOWN: '值' })
    assert.match(prompt.text, /A=值/)
    assert.match(prompt.text, /B=\{\{UNKNOWN\}\}/)
    // 版本号只反映文件内容，不含运行时变量
    assert.match(prompt.version, /^[0-9a-f]{12}$/)
  } finally {
    delete process.env.PROMPTS_DIR
    resetPromptCache()
  }
})

test('article-score prompt contains the industry scope placeholder and the JSON contract', () => {
  resetPromptCache()
  const { raw } = loadPromptFile('article-score')
  assert.match(raw, /\{\{INDUSTRY_SCOPE\}\}/, '行业范围必须走占位符注入，不能删掉')
  assert.match(raw, /relevance_score/, '必须保留评分字段约定')
  assert.match(raw, /safety_blocked/, '必须保留安全闸门字段')
})

test('allPromptVersions covers every required prompt', () => {
  resetPromptCache()
  const versions = allPromptVersions()
  assert.deepEqual(
    versions.map((v) => v.name).sort(),
    [...REQUIRED_PROMPTS].sort(),
  )
  for (const v of versions) assert.match(v.version, /^[0-9a-f]{12}$/)
})
