import assert from 'node:assert/strict'
import test from 'node:test'

import { countSourceExecutionModes, getSourceToggleAction } from './source-schedule.ts'

test('counts every execution mode including manual sources', () => {
  const counts = countSourceExecutionModes([
    { id: 'cloud', enabled: true, method: '{"execution_mode":"cloud"}' },
    { id: 'local', enabled: true, method: '{"execution_mode":"local"}' },
    { id: 'manual', enabled: true, method: '{"execution_mode":"manual"}' },
    { id: 'configured-paused', enabled: true, method: '{"execution_mode":"paused"}' },
    { id: 'disabled', enabled: false, method: '{"execution_mode":"cloud"}' },
  ])

  assert.deepEqual(counts, {
    cloud: 1,
    local: 1,
    manual: 1,
    paused: 2,
  })
})

test('uses the effective execution mode for pause and resume actions', () => {
  assert.equal(getSourceToggleAction({ enabled: true, method: '{"execution_mode":"paused"}' }), 'resume')
  assert.equal(getSourceToggleAction({ enabled: false, method: '{"execution_mode":"cloud"}' }), 'resume')
  assert.equal(getSourceToggleAction({ enabled: true, method: '{"execution_mode":"cloud"}' }), 'pause')
  assert.equal(getSourceToggleAction({ enabled: true, method: '{"execution_mode":"manual"}' }), 'pause')
})
