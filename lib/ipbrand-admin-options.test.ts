import assert from 'node:assert/strict'
import test from 'node:test'
import { createOption, renameOption, removeOption } from './ipbrand-admin.ts'

type OptionState = { added: string[]; removed: string[] }

const state = (patch: Partial<OptionState> = {}): OptionState => ({
  added: [],
  removed: [],
  ...patch,
})

test('createOption trims the value, adds it once, and does not mutate state', () => {
  const input = state({ added: ['已有'], removed: ['已删除'] })
  const result = createOption(input, '  新选项  ')

  assert.deepEqual(result, { added: ['已有', '新选项'], removed: ['已删除'] })
  assert.deepEqual(input, { added: ['已有'], removed: ['已删除'] })
})

test('createOption rejects empty and duplicate values', () => {
  const input = state({ added: ['已有'] })

  assert.throws(() => createOption(input, '   '), /不能为空/)
  assert.throws(() => createOption(input, ' 已有 '), /重复/)
})

test('renameOption removes the old added value, adds the target, and records the old value as removed', () => {
  const input = state({ added: ['旧值', '保留'], removed: ['历史值'] })
  const result = renameOption(input, ' 旧值 ', ' 新值 ')

  assert.deepEqual(result, {
    added: ['保留', '新值'],
    removed: ['历史值', '旧值'],
  })
  assert.deepEqual(input, { added: ['旧值', '保留'], removed: ['历史值'] })
})

test('renameOption rejects empty, same, and duplicate target values', () => {
  const input = state({ added: ['旧值', '已存在'] })

  assert.throws(() => renameOption(input, '旧值', '   '), /不能为空/)
  assert.throws(() => renameOption(input, '旧值', '旧值'), /相同/)
  assert.throws(() => renameOption(input, '旧值', ' 已存在 '), /重复/)
})

test('removeOption blocks deletion when usage exists and includes the exact count', () => {
  const input = state({ added: ['待删'] })

  assert.throws(() => removeOption(input, '待删', 7), /7/)
  assert.deepEqual(input, { added: ['待删'], removed: [] })
})

test('removeOption removes an unused added value and records it as removed', () => {
  const input = state({ added: ['待删', '保留'], removed: ['历史值'] })
  const result = removeOption(input, ' 待删 ', 0)

  assert.deepEqual(result, {
    added: ['保留'],
    removed: ['历史值', '待删'],
  })
  assert.deepEqual(input, { added: ['待删', '保留'], removed: ['历史值'] })
})
